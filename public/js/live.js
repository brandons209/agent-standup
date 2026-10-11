// =====================================================================
//  data: live follow + replay
// =====================================================================
async function loadSession(proj, id) {
  pause(); const mine = (S.loadN = (S.loadN || 0) + 1);
  const r = await fetch(`/api/session?proj=${encodeURIComponent(proj)}&id=${id}`), data = await r.json();
  if (mine !== S.loadN || data.error) return false; S.saidSrv = +r.headers.get('x-said') || 0;
  closeAllShares(); S.term = {}; S.focus = null; S.agents = {}; S.castN = 0; for (const k in nameBook) delete nameBook[k]; [{ id: 'user' }, ...data.agents].forEach((a) => (S.agents[a.id] = persona(a)));
  clearThoughts(); Object.assign(TH, { since: {}, next: {}, said: {}, last: 0 }); S.events = data.events; stampT(0); S.byK = new Map(data.events.map((e) => [e.k, e])); S.seq = data.seq || 0; S.ep = data.ep || ''; S.sawEnd = data.events.some((e) => e.end); S.late = []; S.pos = 0; S.joinAt = Date.now(); S.idx = 0; S.status = {}; S.tc = {}; S.cur = { proj, id }; S.logTo = 0; S.detail = null; $('#detail').classList.remove('on');
  const opt = $('#sessions').selectedOptions[0]; S.title = (S.live ? niceProj(proj) : opt && opt.dataset.title) || '';
  if (proj === '_demo') S.events.forEach((e) => { if (e.fr) trMem.set(baseText(e), e.fr); });   // the demo ships its own French
  $('#subtitle').textContent = S.title; recomputeStatus(0); buildStage(); renderHighlights(); setFocus('main'); renderLog(true); computeGantt(); layout(); paintStatus(); prefetchTr(0); return true;
}
const niceProj = (p) => (p === '_demo' ? '' : String(p).replace(/^-+/, '').replace(/-/g, '/').split('/').slice(-2).join('/'));
async function fillProjects() {   // live view: follow the latest activity anywhere, or pin one project
  const sel = $('#liveProj'); let rows = []; try { rows = await (await fetch('/api/projects')).json(); } catch {}
  sel.innerHTML = `<option value="">${L('Tous les projets (le plus récent)', 'All projects (most recent)')}</option>` + rows.map((r) => `<option value="${esc(r.proj)}">${esc(niceProj(r.proj))}</option>`).join('');
  sel.value = prefs.proj && rows.some((r) => r.proj === prefs.proj) ? prefs.proj : ''; sel.style.display = rows.length > 1 && !S.pin ? '' : 'none';
}
$('#liveProj').onchange = () => { Q.delete('proj'); prefs.proj = $('#liveProj').value; savePrefs(); S.cur = null; followCurrent(); };
async function followCurrent() {
  const proj = S.pin ? S.pin.proj : Q.has('proj') ? Q.get('proj') : prefs.proj || '';   // an empty ?proj= means all projects
  const cur = await (await fetch('/api/current?proj=' + encodeURIComponent(proj) + (S.pin ? '&id=' + encodeURIComponent(S.pin.id) : S.stick ? '&sproj=' + encodeURIComponent(S.stick.proj) + '&sid=' + encodeURIComponent(S.stick.id) : ''))).json();
  if (cur.missing) { $('#eT').textContent = L('Cette session est terminée.', 'This session has ended.'); $('#eP').textContent = ''; $('#empty').classList.add('on'); return false; }
  if (!cur.id) { $('#empty').classList.add('on'); return false; } $('#empty').classList.remove('on');
  if (S.cur && S.cur.id === cur.id && S.cur.proj === cur.proj) return false;
  if (!(await loadSession(cur.proj, cur.id))) return false; S.stick = { proj: cur.proj, id: cur.id };   // kept when a reload clears S.cur, so it does not hand the call to another session
  const start = liveStart(); if (!S.locked && !S.userPaused) run(start); return true;
}
// Live: a call starts when you join it. Only what happened since then, and was not said yet, is said (the last 16 events at most, when a session is picked up on the way);
// the end of a session that was already over is on screen (states, transcript) but is not read again. Joining while the agents are at work, the last few seconds are said too, to know what they are on
const JOIN_BACK_MS = 10000;
function midWork() {   // someone is in the middle of something: the session does not end on a message of the lead (its turn is over then, or about to be)
  let k = S.events.length - 1; while (k >= 0 && (S.events[k].kind === 'usage' || S.events[k].kind === 'compact')) k--; const e = S.events[k]; return !!e && !(e.agent === 'main' && e.kind === 'say');
}
function liveStart() {   // S.saidSrv: how far this session was already said (by any page, before a reload); S.join: you are joining now, so what came before is past
  const n = S.events.length, now = Date.now() - (midWork() ? JOIN_BACK_MS : 0);
  if (!S.locked) { S.since = S.join ? Math.max(S.saidSrv || 0, now) : S.saidSrv || now; S.join = false; }
  const since = S.locked ? Date.now() : S.since; let i = n; while (i > Math.max(0, n - 16) && S.events[i - 1].ts > since) i--;   // by the session's own stamps, as run() marks them: _t depends on the order this page received events in, so it would not survive a reload
  recomputeStatus(i); S.idx = S.pos = i; S.from = since; trNew(Math.max(0, n - 16)); paintStatus(); return i;
}
function amend(e, was) {   // the server corrected an event the call already has: another tool call in the same message, a last line that turns out to be a report, the mark that closes the lead's turn
  const i = S.events.indexOf(e), row = $(`#log .row[data-i="${i}"]`); if (row) row.outerHTML = logRow(i);
  if (e.end) S.sawEnd = true; if (S.locked || S.recomputing || !S.live) return; const past = i < S.pos;   // at the door everything is worked out again on Join
  if (e.kind === 'tools') { const done = e._n != null ? e._n : past ? was.n : null; if (done != null && e.tools.length > done) { const more = { ...e, tools: e.tools.slice(done) }; e._n = e.tools.length; applyStatus(more); tickTools(more); } }
  if (e.kind === 'report' && was.kind === 'say' && (e._as === 'say' || past)) {   // it was read as an ordinary line: the report still counts (the agent is done, a ding, perhaps a word of thanks), without reading it again
    applyStatus(e); AUD.ding(); fly(e.agent, e.to, '✅'); popTile(e.agent); if (e._as === 'say') { e._as = 'report'; S.late.push(e); }
  }
  if (e.end && !was.end && (e._n != null || e._as || past)) { let k = S.events.length - 1; while (k > i && !(S.events[k].kind === 'user' || (S.events[k].agent === 'main' && /^(say|tools|order)$/.test(S.events[k].kind) && !S.events[k].wf))) k--; if (k === i) S.turnOver = true; }   // only if nothing came after it
}
let polling = false;
setInterval(async () => {
  if (document.hidden && (S.hidTick = (S.hidTick || 0) + 1) % 5) return;   // a hidden window polls every 5th tick
  if (!S.live || polling) return; polling = true;
  try {
    const switched = await followCurrent(); if (S.offline) { S.offline = false; syncUI(); }
    if (switched || !S.cur) return;
    const cur = S.cur, d = await (await fetch(`/api/session?proj=${encodeURIComponent(cur.proj)}&id=${cur.id}&after=${S.seq}&ep=${encodeURIComponent(S.ep)}${S.since ? '&said=' + S.since : ''}`)).json();
    if (d.error || cur !== S.cur) return; if (d.resync) { S.cur = null; return; }   // the server no longer has our place (restarted, transcript rewritten): reload next tick
    S.seq = d.seq; if (!d.events || !d.events.length) return;
    for (const a of d.agents) if (!S.agents[a.id]) { S.agents[a.id] = persona(a); addTile(S.agents[a.id]); }
    const from = S.events.length, fresh = [], changed = [];   // the session is not written in order: what is new goes at the end (the order the call got it in), what the server corrected is corrected in place
    for (const e of d.events) { const old = S.byK.get(e.k); if (old) { changed.push([old, { kind: old.kind, n: old.tools ? old.tools.length : 0, end: old.end }]); Object.assign(old, e); } else { S.byK.set(e.k, e); fresh.push(e); } }
    if (fresh.some((e) => e.end)) S.sawEnd = true;
    if (fresh.length) { S.events = S.events.concat(fresh); stampT(from); $('#seek').max = S.events.length - 1; trNew(from); warmTTS(from); renderLog(false); }
    if (S.playing && !S.recomputing) for (const e of fresh) if (e.kind === 'order' && !S.status[e.to]) { S.status[e.to] = 'working'; S.orderTs[e.to] = e.ts || 0; S.gone.delete(e.to); }   // a new sub-agent shows up now, while the previous line is still being read
    for (const [e, was] of changed) amend(e, was);
    paintStatus();
  } catch { if (!S.offline) { S.offline = true; syncUI(); } } finally { polling = false; }
}, 400);


window.addEventListener('focus', () => { if (!S.locked) claimAudio(); });
window.addEventListener('message', (e) => { if (EMBED && e.source === window.parent && e.data && e.data.agentStandup === 'claim' && !S.locked) claimAudio(); });   // VS Code: this tab became the active one
// ---------- meeting chrome: participants and a clock ----------
function renderMeet() {
  const m = $('#meet'); if (!m) return; const n = Object.keys(S.agents).filter((id) => id !== 'user' && !S.gone.has(id) && ((S.status[id] && S.status[id] !== 'done') || id === 'main')).length;
  const e0 = S.events[0], cur = S.events[Math.min(S.idx, S.events.length - 1)]; let ms = 0;
  if (S.live) ms = Date.now() - (S.joinAt || (S.joinAt = Date.now())); else if (cur) ms = cur.t || 0;
  const s = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(s / 3600), mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  const html = `${S.live ? '<i title="live"></i>' : ''}<span>👥 ${n}</span><span>${hh ? hh + ':' : ''}${mm}:${ss}</span>`; if (m.innerHTML !== html) m.innerHTML = html;
}
setInterval(() => { if (!document.hidden && S.live && S.events && S.events.length) renderMeet(); }, 1000);

// ---------- reactions: send a little emoji to whoever has the floor ----------
$('#reactBar').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return; const em = b.dataset.e, ids = Object.keys(S.agents).filter((id) => id !== 'user' && $('#t-' + id) && $('#t-' + id).style.display !== 'none');
  const to = [...S.speakers].find((id) => id !== 'user' && S.agents[id]) || ids.find((id) => S.status[id] === 'working') || ids[0]; if (!to) return;
  fly('user', to, em); setTimeout(() => { popTile(to); AUD.blip(em === '☕' ? 520 : em === '🔥' ? 760 : 660); }, 380); if (em !== '🔥') setTimeout(() => fly(to, 'user', em === '🙌' ? '🙌' : '👍'), 900);
};

// ---------- board: every recent session at a glance ----------
const BSTATE = { blocked: ['✋', 'needs you?', 'attend vous ?'], working: ['⚙', 'working', 'au travail'], waiting: ['🔗', 'waiting on sub-agents', 'attend ses sous-agents'], turn: ['✓', 'your turn', 'à vous'], idle: ['💤', 'idle', 'inactif'] };
const BORDER = ['blocked', 'working', 'waiting', 'turn', 'idle'];
const agoStr = (ms) => (ms < 90e3 ? Math.max(1, Math.round(ms / 1000)) + 's' : ms < 5400e3 ? Math.round(ms / 60e3) + ' min' : Math.round(ms / 3600e3) + ' h');
let boardBusy = false;
async function renderBoardView() {
  if (!document.body.classList.contains('board') || boardBusy) return; boardBusy = true;
  try {
    const rows = (await (await fetch('/api/board')).json()).sort((a, b) => BORDER.indexOf(a.state) - BORDER.indexOf(b.state) || b.mtime - a.mtime), now = Date.now();
    if (!document.body.classList.contains('board')) return;
    const cnt = {}; rows.forEach((r) => (cnt[r.state] = (cnt[r.state] || 0) + 1));
    const sum = BORDER.filter((k) => cnt[k]).map((k) => `<span class="stc ${k}">${BSTATE[k][0]} ${cnt[k]} ${L(BSTATE[k][2], BSTATE[k][1])}</span>`).join('');
    $('#boardv').innerHTML = `<div class="bsum">${sum || `<span>${L('Aucune session récente', 'No recent session')}</span>`}</div><div class="bgrid">${rows.map((r) => {
      const [ic, en, fr] = BSTATE[r.state], extra = r.state === 'blocked' ? ` · ${esc(r.tool)} ${agoStr(r.ageMs)}` : r.state === 'working' && r.tool ? ` · ${esc(r.tool)}` : r.state === 'idle' || r.state === 'turn' ? ` · ${agoStr(now - r.mtime)}` : '';
      return `<div class="bcard ${r.state}" tabindex="0" role="button" data-p="${esc(r.proj)}" data-i="${esc(r.id)}"><button class="bnew" data-p="${esc(r.proj)}" data-i="${esc(r.id)}" title="${esc(L('Ouvrir dans une nouvelle fenêtre', 'Open in a new window'))}">⧉</button><div><span class="stc ${r.state}">${ic} ${L(fr, en)}${extra}</span></div><div class="bt">${esc(/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(r.title) ? L('Session sans titre', 'Untitled session') : r.title)}</div><div class="bp">${esc(niceProj(r.proj))}</div>${r.subTotal ? `<div class="bm">👥 ${r.subActive}/${r.subTotal} ${L('sous-agents actifs', 'sub-agents active')}</div>` : ''}</div>`; }).join('')}</div>`;
  } catch {} finally { boardBusy = false; }
}
$('#boardv').onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('bcard')) { e.preventDefault(); e.target.click(); } };
function openWindow(proj, id) {
  if (EMBED) window.parent.postMessage({ agentStandup: 'openSession', proj, id }, '*');
  else window.open('/?live=1&pin=' + encodeURIComponent(id) + '&proj=' + encodeURIComponent(proj), '_blank');
}
async function openSession(proj, id) {
  if (S.pin && (S.pin.id !== id || S.pin.proj !== proj)) { openWindow(proj, id); return; }
  S.pin = { id, proj }; setView('call');
  if (S.live || S.demo) { if (S.demo) await setMode('live'); S.cur = null; fillProjects(); await followCurrent(); } else await setMode('live');
}
$('#boardv').onclick = (e) => { const n = e.target.closest('.bnew'); if (n) { e.stopPropagation(); openWindow(n.dataset.p, n.dataset.i); return; } const c = e.target.closest('.bcard'); if (c) openSession(c.dataset.p, c.dataset.i); };
// Cmd/Ctrl+K: jump to any session from any view
async function openSwitcher() {
  let sw = $('#switcher'); if (sw) { closeSwitcher(); return; }
  sw = document.createElement('div'); sw.id = 'switcher'; sw.innerHTML = `<div class="sbox"><input id="swq" type="search" aria-label="${esc(L('Chercher une session', 'Find a session'))}" placeholder="${esc(L('Chercher une session…', 'Find a session…'))}"><div id="swl" role="listbox"></div></div>`; document.body.appendChild(sw);
  let rows = []; try { rows = (await (await fetch('/api/board')).json()).sort((a, b) => BORDER.indexOf(a.state) - BORDER.indexOf(b.state) || b.mtime - a.mtime); } catch {}
  let sel = 0, shown = [];
  const draw = () => {
    const q = $('#swq').value.trim().toLowerCase(), now = Date.now(); shown = rows.filter((r) => !q || (r.title + ' ' + niceProj(r.proj)).toLowerCase().includes(q)).slice(0, 12); sel = Math.min(sel, Math.max(0, shown.length - 1));
    $('#swl').innerHTML = shown.map((r, i) => { const [ic, en, fr] = BSTATE[r.state]; return `<div class="swr${i === sel ? ' on' : ''}" role="option" data-i="${i}"><span class="stc ${r.state}">${ic} ${L(fr, en)}</span><b>${esc(/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(r.title) ? L('Session sans titre', 'Untitled session') : r.title)}</b><i>${esc(niceProj(r.proj))} · ${agoStr(now - r.mtime)}</i></div>`; }).join('') || `<div class="swr dim">${L('Aucune session récente', 'No recent session')}</div>`;
  };
  const pick = (i) => { const r = shown[i]; closeSwitcher(); if (r) openSession(r.proj, r.id); };
  $('#swq').oninput = () => { sel = 0; draw(); };
  $('#swq').onkeydown = (e) => { if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') pick(sel); else if (e.key === 'Escape') closeSwitcher(); };
  $('#swl').onclick = (e) => { const r = e.target.closest('.swr[data-i]'); if (r) pick(+r.dataset.i); };
  sw.onclick = (e) => { if (e.target === sw) closeSwitcher(); };
  draw(); $('#swq').focus();
}
function closeSwitcher() { const sw = $('#switcher'); if (sw) sw.remove(); }
setInterval(() => { if (!document.hidden) renderBoardView(); }, 2500);
async function setMode(m) {
  if (m === 'demo') {   // a built-in fictional session: nothing to install, nothing private on screen
    pause(); S.live = false; S.demo = true; S.userPaused = false; S.cur = null; $('#empty').classList.remove('on');
    document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === 'demo')); $('#sessions').style.display = 'none';
    if (await loadSession('_demo', 'demo')) { S.title = L('Démo — une équipe corrige un login lent', 'Demo — a team fixes a slow login'); $('#subtitle').textContent = S.title; S.locked = false; $('#gate').classList.remove('on'); syncUI(); }
    return;
  }
  S.demo = false;
  const live = m === 'live'; if (live === S.live && S.cur) return; pause(); S.live = live; S.userPaused = false;
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); $('#sessions').style.display = live ? 'none' : '';
  S.cur = null; syncUI();
  if (live) { S.join = true; fillProjects(); await followCurrent(); return; }
  $('#liveProj').style.display = 'none';
  const rows = await (await fetch('/api/sessions')).json();
  $('#sessions').innerHTML = rows.map((r) => { const d = new Date(r.mtime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<option value="${esc(r.proj)}|${r.id}" data-title="${esc(r.title)}">${r.agents ? '👥' + r.agents + ' · ' : ''}${esc(r.title.slice(0, 40))} (${d})</option>`; }).join('');
  $('#empty').classList.remove('on'); const pick = rows.find((r) => r.id === Q.get('pin')) || rows.find((r) => r.agents) || rows[0]; if (!pick) { $('#empty').classList.add('on'); return; }
  $('#sessions').value = `${pick.proj}|${pick.id}`; await openSelected();
}
async function openSelected() { const [p, i] = $('#sessions').value.split('|'); if (await loadSession(p, i)) { S.locked = false; $('#gate').classList.remove('on'); const at = (prefs.pos || {})[p + '/' + i]; if (!S.live && at > 3 && at < S.events.length - 3) { seekTo(at); toast(L('Reprise là où vous vous étiez arrêté', 'Resumed where you left off')); } } }
$('#sessions').onchange = openSelected;

