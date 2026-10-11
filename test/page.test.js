// The real public/js scripts in a node vm with a tiny fake DOM: the logic, without a browser (test/live.test.js drives a real one)
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const PUB = process.env.PUB || path.join(__dirname, '..', 'public');
function El(tag = 'div') {
  const cls = new Set(), kids = [], el = { tag, dataset: {}, style: { setProperty(k, v) { el._props[k] = v; } }, _props: {}, children: kids, parentNode: null, textContent: '', _html: '', clientWidth: 0, clientHeight: 0, offsetWidth: 0, id: '',
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; v ? cls.add(c) : cls.delete(c); return v; } },
    get className() { return [...cls].join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((x) => cls.add(x)); },
    get innerHTML() { return el._html; }, set innerHTML(v) { el._html = v; kids.length = 0; for (const m of String(v).matchAll(/<(\w+)[^>]*class="([^"]+)"/g)) { const k = El(m[1]); k.className = m[2]; k.parentNode = el; kids.push(k); } },
    appendChild: (k) => { kids.push(k); k.parentNode = el; return k; }, remove: () => { const p = el.parentNode; if (p) p.children.splice(p.children.indexOf(el), 1); },
    querySelector: (sel) => { const c = sel.replace(/^\./, ''); const find = (n) => { for (const k of n.children) { if (k.classList.contains(c)) return k; const r = find(k); if (r) return r; } return null; }; return find(el); },
    querySelectorAll: () => [], setAttribute() {}, getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }), animate: () => ({}), scrollTo() {}, focus() {}, addEventListener() {} };
  return el;
}
function page(search = '?live=1') {
  const byId = new Map(), get = (id) => { if (!byId.has(id)) { const e = El(); e.id = id; byId.set(id, e); } return byId.get(id); }, errors = [];
  const document = { body: El('body'), documentElement: El(), hidden: false, createElement: (t) => El(t), getElementById: get, addEventListener() {},
    querySelector: (s) => (/^#[\w-]+$/.test(s) ? get(s.slice(1)) : s.startsWith('#') ? null : El()), querySelectorAll: (s) => (s === '.tile.presenter' ? [...byId.values()].filter((e) => e.classList.contains('presenter')) : []) };
  const ctx = { console: { ...console, log() {}, warn() {} }, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, performance: { now: () => 0 },
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
  for (const g of ['S', 'startTalk', 'agentState', 'togglePlay', 'liveStart', 'share', 'busy', 'layout', 'doneQuip', 'narrate', 'applyLog']) assert.equal(p.run(`typeof ${g}`) !== 'undefined', true, g);
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
test('a full transcript message renders markdown and nothing else', { timeout: 5000 }, () => {
  const { run } = page(), md = (s) => run(`mdHTML(${JSON.stringify(s)})`);
  const ok = (h) => (h.match(/<[^>]*>/g) || []).every((t) => /^<\/?(p|br|b|i|code|pre|ul|ol|li|blockquote|u)( class="mdh"| title="[^"<>]*")?>$/.test(t));
  for (const x of ['<img src=x onerror=alert(1)>', '<script>x</script>', '[a](javascript:alert(1))', '[a](https://x.y/"onmouseover="alert(1))', '```\n</pre><script>x</script>\n```', '> <svg onload=x>']) assert.ok(ok(md(x)), x + ' → ' + md(x));
  const h = md('## Plan\n**b** *i* `c` [d](https://e.f/g)\n\n- one\n- two\n\n```\na < b\n```');
  for (const want of ['<b class="mdh">Plan</b>', '<b>b</b>', '<i>i</i>', '<code>c</code>', '<u title="https://e.f/g">d</u>', '<ul><li>one</li><li>two</li></ul>', '<pre>a &lt; b</pre>']) assert.ok(h.includes(want), want);
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
