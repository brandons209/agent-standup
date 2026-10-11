// =====================================================================
//  rendering
// =====================================================================
function addTile(p) {
  const d = document.createElement('div'); d.className = 'tile' + (p.lead ? ' lead' : ''); d.id = 't-' + p.id; d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', p.name + ' — ' + p.role); d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(p.id); } }; d.style.display = 'none'; d.onclick = () => openDetail(p.id);
  d.innerHTML = `${avatarSVG(p, undefined, 't' + p.gid + '_')}<div class="bubble"></div><div class="status"></div><div class="prop"></div><div class="thought"></div><div class="ticker"></div><div class="tbadge"></div><div class="tag"><b>${esc(p.name)}</b><span>${esc(p.role)}</span><span class="tk"></span><span class="cx"></span></div>`;
  $('#stage').appendChild(d);
}
function buildStage() {   // the tiles, and the presenter camera with them: a character change must never leave the old look in the corner of the shared screen
  $('#stage').innerHTML = ''; Object.values(S.agents).forEach(addTile); S.camFor = null;
  const pr = S.present && S.agents[S.present]; if (pr) { $('#pcam').innerHTML = avatarSVG(pr, undefined, 'c' + pr.gid + '_') + `<div class="tag"><b>${esc(pr.name)}</b></div>`; S.camFor = pr.id; }
}
const layout = () => {
  const st = $('#stage'), w = st.clientWidth - 28 || 600, nar = $('#center').clientWidth < 480, cols = nar ? (w >= 300 ? 2 : 1) : Math.max(1, Math.floor((w + 12) / 212)), colw = (w - 12 * (cols - 1)) / cols;
  const rh = Math.round(colw * (nar ? 0.66 : 0.74)); st.style.setProperty('--cols', cols); st.style.setProperty('--rh', rh + 'px'); // Spotlight size: the biggest block (k columns × fr rows) that stays close to 3:2 and leaves room beside it for the others.
  const maxRows = Math.max(cols > 1 ? 2 : 1, Math.floor((st.clientHeight * 0.7 + 12) / (rh + 12)));   // the stage scrolls, so the spotlight may be a bit taller than the free space
  let k = 1, fr = 1, best = -1;
  for (let kk = 1; kk <= cols; kk++) for (let rr = 1; rr <= Math.min(4, maxRows); rr++) {
    const fw = kk * colw + (kk - 1) * 12, fh = rr * rh + (rr - 1) * 12, ratio = fw / fh, area = fw * fh;
    if ((cols > 2 && kk === cols) || ratio < 1.15 || ratio > 1.95) continue;
    if (area > best) { best = area; k = kk; fr = rr; }
  }
  if (nar) { k = cols; fr = cols > 1 ? 2 : 1; }   // side panel: small tiles, a banner-sized spotlight
  else if (best < 0) { k = Math.min(2, cols); fr = Math.min(2, maxRows); }
  st.style.setProperty('--fcols', k); st.style.setProperty('--fr', fr); st.classList.toggle('one', cols === 1);
  document.body.classList.toggle('narrow', $('#center').clientWidth <= 480); document.body.classList.toggle('compact', $('#center').clientWidth <= 480 && !$('#roster').offsetWidth); document.body.classList.toggle('tiny', $('#center').clientWidth < 300); drawGantt();
};
new ResizeObserver(layout).observe($('#center'));

function logRow(i) {
  const e = S.events[i], arrow = e.to ? ` <span class="arrow">→</span> <span class="who">${esc(nameOf(e.to))}</span>` : '';
  const body = e.kind === 'tools' ? e.tools.map((t) => t.name).join(', ') : spoken(e), k = { order: L('tâche', 'task'), report: L('rapport', 'report'), say: '', user: L('brief', 'brief'), tools: L('outils', 'tools') }[e.kind];
  return `<div class="row ${e.kind}" data-i="${i}"><span class="who">${esc(nameOf(e.agent))}</span>${arrow} <span class="k">${k}</span><div class="txt">${esc(body)}</div></div>`;
}
function renderLog(full) {
  const log = $('#log'), from = S.live ? Math.max(0, S.events.length - 300) : 0;
  if (full || S.logTo < from || S.logTo > S.events.length) { log.innerHTML = ''; S.logTo = from; }
  const html = [];
  for (let i = S.logTo; i < S.events.length; i++) {
    if (S.events[i].kind === 'results' || S.events[i].kind === 'usage' || S.events[i].kind === 'finish' || S.events[i].kind === 'compact') continue;
    html.push(logRow(i));
  }
  log.insertAdjacentHTML('beforeend', html.join('')); S.logTo = S.events.length;
  if (S.live) while (log.children.length > 320) log.firstChild.remove();
  filterLog();
}
function filterLog() { const q = $('#logQ').value.trim().toLowerCase(); for (const r of $('#log').children) r.style.display = !q || r.textContent.toLowerCase().includes(q) ? '' : 'none'; }
$('#logQ').oninput = filterLog;
$('#log').onclick = (ev) => { const r = ev.target.closest('.row'); if (r && !S.live) seekTo(+r.dataset.i); };
function paintStatus() {
  for (const p of Object.values(S.agents)) {
    const t = $('#t-' + p.id); if (!t) continue; const s = S.status[p.id];
    t.style.display = p.id === 'main' || p.id === 'user' || (s && (!S.gone.has(p.id) || S.leaving.has(p.id))) ? '' : 'none';
  }
  paintStates();
  const prev = $('.row.now'); if (prev) prev.classList.remove('now');
  const now = $(`.row[data-i="${S.idx}"]`); if (now) { now.classList.add('now'); if (document.body.classList.contains('log')) now.scrollIntoView({ block: 'nearest' }); }
  later('detail', renderDetail); later('tree', renderTree); later('meet', renderMeet, 400); drawGantt();
  $('#seek').value = S.idx; $('#pos').textContent = `${Math.min(S.idx + 1, S.events.length)} / ${S.events.length}`;
}
const applyStatus = (ev) => {
  if (ev.kind === 'order') { (S.waitOn[ev.agent] = S.waitOn[ev.agent] || new Set()).add(ev.to); S.orderTs[ev.to] = ev.ts || 0; S.status[ev.to] = 'working'; delete S.doneAt[ev.to]; S.gone.delete(ev.to); S.leaving.delete(ev.to); if (!ev.bg && ev.toolId) S.run[ev.agent] = { id: ev.toolId, ts: ev.ts, start: performance.now(), name: 'Agent' }; const t = $('#t-' + ev.to); if (t) t.classList.remove('vanishing'); }
  if (ev.kind === 'finish') { if (S.waitOn[ev.to]) S.waitOn[ev.to].delete(ev.agent); if (S.status[ev.agent] !== 'done') { S.status[ev.agent] = 'done'; S.doneAt[ev.agent] = S.clock; } delete S.run[ev.agent]; const lr = S.run[ev.to]; if (lr && /^(Task|Agent)$/.test(lr.name) && !(S.waitOn[ev.to] && S.waitOn[ev.to].size)) delete S.run[ev.to]; }
  if (ev.kind === 'report') { if (S.waitOn[ev.to]) S.waitOn[ev.to].delete(ev.agent); S.status[ev.agent] = 'done'; S.doneAt[ev.agent] = S.clock; delete S.run[ev.agent]; }
  if (ev.kind === 'user' || (ev.agent === 'main' && (ev.kind === 'say' || ev.kind === 'tools' || (ev.kind === 'order' && !ev.wf)))) S.turnOver = !!ev.end;   // Claude Code marks the message that closes the lead's turn; anything after it opens the next one (not the agents a workflow launches by itself)
};
function recomputeStatus(upTo) {
  S.term = {}; S.todos = {}; S.run = {}; S.act = {}; S.usage = {}; S.errs = {}; S.lastAct = {}; S.waitOn = {}; S.orderTs = {}; S.prevState = {}; S.lastTool = {}; S.mainBusyAt = 0; S.turnOver = false; S.th = {}; S.ctx = {}; S.model = {}; S.compacts = {}; S.ctxWarned = {}; S.rep = {}; S.loops = {}; S.recomputing = true; document.querySelectorAll('.tile').forEach((t) => { clearTimeout(t._byeT); t.classList.remove('bye'); }); hidePresent();
  S.status = {}; S.tc = {}; S.doneAt = {}; S.gone.clear(); S.leaving.clear(); document.querySelectorAll('.tile.vanishing').forEach((t) => t.classList.remove('vanishing')); const doneIdx = {}; document.querySelectorAll('.ticker').forEach((x) => { x.classList.remove('on'); x.innerHTML = ''; });
  for (let i = 0; i < upTo; i++) {
    const e = S.events[i]; applyStatus(e); tally(e); if (e.kind === 'tools') S.tc[e.agent] = (S.tc[e.agent] || 0) + e.tools.length;
    if (i >= upTo - 160) { if (e.kind === 'tools') e.tools.forEach((t) => pushTerm(e.agent, t)); else if (e.kind === 'results') applyResults(e, true); }
    if (e.kind === 'report' || e.kind === 'finish') doneIdx[e.agent] = i; if (e.kind === 'order') delete doneIdx[e.to];
  }
  S.recomputing = false; later('tok', renderTokens, 50); later('badges', renderBadges, 50);
  const now = S.events[Math.max(0, upTo - 1)];   // agents that finished long before this point are already gone
  if (prefs.vanish && now) for (const id in doneIdx) if (now.t - S.events[doneIdx[id]].t >= VANISH_MS) S.gone.add(id);
}
function syncUI() {
  $('#bPlay').textContent = S.playing ? '⏸' : '▶';
  paintPill();
  document.body.classList.toggle('replay', !S.live);
}

// ---------- tool ticker, shared screen, flying messages ----------
// ---------- what each agent is doing: tool calls with their real outputs ----------
S.term = {}; S.todos = {}; S.run = {}; S.act = {}; S.usage = {}; S.errs = {}; S.lastAct = {}; S.waitOn = {}; S.orderTs = {}; S.prevState = {}; S.ctx = {}; S.model = {}; S.compacts = {}; S.ctxWarned = {}; S.rep = {}; S.loops = {}; S.present = null; S.camFor = null; let presentTimer = null;
const later = (k, fn, ms = 160) => { later.p = later.p || {}; if (later.p[k]) return; later.p[k] = setTimeout(() => { later.p[k] = 0; fn(); }, ms); };   // coalesce bursts of repaints
const fmtTok = (n) => (n < 1000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(n < 1e4 ? 1 : 0) + 'k' : (n / 1e6).toFixed(n < 1e7 ? 2 : 1) + 'M');
const tokTotal = (u) => (u ? u.i + u.o + u.w : 0);   // headline = input + output + cache writes; cache reads are cheap and shown separately
// A loop is the same call repeated 3 times in a row, or 4 failures in a row. Polling and screenshot tools are legitimate repeaters and are ignored.
const LOOP_SKIP = /^(Monitor|TodoWrite|ToolSearch|Skill|Read|mcp__Claude_Browser__(computer|wait|screenshot)|mcp__terminal__read_terminal)$/, POLLY = /\b(sleep|watch|tail -f|gh run|status|poll)\b/;
function loopStep(R, ev) {   // R: per-agent repetition state; returns a detection {kind,n,tool} or null
  const a = ev.agent, st = (R[a] = R[a] || { key: '', n: 0, e: 0 });
  if (ev.kind === 'tools') { for (const t of ev.tools) { const key = t.name + '|' + (t.d ? JSON.stringify(t.d) : (t.arg || ''));   // the whole call, not just the file name: three different edits of one file are not a loop
     if (LOOP_SKIP.test(t.name) || (t.name === 'Bash' && POLLY.test(t.arg || ''))) { st.key = ''; st.n = 0; continue; } if (key === st.key) st.n++; else { st.key = key; st.n = 1; } if (st.n >= 3) return { kind: 'calls', n: st.n, tool: t.name }; } }
  else if (ev.kind === 'results') { if (ev.items.some((it) => it.err)) st.e++; else st.e = 0; if (st.e >= 4) return { kind: 'errors', n: st.e }; }   // one batch of failures counts once
  return null;
}
const WIN1M = /(opus-4-[78]|opus-5|sonnet-5|fable-5)/;
function ctxWin(model, ctx) { const base = WIN1M.test(model || '') ? 1e6 : 2e5; return ctx > base ? 1e6 : base; }   // the transcript does not say which window is in use: infer it, a bigger observed context proves the 1M window
function tally(ev) {   // numbers that pile up over a session: token usage, errors, last sign of life
  if (ev.kind === 'compact') { S.compacts[ev.agent] = (S.compacts[ev.agent] || 0) + 1; delete S.ctxWarned[ev.agent]; }
  const det = loopStep(S.rep, ev); if (det) { S.loops[ev.agent] = det; later('badges', renderBadges, 300); } else if (S.loops[ev.agent] && (ev.kind === 'results' ? (S.loops[ev.agent].kind === 'errors' && ev.items.every((it) => !it.err)) : (ev.kind === 'tools' && S.rep[ev.agent].n < 2))) { delete S.loops[ev.agent]; later('badges', renderBadges, 300); }
  if (ev.kind === 'usage') { const c = ev.u.i + ev.u.r + ev.u.w; if (c > 0 && ev.model !== '<synthetic>') { S.ctx[ev.agent] = c; S.model[ev.agent] = ev.model; later('tok', renderCtx, 300); } const u = (S.usage[ev.agent] = S.usage[ev.agent] || { i: 0, o: 0, r: 0, w: 0 }); u.i += ev.u.i; u.o += ev.u.o; u.r += ev.u.r; u.w += ev.u.w; later('tok', renderTokens, 300); }
  else if (ev.kind === 'results') ev.items.forEach((it) => { if (it.err) { S.errs[ev.agent] = (S.errs[ev.agent] || 0) + 1; later('badges', renderBadges, 300); oops(ev.agent); noteTrouble(ev.agent, false); } else noteTrouble(ev.agent, true); });
  else if (ev.kind === 'tools' || ev.kind === 'say') S.lastAct[ev.agent] = ev.ts;
  if (ev.th) S.th[ev.agent] = { text: ev.th, ts: ev.ts }; else if (ev.kind === 'user') delete S.th.main;   // your order starts a new chain of thought: what the lead thought before is no longer what it is on
  if (ev.kind === 'results') S.lastAct[ev.agent] = ev.ts; else if (ev.kind === 'user') S.lastAct.main = ev.ts;   // a result coming back and your own order are signs of life too: the lead is thinking about them
}
const tokTip = (u) => `${L('Jetons enregistrés par Claude Code (comptés une fois par message, ce n’est pas une facture)', 'Tokens recorded by Claude Code (counted once per message, not a bill)')}\n${L('entrée', 'input')} ${fmtTok(u.i)} · ${L('sortie', 'output')} ${fmtTok(u.o)} · ${L('écriture cache', 'cache write')} ${fmtTok(u.w)} · ${L('lecture cache', 'cache read')} ${fmtTok(u.r)}`;
const ctxInfo = (id) => { const c = S.ctx[id]; if (!c) return null; const w = ctxWin(S.model[id], c), p = Math.round((c / w) * 100); return { c, w, p, lvl: p >= 88 ? 'hi' : p >= 70 ? 'mid' : 'lo' }; };
function renderCtx() {   // "context N% full": per agent chip (from 50%), a header chip for the lead, and one warning before auto-compaction
  for (const id in S.agents) { const t = $('#t-' + id); if (!t) continue; const el = t.querySelector('.cx'), x = ctxInfo(id);
    if (el) { if (x && x.p >= 50) { el.textContent = `ctx ${x.p}%`; el.className = 'cx ' + x.lvl; el.title = `${L('Contexte', 'Context')}: ${fmtTok(x.c)} / ${fmtTok(x.w)}`; } else { el.textContent = ''; el.className = 'cx'; } }
    if (x && x.p >= 85 && !S.ctxWarned[id] && S.live && S.playing) { S.ctxWarned[id] = 1; toast(`${nameOf(id)}: ${L('contexte plein à ', 'context ')}${x.p}%${L(' — compactage proche', ' full — compaction soon')} 🗜`); if (prefs.notify) AUD.alert(); }
    else if (x && x.p < 60) delete S.ctxWarned[id]; }
  const lead = ctxInfo('main'), cp = $('#ctxp'); if (lead) { cp.style.display = ''; cp.textContent = `ctx ${lead.p}%`; cp.className = 'ctxp ' + lead.lvl; cp.title = `${L('Contexte du chef', 'Lead context')}: ${fmtTok(lead.c)} / ${fmtTok(lead.w)}${S.compacts.main ? ' · ' + S.compacts.main + '×🗜' : ''}`; } else cp.style.display = 'none';
}
function renderTokens() {
  renderCtx();
  const all = { i: 0, o: 0, r: 0, w: 0 }; for (const id in S.usage) for (const k in all) all[k] += S.usage[id][k];
  const b = $('#tok'), tot = tokTotal(all); b.style.display = tot ? '' : 'none';
  if (tot) { b.textContent = `⚡ ${fmtTok(tot)} ${L('jetons', 'tokens')}`; b.title = tokTip(all); }
  for (const id in S.agents) { const t = $('#t-' + id); if (!t) continue; const u = S.usage[id], el = t.querySelector('.tk'); el.textContent = u && tokTotal(u) ? `⚡${fmtTok(tokTotal(u))}` : ''; if (u) t.title = tokTip(u); }
}
// One boring signal per tile: working · waiting on another agent · may need you · stalled · done. Stalled hand-offs are what really cost time.
// file edits are instant, so one that stays pending is almost surely an approval prompt; a Bash command may legitimately run long (⏳ badge instead)
const NEEDS_OK = /^(Edit|Write|MultiEdit|NotebookEdit|AskUserQuestion|ExitPlanMode)/, ASKS = /^(AskUserQuestion|ExitPlanMode)/;
const atTail = () => S.idx >= S.events.length - 3;   // only trust wall-clock ages when playback has caught up with the live end
function agentState(id, now) {
  let s = S.status[id]; const r = S.run[id], w = S.waitOn[id], la = S.lastAct[id];
  if (id === 'main' && !s) {   // the lead is at work until the message that closes its turn, even while it thinks; a transcript without that mark falls back on "quiet for 25 s", and a turn cut short on 3 minutes of silence
    const open = S.live && la && (S.sawEnd ? !S.turnOver && now - la < 180000 : now - la < 25000);
    if (r || (w && w.size) || open) s = 'working'; else if (S.live && la) return { k: 'done', txt: '✓ ' + L('à vous', 'your turn') };
  }
  if (s === 'done') return { k: 'done', txt: '✓ ' + L('terminé', 'done') };
  if (!s) return { k: 'idle', txt: '' };
  if (S.live && atTail() && r && r.ts && r.name && NEEDS_OK.test(r.name)) { const age = now - r.ts; if (age > (ASKS.test(r.name) ? 4000 : 15000)) return { k: 'blocked', txt: '✋ ' + L('attend vous ? ', 'needs you? ') + fmtShort(age) }; }
  if (w && w.size) {   // really waiting only while the lead has a sub-agent call pending, or while those agents are still active (background agents never block the lead)
    const pendingSub = r && /^(Task|Agent)$/.test(r.name), open = [...w].filter((c) => S.status[c] !== 'done' && (pendingSub || !S.live || now - Math.max(S.lastAct[c] || 0, S.orderTs[c] || 0) < 120000));
    if (open.length) {
      const names = open.map(nameOf); let stale = S.live && pendingSub; for (const c of open) if (!(now - Math.max(S.lastAct[c] || 0, S.orderTs[c] || 0) > 120000)) stale = false;
      return { k: stale ? 'stalled' : 'waiting', txt: (stale ? '⚠ ' + L('bloqué · ', 'stalled · ') : '🔗 ') + L('attend ', 'waiting on ') + names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : '') };
    }
  }
  return { k: 'working', txt: '⚙ ' + (S.act[id] || L('au travail', 'working')) };
}
const STATE_CLASSES = ['working', 'waiting', 'blocked', 'stalled', 'done'];
function paintStates() {
  const now = Date.now(), n = { working: 0, waiting: 0, blocked: 0, stalled: 0, done: 0 }, ros = [], attn = [];
  for (const p of Object.values(S.agents)) {
    if (p.id === 'user') continue; const t = $('#t-' + p.id); if (!t) continue;
    const st = agentState(p.id, now), shown = t.style.display !== 'none'; if (shown && n[st.k] !== undefined && !S.gone.has(p.id)) { n[st.k]++; if (st.k === 'blocked' || st.k === 'stalled') attn.push(p.id); }
    STATE_CLASSES.forEach((c) => t.classList.toggle(c, st.k === c));
    const el = t.querySelector('.status'); if (el.textContent !== st.txt) el.textContent = st.txt; el.className = 'status ' + st.k + (isTurn(p.id, st) ? ' turn' : '');
    const pr = t.querySelector('.prop'), want = { blocked: '✋', stalled: '😰', waiting: '⌛' }[st.k] || '', was = S.prevState[p.id];   // a raised hand, a sweat drop, an hourglass: the call metaphor for "needs you / stuck / waiting"
    if (st.k === 'done' && was && was !== 'done' && was !== 'idle') { pr.textContent = '🎉'; pr.className = 'prop cheer'; setTimeout(() => { if (pr.classList.contains('cheer')) { pr.textContent = ''; pr.className = 'prop'; } }, 1200); }
    else if (!pr.classList.contains('cheer')) { if (pr.textContent !== want) pr.textContent = want; pr.className = 'prop ' + (want ? st.k : ''); }
    if (shown && !S.gone.has(p.id)) ros.push({ p, st });
    if (p.id === 'main' && st.k === 'done' && was && was !== 'done' && was !== 'idle' && S.live && S.playing && Date.now() - (S.mainBusyAt || 0) > 45000) confetti();
    if (p.id === 'main') { if (st.k === 'working' || st.k === 'waiting') S.mainBusyAt = S.mainBusyAt || Date.now(); else if (st.k === 'done') S.mainBusyAt = 0; }
    S.prevState[p.id] = st.k; const tip = `${p.name} — ${p.role}${st.txt ? '\n' + st.txt : ''}${S.lastTool[p.id] ? '\n' + S.lastTool[p.id] : ''}`; if (t.title !== tip) t.title = tip;
  }
  paintPill();
  const b = $('#board'), parts = [['working', '⚙', L('au travail', 'working')], ['waiting', '🔗', L('en attente', 'waiting')], ['blocked', '✋', L('vous attendent', 'need you')], ['stalled', '⚠', L('bloqués', 'stalled')], ['done', '✓', L('terminés', 'done')]]
    .filter(([k]) => n[k] && !S.pillSess).map(([k, i, l]) => `<span class="${k}" title="${n[k]} ${l}">${i} ${n[k]}<em> ${l}</em></span>`).join('');
  if (b.innerHTML !== parts) b.innerHTML = parts; S.nBlocked = n.blocked + n.stalled; S.attn = attn; paintRoster(ros); return n;
}
const RORDER = { blocked: 0, stalled: 1, working: 2, waiting: 3, idle: 4, done: 5 };
function paintRoster(ros) {   // a fixed list beside the call: who is doing what, urgent first, readable even with dozens of agents
  const box = $('#roster'); if (!box || !document.body.classList.contains('rost')) return;
  ros.sort((a, b) => (a.p.id === 'main' ? -1 : b.p.id === 'main' ? 1 : (RORDER[a.st.k] - RORDER[b.st.k]) || (S.lastAct[b.p.id] || 0) - (S.lastAct[a.p.id] || 0)));
  const rows = ros.slice(0, 60).map(({ p, st }) => `<div class="rr k-${st.k}${isTurn(p.id, st) ? ' turn' : ''}${S.focus === p.id ? ' sel' : ''}${S.speakers.has(p.id) ? ' speaking' : ''}" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)}, ${esc(st.txt || '')}"><div class="n"><span class="dot" style="background:${p.shirt}"></span><b>${esc(p.name)}</b><span class="ro">${esc(p.role)}</span></div><div class="st">${esc(st.txt || L('en veille', 'standing by'))}${S.loops[p.id] ? ' 🔁' : ''}</div></div>`).join('');
  const html = `<h3>${L('Agents', 'Agents')} · ${ros.length}</h3>${rows}${ros.length > 60 ? `<div class="ro" style="padding:4px 8px">+${ros.length - 60}</div>` : ''}`;
  if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
}
$('#roster').onclick = (e) => { const r = e.target.closest('.rr'); if (!r) return; S.focusLock = Date.now() + 25000; setFocus(r.dataset.id); paintStates(); };
$('#roster').onkeydown = (e) => { const r = e.target.closest('.rr'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); S.focusLock = Date.now() + 25000; setFocus(r.dataset.id); paintStates(); } else if (r && e.key === 'i') openDetail(r.dataset.id); };
$('#roster').ondblclick = (e) => { const r = e.target.closest('.rr'); if (r) openDetail(r.dataset.id); };
function renderBadges() {   // per tile: failed tool calls, a command that has been running a long time, an agent that went quiet
  const now = Date.now();
  for (const id in S.agents) {
    const t = $('#t-' + id); if (!t) continue; const b = t.querySelector('.tbadge'), parts = []; let slow = false, quiet = false;
    if (S.errs[id]) parts.push(`<span class="e">✗ ${S.errs[id]}</span>`);
    if (S.loops[id]) parts.push(`<span class="l" title="${esc(S.loops[id].kind === 'errors' ? L('Échecs répétés', 'Repeated failures') : L('Même appel répété', 'Same call repeated'))}">🔁 ×${S.loops[id].n}</span>`);
    if (S.live && S.status[id] === 'working') {
      const r = S.run[id];
      if (r && r.ts && atTail() && now - r.ts > 60000) { slow = true; parts.push(`<span class="s">⏳ ${fmtShort(now - r.ts)}</span>`); }
      else if (!r && S.lastAct[id] && now - S.lastAct[id] > 180000) { quiet = true; parts.push(`<span class="q">💤 ${fmtShort(now - S.lastAct[id])}</span>`); }
    }
    t.classList.toggle('slow', slow); t.classList.toggle('quiet', quiet); const h = parts.join(''); if (b.innerHTML !== h) b.innerHTML = h;
  }
}
const fmtShort = (ms) => { const s = Math.round(ms / 1000); return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`; };
function askNotify() { try { if (!EMBED && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {} AUD.init(); AUD.alert(); }
function watchDone(n) {   // live: the team was busy for a while and has now been quiet for a few seconds → tell the person
  if (!S.live || !S.playing) { S.busySince = S.idleAt = 0; return; }
  const now = Date.now(); if (n > 0) { S.busySince = S.busySince || now; S.idleAt = 0; return; } if (!S.busySince) return;
  S.idleAt = S.idleAt || now; if (now - S.idleAt < 6000) return;
  const long = S.idleAt - S.busySince >= 20000; S.busySince = S.idleAt = 0; if (!long || !prefs.notify) return;
  const msg = L('Les agents ont fini 🎉', 'Your agents are done 🎉'); S.doneUntil = now + 60000; AUD.alert();
  if (EMBED) window.parent.postMessage({ agentStandup: 'notify', text: msg }, '*');
  else { try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('Agent Standup', { body: msg }); } catch {} }
}
const FAV0 = (document.querySelector('link[rel="icon"]') || {}).href;
function setFav(color) {
  const l = document.querySelector('link[rel="icon"]'); if (!l || setFav.cur === color) return; setFav.cur = color;
  if (!color) { l.href = FAV0; return; }
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.font = '26px serif'; g.fillText('🎥', 0, 26); g.fillStyle = color; g.beginPath(); g.arc(24, 8, 8, 0, 7); g.fill(); g.strokeStyle = '#12131a'; g.lineWidth = 2; g.stroke(); l.href = c.toDataURL();
}
function updateTitle() {
  paintStates(); if (S.live && S.nBlocked && !S.wasBlocked && prefs.notify) { AUD.alert(); const msg = L('Un agent attend peut-être votre feu vert ✋', 'An agent may be waiting for you ✋'); if (EMBED) window.parent.postMessage({ agentStandup: 'notify', text: msg }, '*'); else { try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('Agent Standup', { body: msg }); } catch {} } } S.wasBlocked = S.nBlocked > 0;
  let n = 0; for (const id in S.status) if (S.status[id] === 'working' && !S.gone.has(id)) n++;
  if (S.live && S.agents.main && /^(working|waiting)$/.test(agentState('main', Date.now()).k)) n++;   // the lead counts too: a session without sub-agents also ends
  watchDone(n); setFav(S.live && S.nBlocked ? '#ff4d4d' : null);
  document.title = S.live && S.nBlocked ? `✋ ${S.nBlocked} ${L('à voir', 'need you')} · Agent Standup` : S.doneUntil > Date.now() && !n ? '✓ ' + L('Terminé', 'Done') + ' · Agent Standup' : S.live && S.playing && n ? `● ${n} ${L('au travail', 'working')} · Agent Standup` : 'Agent Standup';
}
setInterval(() => { if (!S.agents || !S.live) return; renderBadges(); updateTitle(); if (document.body.classList.contains('tree')) renderTree(); }, 2000);
const base = (f) => String(f || '').split('/').pop();
const fmtDur = (ms) => (ms < 950 ? `${Math.max(1, Math.round(ms))} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const quiet = (e) => e.kind === 'tools' || e.kind === 'results' || e.kind === 'usage' || e.kind === 'finish' || e.kind === 'compact';
function activityLabel(t) {   // the short "what is on their screen" tag
  const d = t.d || {}, f = base(d.file || t.arg);
  switch (d.kind) {
    case 'read': return L('Lit ', 'Reading ') + f;
    case 'edit': return L('Modifie ', 'Editing ') + f;
    case 'write': return L('Crée ', 'Writing ') + f;
    case 'cmd': { const n = (d.note || '').trim(); if (n) return n.slice(0, 36); return L('Exécute ', 'Running ') + d.text.trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 26); }
    case 'grep': return L('Cherche « ', 'Searching “') + String(d.pattern || '').slice(0, 22) + L(' »', '”');
    case 'glob': return L('Liste ', 'Listing ') + String(d.pattern || '').slice(0, 24);
    case 'todo': return L('Met à jour sa todo', 'Updating todo list');
    case 'web': return d.url ? L('Consulte ', 'Fetching ') + d.url.replace(/^https?:\/\//, '').slice(0, 26) : L('Recherche sur le web', 'Web search');
    case 'text': { const w = d.what; if (w === 'question') return L('Pose une question', 'Asking a question'); if (w === 'skill') return L('Utilise ', 'Using skill ') + (d.v || ''); if (w === 'mcp') return d.v || t.name; if (w === 'toolsearch') return L('Cherche un outil', 'Looking for a tool'); return t.name; }
    default: return t.name;
  }
}
