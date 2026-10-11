// test/server.test.js: the settings file, session stickiness, the cross-site guard and the pictures of a session, against a real server on a free port
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-test-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects');
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
