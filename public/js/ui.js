// =====================================================================
//  UI wiring
// =====================================================================
function applyLang() {
  renderCharInfo();
  document.documentElement.lang = (LANGS.find((l) => l[0] === prefs.lang) || LANGS[0])[2];
  document.querySelectorAll('[data-fr]').forEach((el) => (el.textContent = FR() ? el.dataset.fr : tr(el.dataset.en)));
  document.querySelectorAll('#viewSeg button').forEach((b) => { b.title = b.textContent; });   // in a narrow window they are icons: the name stays as a tooltip
  const sel = $('#langSel'); if (!sel.options.length) sel.innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join(''); sel.value = prefs.lang;
  [['#bPlay', L('Pause / Lecture (espace)', 'Pause / Play (space)')], ['#bLog', 'Transcript'], ['#bGallery', L('Galerie (G)', 'Gallery (G)')], ['#bMute', L('Son (touche M)', 'Sound (M key)')], ['#bMenu', L('Réglages', 'Settings')], ['#dclose', L('Fermer', 'Close')], ['#officeVol', L('Volume de l’ambiance', 'Ambience volume')], ['#musicVol', L('Volume de la musique', 'Music volume')], ['#liveProj', L('Projet à suivre', 'Project to follow')], ['#reactBar', L('Réactions', 'Reactions')], ['#logQ', L('Rechercher dans la transcription', 'Search the transcript')], ['#roster', L('Agents', 'Agents')]].forEach(([q, t]) => { const el = $(q); if (!el) return; el.title = t; el.setAttribute('aria-label', t); }); $('#logQ').placeholder = L('Rechercher…', 'Search…'); $('#menuQ').placeholder = L('Chercher un réglage…', 'Search settings…'); document.querySelectorAll('#reactBar button').forEach((b) => b.setAttribute('aria-label', b.dataset.e));
  $('#gT').textContent = L('Rejoindre l’appel', 'Join the call'); $('#gP').textContent = L('Cliquez pour activer le son et suivre votre session Claude Code en direct.', 'Click to enable sound and follow your Claude Code session live.'); $('#gB').textContent = L('▶ Rejoindre', '▶ Join');
  $('#eDemo').textContent = L('▶ Voir la démo', '▶ Watch the demo'); $('#eT').textContent = L('En attente d’une session', 'Waiting for a session'); $('#eP').innerHTML = watched() ? esc(L('Lancez Claude Code dans {0} : l’appel démarrera tout seul.', 'Start Claude Code in {0} — the call will start by itself.')).replace('{0}', `<b>${esc(watched())}</b>`) : esc(L('Lancez Claude Code dans ce dossier : l’appel démarrera tout seul.', 'Start Claude Code in this folder — the call will start by itself.'));
  for (const id in S.agents) { const p = persona(S.agents[id]); Object.assign(S.agents[id], { name: p.name, role: p.role }); const t = $('#t-' + id); if (t) { t.querySelector('.tag span').textContent = p.role; t.querySelector('.tag b').textContent = p.name; if (id === 'main' || id === 'user') t.querySelector('.tag span').textContent = p.role; } }
  document.querySelectorAll('#menu .mi[data-t]').forEach((b) => b.querySelector('.sw').classList.toggle('on', !!prefs[b.dataset.t])); renderCoffee(); renderTokens(); updateHint(); renderLog(true); syncUI();
}
const elsewhere = () => !!(S.owner && S.owner !== CID);
function applyMute() {
  const b = $('#bMute'); b.textContent = AUD.muted ? '🔇' : elsewhere() ? '🔈' : '🔊';
  b.title = elsewhere() ? L('Le son est joué dans une autre fenêtre — cliquer pour le reprendre ici', 'Sound is playing in another window — click to take it over here') : L('Son (touche M)', 'Sound (M key)');
  AUD.apply(); if (AUD.off()) { synth && synth.cancel(); AUD.stopAll(); }
}
async function audioSync(claim) {   // heartbeat + ownership: avoids two Agent Standup windows talking at the same time
  try {
    const d = await (await fetch(`/api/audio?cid=${CID}${claim ? '&claim=1' : ''}`)).json(), before = S.owner;
    S.owner = d.owner; if (before !== S.owner) { applyMute(); updateHint(); }
  } catch {}
}
const claimAudio = () => { S.owner = CID; applyMute(); audioSync(true); };
setInterval(() => audioSync(false), 1500);
function toggleMute() { if (elsewhere()) { AUD.muted = false; claimAudio(); return; } AUD.muted = !AUD.muted; applyMute(); }
function setView(v) { prefs.view = v; savePrefs(); document.body.classList.toggle('tree', v === 'tree'); document.body.classList.toggle('board', v === 'board'); if (v === 'board') renderBoardView(); document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); renderTree(); }

$('#viewSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); };
$('#langSel').onchange = () => setLang($('#langSel').value, true);
$('#charPack').value = ['none', 'folder', 'starter', 'cats'].includes(prefs.charPack) ? prefs.charPack : 'none'; $('#charPack').onchange = () => { prefs.charPack = $('#charPack').value; savePrefs(); $('#charReload').onclick(); };
$('#charReload').onclick = async () => { await loadChars(); for (const k in imgCache) delete imgCache[k]; renameAgents(); renderCharInfo(); await TTS.init(); };
function renameAgents() {   // pictures and names are given again: a sub-agent is named after its character, or from the list
  for (const k in nameBook) delete nameBook[k]; const old = S.agents; S.agents = {}; for (const id in old) S.agents[id] = persona(old[id].src || { id });
  buildStage(); paintStatus(); renderLog(true);
}
$('#names').value = prefs.names || ''; $('#names').oninput = () => { prefs.names = $('#names').value; savePrefs(); clearTimeout(S.namesT); S.namesT = setTimeout(renameAgents, 600); };
$('#charOpen').onclick = () => window.parent.postMessage({ agentStandup: 'openCharacters' }, '*');
$('#modeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); };
// ⚙ menu: sections that fold (remembered) and a search box
function menuInit() {
  const m = $('#menu'), secs = []; let cur = null;
  for (const el of [...m.children]) { if (el.tagName === 'H4') { cur = { h: el, items: [] }; secs.push(cur); } else if (cur && !el.classList.contains('keys')) cur.items.push(el); }
  secs.forEach((sc, i) => { sc.h.classList.add('fold'); sc.h.dataset.i = i; sc.h.onclick = () => { const c = !sc.h.classList.contains('closed'); sc.h.classList.toggle('closed', c); sc.items.forEach((e) => e.classList.toggle('mfold', c)); const set = new Set(prefs.menuClosed || []); c ? set.add(i) : set.delete(i); prefs.menuClosed = [...set]; savePrefs(); };
    if ((prefs.menuClosed || []).includes(i)) { sc.h.classList.add('closed'); sc.items.forEach((e) => e.classList.add('mfold')); } });
  $('#menuQ').oninput = () => {
    const q = $('#menuQ').value.trim().toLowerCase();
    for (const sc of secs) { let any = false;
      for (const e of sc.items) { const hit = !q || e.textContent.toLowerCase().includes(q) || [...e.querySelectorAll('option')].some((o) => o.textContent.toLowerCase().includes(q)); e.classList.toggle('mhide', !hit); if (hit && q) any = true; if (q) e.classList.remove('mfold'); else e.classList.toggle('mfold', sc.h.classList.contains('closed')); }
      sc.h.classList.toggle('mhide', !!q && !any && !sc.h.textContent.toLowerCase().includes(q)); if (q) sc.h.classList.remove('closed'); }
    if (!q) secs.forEach((sc, i) => sc.h.classList.toggle('closed', (prefs.menuClosed || []).includes(i)));
    $('#menuNone').style.display = q && !secs.some((sc) => sc.items.some((e) => !e.classList.contains('mhide'))) ? '' : 'none';
  };
}
$('#menu').onclick = (e) => { const b = e.target.closest('.mi[data-t]'); if (!b) return; prefs[b.dataset.t] = !prefs[b.dataset.t]; savePrefs(); if (prefs[b.dataset.t] && ['voice', 'office', 'music', 'notify'].includes(b.dataset.t)) claimAudio(); b.querySelector('.sw').classList.toggle('on', prefs[b.dataset.t]); AUD.apply(); if (b.dataset.t === 'office') $('#officeBox').style.display = prefs.office ? '' : 'none'; if (b.dataset.t === 'customLaptop') { for (const k in imgCache) delete imgCache[k]; buildStage(); paintStatus(); } if (b.dataset.t === 'reactions') document.body.classList.toggle('react', prefs.reactions); if (b.dataset.t === 'roster') { document.body.classList.toggle('rost', prefs.roster); paintStates(); } if (b.dataset.t === 'notify') { prefs.notifyChosen = true; savePrefs(); } if (b.dataset.t === 'notify' && prefs.notify) askNotify(); if (b.dataset.t === 'vanish' && !prefs.vanish) { S.gone.clear(); paintStatus(); }
  if (b.dataset.t === 'music') { $('#musicBox').style.display = prefs.music ? '' : 'none'; if (prefs.music) { AUD.init(); AUD.apply(); } }
  if (b.dataset.t === 'multiShare') while (S.shares.size > shareCap()) unshare(primaryShare()); };   // back to one screen: the newest stays
$('#station').innerHTML = STATIONS.map((s) => `<option value="${s.id}">📻 ${s.name}</option>`).join('');
$('#station').value = prefs.station; $('#musicVol').value = prefs.musicVol; $('#musicBox').style.display = prefs.music ? '' : 'none';
$('#station').onchange = (e) => { prefs.station = e.target.value; savePrefs(); AUD.init(); RADIO.sync(); };
$('#chatSel').value = ['quiet', 'normal', 'lively'].includes(prefs.chat) ? prefs.chat : 'normal'; $('#chatSel').onchange = () => { prefs.chat = $('#chatSel').value; savePrefs(); };
$('#vstyle').innerHTML = [['animal', 'Animal Crossing (babillage)', 'Animal Crossing (babble)'], ['sims', 'Simlish (babillage)', 'Simlish (babble)'], ['cartoon', 'Voix cartoon (voix réelle)', 'Cartoon voices (real voice)'], ['natural', 'Voix naturelles', 'Natural voices'], ['kokoro', 'Voix très naturelles (à installer)', 'Very natural voices (installs on demand)']].map(([v, fr, en]) => `<option value="${v}" data-fr="${fr}" data-en="${en}">${L(fr, en)}</option>`).join(''); $('#vstyle').value = prefs.vstyle; $('#vstyle').onchange = () => { prefs.vstyle = $('#vstyle').value; prefs.vstyleChosen = true; savePrefs(); TTS.init().then(kokoroUI); kokoroUI(); };
// ---- ⚙ → voice server (OpenAI-compatible): settings box, rebuilt with the characters
function renderTtsBox() {
  const box = $('#ttsBox'); if (!box) return; box.textContent = '';
  const t = prefs.tts, apply = () => { TTS.init().then(() => loadHealth()); };
  const lab = (txt) => { const d = document.createElement('div'); d.className = 'dim'; d.style.cssText = 'font-size:11.5px;margin:4px 0 0'; d.textContent = txt; box.appendChild(d); };
  const inp = (txt, val, ph, set) => { lab(txt); const i = document.createElement('input'); i.type = 'text'; i.value = val; i.placeholder = ph; i.spellcheck = false; i.onchange = () => { set(i.value.trim()); apply(); }; box.appendChild(i); };
  lab(L('Serveur de voix (compatible OpenAI)', 'Voice server (OpenAI-compatible)'));
  inp('URL', t.url, 'http://localhost:8880/v1', (v) => (t.url = v));
  inp(L('Modèle', 'Model'), t.model, 'tts-1', (v) => (t.model = v));
  lab(L('Format', 'Format')); const fs = document.createElement('select'); for (const f of ['wav', 'mp3', 'flac', 'opus', 'aac']) fs.add(new Option(f, f)); fs.value = t.format; fs.onchange = () => { t.format = fs.value; apply(); }; box.appendChild(fs);
  inp(L('Voix par défaut', 'Default voice'), t.voice, '', (v) => (t.voice = v));
  inp(L('Voix en rotation', 'Voice pool'), t.pool, L('voix séparées par des virgules', 'comma-separated voices'), (v) => (t.pool = v));
  const ph = L('pool', 'pool');
  for (const [key, name] of [['lead', L('Chef', 'Lead')], ['you', L('Vous', 'You')], ...CHARS.pool.map((c) => [c.name.toLowerCase(), c.name])])
    inp(name, ttsVoiceOf(key), ph, (v) => { if (v) t.voices[key] = v; else delete t.voices[key]; });
  const n = document.createElement('div'); n.className = 'dim'; n.style.cssText = 'font-size:11.5px;margin:6px 0'; n.textContent = L('Clé API : définissez OPENAI_API_KEY là où tourne le serveur.', 'API key: set OPENAI_API_KEY where the server runs.'); box.appendChild(n);
}
// ---- ⚙ → very natural voices (Kokoro): install box and status, polled while installing
let kokoroTimer = null;
async function kokoroUI() {
  const box = $('#kokoroBox'), on = prefs.vstyle === 'kokoro'; box.style.display = on ? '' : 'none'; if (!on) { clearInterval(kokoroTimer); kokoroTimer = null; return; }
  let st; try { st = await (await fetch('/api/kokoro')).json(); } catch { return; }
  const b = $('#kokoroInstall'), h = $('#kokoroHint'); b.style.display = st.installed ? 'none' : '';
  b.disabled = st.installing || !st.npm; b.textContent = st.installing ? L('Installation…', 'Installing…') : L(`Installer (${st.sizeMb} Mo)`, `Install (${st.sizeMb} MB)`);
  h.textContent = st.installing ? L('Téléchargement en cours, vous pouvez continuer : les voix du système servent en attendant.', 'Downloading, you can carry on: system voices are used meanwhile.')
    : st.error ? st.error : !st.npm && !st.installed ? L('npm est introuvable : installez Node.js pour activer cette option.', 'npm not found: install Node.js to enable this option.')
    : st.installed ? (st.gaveUp ? L('Le moteur s’est arrêté : les voix du système servent à la place.', 'The engine stopped: system voices are used instead.') : st.ready ? L('Voix prêtes.', 'Voices ready.') : L('Chargement du modèle (téléchargé au premier usage, environ 305 Mo)…', 'Loading the model (downloaded on first use, about 305 MB)…'))
    : L('Voix locales de bonne qualité, en anglais surtout (une seule voix française). Gratuit, rien n’est envoyé nulle part.', 'Good-quality local voices, mostly English (one French voice). Free, nothing leaves your machine.');
  if ((st.installing || (st.installed && !st.ready && !st.gaveUp)) && !kokoroTimer) kokoroTimer = setInterval(async () => { await kokoroUI(); }, 2500);
  if (!st.installing && (st.ready || st.gaveUp || !st.installed) && kokoroTimer) { clearInterval(kokoroTimer); kokoroTimer = null; if (st.ready && TTS.engine !== 'kokoro') TTS.init(); }
}
$('#kokoroInstall').onclick = async () => { try { await fetch('/api/kokoro/install', { method: 'POST' }); } catch {} kokoroUI(); };
kokoroUI();
$('#officeVol').value = prefs.officeVol; $('#officeBox').style.display = prefs.office ? '' : 'none';
$('#officeVol').oninput = (e) => { prefs.officeVol = +e.target.value; savePrefs(); AUD.applyMusic(); };
$('#musicVol').oninput = (e) => { prefs.musicVol = +e.target.value; savePrefs(); AUD.applyMusic(); };
$('#tok').onclick = () => openRecap();
$('#bMenu').onclick = (e) => { e.stopPropagation(); $('#menu').classList.toggle('on'); };
document.addEventListener('click', (e) => { if (!e.target.closest('#menu') && !e.target.closest('#bMenu')) $('#menu').classList.remove('on'); });
const applyLog = () => {
  const b = document.body, bot = prefs.logPos === 'bottom';
  b.classList.toggle('log', !!prefs.log); $('#bLog').classList.toggle('on', !!prefs.log); b.classList.toggle('logb', bot);
  b.style.setProperty('--logw', prefs.logW + 'px'); b.style.setProperty('--logh', prefs.logH + 'px');
  $('#logDock').title = bot ? L('Ancrer à droite', 'Dock on the right') : L('Ancrer en bas', 'Dock at the bottom');
};
$('#bLog').onclick = () => { prefs.log = !prefs.log; savePrefs(); applyLog(); };
$('#logDock').onclick = () => { prefs.logPos = prefs.logPos === 'bottom' ? 'right' : 'bottom'; savePrefs(); applyLog(); };
$('#logGrip').onpointerdown = (e) => {
  const g = e.currentTarget, m = $('main'); g.setPointerCapture(e.pointerId); e.preventDefault();
  g.onpointermove = (ev) => {
    const r = m.getBoundingClientRect();
    if (prefs.logPos === 'bottom') document.body.style.setProperty('--logh', Math.round(Math.max(120, Math.min(0.6 * r.height, r.bottom - ev.clientY))) + 'px');
    else document.body.style.setProperty('--logw', Math.round(Math.max(240, Math.min(640, 0.6 * r.width, r.right - ev.clientX))) + 'px');
  };
  g.onpointerup = g.onpointercancel = () => {
    g.onpointermove = g.onpointerup = g.onpointercancel = null;
    const v = parseInt(document.body.style.getPropertyValue(prefs.logPos === 'bottom' ? '--logh' : '--logw'));
    if (v) prefs[prefs.logPos === 'bottom' ? 'logH' : 'logW'] = v; savePrefs();
  };
};
$('#bGallery').onclick = () => { prefs.layout = prefs.layout === 'gallery' ? 'speaker' : 'gallery'; savePrefs(); document.body.classList.toggle('gallery', prefs.layout === 'gallery'); $('#bGallery').classList.toggle('on', prefs.layout === 'gallery'); layout(); };
$('#bMute').onclick = toggleMute;
$('#bPlay').onclick = togglePlay;
$('#mRecap').onclick = () => { $('#menu').classList.remove('on'); openRecap(); };
$('#mExport').onclick = () => { $('#menu').classList.remove('on'); exportVideo(); };
$('#mClip').onclick = () => { $('#menu').classList.remove('on'); exportVideo(0, 0, 25000); };
$('#mBrowser').onclick = () => { $('#menu').classList.remove('on'); window.parent.postMessage({ agentStandup: 'openBrowser' }, '*'); };
$('#seek').oninput = (e) => seekTo(+e.target.value);
$('#eDemo').onclick = async () => { await setMode('demo'); if (S.demo && !S.playing) togglePlay(); };   // "Watch the demo" plays it
$('#gB').onclick = () => {
  claimAudio(); AUD.init(); AUD.apply(); S.locked = false; $('#gate').classList.remove('on'); syncUI();
  if (synth && !EMBED) { try { synth.speak(new SpeechSynthesisUtterance('')); } catch {} }   // unlock browser speech
  S.join = true; if (S.live && S.events.length) run(liveStart());   // what arrived while the door was closed is past too
};
// J / K (or a click on the “need you” chip) jump to the agents that need you or are stalled, one after the other
function jumpAttn(dir = 1) {
  const a = (S.attn || []).filter((id) => $('#t-' + id));
  if (!a.length) { toast(L('Personne n’a besoin de vous pour le moment', 'Nobody needs you right now')); return; }
  S.attnAt = ((S.attnAt == null ? (dir > 0 ? -1 : 0) : S.attnAt) + dir + a.length) % a.length; const id = a[S.attnAt];
  if (document.body.classList.contains('tree') || document.body.classList.contains('board')) setView('call');
  S.focusLock = Date.now() + 25000; setFocus(id); const t = $('#t-' + id); if (t) { t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); popTile(id); }
  toast(`${nameOf(id)} — ${agentState(id, Date.now()).txt.replace(/^\S+\s/, '')}`);
}
$('#board').onclick = (e) => { if (e.target.closest('.blocked, .stalled')) jumpAttn(1); };
// ---------- the header status: one line that tells the state of the SESSION (not of the playback), most urgent first ----------
// offline › an agent needs you (who, since when) › stalled › agents at work (and who the lead waits on) › your turn (with the lead's last sentence) › idle.
// It reads the same states as the tiles (agentState); a click goes to the agent it is about. Live, it replaces the count chips, which would say the same thing twice.
function isTurn(id, st) { return id === 'main' && st.k === 'done' && S.status.main !== 'done'; }   // the lead is done and waits for you: not a sub-agent's "done"
function watched() { return niceProj(Q.get('proj') || prefs.proj || ''); }   // the folder the live view follows, when it follows one
function lastWord() {   // the last sentence the lead said: a closing question ("Do you want me to commit?") stays on screen while it is your turn
  const key = (S.cur ? S.cur.id : '') + '|' + S.idx + '|' + S.events.length; if (lastWord.key === key) return lastWord.v;
  let e = null; for (let i = Math.min(S.idx, S.events.length - 1); i >= 0 && !e; i--) if (S.events[i].agent === 'main' && S.events[i].kind === 'say') e = S.events[i];
  lastWord.key = key; return (lastWord.v = e ? pieces(plain(e.text)).pop() || '' : '');
}
function paintPill() {
  const pill = $('#pill'), now = Date.now(); let cls = '', txt = '', to = '', tip = '', sess = false;
  if (S.offline) { cls = 'off'; txt = '⚠ ' + L('HORS LIGNE', 'OFFLINE'); }
  else if (!S.live) txt = 'REPLAY';
  else if (!S.cur) txt = L('En attente d’une session', 'Waiting for a session');
  else if (S.locked) txt = L('PRÊT', 'READY');
  else if (!S.playing) txt = L('PAUSE', 'PAUSED');
  else {
    sess = true; const st = {}, by = { working: [], waiting: [], blocked: [], stalled: [], done: [], idle: [] };
    for (const id in S.agents) if (id !== 'user' && !S.gone.has(id) && (id === 'main' || S.status[id])) { st[id] = agentState(id, now); by[st[id].k].push(id); }
    const what = (id) => `${nameOf(id)} — ${st[id].txt.replace(/^\S+\s/, '')}`, more = (a) => (a.length > 1 ? ` +${a.length - 1}` : ''), lead = st.main || { k: 'idle' };
    if (by.blocked.length) { cls = 'blocked'; to = by.blocked[0]; txt = '✋ ' + what(to) + more(by.blocked); }
    else if (by.stalled.length) { cls = 'stalled'; to = by.stalled[0]; txt = '⚠ ' + what(to) + more(by.stalled); }
    else if (by.working.length || by.waiting.length) {   // "2 working · Claude — waiting on Ken, Mira", or what the only one at work is doing
      const w = by.working, wt = lead.k === 'waiting' ? 'main' : w.length ? '' : by.waiting[0]; cls = 'working'; to = wt || (w.length === 1 ? w[0] : 'main');
      txt = (w.length === 1 && !wt ? '⚙ ' + what(w[0]) : w.length ? `⚙ ${w.length} ${L('au travail', 'working')}` : '') + (wt ? (w.length ? ' · ' : '🔗 ') + what(wt) : '');
    }
    else if (isTurn('main', lead)) { const last = lastWord(); cls = 'turn'; to = 'main'; txt = '👉 ' + L('à vous', 'your turn') + (last ? ' · ' + (last.length > 110 ? last.slice(0, 108).replace(/\s+\S*$/, '') + '…' : last) : ''); tip = last; }
    else { cls = 'idle'; to = 'main'; txt = '💤 ' + L('inactif', 'idle'); }
  }
  const c = cls + (to ? ' go' : ''), sub = !sess && S.cur && S.title ? ' · ' + S.title : '';
  for (const el of [pill, $('#sline')]) {   // the same status, in the header (wide) and on its own line (narrow)
    if (el.className !== c) el.className = c; if (el.textContent !== txt) el.textContent = txt; if (el.title !== (tip || txt)) el.title = tip || txt; if (el.dataset.sub !== sub) el.dataset.sub = sub;
    if (to && !el.hasAttribute('tabindex')) { el.tabIndex = 0; el.setAttribute('role', 'button'); } else if (!to && el.hasAttribute('tabindex')) { el.removeAttribute('tabindex'); el.removeAttribute('role'); }
  }
  S.pillTo = to; S.pillSess = sess;
}
function pillGo() {   // to the agent the status is about; several need you: one after the other (as J does)
  const id = S.pillTo, t = id && $('#t-' + id); if (!t) return; if ((S.attn || []).includes(id)) { jumpAttn(1); return; }
  if (document.body.classList.contains('tree') || document.body.classList.contains('board')) setView('call');
  S.focusLock = Date.now() + 25000; setFocus(id); paintStates(); t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); popTile(id);
}
$('#pill').onclick = $('#sline').onclick = pillGo; $('#pill').onkeydown = $('#sline').onkeydown = (e) => { if (S.pillTo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pillGo(); } };
// ---------- keyboard: the door has the focus (Enter / Space joins, or starts the demo when there is no session); the ⚙ switches say their state; Escape closes and gives the focus back ----------
function focusDoor() {   // never taken from a field or a menu the person is in
  const b = $('#empty').classList.contains('on') ? $('#eDemo') : $('#gate').classList.contains('on') ? $('#gB') : null, a = document.activeElement;
  if (b && a !== b && (!a || a === document.body || a === $('#gB') || a === $('#eDemo'))) b.focus({ preventScroll: true });
}
for (const q of ['#gate', '#empty']) new MutationObserver(focusDoor).observe($(q), { attributes: true, attributeFilter: ['class'] });
function syncSwitches() { document.querySelectorAll('#menu .mi[data-t]').forEach((b) => { b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!prefs[b.dataset.t])); }); }
new MutationObserver(() => {   // the menu opens under the header and the status line, not over them
  const m = $('#menu'), on = m.classList.contains('on'), h = Math.round($('main').getBoundingClientRect().top); $('#bMenu').setAttribute('aria-expanded', String(on)); if (!on) return;
  syncSwitches(); m.style.top = h + 3 + 'px'; m.style.maxHeight = `calc(100dvh - ${h + 13}px)`;
}).observe($('#menu'), { attributes: true, attributeFilter: ['class'] });
$('#menu').addEventListener('click', () => setTimeout(syncSwitches)); $('#bMenu').setAttribute('aria-expanded', 'false'); syncSwitches();
addEventListener('keydown', (e) => {   // on the way down: Escape also works from the search box and the selects of the menu, which the shortcuts below ignore
  if (e.key !== 'Escape' || $('#switcher')) return;
  if ($('#menu').classList.contains('on')) { $('#menu').classList.remove('on'); $('#bMenu').focus(); }
  else if ($('#detail').classList.contains('on') && !$('#recap').classList.contains('on')) { const t = $('#t-' + S.detail); $('#dclose').click(); if (t && t.offsetParent) t.focus(); }
}, true);
// ---------- a bubble that is not whole on screen (last row of tiles, a row of the compact list below the fold) brings the stage to it ----------
new MutationObserver((ms) => {
  for (const m of ms) {
    const b = m.target; if (b.className !== 'bubble' || !b.offsetHeight || b.parentNode.classList.contains('musing')) continue; const st = $('#stage'), r = b.getBoundingClientRect(), s = st.getBoundingClientRect();   // (a thought does not move the stage)
    let room = r.top - s.top - 10; for (const o of st.querySelectorAll('.bubble')) { const q = o.getBoundingClientRect(); if (o !== b && q.height && q.top >= s.top && q.bottom <= s.bottom) room = Math.min(room, q.top - s.top - 10); }   // never at the cost of another line that is on screen
    if (r.bottom > s.bottom - 6) { if (room > 0) st.scrollBy({ top: Math.min(r.bottom - s.bottom + 10, room), behavior: 'smooth' }); } else if (r.top < s.top + 4) st.scrollBy({ top: r.top - s.top - 10, behavior: 'smooth' });
  }
}).observe($('#stage'), { subtree: true, childList: true });
// Replay: arrow keys step through the call, N jumps between highlights, speed presets, and the position of each session is remembered
const stepKind = (e) => !['usage', 'results', 'finish', 'compact'].includes(e.kind);
function stepEvent(dir) {
  if (S.live || !S.events.length) return; let i = S.idx + dir; while (i > 0 && i < S.events.length - 1 && !stepKind(S.events[i])) i += dir;
  seekTo(Math.max(0, Math.min(S.events.length - 1, i)));
}
function stepHighlight(dir) {
  if (S.live) return; const hs = computeHighlights().map((h) => h.i).sort((a, b) => a - b); if (!hs.length) { toast(L('Aucun moment clé dans cette session', 'No highlight in this session')); return; }
  const next = dir > 0 ? hs.find((i) => i > S.idx + 1) : [...hs].reverse().find((i) => i < S.idx - 1); seekTo(next != null ? next : dir > 0 ? hs[0] : hs[hs.length - 1]);
}
function setSpeed(v) { $('#speed').value = v; document.querySelectorAll('#sps button').forEach((b) => b.classList.toggle('on', +b.dataset.s === +v)); }
$('#sps').onclick = (e) => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); };
$('#speed').addEventListener('input', () => document.querySelectorAll('#sps button').forEach((b) => b.classList.toggle('on', +b.dataset.s === +$('#speed').value)));
const posKey = () => (S.cur ? S.cur.proj + '/' + S.cur.id : '');
setInterval(() => {
  if (S.live || S.demo || !S.cur || !S.events.length || S.idx < 3) return; const k = posKey(), pos = prefs.pos || (prefs.pos = {});
  const done = S.idx >= S.events.length - 3; if (done) { if (k in pos) { delete pos[k]; savePrefs(); } return; }
  if (pos[k] !== S.idx) { delete pos[k]; pos[k] = S.idx; const ks = Object.keys(pos); while (ks.length > 40) delete pos[ks.shift()]; savePrefs(); }
}, 3000);
function openKeys() {
  const rows = [['Space', L('Pause / lecture', 'Pause / play')], ['← / →', L('Replay : événement précédent / suivant', 'Replay: previous / next event')], ['N / Shift+N', L('Replay : moment clé suivant / précédent', 'Replay: next / previous highlight')], ['M', L('Son coupé / activé', 'Mute / unmute')], ['G', L('Vue galerie : toutes les caméras à la même taille', 'Gallery view: every camera the same size')], ['T', L('Vue arbre ↔ appel', 'Tree view ↔ call')], ['R', L('Récapitulatif', 'Recap')], ['L', L('Transcription', 'Transcript')], ['J / K', L('Agent suivant / précédent qui a besoin de vous', 'Next / previous agent that needs you')], ['Cmd / Ctrl + K', L('Aller à une session', 'Go to a session')], ['?', L('Cette aide', 'This help')], ['Esc', L('Fermer', 'Close')]];
  $('#recap .box').innerHTML = `<h1>${L('Raccourcis clavier', 'Keyboard shortcuts')}</h1><table>${rows.map(([k, d]) => `<tr><td class="f"><b>${esc(k)}</b></td><td>${esc(d)}</td></tr>`).join('')}</table><h3>${L('Les états', 'What the states mean')}</h3><table>${[['⚙', L('au travail', 'working')], ['🔗', L('attend un autre agent', 'waiting on another agent')], ['✋', L('attend peut-être votre feu vert', 'may be waiting for your approval')], ['⚠', L('bloqué : un sous-agent est silencieux depuis longtemps', 'stalled: a sub-agent has been silent for a long time')], ['✓', L('terminé', 'done')]].map(([k, d]) => `<tr><td class="f">${k}</td><td>${esc(d)}</td></tr>`).join('')}</table><p class="dim" style="margin:14px 0 0;font-size:12px">${L('Les vues Appel, Arbre et Sessions se changent aussi en haut de la fenêtre.', 'You can also switch between Call, Tree and Sessions at the top of the window.')}</p><div style="margin-top:14px"><button class="btn" id="recapx">${L('Fermer', 'Close')}</button></div>`;
  $('#recapx').onclick = () => $('#recap').classList.remove('on'); $('#recap').classList.add('on');
}
$('#mKeys').onclick = () => { $('#menu').classList.remove('on'); openKeys(); };
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSwitcher(); return; }
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;   // browser shortcuts (Cmd+R, Ctrl+N…) stay the browser's
  if (e.key === '?') { openKeys(); return; }
  if (e.key === ' ') { if (e.target.closest && e.target.closest('button, .tile, .rr, .bcard, a, [role=button]')) return; e.preventDefault(); togglePlay(); } else if (e.key.toLowerCase() === 'm') toggleMute(); else if (e.key.toLowerCase() === 'g') $('#bGallery').click(); else if (e.key.toLowerCase() === 't') { const toTree = !document.body.classList.contains('tree'); setView(toTree ? 'tree' : 'call'); if (toTree) toast(L('Vue arbre : T pour revenir, ? pour l’aide', 'Tree view: T to go back, ? for help')); } else if (e.key.toLowerCase() === 'r') openRecap(); else if (e.key.toLowerCase() === 'l') $('#bLog').click(); else if (e.key === 'ArrowRight' && !S.live) { e.preventDefault(); stepEvent(1); } else if (e.key === 'ArrowLeft' && !S.live) { e.preventDefault(); stepEvent(-1); } else if (e.key.toLowerCase() === 'n') stepHighlight(e.shiftKey ? -1 : 1); else if (e.key.toLowerCase() === 'j') jumpAttn(1); else if (e.key.toLowerCase() === 'k') jumpAttn(-1); else if (e.key === 'Escape') { $('#recap').classList.remove('on'); $('#menu').classList.remove('on'); }
});
if (EMBED) $('#mBrowser').style.display = '';

(async function init() {
  if (!LANGS.some((l) => l[0] === prefs.lang)) prefs.lang = 'en'; await loadLocale(prefs.lang); await loadChars();
  document.body.classList.toggle('rost', prefs.roster !== false); document.body.classList.toggle('react', !!prefs.reactions); applyLog(); document.body.classList.toggle('gallery', prefs.layout === 'gallery'); $('#bGallery').classList.toggle('on', prefs.layout === 'gallery'); setView(prefs.view); menuInit(); addEventListener('click', () => { try { if (prefs.notify && !EMBED && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {} }, { once: true }); applyLang(); applyMute(); TTS.init().then(updateHint);
  loadHealth().then(() => {   // French by default only if translation can actually work; otherwise stay in English without a warning
    const h = S.health || {};
    if (!prefs.langChosen && FR() && h.claude === null && !h.apiKey) { prefs.lang = 'en'; applyLang(); }
    if (FR()) fetch('/api/warm').catch(() => {});
  });
  if (Q.get('lang')) { await setLang(Q.get('lang'), false); }
  if (Q.get('demo')) {
    if (Q.get('view') === 'tree') setView('tree');
    await setMode('demo'); if (Q.get('speed')) $('#speed').value = Q.get('speed');
    if (Q.get('at') != null) { showMoment(+Q.get('at')); if (Q.get('recap') === '1') openRecap(); } else if (Q.get('play') === '1') run(0);
    return;
  }
  S.live = Q.get('live') !== '0'; document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === (S.live ? 'live' : 'replay')));
  if (S.live) { S.locked = true; $('#gate').classList.add('on'); S.cur = null; syncUI(); fillProjects(); await followCurrent(); } else { S.live = true; await setMode('replay'); if (Q.get('at') != null && S.events.length) seekTo(Math.max(0, Math.min(S.events.length - 1, +Q.get('at') || 0))); }
  syncUI();
})();
