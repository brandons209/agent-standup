// The real public/js scripts in a node vm with a tiny fake DOM: the logic, without a browser (test/live.test.js drives a real one)
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const PUB = process.env.PUB || path.join(__dirname, '..', 'public');
function El(tag = 'div') {
  const cls = new Set(), kids = [], el = { tag, dataset: {}, style: { setProperty(k, v) { el._props[k] = v; } }, _props: {}, offsetParent: {}, children: kids, parentNode: null, textContent: '', _html: '', clientWidth: 0, clientHeight: 0, offsetWidth: 0, id: '',
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; v ? cls.add(c) : cls.delete(c); return v; } },
    get className() { return [...cls].join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((x) => cls.add(x)); },
    get innerHTML() { return el._html; }, set innerHTML(v) { el._html = v; kids.length = 0; for (const m of String(v).matchAll(/<(\w+)[^>]*class="([^"]+)"/g)) { const k = El(m[1]); k.className = m[2]; k.parentNode = el; kids.push(k); } },
    appendChild: (k) => { kids.push(k); k.parentNode = el; return k; }, remove: () => { const p = el.parentNode; if (p) p.children.splice(p.children.indexOf(el), 1); },
    querySelector: (sel) => { const c = sel.replace(/^\./, ''); const find = (n) => { for (const k of n.children) { if (k.classList.contains(c)) return k; const r = find(k); if (r) return r; } return null; }; return find(el); },
    querySelectorAll: () => [], setAttribute() {}, getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }), animate: () => ({}), scrollTo() {}, focus() {}, addEventListener() {} };
  return el;
}
function page(search = '?live=1', timers = null) {   // timers: an array that collects setTimeout callbacks, to run them by hand
  const byId = new Map(), get = (id) => { if (!byId.has(id)) { const e = El(); e.id = id; byId.set(id, e); } return byId.get(id); }, errors = [];
  const document = { body: El('body'), documentElement: El(), hidden: false, createElement: (t) => El(t), getElementById: get, addEventListener() {},
    querySelector: (s) => (/^#[\w-]+$/.test(s) ? get(s.slice(1)) : s.startsWith('#') ? null : El()), querySelectorAll: (s) => (s === '.tile.presenter' ? [...byId.values()].filter((e) => e.classList.contains('presenter')) : []) };
  const ctx = { console: { ...console, log() {}, warn() {} }, setTimeout: (f) => (timers ? timers.push(f) : 0), setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, performance: { now: () => 0 },
    URLSearchParams, URL, TextEncoder, TextDecoder, fetch: () => new Promise(() => {}), localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search, href: 'http://localhost/' + search }, navigator: { userAgent: '' }, document, SpeechSynthesisUtterance: function () {},
    ResizeObserver: function () { return { observe() {} }; }, MutationObserver: function () { return { observe() {} }; }, Image: function () { return El(); }, Blob: function () {}, FileReader: function () { return El(); },
    matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, getComputedStyle: () => ({}), devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, SAVED_PREFS: null, CSS: { escape: (s) => s } };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  const names = [...fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').matchAll(/<script src="\/js\/([\w-]+)\.js"><\/script>/g)].map((m) => m[1]);
  for (const n of names) try { vm.runInContext(fs.readFileSync(path.join(PUB, 'js', n + '.js'), 'utf8'), ctx, { filename: n + '.js' }); } catch (e) { errors.push(n + ': ' + e.message); }
  return { names, errors, get, ctx, run: (c) => vm.runInContext(c, ctx, { timeout: 2000 }) };
}
test('every page script loads, in the order of index.html, with and without a pinned session', { timeout: 5000 }, () => {
  const p = page(); assert.deepEqual(p.errors, []); assert.ok(p.names.length >= 14, p.names.join());
  assert.deepEqual(fs.readdirSync(path.join(PUB, 'js')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort(), [...p.names].sort(), 'every file in public/js is loaded by index.html');
  for (const g of ['S', 'startTalk', 'agentState', 'togglePlay', 'liveStart', 'share', 'shareBusy', 'layout', 'doneQuip', 'narrate', 'applyLog']) assert.equal(p.run(`typeof ${g}`) !== 'undefined', true, g);
  assert.equal(p.run('S.pin'), null);
  const q = page('?live=1&pin=abc&proj=-p'); assert.deepEqual(q.errors, []); assert.deepEqual(JSON.parse(q.run('JSON.stringify(S.pin)')), { id: 'abc', proj: '-p' });
});
test('the page scripts share one scope cleanly: no name declared twice, nothing a browser would reject', { timeout: 5000 }, () => {
  const names = [...fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').matchAll(/<script src="\/js\/([\w-]+)\.js"><\/script>/g)].map((m) => m[1]), seen = new Map();
  for (const n of names) {
    const src = fs.readFileSync(path.join(PUB, 'js', n + '.js'), 'utf8'); new vm.Script(src, { filename: n + '.js' });   // a classic script: a top-level return is a syntax error here, not in node --check
    for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) { assert.ok(!seen.has(m[1]), `${m[1]} is declared in ${seen.get(m[1])} and ${n}`); seen.set(m[1], n); }
  }
});
test('names: a character name, numbered when two agents share it; your list, then numbers', { timeout: 5000 }, () => {
  const { run } = page();
  assert.equal(run(`charName('rainbow-dash')`), 'Rainbow Dash'); assert.equal(run(`charName('mr_snow')`), 'Mr Snow');
  assert.deepEqual(JSON.parse(run(`JSON.stringify([uniqueName('a', 0, 'Rarity'), uniqueName('b', 0, 'Rarity'), uniqueName('a', 5, 'X')])`)), ['Rarity', 'Rarity 2', 'Rarity']);
  run(`for (const k in nameBook) delete nameBook[k]; prefs.names = 'Ann\\nBob';`);
  const n = JSON.parse(run(`JSON.stringify([uniqueName('x', 0), uniqueName('y', 0), uniqueName('z', 0)])`)); assert.deepEqual(n.slice(0, 2), ['Ann', 'Bob']); assert.match(n[2], /^(Ann|Bob) 3$/);
});
test('gallery: the column count fits every tile on the stage without scrolling', { timeout: 5000 }, () => {
  const { run, get } = page(), st = get('stage'); st.clientWidth = 1228; st.clientHeight = 628; get('center').clientWidth = 1228;
  run(`drawGantt = () => {}; document.body.classList.add('gallery');`);
  for (const n of [1, 2, 4, 6, 9]) {
    st.children.length = 0; for (let i = 0; i < n; i++) st.children.push(get(`g${n}_${i}`));
    run('layout()'); const c = +st._props['--cols'], rh = parseInt(st._props['--rh']), r = Math.ceil(n / c);
    assert.ok(r * rh + (r - 1) * 12 <= 601 && c * rh * 4 / 3 + (c - 1) * 12 <= 1201, `n=${n}: ${c}x${r} @${rh}`); assert.equal(st._props['--fcols'], 1);
  }
});
test('screen share: thinking keeps the screen, done closes it, catching up never opens one', { timeout: 5000 }, () => {
  const { run, get } = page(); run(`AUD.tone = () => {}; avatarSVG = () => ''; termModel = () => ({ view: 'term', title: 't', lines: [], stat: '' }); setTicker = () => {}; activityLabel = () => '';
    S.agents = { main: { id: 'main', name: 'C', gid: 0 }, a: { id: 'a', name: 'A', gid: 1 } }; S.status = { a: 'working' }; S.playing = true; S.boost = 1; S.live = true; S.turnOver = false; prefs.multiShare = false;`);
  for (const id of ['main', 'a']) get('t-' + id).innerHTML = '<div class="bubble"></div>';
  let n = 0; const tool = (a) => run(`tickTools({ agent: '${a}', kind: 'tools', tools: [{ id: 't${++n}', ts: S.clock, name: 'Bash', arg: 'x', d: { kind: 'cmd', text: 'x' } }] })`);
  const result = (a) => run(`applyResults({ agent: '${a}', kind: 'results', ts: S.clock, items: [{ id: 't${n}', out: 'ok' }] })`);
  const tick = (ms) => { for (let t = 0; t < ms; t += 250) run('S.clock += 250 * spd(); tickShares(250)'); }, panes = () => run('[...S.shares.keys()].join()');
  tool('a'); assert.equal(panes(), 'a'); result('a'); tick(20000); assert.equal(panes(), 'a', 'thinking between calls');
  run(`applyStatus({ kind: 'finish', agent: 'a', to: 'main', ts: S.clock })`); tick(2000); assert.equal(panes(), '', 'closed when done');
  run(`S.status.a = 'working'; S.boost = 3`); tool('a'); assert.equal(panes(), '', 'catching up');
});
test('a sub-agent that left the call shares no screen; new work from an agent thought done brings it back', { timeout: 5000 }, () => {
  const { run, get } = page(); run(`AUD.tone = () => {}; avatarSVG = () => ''; termModel = () => ({ view: 'term', title: 't', lines: [], stat: '' }); setTicker = () => {}; activityLabel = () => ''; toast = () => {}; poof = () => {};
    S.agents = { main: { id: 'main', name: 'C', gid: 0 }, a: { id: 'a', name: 'A', gid: 1 } }; S.status = { a: 'working' }; S.playing = true; S.boost = 1; S.live = true; S.turnOver = false; prefs.multiShare = false; prefs.banter = false;`);
  get('t-a').innerHTML = '<div class="bubble"></div>';
  let n = 0; const tools = (a) => `{ agent: '${a}', kind: 'tools', ts: S.clock, tools: [{ id: 't${++n}', ts: S.clock, name: 'Bash', arg: 'x', d: { kind: 'cmd', text: 'x' } }] }`, panes = () => run('[...S.shares.keys()].join()');
  run(`tickTools(${tools('a')})`); assert.equal(panes(), 'a');
  run(`applyStatus({ kind: 'report', agent: 'a', to: 'main', ts: S.clock }); vanish('a')`); assert.equal(panes(), '', 'leaving closes its screen');
  run(`tickTools(${tools('a')})`); assert.equal(panes(), '', 'no screen for an agent that is gone');
  run(`{ const e = ${tools('a')}; applyStatus(e); tickTools(e); }`);
  assert.deepEqual(JSON.parse(run(`JSON.stringify([S.status.a, S.gone.has('a'), 'a' in S.doneAt])`)), ['working', false, false], 'back at work');
  assert.equal(panes(), 'a', 'and sharing again');
  run(`S.events = [{ kind: 'order', agent: 'main', to: 'a', ts: 0, t: 0 }, { kind: 'report', agent: 'a', to: 'main', ts: 1, t: 1 }, ${tools('a').replace('ts: S.clock', 'ts: 2, t: 2')}, { kind: 'say', agent: 'main', ts: 99e4, t: 99e4 }]; recomputeStatus(4)`);
  assert.deepEqual(JSON.parse(run(`JSON.stringify([S.status.a, S.gone.has('a')])`)), ['working', false], 'a seek works it out the same way');
});
test('liveStart: a reload starts after what this session already said', { timeout: 5000 }, () => {
  const { run } = page(); run('recomputeStatus = () => {}; paintStatus = () => {}; trNew = () => {};');
  const now = Date.now(), ev = (dt, kind = 'say') => ({ ts: now + dt, kind, agent: 'main', text: 'x' });
  const setup = (evs, said, x = '') => run(`S.events = ${JSON.stringify(evs)}; S.saidSrv = ${said}; S.locked = false; S.join = false; S.since = 0; ${x}`);
  setup([ev(-30000), ev(-20000), ev(-10000, 'tools')], now - 10000); assert.equal(run('liveStart()'), 3);
  setup([ev(-30000), ev(-20000), ev(-10000), ev(-5000, 'tools')], now - 20000); assert.equal(run('liveStart()'), 2);
  setup([ev(-60000), ev(-1000)], 0, 'S.locked = true;'); assert.equal(run('liveStart()'), 2);
});
test('toolLine says what a tool call does in plain words', { timeout: 5000 }, () => {
  const { run } = page(), W = `LEAD.en`;
  const say = (d, more = []) => run(`toolLine({ tools: [{ d: ${JSON.stringify(d)} }, ...${JSON.stringify(more)}] }, ${W})`);
  assert.match(say({ kind: 'read', file: '/a/server.js' }, [{ d: { kind: 'read', file: '/b/x.js' } }]), /server\.js.*x\.js\.$/);
  assert.match(say({ kind: 'cmd', text: 'npm test --watch' }), /npm test\.$/);
  assert.match(say({ kind: 'cmd', text: 'ls', note: 'List files.' }), /List files\.$/);
});
test('characters: no picture is shown twice among the agents on the call, and a name frees up when its agent leaves', { timeout: 5000 }, () => {
  const { run } = page(), pool = ['applejack', 'fluttershy', 'pinkie-pie', 'rainbow-dash', 'rarity'];
  run(`CHARS = { lead: null, you: null, pool: ${JSON.stringify(pool.map((n) => ({ name: n, idle: n })))} }; S.agents = {};`);
  const add = (id) => run(`S.agents['${id}'] = persona({ id: '${id}' })`), pic = (id) => run(`S.agents['${id}'].custom.name`);
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) add(id);
  run(`S.gone.add('a1'); S.gone.add('a2');`); add('a6'); add('a7');
  const here = ['a3', 'a4', 'a5', 'a6', 'a7'].map(pic); assert.equal(new Set(here).size, 5, here.join());
  assert.doesNotMatch(run(`S.agents.a6.name`), / \d$/, 'a freed picture comes with its plain name');
});
test('the cast order is seeded by the session: another session starts elsewhere, the same session always with the same cast', { timeout: 5000 }, () => {
  const { run } = page(), pool = ['applejack', 'fluttershy', 'pinkie-pie', 'rainbow-dash', 'rarity', 'twilight', 'trixie', 'starlight', 'aurelia'];
  run(`CHARS = { lead: null, you: null, pool: ${JSON.stringify(pool.map((n) => ({ name: n, idle: n })))} };`);
  const cast = (id) => { run(`S.castSeed = hash(${JSON.stringify(id)}); S.castN = 0; S.agents = {}; for (const k in nameBook) delete nameBook[k];`);
    for (const a of ['a1', 'a2', 'a3']) run(`S.agents['${a}'] = persona({ id: '${a}' })`);
    return JSON.parse(run(`JSON.stringify(['a1', 'a2', 'a3'].map((a) => S.agents[a].custom.name))`)); };
  const one = cast('s1'), two = cast('abc');
  assert.notDeepEqual(one.slice(0, 3), two.slice(0, 3), `${one} vs ${two}`);
  assert.deepEqual(cast('s1'), one, 'the same session, reloaded, gets the same cast');
  assert.deepEqual(cast('abc'), two);
  assert.equal(new Set(one).size, 3, one.join());
});
test('own names: a sub-agent you named keeps its own name when the pref is on', { timeout: 5000 }, () => {
  const { run } = page();
  run(`CHARS = { lead: null, you: null, pool: [{ name: 'applejack', idle: 'a' }, { name: 'rarity', idle: 'r' }] }; S.agents = {}; prefs.ownNames = false;`);
  const off = JSON.parse(run(`{ const p = persona({ id: 'x', own: 'Code Reviewer' }); JSON.stringify([p.name, charName(p.custom.name)]); }`));
  assert.equal(off[0], off[1], 'off: named after its character');
  run(`for (const k in nameBook) delete nameBook[k]; S.castN = 0; prefs.ownNames = true;`);
  const on = JSON.parse(run(`{ const p = persona({ id: 'x', own: 'Code Reviewer' }); JSON.stringify([p.name, charName(p.custom.name)]); }`));
  assert.equal(on[0], 'Code Reviewer', 'on: the name the person gave it');
  assert.equal(on[1], off[1], 'the picture stays the character’s');
  assert.equal(run(`persona({ id: 'y', own: 'Code Reviewer' }).name`), 'Code Reviewer 2', 'two of them are numbered');
});
test('a thought is whole sentences of the agent’s own notes; a wrap-up gist is short plain speech', { timeout: 5000 }, () => {
  const { run } = page();
  run(`S.th = { a: { text: 'The migration touches db/schema.sql and the seed data. It has to run before the tests start.', ts: Date.now() } };`);
  assert.equal(run('realThought("a")'), 'The migration touches db/schema.sql and the seed data.', 'a file name does not end a sentence');
  assert.equal(run('realThought("a")'), 'It has to run before the tests start.');
  run(`S.th = { b: { text: '- check the parser\\n- then rerun the suite', ts: Date.now() } };`);
  assert.deepEqual(JSON.parse(run('JSON.stringify([realThought("b"), realThought("b"), realThought("b")])')), ['check the parser', 'then rerun the suite', null], 'one thought per line');
  const md = '## What was done\n\nThe slow query now uses the index added in 1.25.8, so the login answers at once.\n\n- the query was rewritten\n- the cache is warmed at boot\n\n| file | lines |\n|---|---|\n| a.js | 12 |\n\n```\nconst x = 1;\n```\n';
  const g = run(`gist(${JSON.stringify(md)}, '')`);
  assert.ok(g.length <= 280, g.length + ': ' + g);
  assert.doesNotMatch(g, /[|`#]|const x/, g);
  assert.match(g, /index/, g);
});
test('the slider follows the session outside a live call, and the token counts move live', { timeout: 5000 }, () => {
  const timers = [], { run, get } = page('?live=1', timers);
  run(`drawGantt = () => {}; renderMeet = () => {}; renderTree = () => {}; renderDetail = () => {}; paintStates = () => {};
    S.events = [{ kind: 'say', agent: 'main', ts: 0, t: 0 }]; S.idx = 0; paintStatus();`);
  assert.equal(run('$("#seek").max'), 0);
  run(`S.events = [{ kind: 'say', agent: 'main', ts: 0, t: 0 }, { kind: 'say', agent: 'main', ts: 1, t: 1 }, { kind: 'say', agent: 'main', ts: 2, t: 2 }]; paintStatus();`);
  assert.equal(run('$("#seek").max'), 2, 'the range follows the session');
  get('t-main').innerHTML = '<div class="tk"></div><div class="cx"></div>';
  run(`S.agents = { main: { id: 'main', name: 'C', gid: 0 } }; S.usage = {}; S.ctx = {}; S.model = {}; later.p = {};`);
  run(`tally({ kind: 'usage', agent: 'main', u: { i: 100, o: 40, r: 5, w: 0 }, model: 'm' }); tally({ kind: 'usage', agent: 'main', u: { i: 200, o: 60, r: 5, w: 0 }, model: 'm' });`);
  timers.splice(0).forEach((f) => f());
  assert.match(get('tok').textContent, /⚡ 400/, 'the token count moved');
});
test('a full transcript message renders markdown and nothing else', { timeout: 5000 }, () => {
  const { run } = page(), md = (s) => run(`mdHTML(${JSON.stringify(s)})`);
  const ok = (h) => (h.match(/<[^>]*>/g) || []).every((t) => /^<\/?(p|br|b|i|code|pre|ul|ol|li|blockquote|u)( class="mdh"| title="[^"<>]*")?>$/.test(t));
  for (const x of ['<img src=x onerror=alert(1)>', '<script>x</script>', '[a](javascript:alert(1))', '[a](https://x.y/"onmouseover="alert(1))', '```\n</pre><script>x</script>\n```', '> <svg onload=x>']) assert.ok(ok(md(x)), x + ' → ' + md(x));
  const h = md('## Plan\n**b** *i* `c` [d](https://e.f/g)\n\n- one\n- two\n\n```\na < b\n```');
  for (const want of ['<b class="mdh">Plan</b>', '<b>b</b>', '<i>i</i>', '<code>c</code>', '<u title="https://e.f/g">d</u>', '<ul><li>one</li><li>two</li></ul>', '<pre>a &lt; b</pre>']) assert.ok(h.includes(want), want);
  assert.equal(md('`*.js` and `*.ts`'), '<p><code>*.js</code> and <code>*.ts</code></p>', 'nothing inside a code span is markdown');
  assert.equal(md('1. a\n\n2. b'), '<ol><li>a</li><li>b</li></ol>', 'a blank line between items keeps one list');
  assert.equal(md('x \u00000\u0000 y'), '<p>x 0 y</p>', 'the text cannot fake a code span');
});
test('speech never reads markdown: links, lists, quotes, tables and code are dropped', { timeout: 5000 }, () => {
  const { run } = page(), m = '## Plan\n**Done.** Fixed `x` in [present.js](https://github.com/a/b) and _audio.js_.\n- one\n> quoted\n```js\nconst a = 1;\n```\n| a | b |\n|---|---|';
  const said = run(`speakable(plain(${JSON.stringify(m)}))`);
  assert.doesNotMatch(said, /[*#`>|\[\]()]|---|const a|github/, said);
});
test('the landing page builds from the app and its script runs', { timeout: 10000 }, () => {
  const root = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'landing-'));
  for (const f of ['scripts/build-landing.js', 'public/js/cast.js', 'public/app.css', 'landing/template.html', 'media/icon.png', 'package.json']) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(root, f), path.join(tmp, f)); }
  const r = require('child_process').spawnSync(process.execPath, [path.join(tmp, 'scripts/build-landing.js')]); assert.equal(r.status, 0, String(r.stderr));
  const html = fs.readFileSync(path.join(tmp, 'docs/index.html'), 'utf8'); assert.doesNotMatch(html, /\/\*ART_(JS|CSS)\*\/|__VERSION__/); assert.match(html, /@keyframes/);
  for (const m of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);   // parses as a browser script would
  fs.rmSync(tmp, { recursive: true });
});
test('a line that turns into a report while it is read is answered once; an agent that finishes mid-burst still gets its done line', { timeout: 5000 }, async () => {
  const timers = [], { run } = page('?live=1', timers), flush = async () => { for (let n = 0; n < 8; n++) { run('__rel.splice(0).forEach((r) => r())'); timers.splice(0).forEach((f) => f()); for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r)); } };
  run(`paintStatus = () => {}; trNew = () => {}; warmTTS = () => {}; prefetchQuips = () => {}; syncUI = () => {}; AUD.init = () => {}; AUD.ding = () => {}; AUD.join = () => {}; fly = () => {}; popTile = () => {};
    startTalk = () => {}; stopTalk = () => {}; renderLog = () => {}; wrapUp = async () => false; smallTalk = async () => {};
    window.__conv = []; converse = async (g) => { __conv.push(g.k + ':' + g.kind); }; window.__qu = []; doneQuip = async (id) => { __qu.push(id); }; window.__rel = []; speakLine = () => new Promise((r) => __rel.push(r));
    S.live = true; S.locked = false; S.agents = { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' }, c: { id: 'c', name: 'C' } };
    S.events = [{ k: 's1', ts: Date.now(), agent: 'a', kind: 'say', text: 'I have finished checking the module carefully.' }]; stampT(0); S.byK = new Map(S.events.map((e) => [e.k, e])); S.late = []; S.pos = 0; run(0);`);
  for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));   // the line is being read: its voice has not ended
  run(`{ const e = S.events[0], was = { kind: e.kind, n: 0, end: e.end }; Object.assign(e, { kind: 'report', to: 'main' }); amend(e, was); }`); await flush();
  assert.deepEqual(JSON.parse(run('JSON.stringify(__conv)')), ['s1:report'], 'answered once, as a report');
  run(`pause(); __qu = []; const T = Date.now(); S.events = [{ k: 'x1', ts: T, agent: 'a', kind: 'say', text: 'Working on the parser right now, step one.' }, { k: 'f1', ts: T + 1, agent: 'c', kind: 'finish', to: 'main' }, { k: 'x2', ts: T + 2, agent: 'b', kind: 'say', text: 'Tests are running on my side right now.' }]; stampT(0); S.late = []; run(0);`);
  await flush(); assert.deepEqual(JSON.parse(run('JSON.stringify(__qu)')), ['c']);
  run('pause()');
});
test('the live poll passes over a batch that keeps failing, counting from zero', { timeout: 5000 }, () => {
  const { run } = page(); assert.equal(run(`S.pollFails = undefined; (S.pollFails = (S.pollFails || 0) + 1)`), 1);
  assert.match(fs.readFileSync(path.join(PUB, 'js/live.js'), 'utf8'), /S\.seq = data\.seq \|\| 0; S\.pollFails = 0;/, 'loadSession starts the count over');
});
test('a lead whose turn closed while its background agents work stays on the call, and wakes when one answers', { timeout: 5000 }, () => {
  const { run } = page(); run(`AUD.tone = () => {}; avatarSVG = () => ''; termModel = () => ({ view: 'term', title: 't', lines: [], stat: '' }); setTicker = () => {}; share = () => {}; activityLabel = () => 'checking';
    S.agents = { main: { id: 'main', name: 'C', gid: 0 }, a1: { id: 'a1', name: 'A', gid: 1 } }; S.live = true; S.playing = true; S.boost = 1; prefs.multiShare = false;`);
  const T = Date.now();
  run(`S.events = [{ k: 'o1', ts: ${T}, agent: 'main', to: 'a1', kind: 'order', toolId: 'toolu_a', bg: true, text: 'Check the cart.', title: 'check' },
    { k: 't1', ts: ${T + 1}, agent: 'main', kind: 'tools', tools: [{ id: 'toolu_w', ts: ${T + 1}, name: 'ScheduleWakeup', arg: '', d: { kind: 'cmd', text: 'w' } }] },
    { k: 's1', ts: ${T + 2}, agent: 'main', kind: 'say', text: 'On the call.', end: 1 }];
    stampT(0); S.byK = new Map(S.events.map((e) => [e.k, e])); S.pos = 0; S.idx = 2; recomputeStatus(3); tickTools(S.events[1]);`);
  assert.equal(run(`agentState('main', Date.now()).k`), 'waiting', 'parked on its background agent, not your turn');
  assert.equal(run(`agentState('main', Date.now() + 240000).k`), 'waiting', 'minutes of silence do not make it stalled');
  run(`applyStatus({ k: 'f1', ts: Date.now(), agent: 'a1', to: 'main', kind: 'finish' })`);
  assert.notEqual(run(`agentState('main', Date.now()).k`), 'done', 'the answer reopens the lead: it is not your turn yet');
  run(`S.events.push({ k: 'f1', ts: ${T} + 3, agent: 'a1', to: 'main', kind: 'finish' }); stampT(3); S.live = false; recomputeStatus(4)`);   // a replay never wakes the lead: what the transcript says stands as it stands
  assert.notEqual(run(`agentState('main', Date.now()).k`), 'waiting', 'replayed: the turn is over there');
  run(`S.live = true; recomputeStatus(3); S.run.main = { id: 'b1', ts: Date.now(), name: 'Bash', start: 0 }`);
  assert.equal(run(`agentState('main', Date.now()).k`), 'working', 'a lead busy with its own command is not parked');
  run(`logRow = () => ''; S.locked = false; S.recomputing = false; S.pos = 0;
    { const e = { k: 'o9', ts: Date.now(), agent: 'main', to: 'a1', kind: 'order', toolId: 'toolu_z', bg: false, text: 'Check it.', title: 'check' };
      S.events = [e]; S.byK = new Map([['o9', e]]); stampT(0); recomputeStatus(1);
      const had = !!(S.run.main && S.run.main.id === 'toolu_z');
      Object.assign(e, { bg: true }); amend(e, { kind: 'order', n: 0, bg: false });
      S.amendCheck = [had, !S.run.main]; }`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.amendCheck)')), [true, true], 'a call found to be background stops blocking the lead');
});
test('the board row of the followed session tells the lead it needs you, and its menu is shown word for word', { timeout: 5000 }, () => {
  const { run } = page(); run(`avatarSVG = () => '';
    S.agents = { main: { id: 'main', name: 'C', gid: 0 } }; S.live = true; S.cur = { proj: '-p', id: 's' };
    S.events = [{ k: 'a', ts: 1 }, { k: 'b', ts: 2 }]; S.idx = 1; S.lastAct = { main: 0 };`);
  const T = Date.now();
  run(`S.rows = [{ proj: '-p', id: 's', state: 'blocked', since: ${T} - 120000, sure: 1, ask: 'Bash(npm test)', menu: { id: 'm1', tool: 'Bash', kind: 'command', cmd: 'npm test', sure: 1 } }]; S.rowsAt = ${T};`);
  const st = JSON.parse(run(`JSON.stringify(agentState('main', ${T}))`));
  assert.equal(st.k, 'blocked'); assert.match(st.txt, /needs you/); assert.match(st.txt, /npm test/); assert.equal(st.sure, true);
  run(`S.rows = []`);
  assert.notEqual(run(`agentState('main', ${T}).k`), 'blocked', 'no row: the tile falls back on what the feed says');
  const q = { kind: 'question', questions: [{ q: 'Which <b>one</b>?', head: 'H', multi: false, options: [{ label: 'A', about: 'a' }, { label: '<script>x</script>', about: '' }] }] };
  const h = run(`askHtml(${JSON.stringify(q)}, S.agents.main)`);
  assert.match(h, /Which &lt;b&gt;one&lt;\/b&gt;\?/); assert.match(h, /&lt;script&gt;x&lt;\/script&gt;/); assert.ok(!/<script/.test(h), 'nothing of the menu is taken as markup');
  assert.match(run(`askHtml({ kind: 'plan', text: 'do <i>this</i>' }, S.agents.main)`), /do &lt;i&gt;this&lt;\/i&gt;/);
});
test('the board paints sections in order, folds idle, and keeps done sessions apart', async () => {
  const p = page(), T = Date.now();
  const rows = [
    { proj: '-a', id: 'b', state: 'blocked', title: 'Blocked one', mtime: T, tool: 'Bash', ask: 'npm <script>x</script>', sure: 1, ran: 60000, since: T - 30000, pr: { n: 7, url: 'https://github.com/o/r/pull/7' } },
    { proj: '-a', id: 't', state: 'turn', title: 'Turn one <script>alert(1)</script>', mtime: T - 1000, ran: 5000, since: T - 2000, subTotal: 3, subActive: 1 },
    { proj: '-a', id: 'w', state: 'working', title: 'Working one', mtime: T - 2000, tool: 'Edit', asked: T - 9000 },
    { proj: '-a', id: 'i', state: 'idle', title: 'Idle one', mtime: T - 3000 },
    { proj: '-a', id: 'd', state: 'turn', title: 'Put away', mtime: T - 4000, done: 1 },
  ];
  p.ctx.fetch = (u) => (String(u) === '/api/board' ? Promise.resolve({ json: () => Promise.resolve(rows) }) : new Promise(() => {}));   // only the board answers; every other request stays pending, as in the harness
  p.run(`document.body.classList.add('board');`);
  await p.run(`renderBoardView()`);
  const h = p.get('boardv').innerHTML;
  assert.ok(h.indexOf('Blocked one') < h.indexOf('Turn one') && h.indexOf('Turn one') < h.indexOf('Working one'), 'what waits for you comes first');
  assert.match(h, /<section class="bsec"><h3 class="bhd blocked">/);
  assert.match(h, /<details class="bsec bidle"><summary class="bhd idle">/, 'idle is folded');
  assert.match(h, /<details class="bsec bdone"><summary class="bhd">/, 'done sessions sit in their own fold');
  assert.ok(h.indexOf('Working one') < h.indexOf('class="bsec bidle"'), 'idle comes after the working section');
  assert.ok(h.indexOf('Put away') > h.indexOf('bdone'), 'the put-away row is under Done');
  assert.match(h, /Turn one &lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.ok(!/Turn one <script/.test(h), 'a title is never markup');
  assert.equal((h.match(/class="bnew"/g) || []).length, 5, 'every card keeps its new-window button');
  assert.match(h, /class="bpr" data-url="https:\/\/github\.com\/o\/r\/pull\/7"/); assert.match(h, /PR #7/);
  assert.match(h, /class="bdo" data-undo="1"/, 'a put-away card offers to reopen'); assert.ok(!/data-undo/.test(h.slice(0, h.indexOf('bdone'))), 'a live card offers ✓, not ↩');
  assert.match(h, /✋ needs you<\/span>/, 'a sure menu reads "needs you", not "needs you?"');
  assert.match(h, /👥 1\/3/);
});
