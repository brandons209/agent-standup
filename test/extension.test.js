// test/extension.test.js: the extension's "needs you" notification, with a stand-in for the vscode module
const test = require('node:test'), assert = require('node:assert'), Module = require('module');
const shown = [], conf = { notifyNeedsYou: true, statusBar: true }, tab = { label: 'Claude Code', viewType: '' };
const vscode = {
  workspace: { getConfiguration: () => ({ get: (k) => conf[k] }), workspaceFolders: [] },
  window: { showInformationMessage: (t) => { shown.push(t); return Promise.resolve(); }, get tabGroups() { return { activeTabGroup: { activeTab: { label: tab.label, input: { viewType: tab.viewType } } } }; } },
  l10n: { t: (s, ...a) => s.replace(/\{(\d+)\}/g, (_, i) => a[i]) },
};
const load = Module._load; Module._load = function (req, ...rest) { return req === 'vscode' ? vscode : load.call(this, req, ...rest); };
const { _needsYou: needsYou } = require('../extension.js');
const row = (o) => ({ proj: '-p', id: 's1', title: 'Fix the slow login', state: 'blocked', since: 1000, tool: 'Bash', ask: 'Bash(npm run build)', ...o });

test('needs you: once when a session starts to wait, once more 5 minutes later, then not again until it waits again', () => {
  shown.length = 0; const t0 = 1e12;
  needsYou([row()], t0); assert.deepEqual(shown, ['✋ Fix the slow login is waiting for you: Bash(npm run build)']);
  needsYou([row()], t0 + 60e3); assert.equal(shown.length, 1, 'not again within 5 minutes');
  needsYou([row()], t0 + 5 * 60e3 + 1); assert.equal(shown[1], '✋ Still waiting: Fix the slow login is waiting for you: Bash(npm run build)');
  needsYou([row()], t0 + 20 * 60e3); assert.equal(shown.length, 2, 'one reminder only');
  needsYou([row({ state: 'working' })], t0 + 21 * 60e3); needsYou([row({ since: 9000 })], t0 + 22 * 60e3); assert.equal(shown.length, 3, 'answered, then waiting again: told again');
});
test('needs you: a plan names itself; nothing while you are on that session\'s Claude Code tab, nor with the setting off', () => {
  shown.length = 0; const t0 = 2e12;
  needsYou([row({ id: 's2', tool: 'ExitPlanMode', ask: '' })], t0); assert.deepEqual(shown, ['✋ Fix the slow login is waiting for you: a plan to approve']);
  Object.assign(tab, { label: 'Fix the slow…', viewType: 'mainThreadWebview-claudeVSCodePanel' }); needsYou([row({ id: 's3' })], t0); assert.equal(shown.length, 1, 'its tab is in front of you');
  Object.assign(tab, { label: 'Claude Code', viewType: '' }); conf.notifyNeedsYou = false; needsYou([row({ id: 's4' })], t0); assert.equal(shown.length, 1, 'setting off');
  conf.notifyNeedsYou = true; needsYou([row({ id: 's5', state: 'turn' })], t0); assert.equal(shown.length, 1, 'your turn is not a wait');
});
test('the server runs in a process of its own, answers, and ends when the editor goes', async () => {
  const { _ensureServer: ensureServer } = require('../extension.js'), http = require('http');
  const s = await ensureServer(); assert.ok(s.kid && s.port, 'a child process with its port');
  const status = await new Promise((res) => http.get({ host: '127.0.0.1', port: s.port, path: '/api/health' }, (m) => { m.resume(); res(m.statusCode); }).on('error', () => res(0)));
  assert.equal(status, 200);
  const gone = new Promise((res) => s.kid.once('exit', res)); s.kid.disconnect(); await gone; assert.notEqual(s.kid.exitCode, null);
});
test('needs you: rows read again after the window was away tell nothing new; only the setting turned off forgets', () => {
  shown.length = 0; const t0 = 3e12, r = row({ id: 's9' });
  needsYou([r], t0); needsYou([r], t0 + 1000); assert.equal(shown.length, 1);
  needsYou([], t0 + 2000); needsYou([r], t0 + 3000); assert.equal(shown.length, 2, 'off, then on: the wait is told again');
});
