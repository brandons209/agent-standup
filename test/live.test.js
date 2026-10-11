// test/live.test.js: the live call in a real browser. A transcript is written record by record, the way Claude Code writes it, and we check what the call says and shows.
// One case per regression that reached a release: the end of the previous call read again, answers that stopped, lines lost or said twice, a turn that "ended" in the middle.
// Needs puppeteer-core (npm i) and a Chrome (CHROME_PATH, or the usual places); skipped with a note when they are missing, except in CI where that is a failure.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-live-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects');
fs.writeFileSync(process.env.AGENT_STANDUP_PREFS, JSON.stringify({ lang: 'en', voice: false, chat: 'normal', banter: true, narrate: false, _t: Date.now() }));   // no voice: a line lasts as long as its text, on every machine
let puppeteer = null; for (const m of ['puppeteer-core', path.join(process.env.PUPPETEER_DIR || '/tmp/as/pp', 'node_modules/puppeteer-core')]) { try { puppeteer = require(m); break; } catch {} }
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => p && fs.existsSync(p));
const missing = !puppeteer ? 'puppeteer-core is not installed (npm i)' : !CHROME ? 'no Chrome found (set CHROME_PATH)' : '';
if (missing && process.env.CI) throw new Error('live tests cannot run: ' + missing);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, port, browser, nSession = 0, nId = 0;
// ---- a session being written ----
function session() {
  const proj = '-live' + ++nSession, dir = path.join(tmp, 'projects', proj), main = path.join(dir, 's.jsonl'), subDir = path.join(dir, 's', 'subagents'); fs.mkdirSync(subDir, { recursive: true });
  const put = (f, r, at) => fs.appendFileSync(f, JSON.stringify({ timestamp: new Date(at || Date.now()).toISOString(), ...r }) + '\n'), sub = (k) => path.join(subDir, `agent-a${k}.jsonl`);
  const s = {
    proj,
    user: (text, at) => put(main, { type: 'user', message: { role: 'user', content: text } }, at),
    say: (text, o = {}) => put(o.sub ? sub(o.sub) : main, { type: 'assistant', message: { id: o.id || 'm' + ++nId, role: 'assistant', stop_reason: o.end ? 'end_turn' : null, content: [{ type: 'text', text }] } }, o.at),
    tool: (name, input, o = {}) => { const id = 'toolu_' + ++nId; put(o.sub ? sub(o.sub) : main, { type: 'assistant', message: { id: o.id || 'm' + ++nId, role: 'assistant', stop_reason: null, content: [{ type: 'tool_use', id, name, input }] } }, o.at); return id; },
    result: (id, text, o = {}) => put(o.sub ? sub(o.sub) : main, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] } }, o.at),
    think: (text, o = {}) => put(o.sub ? sub(o.sub) : main, { type: 'assistant', message: { id: o.id || 'm' + ++nId, role: 'assistant', stop_reason: null, content: [{ type: 'thinking', thinking: text, signature: 'x' }] } }, o.at),   // the reasoning before a line or a call, when Claude Code keeps its text
    queued: (text, at) => put(main, { type: 'attachment', attachment: { type: 'queued_command', prompt: [{ type: 'text', text }], origin: { kind: 'human' }, commandMode: 'prompt' } }, at),   // an order typed while the lead works: written when delivered, stamped when typed
    launch: (k, title, prompt) => { const id = s.tool('Agent', { description: title, prompt, subagent_type: 'general-purpose' }); fs.writeFileSync(path.join(subDir, `agent-a${k}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description: title, toolUseId: id })); put(sub(k), { type: 'user', message: { role: 'user', content: prompt } }); return id; },
  };
  return s;
}
// ---- the call, watched ----
async function open(s, join = true) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/?proj=${s.proj}`); await page.waitForFunction('typeof S !== "undefined" && S.cur', { timeout: 15000 });
  await page.evaluate(() => { window.__said = []; const o = window.startTalk; window.startTalk = function (id, line, label) { window.__said.push({ id, line: String(line), label: label || '', at: performance.now() }); return o.apply(this, arguments); }; });
  await page.evaluate(() => { window.__voice = []; const o = window.speakLine; window.speakLine = function (text, p, primary, token, fr, always) { window.__voice.push({ id: p && p.id, text: String(text), silent: !!(S.hurry && !always) }); return o.apply(this, arguments); }; });   // silent: shown without a voice because the call is behind
  if (join) await page.click('#gB');
  const call = {
    page, errors,
    said: () => page.evaluate(() => window.__said),
    lines: async (id) => (await call.said()).filter((x) => !id || x.id === id).map((x) => x.line),
    until: (fn, arg, ms = 20000) => page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg),
    heard: (text, ms) => call.until((t) => window.__said.some((x) => x.line.includes(t)), text, ms),   // a line containing this text has started
    quiet: async (ms = 2500) => { await call.until(() => S.idle && !S.speakers.size, null, 30000); await wait(ms); },   // everything received has been played, and nothing more came
    lead: () => page.evaluate(() => agentState('main', Date.now()).k),
    close: async () => { await page.close(); assert.deepEqual(errors, [], 'page errors'); },
  };
  return call;
}
const count = (lines, text) => lines.filter((l) => l.includes(text)).length;

test('live call', { skip: missing || false, timeout: 600000 }, async (t) => {
  srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); port = srv.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox'] });
  t.after(async () => { await browser.close(); srv.close(); require('../server.js').shutdown(); });

  await t.test('joining a call that is over says nothing; what comes next is said once, also after a reload', async () => {
    const s = session(), old = Date.now() - 600000; s.user('OLD order', old); s.say('OLD answer, all done.', { at: old + 5000, end: true });
    const c = await open(s); await c.quiet(); assert.deepEqual(await c.lines(), []);
    s.user('NEW order'); await wait(1500); s.say('NEW answer.', { end: true }); await c.heard('NEW answer'); await c.quiet();
    await c.page.evaluate(() => { S.cur = null; }); await wait(3000); await c.quiet();   // what a rewritten transcript or a server restart triggers
    const l = await c.lines(); assert.equal(count(l, 'OLD'), 0); assert.equal(count(l, 'NEW order'), 1); assert.equal(count(l, 'NEW answer'), 1); await c.close();
  });

  await t.test('joining while the agents are at work: the last seconds are said, not what came before', async () => {
    const s = session(), now = Date.now(); s.user('EARLIER order', now - 40000); s.say('EARLIER line.', { at: now - 30000 }); s.tool('Bash', { command: 'ls' }, { at: now - 20000 }); s.say('RECENT line.', { at: now - 5000 }); s.tool('Bash', { command: 'npm test' }, { at: now - 2000 });
    const c = await open(s); await c.heard('RECENT line'); await c.quiet(1000); const l = await c.lines(); assert.equal(count(l, 'EARLIER'), 0); assert.equal(count(l, 'RECENT line'), 1); await c.close();
  });

  await t.test('the lead answers an order when it goes to its tools without a word, also after a long order; not when it spoke', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Fix the slow login'); await wait(2500); s.tool('Read', { file_path: '/x/src/server.js' }); await c.heard('server.js');
    await c.quiet(500); s.say('The login waits on a slow query.', { end: true }); await c.heard('slow query'); await c.quiet(500);
    s.user('Please go through the whole authentication module, list every place where a session token is read or written, check each one against the new expiry rule, and tell me which ones still need to change before the release.'); await wait(2000);
    let id = s.tool('Bash', { command: 'npm test', description: 'Run the test suite' });
    for (let k = 0; k < 8; k++) { await wait(1000); s.result(id, 'ok'); id = s.tool('Read', { file_path: `/x/auth/part${k}.js` }); }   // the lead goes on while the order is still being read: its first tool is no longer "just now"
    await c.heard('Run the test suite', 30000);
    await c.quiet(500); s.say('Two places still need to change.', { end: true }); await c.heard('Two places'); await c.quiet(500);
    s.user('And what do you think?'); await wait(2000); s.say('I think the query needs an index.'); await wait(300); s.tool('Grep', { pattern: 'CREATE INDEX' }); await c.heard('needs an index'); await c.quiet();
    const lead = await c.lines('main'); assert.equal(lead.filter((l) => /^(Got it|Okay|On it|Sure|Right)\./.test(l)).length, 2, lead.join(' | ')); await c.close();
  });

  await t.test('a sub-agent answers its order; a last line that becomes a report afterwards counts as one, without being read again', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Check the tests'); await wait(1500); s.say('I will hand this over.'); await wait(1500);
    const id = s.launch(1, 'Run the tests', 'Run the whole test suite and report every failure with its file and line.');
    for (let k = 0; k < 8; k++) { await wait(1000); s.result(s.tool('Bash', { command: 'npm test' }, { sub: 1 }), 'ok', { sub: 1 }); }
    await c.until(() => window.__said.some((x) => x.id === 'a1' && x.label === '💬'), null, 30000);   // the answer to the order
    s.say('REPORT: 40 tests pass and two fail in the auth module.', { sub: 1 }); await c.heard('REPORT: 40 tests');   // the page has it as an ordinary line
    await wait(3000); s.result(id, 'REPORT: 40 tests pass and two fail in the auth module.');   // Claude Code writes the completion a few seconds later
    await c.until(() => S.status.a1 === 'done' && S.events.some((e) => e.agent === 'a1' && e.kind === 'report'), null, 15000); await c.quiet();
    assert.equal(count(await c.lines(), 'REPORT: 40 tests'), 1); assert.ok(await c.page.evaluate(() => !!document.querySelector('#log .row.report'))); await c.close();
  });

  await t.test('an order typed while the lead works reaches the call, once, and no line is said twice', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Start the build'); await wait(1500); s.say('FIRST lead line.'); await c.heard('FIRST lead line'); const typed = Date.now(); await wait(4000);
    s.say('SECOND lead line.'); await c.heard('SECOND lead line'); await c.quiet(500);
    s.queued('ORDER TYPED MEANWHILE', typed); await c.heard('ORDER TYPED MEANWHILE'); await wait(1000); s.say('THIRD lead line.', { end: true }); await c.heard('THIRD lead line'); await c.quiet();
    const l = await c.lines(); for (const x of ['FIRST lead line', 'SECOND lead line', 'ORDER TYPED MEANWHILE', 'THIRD lead line']) assert.equal(count(l, x), 1, x + ' in ' + l.join(' | ')); await c.close();
  });

  await t.test('tool calls of one message written one after the other all reach the call', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Look around'); await wait(1500); s.say('Looking.'); await c.heard('Looking'); await c.quiet(300);
    s.tool('Read', { file_path: '/x/one.js' }, { id: 'mPar' }); await wait(1200); s.tool('Read', { file_path: '/x/two.js' }, { id: 'mPar' }); await wait(1200); s.tool('Read', { file_path: '/x/three.js' }, { id: 'mPar' });
    await c.until(() => (S.tc.main || 0) === 3, null, 15000); assert.equal(await c.page.evaluate(() => S.events.filter((e) => e.kind === 'tools').reduce((n, e) => n + e.tools.length, 0)), 3); await c.close();
  });

  await t.test('the lead is at work until the message that closes its turn: while it thinks, after a long command, and no wrap-up in the middle', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s); await c.quiet(500); assert.equal(await c.lead(), 'done');
    s.user('Run the long job'); await c.heard('Run the long job'); await c.quiet(1500); assert.equal(await c.lead(), 'working');   // thinking: nothing written yet
    s.say('Starting the long job now, this is going to take a while because the whole suite runs twice.'); await wait(500); const id = s.tool('Bash', { command: 'sleep 30' }); await wait(28000);   // longer than the old 25 s rule
    assert.equal(await c.lead(), 'working'); s.result(id, 'ok'); await wait(4000); assert.equal(await c.lead(), 'working'); assert.equal(count(await c.lines(), 'To sum up'), 0);
    s.say('The long job is finished.', { end: true }); await c.heard('long job is finished'); await c.until(() => agentState('main', Date.now()).k === 'done', null, 8000); await c.close();
  });

  await t.test('your own line is always voiced: typed long before it was delivered, or in the middle of a backlog', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Start', Date.now() - 170000); await wait(1200); s.say('Working on it.', { at: Date.now() - 165000 }); await c.heard('Working on it'); await c.quiet(500);   // dated as if the command below had really run for two minutes
    const id = s.tool('Bash', { command: 'sleep 140' }, { at: Date.now() - 150000 }); await wait(1500); s.result(id, 'ok'); s.queued('ORDER TYPED TWO MINUTES AGO', Date.now() - 130000); await wait(300); s.say('Noted.', { end: true });   // a long command, an order typed 20 s into it: Claude Code hands the order over when the command returns, stamped with the time it was typed
    await c.heard('ORDER TYPED TWO MINUTES AGO'); await c.heard('Noted'); await c.quiet(500);
    for (let k = 0; k < 30; k++) { if (k === 12) s.user('ORDER IN THE BACKLOG'); s.say(`Backlog line ${k} of the lead, long enough to take a moment to read out loud.`); }   // written at once: the call is far behind and skips ahead
    s.say('End of the backlog.', { end: true }); await c.heard('End of the backlog', 120000); await c.quiet(500);
    const mine = await c.page.evaluate(() => window.__voice.filter((x) => x.id === 'user'));
    for (const x of ['ORDER TYPED TWO MINUTES AGO', 'ORDER IN THE BACKLOG']) { const hit = mine.filter((y) => y.text.includes(x)); assert.equal(hit.length, 1, x + ' said ' + hit.length + ' times'); assert.equal(hit[0].silent, false, x + ' was shown without a voice'); }
    await c.close();
  });

  await t.test('an agent at work for a while thinks to itself: its own reasoning when the session has it, else what it is doing; shown, not said, gone when it speaks', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Why is the login slow?'); await c.heard('Why is the login slow'); await wait(1500);
    s.think('The login is slow because the query scans the whole table. I should look at the index before anything else.', { id: 'mTh' }); const id = s.tool('Bash', { command: 'psql -f explain.sql', description: 'Explain the login query' }, { id: 'mTh' });
    await c.until(() => { const b = document.querySelector('#t-main.musing .bubble'); return b && b.textContent.includes('scans the whole table'); }, null, 45000);   // its own words come first
    assert.equal(await c.page.evaluate(() => S.speakers.size), 0); assert.equal(count(await c.lines(), 'scans the whole table'), 0, 'a thought is not a spoken line');
    s.result(id, 'Seq Scan on users'); s.say('It was the missing index.', { end: true }); await c.heard('It was the missing index'); assert.equal(await c.page.evaluate(() => !!document.querySelector('#t-main.musing')), false);
    await c.quiet(500); s.user('Then fix it'); await wait(1500); s.say('I will hand the migration over.'); await wait(1000); s.launch(1, 'Check the migration', 'Write the migration that adds the index and check it on a copy of the database.');
    const run = s.tool('Bash', { command: 'npm run migrate:check', description: 'Check the migration' }, { sub: 1 });   // no reasoning kept for this one: the thought is about what it is on
    await c.until(() => { const b = document.querySelector('#t-a1.musing .bubble'); return b && b.textContent.includes('Check the migration'); }, null, 60000);
    assert.equal((await c.said()).filter((x) => x.id === 'a1' && x.line.includes('Check the migration')).length, 0); s.result(run, 'ok', { sub: 1 }); await c.close();
  });

  await t.test('a page reloaded in the middle of a call does not say again what it already said', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); let c = await open(s);
    s.user('Do the thing'); await wait(1200); s.say('FIRST step done.'); await c.heard('FIRST step'); await c.quiet(1500); await c.close();
    c = await open(s); s.say('SECOND step done.', { end: true }); await c.heard('SECOND step'); await c.quiet();
    const l = await c.lines(); assert.equal(count(l, 'FIRST step'), 0); assert.equal(count(l, 'SECOND step'), 1); await c.close();
  });

  await t.test('following the latest session: a call keeps its session while the other one writes, also across a reload of its feed', async () => {
    const a = session(), b = session(); a.user('A order', Date.now() - 600000); a.say('A ready.', { at: Date.now() - 590000, end: true });
    const page = await browser.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/?live=1&proj=`); await page.waitForFunction('typeof S !== "undefined" && S.cur', { timeout: 15000 }); await page.click('#gB');
    a.say('A is working.'); await page.waitForFunction((p) => S.cur && S.cur.proj === p, { timeout: 15000 }, a.proj);
    b.user('B order'); b.say('B line one.'); await wait(1500); b.say('B line two.'); await wait(1500);
    assert.equal(await page.evaluate(() => S.cur.proj), a.proj, 'stays on its session while the other writes');
    await page.evaluate(() => { S.cur = null; }); await wait(2500);   // a reload of the feed (restart, rewritten transcript)
    assert.equal(await page.evaluate(() => S.cur && S.cur.proj), a.proj, 'a reload does not hand the call to the other session');
    await page.close(); assert.deepEqual(errors, []);
  });

  await t.test('a sub-agent at work says what it is doing, in turn: never over another line, never twice in a row', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    await c.page.evaluate(() => { prefs.narrate = true; window.__overlap = 0; const st = window.startTalk; window.startTalk = function (id) { if (S.speakers.size && !S.speakers.has(id)) window.__overlap++; return st.apply(this, arguments); }; });
    s.user('Check the login'); await wait(1500); s.launch(1, 'Check login', 'Look at the login page'); await wait(1500);
    for (let k = 0; k < 4; k++) { const id = s.tool('Read', { file_path: `/x/src/file${k}.js` }, { sub: 1 }); await wait(400); s.result(id, 'ok', { sub: 1 }); await wait(3500); }
    await c.quiet(); const said = await c.said(), mine = said.filter((x) => x.label === '🛠');
    assert.ok(mine.length >= 1, 'it said what it was doing'); assert.ok(mine.every((x) => /^Reading file\d\.js\.$/.test(x.line)), JSON.stringify(mine));
    for (let k = 1; k < mine.length; k++) assert.ok(mine[k].at - mine[k - 1].at >= 12000, 'never twice in a row: at least 12 s between two lines of one agent');
    assert.equal(await c.page.evaluate(() => window.__overlap), 0, 'never over someone else'); await c.close();
  });

  await t.test('a sub-agent that finishes says so once and celebrates', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    await c.page.evaluate(() => { window.__cheered = 0; const o = window.celebrate; window.celebrate = function (id) { if (id === 'a1') window.__cheered++; return o.apply(this, arguments); }; });
    s.user('Check the login'); await wait(1200); const id = s.launch(1, 'Check login', 'Look at the login page'); await wait(1500);
    s.say('Looked at it: the query is slow.', { sub: 1 }); await wait(6000); s.result(id, 'Looked at it: the query is slow.'); await c.quiet();
    const said = await c.said(); assert.ok(said.filter((x) => x.id === 'a1' && x.label === '🎉').length <= 1, 'at most one completion line');
    assert.equal(await c.page.evaluate(() => S.quipped.a1), true); assert.ok(await c.page.evaluate(() => window.__cheered >= 1), 'it celebrated'); await c.close();
  });

  await t.test('pausing and resuming at the end of a live call does not repeat the last line', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('One thing'); await wait(1200); s.say('LAST line of the call.', { end: true }); await c.heard('LAST line'); await c.quiet(500);
    await c.page.evaluate(() => togglePlay()); await wait(800); await c.page.evaluate(() => togglePlay()); await c.quiet(); assert.equal(count(await c.lines(), 'LAST line'), 1); await c.close();
  });
});
