// test/server.test.js: the settings file, session stickiness, the cross-site guard and the pictures of a session, against a real server on a free port
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-test-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects'); process.env.AGENT_STANDUP_CC_SESSIONS = path.join(tmp, 'cc');
const get = (port, p, headers = {}, method = 'GET', body) => new Promise((res, rej) => { const r = http.request({ port, path: p, method, headers }, (x) => { let b = '', n = 0; x.on('data', (d) => { b += d; n += d.length; }); x.on('end', () => res({ status: x.statusCode, body: b, type: x.headers['content-type'], bytes: n, headers: x.headers })); }); r.on('error', rej); if (body) r.write(body); r.end(); });
test('settings are kept in a file; cross-site writes are refused', async () => {
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  try {
    assert.match((await get(port, '/api/prefs.js')).body, /SAVED_PREFS = null/);
    assert.equal((await get(port, '/api/prefs', { 'content-type': 'application/json' }, 'PUT', '{"lang":"fr","_t":5}')).status, 200);
    assert.match((await get(port, '/api/prefs.js')).body, /"lang":"fr"/);
    assert.equal((await get(port, '/api/prefs', { 'sec-fetch-site': 'cross-site' }, 'PUT', '{}')).status, 403);
    assert.equal((await get(port, '/api/prefs', {}, 'PUT', '[1]')).status, 400);
    assert.equal(JSON.parse((await get(port, '/api/kokoro')).body).installed, false);
    assert.equal((await get(port, '/api/kokoro/install', { 'sec-fetch-site': 'cross-site' }, 'POST')).status, 403);
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('pictures returned by tools are counted in the timeline and served from the transcript only', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', pic = (type, data) => ({ type: 'image', source: { type: 'base64', media_type: type, data } });
  const rec = (id, content) => [{ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: '/x/shot.png' } }] } }, { type: 'user', timestamp: '2026-01-01T00:00:01Z', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } }].map((r) => JSON.stringify(r)).join('\n') + '\n';
  const dir = path.join(tmp, 'projects', '-p'); fs.mkdirSync(path.join(dir, 's1', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 's1.jsonl'), rec('toolu_pic', [pic('image/png', png), pic('image/svg+xml', 'PHN2Zy8+')])); fs.writeFileSync(path.join(dir, 's1', 'subagents', 'agent-a1.jsonl'), rec('toolu_sub', [pic('image/png', png)]));
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port, media = (q) => get(port, '/api/media?proj=-p&id=s1&' + q);
  try {
    const items = JSON.parse((await get(port, '/api/session?proj=-p&id=s1')).body).events.filter((e) => e.kind === 'results').flatMap((e) => e.items);
    assert.deepEqual(items.map((it) => [it.id, it.img]).sort(), [['toolu_pic', 1], ['toolu_sub', 1]]);   // the SVG is not a picture we show
    const ok = await media('agent=main&tool=toolu_pic&n=0'); assert.equal(ok.status, 200); assert.equal(ok.type, 'image/png'); assert.equal(ok.bytes, Buffer.from(png, 'base64').length);
    assert.equal((await media('agent=a1&tool=toolu_sub&n=0')).status, 200);
    assert.equal((await media('agent=main&tool=toolu_pic&n=1')).status, 404);
    assert.equal((await media('agent=main&tool=toolu_sub&n=0')).status, 404);
    assert.equal((await media('agent=..&tool=toolu_pic&n=0')).status, 400);
    assert.equal((await get(port, '/api/media?proj=..&id=s1&agent=main&tool=toolu_pic&n=0')).status, 400);
    assert.equal((await get(port, '/api/media?proj=-p&id=s1&agent=main&tool=toolu_pic&n=0', { 'sec-fetch-site': 'cross-site' })).status, 403);
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('OpenAI-compatible voice server: settings, request shape, cache, key never leaked, failure reported', async () => {
  const oldKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'sk-test';
  const calls = []; let fail401 = false;
  const wav = Buffer.alloc(52); wav.write('RIFF', 0); wav.writeUInt32LE(44, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(8, 40);
  const fake = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    calls.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(b) });
    if (fail401) { res.writeHead(401); return res.end('bad key ' + req.headers.authorization); }
    res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(wav);
  }); });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r)); const fport = fake.address().port;
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port, J = { 'content-type': 'application/json' };
  const put = (tts) => get(port, '/api/prefs', J, 'PUT', JSON.stringify({ tts, _t: 1 }));
  try {
    assert.equal((await put({ url: `http://127.0.0.1:${fport}/v1/`, model: 'm', voice: 'v' })).status, 200);
    const vo = await get(port, '/api/voices?engine=openai'); assert.equal(JSON.parse(vo.body).available, true);
    assert.ok(!vo.body.includes('sk-test') && !vo.body.includes('127.0.0.1'));
    const q = '/api/tts?engine=openai&voice=af_bella&rate=178&lang=en&text=';
    const a = await get(port, q + 'hi'); assert.equal(a.status, 200); assert.equal(a.headers['content-type'], 'audio/wav'); assert.equal(a.headers['cache-control'], 'no-store');
    assert.equal(calls.length, 1); const c = calls[0];
    assert.equal(c.path, '/v1/audio/speech'); assert.equal(c.auth, 'Bearer sk-test');
    assert.equal(c.body.model, 'm'); assert.equal(c.body.voice, 'af_bella'); assert.equal(c.body.speed, 1); assert.equal(c.body.response_format, 'wav'); assert.equal(c.body.input, 'hi');
    assert.equal((await get(port, q + 'hi')).status, 200); assert.equal(calls.length, 1);
    assert.equal((await get(port, '/api/tts?engine=openai&voice=%3Cscript%3E&text=hi')).status, 400);
    assert.equal((await get(port, '/api/tts', { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await get(port, '/api/prefs.js', { 'sec-fetch-site': 'cross-site' })).status, 403);
    fail401 = true; await get(port, q + 'second');
    const h = JSON.parse((await get(port, '/api/health')).body); assert.match(h.ttsError, /^HTTP 401/); assert.ok(!h.ttsError.includes('sk-test')); assert.equal(h.ttsKey, true);
    assert.equal((await put({ url: '' })).status, 200);
    assert.equal(JSON.parse((await get(port, '/api/voices?engine=openai')).body).available, false);
    assert.equal(JSON.parse((await get(port, '/api/health')).body).ttsError, '');
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    srv.close(); fake.close(); require('../server.js').shutdown();
  }
});
test('an order typed while the lead is working is part of the call', async () => {
  const at = (s) => `2026-01-01T00:00:0${s}Z`, queued = (s, prompt, origin) => ({ type: 'attachment', timestamp: at(s), attachment: { type: 'queued_command', prompt, origin, commandMode: origin.kind === 'human' ? 'prompt' : 'task-notification' } });
  const recs = [{ type: 'user', timestamp: at(0), message: { role: 'user', content: 'first order' } }, { type: 'assistant', timestamp: at(1), message: { content: [{ type: 'tool_use', id: 'toolu_q', name: 'Bash', input: { command: 'ls' } }] } },
    queued(2, [{ type: 'text', text: 'order sent meanwhile' }], { kind: 'human' }), queued(3, '<task-notification>\n<task-id>x</task-id>', { kind: 'task-notification' }), { type: 'assistant', timestamp: at(4), message: { content: [{ type: 'text', text: 'On it.' }] } }];
  const dir = path.join(tmp, 'projects', '-q'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 's2.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  try {
    const said = JSON.parse((await get(port, '/api/session?proj=-q&id=s2')).body).events.filter((e) => e.kind === 'user' || e.kind === 'say').map((e) => [e.agent, e.text]);
    assert.deepEqual(said, [['user', 'first order'], ['user', 'order sent meanwhile'], ['main', 'On it.']]);
  } finally { srv.close(); require('../server.js').shutdown(); }
});
// ---- 1.25.7: a live feed that loses nothing, the end of the lead's turn, transcripts of other shapes, requests that used to stop the server
const wait = (ms) => new Promise((r) => setTimeout(r, ms)), at = (s) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + s * 1000).toISOString(), line = (r) => JSON.stringify(r) + '\n';
const said = (s, text, o = {}) => ({ type: 'assistant', timestamp: at(s), message: { id: o.id || 'm' + s, stop_reason: o.stop === undefined ? null : o.stop, content: [{ type: o.thinking ? 'thinking' : 'text', [o.thinking ? 'thinking' : 'text']: text }] } });
const used = (s, id, name, input, o = {}) => ({ type: 'assistant', timestamp: at(s), message: { id: o.id || 'm' + s, stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } });
const typed = (s, content, o = {}) => ({ type: 'user', timestamp: at(s), ...o, message: { role: 'user', content } }), result = (s, id, content, o = {}) => typed(s, [{ type: 'tool_result', tool_use_id: id, content }], o);
const serve = async () => { const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); return { srv, port: srv.address().port, stop: () => { srv.close(); require('../server.js').shutdown(); } }; };
const load = async (port, q) => JSON.parse((await get(port, '/api/session?' + q)).body);
test('a live call followed record by record ends with exactly what a fresh load shows', async () => {
  const dir = path.join(tmp, 'projects', '-f'), main = path.join(dir, 's.jsonl'), sub = path.join(dir, 's', 'subagents', 'agent-a1.jsonl'); fs.mkdirSync(path.dirname(sub), { recursive: true });
  const steps = [   // [file, record]: written one at a time, the way Claude Code writes them
    [main, typed(0, 'first order')], [main, said(1, 'I will look.')],
    [main, used(2, 'toolu_r', 'Read', { file_path: '/x/a.js' }, { id: 'mA' })], [main, used(2, 'toolu_g', 'Grep', { pattern: 'slow' }, { id: 'mA' })], [main, used(3, 'toolu_ag', 'Agent', { prompt: 'Find the slow query.', description: 'Profiler' }, { id: 'mA' })],   // one message, one record per tool call
    [sub, typed(4, 'Find the slow query.')], [sub, used(5, 'toolu_b', 'Bash', { command: 'ls' })], [sub, said(6, 'Found it: the cart query.')],
    [main, { type: 'attachment', timestamp: at(2.5), attachment: { type: 'queued_command', prompt: [{ type: 'text', text: 'ORDER TYPED MEANWHILE' }], origin: { kind: 'human' }, commandMode: 'prompt' } }],   // typed at 2.5 s, delivered after lines stamped later
    [main, result(7, 'toolu_ag', 'The cart query is slow.')],   // the sub-agent's completion record comes after its last text
    [main, used(8, 'toolu_e', 'Edit', { file_path: '/x/a.js', old_string: 'a', new_string: 'b' })], [main, typed(9, [{ type: 'text', text: '[Request interrupted by user for tool use]' }])],
    [main, typed(10, 'second order')], [main, said(11, 'Done.', { stop: 'end_turn' })]];
  fs.writeFileSync(path.join(dir, 's', 'subagents', 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Profiler', toolUseId: 'toolu_ag' }));
  fs.writeFileSync(main, line(steps[0][1]));
  const { port, stop } = await serve(), q = 'proj=-f&id=s';
  try {
    const first = await load(port, q), have = new Map(first.events.map((e) => [e.k, e])), seen = []; let seq = first.seq, late = 0; const ep = first.ep;
    assert.equal(typeof ep, 'string'); assert.ok(Number.isInteger(seq)); assert.equal(have.size, first.events.length); assert.equal(first.marks, 1, 'before the lead has written anything, its turn is open');   // marks: the turns of this transcript end with a mark, so the lead is at work until one comes
    const marks = [];
    for (const [file, rec] of steps.slice(1)) {
      fs.appendFileSync(file, line(rec)); await wait(280);   // the server does not build a timeline twice within 250 ms
      const d = await load(port, q + '&after=' + seq + '&ep=' + ep); assert.equal(d.ep, ep); assert.ok(d.seq >= seq); assert.deepEqual(Object.keys(d).filter((k) => k !== 'marks').sort(), ['agents', 'ep', 'events', 'id', 'seq']); marks.push(d.marks || 0);
      for (const e of d.events) { seen.push([have.has(e.k) ? 'changed' : 'new', e.kind, e.agent, e.end || 0]); if (!have.has(e.k) && [...have.values()].some((x) => x.ts > e.ts)) late++; have.set(e.k, e); }   // what the page does: a known key is replaced in place, an unknown one is added
      seq = d.seq; assert.deepEqual((await load(port, q + '&after=' + seq + '&ep=' + ep)).events, []);   // asked again with the new number: nothing
    }
    const fresh = await load(port, q); assert.equal(fresh.ep, ep); assert.equal(fresh.seq, seq); assert.equal(marks[0], 0, 'a transcript whose records carry no stop reason is not said to mark its turns'); assert.equal(marks[marks.length - 1], 1); assert.equal(fresh.marks, 1);
    assert.equal(new Set(fresh.events.map((e) => e.k)).size, fresh.events.length);   // keys are unique
    assert.deepEqual([...have.keys()].sort(), fresh.events.map((e) => e.k).sort()); for (const e of fresh.events) assert.deepEqual(have.get(e.k), e);
    fs.mkdirSync(path.join(tmp, 'projects', '-f2'), { recursive: true }); fs.cpSync(dir, path.join(tmp, 'projects', '-f2'), { recursive: true });   // the same files read for the first time by a server that never saw them grow: same keys, same events
    const cold = await load(port, 'proj=-f2&id=s'); assert.notEqual(cold.ep, ep); assert.deepEqual(cold.events, fresh.events);
    // the three losses of the feed by position, each seen coming through
    assert.ok(late >= 1); assert.ok(seen.some((s) => s[0] === 'new' && s[1] === 'user')); assert.equal([...have.values()].filter((e) => e.kind === 'user').map((e) => e.text).join('|'), 'first order|ORDER TYPED MEANWHILE|second order');
    assert.ok(seen.some((s) => s[0] === 'changed' && s[1] === 'report' && s[2] === 'a1')); assert.deepEqual([...have.values()].filter((e) => e.agent === 'a1').map((e) => e.kind).sort(), ['finish', 'report', 'tools']);
    assert.ok(seen.some((s) => s[0] === 'changed' && s[1] === 'tools' && s[2] === 'main')); assert.deepEqual(fresh.events.filter((e) => e.kind === 'tools' && e.agent === 'main').map((e) => e.tools.map((t) => t.id).join('+') + (e.end ? ' end' : '')), ['toolu_r+toolu_g', 'toolu_e end']);
    assert.ok(seen.some((s) => s[0] === 'changed' && s[1] === 'tools' && s[3] === 1));   // the interruption marks a beat the page already had: it comes back under the same key
    // a page that follows another feed is told to load again; a page from before the upgrade is still answered by position
    assert.deepEqual(await load(port, q + '&after=0&ep=nope'), { resync: true }); assert.deepEqual(await load(port, q + '&after=' + (seq + 1) + '&ep=' + ep), { resync: true });
    const old = await load(port, q + '&after=2'); assert.equal(old.total, fresh.events.length); assert.deepEqual(old.events, fresh.events.slice(2));
    assert.equal((await load(port, q + '&after=0&ep=' + ep)).events.length, fresh.events.length);
  } finally { stop(); }
});
test('the lead\'s turn ends on end_turn or on an interruption, and only the lead\'s', async () => {
  const dir = path.join(tmp, 'projects', '-e'); fs.mkdirSync(path.join(dir, 's', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'one'), said(1, 'Looking.', { stop: 'tool_use', id: 'm1' }), used(1, 'toolu_1', 'Bash', { command: 'ls' }, { id: 'm1' }), result(2, 'toolu_1', 'a.js'),
    said(3, 'hm', { thinking: 1, stop: 'end_turn', id: 'm2' }), said(3, 'All good.', { stop: 'end_turn', id: 'm2' }),   // one message, one record per block, each with the stop reason: the mark is on the line, once
    typed(4, 'two'), said(5, 'Starting.'), used(6, 'toolu_2', 'Bash', { command: 'sleep 9' }), used(6, 'toolu_3', 'Read', { file_path: '/x' }), result(7, 'toolu_2', 'no', { toolUseResult: 'interrupted' }), typed(7, [{ type: 'text', text: '[Request interrupted by user for tool use]' }]),
    typed(8, 'three'), said(9, 'Let me think about'), typed(10, [{ type: 'text', text: '[Request interrupted by user]' }]), typed(11, 'four'), used(12, 'toolu_4', 'Glob', { pattern: '*' })].map(line).join(''));
  fs.writeFileSync(path.join(dir, 's', 'subagents', 'agent-a1.jsonl'), [typed(1, 'sub order'), said(2, 'Sub done.', { stop: 'end_turn' })].map(line).join(''));
  const { port, stop } = await serve();
  try {
    const ev = (await load(port, 'proj=-e&id=s')).events.filter((e) => e.kind === 'say' || e.kind === 'tools' || e.kind === 'user' || e.kind === 'report');
    assert.deepEqual(ev.map((e) => e.agent + ' ' + (e.text || e.tools.map((t) => t.id).join('+')) + (e.end ? ' END' : '')), ['user one', 'main Looking.', 'main toolu_1', 'a1 Sub done.', 'main All good. END', 'user two', 'main Starting.', 'main toolu_2+toolu_3 END', 'user three', 'main Let me think about END', 'user four', 'main toolu_4']);
    assert.ok(ev.every((e) => e.end === undefined || e.end === 1));
  } finally { stop(); }
});
test('a turn that ends on a message Claude Code writes itself is over: the API is down, the limit is reached, a refusal, nothing to answer; a message of the model that is cut is not the end', async () => {
  const dir = path.join(tmp, 'projects', '-x'); fs.mkdirSync(path.join(dir, 's', 'subagents'), { recursive: true });
  const err = (s, text, stop = 'stop_sequence') => ({ ...said(s, text, { stop }), isApiErrorMessage: true });   // written by Claude Code itself, in the place of the model's answer
  const synthetic = (r) => ({ ...r, message: { ...r.message, model: '<synthetic>' } });
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'one'), said(1, 'Looking.'), err(2, 'API Error: 529 Overloaded.'), typed(3, 'two'), err(4, 'You have hit your limit'), typed(5, 'three'), err(6, 'API Error: the safeguards flagged this message', 'refusal'),
    typed(7, 'four'), synthetic(said(8, 'No response requested.', { stop: 'stop_sequence' })), typed(9, 'five'), said(10, 'A long answer that was cut', { stop: 'max_tokens' }), typed(11, 'six'), said(12, 'Stopped by a safety check in the middle', { stop: 'refusal' }), said(13, 'and it goes on.', { stop: 'tool_use' }),
    typed(14, 'seven'), used(15, 'toolu_w', 'Bash', { command: 'sleep 60' }), err(16, 'API Error: Connection lost mid-response.'), result(17, 'toolu_w', 'ok'), said(18, 'Back, and done.', { stop: 'end_turn' })].map(line).join(''));   // the connection dropped while a call was out: the lead goes on when it answers
  fs.writeFileSync(path.join(dir, 's', 'subagents', 'agent-a1.jsonl'), [typed(1, 'sub order'), err(1.5, 'API Error: 500')].map(line).join(''));   // a sub-agent that fails does not end the lead's turn
  const { port, stop } = await serve();
  try {
    const ev = (await load(port, 'proj=-x&id=s')).events.filter((e) => e.kind === 'say' || e.kind === 'user');
    assert.deepEqual(ev.map((e) => e.agent + ' ' + e.text + (e.end ? ' END' : '')), ['user one', 'main Looking.', 'a1 API Error: 500', 'main API Error: 529 Overloaded. END', 'user two', 'main You have hit your limit END', 'user three', 'main API Error: the safeguards flagged this message END', 'user four', 'main No response requested. END', 'user five', 'main A long answer that was cut', 'user six', 'main Stopped by a safety check in the middle', 'main and it goes on.', 'user seven', 'main API Error: Connection lost mid-response.', 'main Back, and done. END']);
  } finally { stop(); }
});
test('a pack name that is not a pack is answered as such, whatever the word', async () => {
  const { port, stop } = await serve();
  try {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'nope']) {
      const list = await get(port, '/api/characters?pack=' + name); assert.equal(list.status, 200, name); assert.deepEqual(JSON.parse(list.body).chars, [], name);
      assert.equal((await get(port, '/packs/' + name + '/x.png')).status, 404, name);
    }
    const ponies = JSON.parse((await get(port, '/api/characters?pack=ponies')).body);
    assert.deepEqual(ponies.chars.filter((c) => c.role !== 'lead' && c.role !== 'you').map((c) => c.stem), ['applejack', 'aurelia', 'fluttershy', 'pinkie-pie', 'rainbow-dash', 'rarity', 'starlight-glimmer', 'trixie']);
    assert.deepEqual(ponies.chars.filter((c) => c.role === 'lead').map((c) => c.stem), ['lead']); assert.deepEqual(ponies.chars.filter((c) => c.role === 'you').map((c) => c.stem), ['you']);
    assert.ok(ponies.chars.every((c) => c.talk && c.think && c.celebrate));
    assert.ok(JSON.parse((await get(port, '/api/characters?pack=cats')).body).chars.length > 0);
    assert.deepEqual(JSON.parse((await get(port, '/api/packs')).body).map((p) => p.name), ['ponies', 'cats']);
  } finally { stop(); }
});
test('own agent names: the name given at launch, or the person\'s own agent type; never a stock type', async () => {
  const dir = path.join(tmp, 'projects', '-n'), subs = path.join(dir, 's', 'subagents'); fs.mkdirSync(subs, { recursive: true });
  const kids = [['a1', 'code-reviewer', {}, 3], ['a2', 'general-purpose', {}, 4], ['a3', 'general-purpose', { name: 'Athena' }, 5], ['a4', 'code-reviewer', {}, 6], ['a5', 'my-plugin:db_migrator', {}, 7], ['a6', 'Explore', {}, 8]];
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'review it'), ...kids.map(([id, type, extra, s]) => used(s, 'toolu_' + id, 'Agent', { prompt: 'Do ' + id, description: 'Task ' + id, subagent_type: type, ...extra }, { id: 'mN' }))].map(line).join(''));
  for (const [id, type, , s] of kids) {
    fs.writeFileSync(path.join(subs, `agent-${id}.jsonl`), [typed(s + 10, 'Do ' + id), said(s + 11, 'On it.')].map(line).join(''));
    fs.writeFileSync(path.join(subs, `agent-${id}.meta.json`), JSON.stringify({ agentType: type, description: 'Task ' + id, toolUseId: 'toolu_' + id }));
  }
  const { port, stop } = await serve();
  try {
    const tl = await load(port, 'proj=-n&id=s'), own = Object.fromEntries(tl.agents.map((a) => [a.id, a.own || null]));
    assert.deepEqual(own, { main: null, a1: 'Code Reviewer', a2: null, a3: 'Athena', a4: 'Code Reviewer 2', a5: 'Db Migrator', a6: null });
    assert.ok(!tl.events.some((e) => 'nm' in e), 'the launch name stays on the server side');
    const t0 = Date.now(), [v, h] = await Promise.all([get(port, '/api/voices'), get(port, '/api/health')]);
    assert.equal(v.status, 200); assert.equal(h.status, 200); assert.ok(Array.isArray(JSON.parse(v.body).voices)); assert.ok(Date.now() - t0 < 20000);
  } finally { stop(); }
});
test('compaction summaries, workflow agents, titles and a transcript rewritten in place', async () => {
  const dir = path.join(tmp, 'projects', '-w'), main = path.join(dir, 's.jsonl'), run = path.join(dir, 's', 'subagents', 'workflows', 'wf_run1'); fs.mkdirSync(run, { recursive: true });
  const wfAgent = (id, phase, recs) => { fs.writeFileSync(path.join(run, `agent-${id}.jsonl`), recs.map(line).join('')); fs.writeFileSync(path.join(run, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'workflow-subagent', description: 'check ' + id, workflowPhase: phase })); };
  fs.writeFileSync(main, [typed(0, 'x'.repeat(70000)), said(1, 'NOT THE TITLE'), typed(2, 'This session is being continued. '.repeat(400), { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    used(3, 'toolu_wf', 'Workflow', { script: 'run()' }), result(4, 'toolu_wf', 'launched', { toolUseResult: { status: 'async_launched', runId: 'wf_run1' } }), said(5, 'Launched.', { stop: 'end_turn' })].map(line).join(''));
  wfAgent('w1', 'Review', [typed(6, 'Review the cart.'), used(7, 'toolu_w1', 'Bash', { command: 'ls' }), said(8, 'Cart is fine.')]); wfAgent('w2', 'Verify', [typed(6, 'Verify the login.'), said(9, 'Still looking.')]);
  fs.writeFileSync(path.join(run, 'journal.jsonl'), [{ type: 'launched' }, { type: 'started', agentId: 'w1', key: 'a', label: 'check w1', phase: 'Review' }, { type: 'started', agentId: 'w2', key: 'b', label: 'check w2', phase: 'Verify' }, { type: 'result', agentId: 'w1', key: 'a', result: { ok: true } }].map(line).join(''));
  const { port, stop } = await serve(), q = 'proj=-w&id=s', row = async (p) => JSON.parse((await get(port, p)).body).find((r) => r.proj === '-w');
  try {
    const tl = await load(port, q), by = (k) => tl.events.filter((e) => e.kind === k);
    assert.deepEqual(by('user').map((e) => e.text.length), [70000]);   // the summary is not something the human said
    assert.deepEqual(tl.agents.map((a) => [a.id, a.role, a.type, a.wf, a.phase]), [['main', 'Lead', 'main', undefined, undefined], ['w1', 'check w1', 'workflow-subagent', 'wf_run1', 'Review'], ['w2', 'check w2', 'workflow-subagent', 'wf_run1', 'Verify']]);   // journal.jsonl is not an agent
    assert.deepEqual(by('order').map((e) => [e.agent, e.to, e.bg, e.wf, e.toolId, e.text, e.title, e.k]), [['main', 'w1', true, 'wf_run1', 'toolu_wf', 'Review the cart.', 'check w1', 'o/w1'], ['main', 'w2', true, 'wf_run1', 'toolu_wf', 'Verify the login.', 'check w2', 'o/w2']]);
    assert.deepEqual(by('report').map((e) => [e.agent, e.to, e.text]), [['w1', 'main', 'Cart is fine.']]); assert.deepEqual(by('finish').map((e) => [e.agent, e.to, e.k]), [['w1', 'main', 'f/w1']]);   // the journal says w1 handed its result back; w2 is still at work
    assert.deepEqual(by('say').map((e) => [e.agent, e.text]), [['main', 'NOT THE TITLE'], ['main', 'Launched.'], ['w2', 'Still looking.']]);
    assert.equal((await get(port, '/api/media?proj=-w&id=s&agent=w1&tool=toolu_w1&n=0')).status, 404); assert.equal((await get(port, '/api/media?proj=-w&id=s&agent=nobody&tool=toolu_w1&n=0')).status, 404); assert.equal((await get(port, '/api/media?proj=-w&id=s&agent=main&tool=e&n=0')).status, 400);
    const b = await row('/api/board'); assert.equal(b.title, 'x'.repeat(90)); assert.equal(b.subTotal, 2); assert.equal((await row('/api/sessions')).agents, 2);   // the first prompt, cut off by the 64 KB read, and not the assistant's first line
    fs.appendFileSync(main, line({ type: 'ai-title', aiTitle: 'Named later' })); await wait(1300); assert.equal((await row('/api/board')).title, 'Named later');
    fs.appendFileSync(main, line({ type: 'custom-title', customTitle: 'Renamed by hand' }) + line({ type: 'ai-title', aiTitle: 'Named again' })); await wait(1300); assert.equal((await row('/api/board')).title, 'Renamed by hand');
    fs.appendFileSync(path.join(run, 'journal.jsonl'), line({ type: 'result', agentId: 'w2', key: 'b', result: 'done' })); await wait(280);   // only the journal changed: w2's last line becomes its report
    const d = await load(port, q + '&after=' + tl.seq + '&ep=' + tl.ep); assert.deepEqual(d.events.map((e) => [e.k, e.kind, e.agent]).sort(), [['f/w2', 'finish', 'w2'], [tl.events.find((e) => e.text === 'Still looking.').k, 'report', 'w2']]);
    const size = fs.statSync(main).size; fs.writeFileSync(main, [typed(0, 'a different conversation'), said(1, 'With other lines.'), said(2, 'x'.repeat(size + 5000), { stop: 'end_turn' })].map(line).join('')); await wait(280); assert.ok(fs.statSync(main).size > size);   // rewritten in place and longer than before: the bytes after the old length must not be read as a continuation
    assert.deepEqual(await load(port, q + '&after=' + d.seq + '&ep=' + d.ep), { resync: true });
    const again = await load(port, q); assert.notEqual(again.ep, tl.ep); assert.deepEqual(again.events.filter((e) => e.agent === 'main' || e.agent === 'user').filter((e) => e.kind !== 'order').map((e) => e.kind + (e.end ? ' end' : '')), ['user', 'say', 'say end']);
  } finally { stop(); }
});
test('the list of sessions: a line that goes on with a tool call is not the end of the turn', async () => {
  const dir = path.join(tmp, 'projects', '-b'), f = path.join(dir, 's.jsonl'); fs.mkdirSync(dir, { recursive: true });
  const { port, stop } = await serve(), row = async (proj = '-b') => { await wait(1300); return JSON.parse((await get(port, '/api/board')).body).find((r) => r.proj === proj); }, state = async (proj) => (await row(proj)).state;   // the list is worked out at most once every 1.2 s
  try {
    fs.writeFileSync(f, [typed(0, 'Write the file'), said(1, 'I write it now.', { stop: 'tool_use' })].map(line).join('')); assert.equal(await state(), 'working');   // the call itself is written when it is whole, many seconds later for a long file
    fs.appendFileSync(f, line(used(2, 'toolu_w', 'Bash', { command: 'ls' })) + line(result(3, 'toolu_w', 'ok')) + line(said(4, 'It is written.', { stop: 'end_turn' }))); assert.equal(await state(), 'turn');
    fs.appendFileSync(f, line(typed(5, 'Thanks')) + line(said(6, 'A line that does not say why it stopped, in a session that does.'))); assert.equal(await state(), 'working');   // before a tool call: the call may still come
    const ago = (Date.now() - 60000) / 1000; fs.utimesSync(f, ago, ago); assert.equal(await state(), 'turn');   // none came for 45 s: that was its last word
    fs.appendFileSync(f, line(typed(7, 'Go on')) + line(used(8, 'toolu_x', 'Bash', { command: 'sleep 60' }))); assert.equal(await state(), 'working');
    fs.appendFileSync(f, line(typed(9, '[Request interrupted by user for tool use]'))); assert.equal((await row()).state, 'turn');   // Esc: your turn there, and you know it
    fs.appendFileSync(f, line(typed(10, 'Again')) + line(said(11, 'Done.', { stop: 'end_turn' }))); assert.equal((await row()).state, 'turn');
    fs.mkdirSync(path.join(tmp, 'projects', '-b2'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'projects', '-b2', 's.jsonl'), [typed(0, 'Hello'), said(1, 'A session that never says why its messages stop.')].map(line).join('')); assert.equal(await state('-b2'), 'turn');   // as before
  } finally { stop(); }
});
test('a pinned session is that session or nothing, whatever was written later elsewhere', async () => {
  const a = path.join(tmp, 'projects', '-pa'), b = path.join(tmp, 'projects', '-pb'); fs.mkdirSync(a, { recursive: true }); fs.mkdirSync(b, { recursive: true });
  fs.writeFileSync(path.join(a, 'old.jsonl'), line(typed(0, 'first'))); await wait(30); fs.writeFileSync(path.join(a, 'busy.jsonl'), line(typed(30, 'later, same project'))); await wait(30); fs.writeFileSync(path.join(b, 'new.jsonl'), line(typed(60, 'later, elsewhere')));   // each one typed in later than the last, so the unpinned call has somewhere to go
  const { port, stop } = await serve(), cur = async (q) => JSON.parse((await get(port, '/api/current?' + q)).body);
  try {
    assert.equal((await cur('proj=-pa&id=old')).id, 'old'); assert.equal((await cur('proj=-pa&id=old')).proj, '-pa');
    assert.deepEqual(await cur('proj=-pa&id=gone'), { missing: true }); assert.deepEqual(await cur('proj=&id=old'), { missing: true }); assert.deepEqual(await cur('proj=..&id=old'), { missing: true });
    assert.equal((await cur('proj=-pa&id=old&sproj=-pa&sid=busy')).id, 'old', 'a pin wins over the session a follow window sticks to');
    assert.equal((await cur('proj=-pa&sproj=-pa&sid=busy')).id, 'busy', 'a follow window keeps its session');
    await wait(1300); assert.equal((await cur('proj=')).id, 'new');   // not pinned: the session whose last order is the latest
  } finally { stop(); }
});
test('no request stops the server; another site cannot read the settings', async () => {
  const dir = path.join(tmp, 'projects', '-l'); fs.mkdirSync(path.join(dir, 's', 'subagents'), { recursive: true }); fs.writeFileSync(path.join(dir, 's.jsonl'), line(typed(0, 'hello')));
  let links = true; try { fs.symlinkSync(path.join(dir, 'gone.jsonl'), path.join(dir, 'dead.jsonl')); fs.symlinkSync(path.join(dir, 'gone.jsonl'), path.join(dir, 's', 'subagents', 'agent-dead.jsonl')); } catch { links = false; }   // links that point nowhere (not allowed on every Windows account)
  const { port, stop } = await serve(), raw = (text) => new Promise((res, rej) => { const s = require('net').connect(port, '127.0.0.1', () => s.write(text)); let b = ''; s.on('data', (d) => { b += d; }); s.on('error', rej); s.on('close', () => res(b)); setTimeout(() => s.destroy(), 1500); });
  try {
    assert.match(await raw(`GET // HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`), /^HTTP\/1\.1 400 /);   // used to be an exception outside any try: the process died
    for (const p of ['/%', '/..%2f..%2fetc/passwd', '/api/session?proj=%00&id=%ff', '/api/media', '/api/tts?text=hi&voice=' + 'x'.repeat(300), '/characters/%', '/packs/cats/..%2f..%2fserver.js']) assert.ok((await get(port, p)).status >= 400, p);
    for (const p of ['/api/sessions', '/api/projects', '/api/current', '/api/current?proj=-l', '/api/current?proj=..&id=..&sproj=..&sid=..', '/api/board', '/api/session?proj=-l&id=s']) assert.equal((await get(port, p)).status, 200, p + (links ? ' with a dangling link next to the transcripts' : ''));
    assert.deepEqual(JSON.parse((await get(port, '/api/sessions')).body).filter((r) => r.proj === '-l').map((r) => r.id), ['s']); assert.equal(JSON.parse((await get(port, '/api/current?proj=-l')).body).id, 's');
    assert.equal((await get(port, '/api/prefs.js', { 'sec-fetch-site': 'cross-site' })).status, 403); assert.equal((await get(port, '/api/prefs.js', { 'sec-fetch-site': 'same-site' })).status, 403);   // a <script src> on another site's page
    assert.equal((await get(port, '/api/prefs.js', { 'sec-fetch-site': 'same-origin' })).status, 200); assert.equal((await get(port, '/api/prefs.js')).status, 200);
    assert.equal((await get(port, '/')).status, 200);   // still there
  } finally { stop(); }
});
test('the reasoning before a line or a call rides on it when the transcript keeps its text', async () => {
  const at = (n) => `2026-01-01T00:00:0${n}Z`, asst = (n, id, content) => ({ type: 'assistant', timestamp: at(n), message: { id, content } });
  const recs = [{ type: 'user', timestamp: at(0), message: { role: 'user', content: 'why is it slow' } }, asst(1, 'm1', [{ type: 'thinking', thinking: 'The query scans the whole table.\nI should check the index.', signature: 's' }]), asst(2, 'm1', [{ type: 'tool_use', id: 'toolu_t1', name: 'Bash', input: { command: 'ls' } }]),
    asst(3, 'm2', [{ type: 'thinking', thinking: '', signature: 's' }]), asst(4, 'm2', [{ type: 'text', text: 'Found it.' }])];   // most of the time only the signature is kept: nothing to show
  const dir = path.join(tmp, 'projects', '-th'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 's3.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  try {
    const ev = JSON.parse((await get(port, '/api/session?proj=-th&id=s3')).body).events.filter((e) => e.kind === 'tools' || e.kind === 'say');
    assert.deepEqual(ev.map((e) => [e.kind, e.th || null]), [['tools', 'The query scans the whole table.\nI should check the index.'], ['say', null]]);   // the line breaks of its notes are kept
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('how far a session was said is kept per session, never goes back, and outlives a reload of its feed', async () => {
  const dir = path.join(tmp, 'projects', '-said'), line = (t, text) => JSON.stringify({ type: 'assistant', timestamp: new Date(t).toISOString(), message: { id: 'm' + t, role: 'assistant', content: [{ type: 'text', text }] } }) + '\n';
  fs.mkdirSync(dir, { recursive: true }); const t0 = Date.now() - 60000;
  fs.writeFileSync(path.join(dir, 'a.jsonl'), line(t0, 'one') + line(t0 + 1000, 'two')); fs.writeFileSync(path.join(dir, 'b.jsonl'), line(t0, 'other'));
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  const load = async (id) => { const r = await get(port, `/api/session?proj=-said&id=${id}`), d = JSON.parse(r.body); return { said: +r.headers['x-said'], ep: d.ep, seq: d.seq }; };
  const poll = (id, f, said) => get(port, `/api/session?proj=-said&id=${id}&after=${f.seq}&ep=${encodeURIComponent(f.ep)}&said=${said}`);
  try {
    const a = await load('a'); assert.equal(a.said, 0);
    await poll('a', a, t0 + 1000); assert.equal((await load('a')).said, t0 + 1000);
    await poll('a', a, t0); assert.equal((await load('a')).said, t0 + 1000, 'never goes back');
    await poll('a', a, Date.now() + 3600e3); assert.equal((await load('a')).said, t0 + 1000, 'a time far in the future is ignored');
    assert.equal((await load('b')).said, 0, 'per session');
    fs.writeFileSync(path.join(dir, 'a.jsonl'), line(t0, 'a different conversation') + line(t0 + 500, 'x'.repeat(4000))); await new Promise((r) => setTimeout(r, 300));   // rewritten in place: a new feed
    const a2 = await load('a'); assert.notEqual(a2.ep, a.ep); assert.equal(a2.said, t0 + 1000, 'outlives the new feed');
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('a character\'s thinking and celebrating pictures are its frames, not characters of their own', () => {
  const dir = path.join(tmp, 'chars'); fs.mkdirSync(dir, { recursive: true }); const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  for (const f of ['lead.svg', 'aj.svg', 'aj-talk.svg', 'aj-think.svg', 'aj-celebrate.svg', 'bo.png', 'bo-think.png', 'deep-think.png']) fs.writeFileSync(path.join(dir, f), svg);
  process.env.AGENT_STANDUP_CHARACTERS = dir;
  try {
    const { chars } = require('../server.js').listCharacters(), by = Object.fromEntries(chars.map((c) => [c.stem, c]));
    assert.deepEqual(chars.map((c) => c.stem), ['aj', 'bo', 'deep-think', 'lead'], 'a "-think" picture with no character of its own is a character');
    assert.deepEqual([by.aj.talk, by.aj.think, by.aj.celebrate], ['aj-talk.svg', 'aj-think.svg', 'aj-celebrate.svg']);
    assert.deepEqual([by.bo.talk, by.bo.think, by.bo.celebrate], [null, 'bo-think.png', null]);
  } finally { delete process.env.AGENT_STANDUP_CHARACTERS; }
});
test('the page is served as files that are never kept stale, and nothing outside public/ can be reached', async () => {
  const { port, stop } = await serve();
  try {
    const html = (await get(port, '/')).body, srcs = [...html.matchAll(/<script src="(\/js\/[\w-]+\.js)">/g)].map((m) => m[1]); assert.ok(srcs.length >= 14);
    for (const p of [...srcs, '/app.css']) { const r = await get(port, p); assert.equal(r.status, 200, p); assert.equal(r.headers['cache-control'], 'no-cache', p); assert.match(r.headers['content-type'], p.endsWith('.css') ? /text\/css/ : /javascript/, p); }
    for (const p of ['/js/../../server.js', '/js/..%2f..%2fserver.js', '/js/%2e%2e/%2e%2e/package.json', '/js/nope.js', '/js/']) assert.equal((await get(port, p)).status, 404, p);
  } finally { stop(); }
});
test('a silent sub-agent is finished only once its turn has closed; one continued after its completion is not', async () => {
  const dir = path.join(tmp, 'projects', '-q'), sd = path.join(dir, 's', 'subagents'); fs.mkdirSync(sd, { recursive: true });
  const T = Date.now() - 20 * 60000, at = (s) => new Date(T + s * 1000).toISOString(), line = (r) => JSON.stringify(r) + '\n';
  const call = (id, s) => line({ type: 'assistant', timestamp: at(s), message: { id: 'm' + id, stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'sleep 999' } }] } });
  const answer = (id, s) => line({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
  const say = (text, s, end) => line({ type: 'assistant', timestamp: at(s), message: { id: 'm' + s, stop_reason: end ? 'end_turn' : null, content: [{ type: 'text', text }] } });
  const notify = (tid, s) => line({ type: 'queue-operation', timestamp: at(s), content: `<task-notification><tool-use-id>${tid}</tool-use-id><status>completed</status></task-notification>` });
  let main = line({ type: 'user', timestamp: at(0), message: { role: 'user', content: 'go' } });
  const agents = { busy: [say('Running the long command.', 2), call('tb', 3)], idle: [say('All done here.', 2, true)], cont: [say('First pass done.', 2, true), call('tc', 40)], think: [call('tt', 2), answer('tt', 3)] };
  for (const [k, recs] of Object.entries(agents)) {
    const tid = 'toolu_' + k; main += line({ type: 'assistant', timestamp: at(1), message: { id: 'l' + k, content: [{ type: 'tool_use', id: tid, name: 'Agent', input: { description: k, prompt: 'p', run_in_background: true } }] } });
    main += line({ type: 'user', timestamp: at(1), message: { content: [{ type: 'tool_result', tool_use_id: tid, content: 'Async agent launched successfully.' }] } });
    fs.writeFileSync(path.join(sd, `agent-${k}.meta.json`), JSON.stringify({ agentType: 'x', description: k, toolUseId: tid })); fs.writeFileSync(path.join(sd, `agent-${k}.jsonl`), line({ type: 'user', timestamp: at(1), message: { role: 'user', content: 'p' } }) + recs.join(''));
  }
  main += notify('toolu_cont', 3); fs.writeFileSync(path.join(dir, 's.jsonl'), main);
  const ago = (min) => new Date(Date.now() - min * 60000); for (const k of ['busy', 'idle', 'cont', 'think']) fs.utimesSync(path.join(sd, `agent-${k}.jsonl`), ago(7), ago(7));
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  try {
    const ev = JSON.parse((await get(port, '/api/session?proj=-q&id=s')).body).events, done = (k) => ev.filter((e) => e.agent === k && (e.kind === 'finish' || e.kind === 'report')).map((e) => e.kind).sort().join();
    assert.equal(done('busy'), '', 'a long command is not the end');
    assert.equal(done('idle'), 'finish,report', 'closed its turn, then 6 min of silence');
    assert.equal(done('think'), '', 'thinking about a result is not the end');
    assert.equal(done('cont'), '', 'continued after its completion notice');
    for (const k of ['busy', 'think']) fs.utimesSync(path.join(sd, `agent-${k}.jsonl`), ago(31), ago(31));
    fs.appendFileSync(path.join(dir, 's.jsonl'), line({ type: 'user', timestamp: at(50), message: { role: 'user', content: 'again' } }));
    await new Promise((r) => setTimeout(r, 300));   // past the rebuild throttle
    const ev2 = JSON.parse((await get(port, '/api/session?proj=-q&id=s')).body).events;
    for (const k of ['busy', 'think']) assert.equal(ev2.filter((e) => e.agent === k && e.kind === 'finish').length, 1, k + ': 30 min stuck counts as finished');
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('an Agent call launched without the flag is a background call: its answer says so', async () => {
  const dir = path.join(tmp, 'projects', '-bg'), subs = path.join(dir, 's', 'subagents'); fs.mkdirSync(subs, { recursive: true });
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'go'), used(1, 'toolu_a', 'Agent', { prompt: 'Check the cart.', description: 'check cart' }),
    result(2, 'toolu_a', 'Async agent launched successfully. agentId: a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a1' } }), said(3, 'On the call.', { stop: 'end_turn' })].map(line).join(''));
  fs.writeFileSync(path.join(subs, 'agent-a1.jsonl'), [typed(4, 'Check the cart.'), said(5, 'Cart is fine.')].map(line).join(''));
  fs.writeFileSync(path.join(subs, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'check cart', toolUseId: 'toolu_a' }));
  const { port, stop } = await serve();
  try {
    const tl = await load(port, 'proj=-bg&id=s');
    assert.deepEqual(tl.events.filter((e) => e.kind === 'order').map((e) => [e.agent, e.to, e.bg, e.toolId]), [['main', 'a1', true, 'toolu_a']]);
    assert.ok(!tl.events.some((e) => e.kind === 'finish'), 'no completion record yet: the agent is still on the call');
  } finally { stop(); }
});
test('a sub-agent that hands its report back with a tool call still reports in words', async () => {
  const dir = path.join(tmp, 'projects', '-hb'), subs = path.join(dir, 's', 'subagents'); fs.mkdirSync(subs, { recursive: true });
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'go'), used(1, 'toolu_a', 'Agent', { prompt: 'Check the cart.' }), result(6, 'toolu_a', 'Cart is fine.')].map(line).join(''));
  fs.writeFileSync(path.join(subs, 'agent-a1.jsonl'), [typed(2, 'Check the cart.'), used(4, 'toolu_h', 'SubagentHandback', { message: 'Cart is fine: two bugs, both fixed.' })].map(line).join(''));
  fs.writeFileSync(path.join(subs, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'check cart', toolUseId: 'toolu_a' }));
  const { port, stop } = await serve();
  try {
    const tl = await load(port, 'proj=-hb&id=s'), ev = tl.events.filter((e) => e.agent === 'a1');
    assert.deepEqual(ev.filter((e) => e.kind === 'report').map((e) => [e.agent, e.to, e.text]), [['a1', 'main', 'Cart is fine: two bugs, both fixed.']]);
    assert.ok(!ev.some((e) => e.kind === 'tools' || e.kind === 'results'), 'the handback is not shown as a tool call');
  } finally { stop(); }
});
test('the board: a lead whose turn closed while its background agents work is on the call, not yours', async () => {
  const dir = path.join(tmp, 'projects', '-bb'), f = path.join(dir, 's.jsonl'), subs = path.join(dir, 's', 'subagents'); fs.mkdirSync(subs, { recursive: true });
  fs.writeFileSync(f, [typed(0, 'go'), used(1, 'toolu_a', 'Agent', { prompt: 'Check the cart.' }),
    result(2, 'toolu_a', 'Async agent launched successfully.', { toolUseResult: { isAsync: true, status: 'async_launched' } }), used(3, 'toolu_w', 'ScheduleWakeup', {}), result(4, 'toolu_w', 'ok'), said(5, 'On the call.', { stop: 'end_turn' })].map(line).join(''));
  fs.writeFileSync(path.join(subs, 'agent-a1.jsonl'), [typed(2, 'Check the cart.'), said(3, 'Cart is fine.')].map(line).join(''));
  const old = (Date.now() - 600000) / 1000; fs.utimesSync(path.join(subs, 'agent-a1.jsonl'), old, old);   // its last word is old: only the unanswered launch keeps the row on the call
  const { port, stop } = await serve(), row = async () => { await wait(1300); return JSON.parse((await get(port, '/api/board')).body).find((r) => r.proj === '-bb'); };
  try {
    assert.equal((await row()).state, 'waiting');
    fs.appendFileSync(f, line({ type: 'queue-operation', operation: 'enqueue', timestamp: at(6), content: '<task-notification>\n<task-id>t1</task-id>\n<tool-use-id>toolu_a</tool-use-id>\n<status>completed</status>\n</task-notification>' }));
    assert.equal((await row()).state, 'turn');   // the agent answered: its report is the lead's next turn
  } finally { stop(); }
});
// ---- the live call follows the last order typed, in the folder it follows, and holds on a session you went to by hand
// These look at every session under ROOT, so the ones other tests left are parked in another folder while they run.
const alone = (made) => { const root = path.join(tmp, 'projects'), where = fs.mkdtempSync(path.join(tmp, 'park-')); for (const d of fs.readdirSync(root)) if (!made.includes(d)) fs.renameSync(path.join(root, d), path.join(where, d)); return () => { for (const d of fs.readdirSync(where)) fs.renameSync(path.join(where, d), path.join(root, d)); }; };
test('a project beside the one the call follows is not inside it: the cwd of its transcripts tells', async () => {
  const root = path.join(tmp, 'projects'), made = ['-w-app', '-w-app-old', '-w-app-sub'];
  for (const d of made) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, '-w-app', 'here.jsonl'), line(typed(100, 'the app itself', { cwd: '/w/app' })));
  fs.writeFileSync(path.join(root, '-w-app-old', 'beside.jsonl'), line(typed(300, 'a folder beside the app, typed last', { cwd: '/w/app-old' })));   // its name starts with "-w-app-": by name alone it would count as inside
  fs.writeFileSync(path.join(root, '-w-app-sub', 'inside.jsonl'), line(typed(10, 'a folder inside the app', { cwd: '/w/app/sub' })));
  const back = alone(made), { port, stop } = await serve(), cur = async (q) => { await wait(1300); return JSON.parse((await get(port, '/api/current?' + q)).body); };
  try {
    assert.equal((await cur('proj=-w-app')).id, 'here', 'the newest order in the folder wins over one typed beside it');
    fs.appendFileSync(path.join(root, '-w-app-sub', 'inside.jsonl'), line(typed(200, 'typed in the folder')));
    assert.equal((await cur('proj=-w-app')).id, 'inside', 'a session of a folder inside counts');
    fs.appendFileSync(path.join(root, '-w-app-old', 'beside.jsonl'), line(typed(400, 'typed beside, the latest order anywhere')));
    assert.equal((await cur('proj=-w-app')).id, 'inside', 'the newest order in a folder beside never takes the call');
    assert.equal((await cur('proj=-w-app-old')).id, 'beside', 'a window on that folder follows it');
    assert.equal((await cur('proj=')).id, 'beside', 'looking everywhere, the newest order wins');
  } finally { stop(); back(); }
});
test('the call goes to the session you typed in last, not to the one written to last', async () => {
  const root = path.join(tmp, 'projects'), made = ['-lt-a', '-lt-b'];
  fs.mkdirSync(path.join(root, '-lt-a'), { recursive: true }); fs.mkdirSync(path.join(root, '-lt-b'), { recursive: true });
  fs.writeFileSync(path.join(root, '-lt-a', 'a.jsonl'), line(typed(500000, 'ordered here last'))); await wait(30);
  fs.writeFileSync(path.join(root, '-lt-b', 'b.jsonl'), line(typed(400000, 'written later, ordered earlier')));   // B is the newest file, A holds the last order
  const back = alone(made), { port, stop } = await serve(), cur = async (q) => { await wait(1300); return JSON.parse((await get(port, '/api/current?' + q)).body); };
  try {
    assert.equal((await cur('proj=')).id, 'a', 'the last typed order wins over the newest file');
    assert.equal((await cur('proj=')).why, 'typed');
    fs.appendFileSync(path.join(root, '-lt-b', 'b.jsonl'), line(typed(600000, 'now an order here')));
    assert.equal((await cur('proj=')).id, 'b', 'typing elsewhere moves the call there');
  } finally { stop(); back(); }
});
test('a session opened by hand keeps the call until an order is typed somewhere else', async () => {
  const root = path.join(tmp, 'projects'), made = ['-pk'];
  fs.mkdirSync(path.join(root, '-pk'), { recursive: true });
  fs.writeFileSync(path.join(root, '-pk', 'idle.jsonl'), line(typed(100, 'an idle session, opened by hand')));
  fs.writeFileSync(path.join(root, '-pk', 'busy.jsonl'), line(typed(700000, 'a session at work')));
  const back = alone(made), { port, stop } = await serve(), cur = async (q) => { await wait(1300); return JSON.parse((await get(port, '/api/current?' + q)).body); };
  try {
    const p = await cur('proj=&pproj=-pk&pid=idle'); assert.equal(p.id, 'idle'); assert.equal(p.why, 'pick'); assert.equal(p.asked, Date.parse(at(700000)), 'the answer gives the latest order, for the page to send back');
    assert.equal((await cur('proj=&pproj=-pk&pid=idle&psince=' + p.asked)).id, 'idle', 'no new order: the pick holds');
    fs.appendFileSync(path.join(root, '-pk', 'idle.jsonl'), line(typed(800000, 'an order in the picked session')));
    const q = await cur('proj=&pproj=-pk&pid=idle&psince=' + p.asked); assert.equal(q.id, 'idle'); assert.equal(q.asked, Date.parse(at(800000)), 'what you type in it keeps the call there');
    fs.appendFileSync(path.join(root, '-pk', 'busy.jsonl'), line(typed(900000, 'an order elsewhere')));
    assert.equal((await cur('proj=&pproj=-pk&pid=idle&psince=' + q.asked)).id, 'busy', 'an order typed elsewhere takes the call back');
  } finally { stop(); back(); }
});
test('the list keeps places per folder, and the temporary folders have places of their own', async () => {
  const root = path.join(tmp, 'projects'), made = ['-keep', '-tp-main', '-tmp-x'];
  for (let i = 0; i < 15; i++) made.push('-busy' + i);
  for (const d of made) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, '-keep', 'mine.jsonl'), line(typed(0, 'the session of my folder'))); await wait(30);
  for (let i = 0; i < 15; i++) for (let k = 0; k < 3; k++) fs.writeFileSync(path.join(root, `-busy${i}`, `s${k}.jsonl`), line(typed(10, 'written after mine')));   // 45 sessions elsewhere
  fs.writeFileSync(path.join(root, '-tmp-x', 't.jsonl'), line(typed(800000, 'a script ran Claude Code in a temporary folder')));
  fs.writeFileSync(path.join(root, '-tp-main', 'm.jsonl'), line(typed(700000, 'a session someone works in')));
  const back = alone(made), { port, stop } = await serve(), board = async () => { await wait(1300); return JSON.parse((await get(port, '/api/board')).body); }, cur = async (q) => { await wait(1300); return JSON.parse((await get(port, '/api/current?' + q)).body); };
  try {
    const rows = await board();
    assert.ok(rows.some((r) => r.proj === '-keep' && r.id === 'mine'), 'my folder keeps its session however busy the others are');
    assert.equal(rows.filter((r) => r.proj === '-tmp-x').length, 1); assert.ok(rows.every((r) => !!r.tmp === (r.proj === '-tmp-x')), 'a row says whether its folder is a temporary one');
    assert.equal((await cur('proj=')).id, 'm', 'the newest session is a temporary one: the call goes elsewhere');
    assert.equal((await cur('proj=-tmp-x')).id, 't', 'a window open on such a folder follows it');
    for (const d of fs.readdirSync(root)) if (d !== '-tmp-x') fs.rmSync(path.join(root, d), { recursive: true, force: true });   // nothing but the temporary folder left
    assert.equal((await cur('proj=')).id, 't', 'a temporary session rather than an empty call');
  } finally { stop(); back(); }
});
// ---- what a session waits for: Claude Code's own sessions folder says a menu is open (a Bash approval looks like a running command in the transcript)
test('a menu open in the session makes its row say so: the command, the question, the plan', async () => {
  const root = path.join(tmp, 'projects'), cc = path.join(tmp, 'cc'), made = ['-lv'];
  fs.mkdirSync(root + '/-lv', { recursive: true }); fs.mkdirSync(cc, { recursive: true });
  const asst = (n, id, content) => ({ type: 'assistant', timestamp: at(n), message: { id, content } });
  const kids = [];   // one live process per session: Claude Code's file is named after its pid, and a file whose process ended is ignored
  const sess = (id, o) => { const pid = o.pid || (kids.push(require('child_process').spawn('sleep', ['600'])), kids[kids.length - 1].pid); fs.writeFileSync(path.join(cc, pid + '.json'), JSON.stringify({ pid, sessionId: id, status: o.status, waitingFor: o.waitingFor, statusUpdatedAt: Date.now() - 60000 })); };
  const rec = (rs) => rs.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(root, '-lv', 'cmd.jsonl'), rec([typed(0, 'run the tests'), asst(1, 'm1', [{ type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { command: 'npm test', description: 'the suite' } }])]));   // no result: it waits for the go-ahead
  fs.writeFileSync(path.join(root, '-lv', 'ask.jsonl'), rec([typed(0, 'which one'), asst(1, 'm1', [{ type: 'tool_use', id: 'toolu_q', name: 'AskUserQuestion', input: { questions: [{ question: 'Which port?', header: 'Port', options: [{ label: '8080', description: 'dev' }, { label: '443', description: 'tls' }] }] } }])]));
  fs.writeFileSync(path.join(root, '-lv', 'dlg.jsonl'), rec([typed(0, 'hi'), asst(1, 'm1', [{ type: 'tool_use', id: 'toolu_d', name: 'Bash', input: { command: 'ls' } }])]));
  const planPath = path.join(root, '-lv', '.claude', 'plans', 'x.md'); fs.mkdirSync(path.dirname(planPath), { recursive: true }); fs.writeFileSync(planPath, '# Check the index first');
  fs.writeFileSync(path.join(root, '-lv', 'plan.jsonl'), rec([typed(0, 'fix it'), asst(1, 'm1', [{ type: 'tool_use', id: 'toolu_w', name: 'Write', input: { file_path: planPath } }]), result(2, 'toolu_w', 'ok')]));
  fs.writeFileSync(path.join(root, '-lv', 'dead.jsonl'), rec([typed(0, 'run'), asst(1, 'm1', [{ type: 'tool_use', id: 'toolu_x', name: 'Bash', input: { command: 'sleep 5' } }])]));
  sess('cmd', { status: 'waiting' }); sess('ask', { status: 'waiting' }); sess('dlg', { status: 'waiting', waitingFor: 'dialog open' }); sess('plan', { status: 'waiting' }); sess('dead', { status: 'waiting', pid: 2147483646 });
  const back = alone(made), { port, stop } = await serve(), board = async () => { await wait(1300); const rows = JSON.parse((await get(port, '/api/board')).body); return Object.fromEntries(rows.map((r) => [r.id, r])); };
  try {
    const r = await board();
    assert.equal(r.cmd.state, 'blocked'); assert.equal(r.cmd.sure, 1); assert.equal(r.cmd.menu.kind, 'command'); assert.equal(r.cmd.menu.cmd, 'npm test'); assert.equal(r.cmd.ask, 'Bash(npm test)');
    assert.ok(r.cmd.since && r.cmd.ran >= 0, 'since and how long it worked');
    assert.deepEqual(r.ask.menu.questions[0].options.map((o) => o.label), ['8080', '443']); assert.equal(r.ask.ask, 'Which port?');
    assert.notEqual(r.dlg.state, 'blocked', 'a dialog you opened yourself (/model) is not a question for you');
    assert.equal(r.plan.state, 'blocked'); assert.equal(r.plan.menu.kind, 'plan'); assert.match(r.plan.menu.text, /Check the index/); assert.ok(r.plan.menu.sure, 'a menu the transcript does not record: the plan written this turn');
    assert.ok(!r.dead.sure && r.dead.state !== 'blocked', 'a session whose process ended is not waited on');
  } finally { for (const n of fs.readdirSync(cc)) fs.unlinkSync(path.join(cc, n)); kids.forEach((k) => k.kill()); stop(); back(); }
});
