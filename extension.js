// Agent Standup — VS Code extension host. Runs the local server in a process of its own and shows it in a webview.
const vscode = require('vscode');
const http = require('http'), fs = require('fs'), path = require('path');

const panels = new Map(); let status = null, started = null, side = null, extCtx = null;

const cfg = () => vscode.workspace.getConfiguration('agentStandup');
const tt = (s, ...a) => (vscode.l10n && vscode.l10n.t ? vscode.l10n.t(s, ...a) : s.replace(/\{(\d+)\}/g, (_, i) => a[i]));   // runtime strings: bundles in ./l10n, the English text is the key
const projKey = () => {
  const f = vscode.workspace.workspaceFolders;
  if (!f || !f.length || !cfg().get('onlyThisWorkspace')) return '';
  return f[0].uri.fsPath.replace(/[^a-zA-Z0-9]/g, '-');   // Claude Code's project-dir naming
};
const ping = (port) => new Promise((res) => {
  const r = http.get({ host: '127.0.0.1', port, path: '/api/current', timeout: 1500 }, (m) => { m.resume(); res(m.statusCode === 200); });
  r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); });
});

// Each window runs its own server on a free port (a fixed port can be set; if that port already serves Agent Standup it is reused).
// Reusing someone else's server by default caused trouble: it may run without the right environment (e.g. no way to call `claude`).
// The server runs in a process of its own (the editor's own runtime, as a plain Node): in the extension host, which every extension shares, reading a large session held them all,
// Claude Code's included, for a second or more. If that process cannot start, or ends three times in a minute, the server runs in the extension host as it used to.
let lastPort = 0, crashes = [], inHost = false, stopping = false;
const serverEnv = () => ({ AGENT_STANDUP_CLAUDE: cfg().get('claudePath') || '', AGENT_STANDUP_CHARACTERS: cfg().get('charactersPath') || '' });
function hostServer(wanted, resolve) {
  const srv = require('./server.js').start(wanted);
  srv.once('listening', () => resolve({ port: (lastPort = srv.address().port), server: srv }));
  srv.once('error', async () => resolve((await ping(wanted)) ? { port: wanted } : { port: wanted, error: true }));
}
function ensureServer() {
  if (started) return started;
  const wanted = cfg().get('port') || lastPort || 0;   // lastPort: a server that ended comes back on the same port, so the open panels find it again
  const mine = (started = new Promise((resolve) => {
    if (inHost) return hostServer(wanted, resolve);
    let kid, done = false, ours = false;
    try { kid = require('child_process').fork(require('path').join(__dirname, 'server.js'), [], { env: { ...process.env, ...serverEnv(), PORT: String(wanted), ELECTRON_RUN_AS_NODE: '1', AGENT_STANDUP_CHILD: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); }
    catch { inHost = true; return hostServer(wanted, resolve); }
    const late = setTimeout(() => { if (!done) { done = true; inHost = true; try { kid.kill(); } catch {} hostServer(wanted, resolve); } }, 8000);   // an editor whose runtime cannot run as Node: the extension host it is
    kid.on('message', async (m) => {
      clearTimeout(late); if (done) return;
      if (m && m.port) { done = ours = true; resolve({ port: (lastPort = m.port), kid }); }
      else if (m && m.error) { done = true; if (!cfg().get('port') && wanted === lastPort && wanted) { lastPort = 0; if (started === mine) started = null; return resolve(ensureServer()); } resolve(m.error === 'EADDRINUSE' && (await ping(wanted)) ? { port: wanted } : { port: wanted, error: true }); }   // the port set in the settings is taken (by another window's server: used); the port of a server that ended, taken meanwhile: a free one
    });
    kid.on('error', () => { if (!done) { inHost = true; done = true; hostServer(wanted, resolve); } });
    kid.on('exit', () => {
      clearTimeout(late);
      if (!done) { done = true; inHost = true; return hostServer(wanted, resolve); }   // it ended before it listened: the extension host it is
      if (ours && started === mine && !stopping) { started = null; const now = Date.now(); crashes = crashes.filter((t) => now - t < 60000).concat(now); if (crashes.length >= 3) inHost = true; }   // the next watch starts it again
    });
  }));
  return started;
}
async function url() {
  const { port, error } = await ensureServer();
  if (error) throw new Error(`Port ${port} is busy and not serving Agent Standup. Set agentStandup.port to 0 (automatic) or another port.`);
  const q = `?live=1&proj=${encodeURIComponent(projKey())}`;
  return `http://localhost:${port}/${q}`;
}

const OPENING = {}, SAFE_ID = /^[\w.-]{1,200}$/;   // OPENING: the slot of a tab still being made
async function openPanel(pin) {   // pin: { id, proj } of the session to lock the tab to; none: the tab that follows the latest activity
  pin = pin && SAFE_ID.test(pin.id) && SAFE_ID.test(pin.proj) ? pin : null;
  const key = pin ? `${pin.proj}/${pin.id}` : 'follow', old = panels.get(key);
  if (old) { if (old === OPENING) return; try { old.reveal(); return; } catch { panels.delete(key); } }   // a disposed panel falls through and is recreated
  panels.set(key, OPENING);   // taken before the awaits below: a second click while this one opens does not make a second tab
  let u;
  try { u = await url(); } catch (e) { panels.delete(key); return vscode.window.showErrorMessage(e.message); }
  if (pin) u = u.replace(/([?&])proj=[^&]*&?/, '$1').replace(/[?&]$/, '') + `&pin=${encodeURIComponent(pin.id)}&proj=${encodeURIComponent(pin.proj || '')}`;   // one proj parameter only: the pinned session's project
  let ext; try { ext = await vscode.env.asExternalUri(vscode.Uri.parse(u + '&embed=1')); } catch (e) { panels.delete(key); return vscode.window.showErrorMessage(e.message); }
  const row = pin && require('./server.js').boardRows().find((r) => r.id === pin.id), title = pin ? ('Standup: ' + ((row && row.title) || tt('Untitled session'))).slice(0, 40) : 'Agent Standup';
  const panel = vscode.window.createWebviewPanel('agentStandup', title, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  panels.set(key, panel); relay(panel.webview); panel.webview.html = frameHtml(ext.toString(true));
  panel.onDidDispose(() => { if (panels.get(key) === panel) panels.delete(key); });
  panel.onDidChangeViewState((e) => { if (e.webviewPanel.active) e.webviewPanel.webview.postMessage({ agentStandup: 'claim' }); });   // the tab you look at is the one that talks
}
const frameHtml = (src) => `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>html,body{margin:0;height:100%;background:#12131a}iframe{border:0;width:100%;height:100vh}</style></head>
    <body><iframe src="${src}" allow="autoplay; clipboard-write"></iframe>
    <script>const vs = acquireVsCodeApi(); const fr = document.querySelector('iframe'); addEventListener('message', (e) => { if (e.source === fr.contentWindow) { if (e.data && e.data.agentStandup) vs.postMessage(e.data); } else if (e.data && e.data.agentStandup === 'claim') fr.contentWindow.postMessage(e.data, '*'); });</script></body></html>`;
// Messages from the page: open it in the browser, or open a donation link (https only, known donation sites only).
const DONATE_HOSTS = /^(www\.)?(buymeacoffee\.com|ko-fi\.com|paypal\.me|paypal\.com|github\.com)$/;
const relay = (webview) => webview.onDidReceiveMessage((m) => {
  if (!m) return;
  if (m.agentStandup === 'openSession') openPanel({ id: m.id, proj: m.proj });
  if (m.agentStandup === 'openBrowser') openBrowser();
  if (m.agentStandup === 'openCharacters') openCharacters();
  if (m.agentStandup === 'notify' && typeof m.text === 'string' && !(m.text.includes('✋') && cfg().get('notifyNeedsYou') !== false && !callInView())) vscode.window.showInformationMessage('Agent Standup: ' + m.text.slice(0, 120));   // a page out of view leaves "needs you" to the notification that names the session (needsYou)
  if (m.agentStandup === 'openExternal') { try { const u = new URL(m.url); if (u.protocol === 'https:' && DONATE_HOSTS.test(u.hostname)) vscode.env.openExternal(vscode.Uri.parse(u.toString())); } catch {} }
});

// "Needs you": a notification when a session the status bar counts starts to wait on you (a question, an approval, a plan), naming it and what it asks (agentStandup.notifyNeedsYou).
// Once when it starts to wait, once more if it still waits 5 minutes later. Not while a call is in view, nor while you are on that session's Claude Code tab. Windows on one folder share a mark: the first tells it.
const REMIND_MS = 5 * 60e3, needsSeen = new Map();   // "proj/id" → { ep, at, reminded }
const callInView = () => !!((side && side.visible) || [...panels.values()].some((p) => p && p.visible));
const oneLine = (x) => String(x).replace(/\s+/g, ' ').trim(), clip = (s, n) => { s = oneLine(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
function onTabOf(r) {   // the active tab is that session's Claude Code tab: its label, whole or cut with "…", against the session's title
  try {
    const g = vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup, t = g && g.activeTab, vt = t && t.input && t.input.viewType;
    if (typeof vt !== 'string' || !vt.includes('claudeVSCodePanel') || typeof t.label !== 'string' || typeof r.title !== 'string' || t.label === 'Claude Code') return false;
    const cut = /…$/.test(t.label), label = oneLine(t.label.replace(/…$/, '')); return !!label && (cut ? oneLine(r.title).startsWith(label) : oneLine(r.title) === label);
  } catch { return false; }
}
function claimNeeds(k, ep, kind) {   // true: this window is the first to tell it
  try {
    const dir = extCtx && extCtx.globalStorageUri && extCtx.globalStorageUri.fsPath; if (!dir) return true; const d = path.join(dir, 'needs'), now = Date.now(); fs.mkdirSync(d, { recursive: true });
    if (now - claimNeeds.tidy > 3600e3) { claimNeeds.tidy = now; for (const f of fs.readdirSync(d)) try { if (now - fs.statSync(path.join(d, f)).mtimeMs > 864e5) fs.unlinkSync(path.join(d, f)); } catch {} }   // marks older than a day
    fs.closeSync(fs.openSync(path.join(d, require('crypto').createHash('sha1').update(k + '\n' + ep).digest('hex').slice(0, 24) + '-' + kind), 'wx')); return true;
  } catch (err) { return !(err && err.code === 'EEXIST'); }
}
claimNeeds.tidy = 0;
function needsText(r) {
  const plan = r.tool === 'ExitPlanMode' || (r.menu && r.menu.kind === 'plan'), what = r.ask || (plan ? tt('a plan to approve') : /^(AskUserQuestion)?$/.test(r.tool || '') ? '' : r.tool), name = clip(r.title || r.id, 60);
  return what ? tt('{0} is waiting for you: {1}', name, clip(what, 80)) : tt('{0} is waiting for you', name);
}
function needsYou(rows, now = Date.now()) {   // rows: those the status bar counts
  const on = cfg().get('notifyNeedsYou') !== false, here = new Set();
  for (const r of on ? rows : []) {
    if (r.state !== 'blocked') continue;
    const k = r.proj + '/' + r.id, ep = String(r.since || r.mtime || 0); here.add(k);
    let s = needsSeen.get(k); const again = !!s;   // a session that waits on and on is one wait, even when what says since when changes
    if (!s) needsSeen.set(k, (s = { ep, at: now, reminded: false }));
    else if (s.reminded || now - s.at < REMIND_MS) continue;
    if (callInView() || onTabOf(r)) continue;   // seen: the call or its tab shows it; a reminder may still come later
    if (again) s.reminded = true; if (!claimNeeds(k, s.ep, again ? 'again' : 'first')) continue;
    const text = needsText(r), go = tt('Go to session'), call = tt('Open call');
    Promise.resolve(vscode.window.showInformationMessage('✋ ' + (again ? tt('Still waiting: {0}', text) : text), go, call)).then((a) => { if (a === go) return openPanel({ id: r.id, proj: r.proj }); if (a === call) return openPanel(); }, () => {});
  }
  for (const k of [...needsSeen.keys()]) if (!here.has(k)) needsSeen.delete(k);   // answered (or the setting off): the next wait is told again
}

// Sidebar view: the same live call, in the activity bar.
const sidebar = {
  async resolveWebviewView(view) {
    side = view; view.onDidDispose(() => { if (side === view) side = null; });
    view.webview.options = { enableScripts: true }; relay(view.webview);
    try {
      const ext = await vscode.env.asExternalUri(vscode.Uri.parse((await url()) + '&embed=1'));
      view.webview.html = frameHtml(ext.toString(true));
    } catch (e) { view.webview.html = `<body style="font:13px sans-serif;color:#ccc;padding:12px">${e.message}</body>`; }
  },
};

// The folder where the person drops their own pixel art (lead.png, you.png, others for the sub-agents, name-talk.png for an open mouth).
async function openCharacters() {
  try {
    const dir = require('./server.js').charactersDir(); const fresh = !fs.existsSync(dir); fs.mkdirSync(dir, { recursive: true });
    if (fresh) fs.writeFileSync(require('path').join(dir, 'README.txt'), 'Put your pixel art here (PNG, GIF, WebP or SVG, up to 300 KB each).\nlead.png = the lead (Claude) · you.png = you · any other image = a sub-agent\nname-talk.png = optional open-mouth frame of name.png\nThen press Reload in the Agent Standup settings menu.\n');
    vscode.env.openExternal(vscode.Uri.file(dir));
  } catch (e) { vscode.window.showErrorMessage(e.message); }
}
async function openBrowser() {
  try { vscode.env.openExternal(vscode.Uri.parse(await url())); } catch (e) { vscode.window.showErrorMessage(e.message); }
}

function activate(ctx) {
  extCtx = ctx;
  const applyPath = () => { const v = serverEnv(); Object.assign(process.env, v); if (started) started.then((x) => { if (x.kid && x.kid.connected) x.kid.send({ env: v }); }).catch(() => {}); };   // the status bar reads here; the server process is told too
  applyPath(); ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((ev) => { if (ev.affectsConfiguration('agentStandup.claudePath') || ev.affectsConfiguration('agentStandup.charactersPath')) applyPath(); }));
  ctx.subscriptions.push(
    vscode.commands.registerCommand('agentStandup.open', openPanel),
    vscode.commands.registerCommand('agentStandup.openSession', async () => {
      const rows = require('./server.js').boardRows().filter((r) => { const k = projKey(); return k ? (r.proj === k || r.proj.startsWith(k + '-')) : !r.tmp; });   // no workspace: sessions someone works in, not the ones a script started in a temporary folder
      const pick = await vscode.window.showQuickPick(rows.map((r) => ({ label: r.title, description: r.state, detail: r.proj, r })), { placeHolder: tt('Open a session in its own tab') });
      if (pick) openPanel({ id: pick.r.id, proj: pick.r.proj });
    }),
    vscode.commands.registerCommand('agentStandup.openInBrowser', openBrowser),
    vscode.commands.registerCommand('agentStandup.openCharacters', openCharacters),
    vscode.commands.registerCommand('agentStandup.focus', () => vscode.commands.executeCommand('workbench.view.extension.agentStandup')),
    vscode.window.registerWebviewViewProvider('agentStandup.view', sidebar, { webviewOptions: { retainContextWhenHidden: true } }),
  );
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.text = '$(device-camera-video) Agent Standup'; status.tooltip = tt('Open the live Agent Standup call'); status.command = 'agentStandup.open';
  status.show(); ctx.subscriptions.push(status);
  // Glanceable state without opening anything: counts for this workspace, red when an agent may need you. Reads the session files directly (no server needed).
  let target = null;
  const poll = () => {
    try {
      const bar = cfg().get('statusBar'), tell = cfg().get('notifyNeedsYou') !== false;
      if (!bar && status.text !== '$(device-camera-video) Agent Standup') { status.text = '$(device-camera-video) Agent Standup'; status.backgroundColor = undefined; status.tooltip = tt('Open the live Agent Standup call'); }   // counts off: the plain button stays
      if ((!bar && !tell) || !vscode.window.state.focused) return needsYou([]);
      const key = projKey(), rows = require('./server.js').boardRows().filter((r) => key ? (r.proj === key || r.proj.startsWith(key + '-')) : !r.tmp), now = Date.now();
      needsYou(rows, now); if (!bar) return;
      const act = rows.filter((r) => r.state !== 'idle' || now - r.mtime < 15 * 60e3), cnt = (st) => act.filter((r) => r.state === st).length;
      const blocked = cnt('blocked'), working = cnt('working') + cnt('waiting'), turn = cnt('turn');
      const parts = []; if (blocked) parts.push('$(warning) ' + tt('{0} needs you', blocked)); if (working) parts.push('$(sync~spin) ' + tt('{0} working', working)); if (!blocked && !working && turn) parts.push('$(check) ' + tt('your turn'));
      status.text = '$(device-camera-video) ' + (parts.join(' · ') || 'Agent Standup');
      status.backgroundColor = blocked ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
      const best = act.find((r) => r.state === 'blocked') || act.find((r) => r.state === 'working') || act.find((r) => r.state === 'waiting') || act[0] || null; target = best ? { id: best.id, proj: best.proj } : null;
      status.tooltip = act.length ? act.slice(0, 6).map((r) => `${{ blocked: '✋', working: '⚙', waiting: '🔗', turn: '✓', idle: '💤' }[r.state]} ${r.title}`).join('\n') + '\n\n' + tt('Click to open the call') : tt('Open the live Agent Standup call');
    } catch {}
  };
  ctx.subscriptions.push(vscode.commands.registerCommand('agentStandup.openStatus', () => openPanel(target)));
  status.command = 'agentStandup.openStatus';
  try { ctx.subscriptions.push(vscode.window.onDidChangeWindowState((s) => { if (s.focused) poll(); })); } catch {}   // refresh the moment the window regains focus
  const pollT = setInterval(poll, 4000); poll(); ctx.subscriptions.push({ dispose: () => clearInterval(pollT) });
  // If another VS Code window was serving the port and closes, take over so this window keeps working.
  const watch = setInterval(async () => { try { if (!started) { if (side || panels.size) ensureServer(); return; } const s = await started; if (!s.error && !(s.kid ? s.kid.exitCode === null : s.server ? s.server.listening : await ping(s.port))) { started = null; ensureServer(); } } catch { started = null; } }, 5000);   // its own server is asked whether it still runs, not pinged: a ping missed while a large session is read would start a second one
  ctx.subscriptions.push({ dispose: () => clearInterval(watch) });
  if (cfg().get('autoOpen')) openPanel();
}
async function deactivate() { stopping = true; try { if (started) { const s = await started; if (s.kid) s.kid.kill(); if (s.server) s.server.close(); } require('./server.js').shutdown(); } catch {} }
module.exports = { activate, deactivate, _needsYou: needsYou, _ensureServer: ensureServer };
