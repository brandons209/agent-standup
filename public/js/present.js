function pushTerm(id, tool) {
  const d = tool.d || {}, buf = (S.term[id] = S.term[id] || []);
  buf.push({ k: d.kind === 'text' ? 'tool' : d.kind, id: tool.id, ts: tool.ts, tool, out: null, err: false, end: null });
  if (d.kind === 'todo') S.todos[id] = d.items;
  if (buf.length > 80) buf.shift();
  S.act[id] = activityLabel(tool);
}
function applyResults(ev, silent) {   // the output of a tool call arrives
  const buf = S.term[ev.agent] || []; let last = null;
  for (const it of ev.items) for (let i = buf.length - 1; i >= 0; i--) if (buf[i].id === it.id) { Object.assign(buf[i], { out: it.out, err: it.err, end: ev.ts, img: it.img || 0, picAt: it.img && !silent ? performance.now() : 0 }); last = buf[i]; break; }
  if (S.run[ev.agent] && ev.items.some((it) => it.id === S.run[ev.agent].id)) delete S.run[ev.agent];
  if (last) S.resAt[ev.agent] = S.clock;   // still at work: the screen stays up while it thinks about what came back
  if (silent || !last) return;
  setTicker(ev.agent, last); const pe = paneOf(ev.agent); if (pe) renderPane(pe, ev.agent);
}
function setTicker(id, e) {   // the strip on the tile: spinner while running, then ✓/✗ and the real duration
  const t = $('#t-' + id); if (!t) return; const tk = t.querySelector('.ticker'), tool = e.tool, running = e.end == null;
  tk.innerHTML = `${running ? '<span class="spin"></span>' : ''}<i>${esc(tool.name)}</i> ${esc(tool.arg || '')}${running ? ' <em class="el"></em>' : ` <em class="${e.err ? 'bad' : 'ok'}">${e.err ? '✗' : '✓'} ${fmtDur(e.end - e.ts)}</em>`}`;
  tk.classList.add('on'); if (running) { tk.classList.remove('flash'); void tk.offsetWidth; tk.classList.add('flash'); }
}
function tickTools(ev) {
  ev._n = ev.tools.length; const t = $('#t-' + ev.agent); if (!t) return; t.style.display = '';
  ev.tools.forEach((tool) => pushTerm(ev.agent, tool));
  const buf = S.term[ev.agent], k = ev.tools[ev.tools.length - 1];
  S.tc[ev.agent] = (S.tc[ev.agent] || 0) + ev.tools.length; S.lastTool[ev.agent] = k.name + ' ' + (k.arg || '').slice(-38);
  S.run[ev.agent] = { id: k.id, start: performance.now(), ts: k.ts, name: k.name }; setTicker(ev.agent, buf[buf.length - 1]); share(ev.agent);
}
setInterval(() => {   // live "running…" counters, and who keeps a shared screen
  if (!S.playing) return;
  for (const id in S.run) { const el = performance.now() - S.run[id].start, tag = $('#t-' + id + ' .ticker .el'); if (tag) tag.textContent = el > 1500 ? fmtDur(el) : ''; }
  for (const [id, sh] of S.shares) if (S.run[id]) sh.el.querySelector('.pstat').textContent = termModel(id).stat;
  tickShares(250);
}, 250);

// What the shared screen shows for an agent: terminal history with outputs, or an editor (file read / diff).
function statOf(e, id) {
  if (!e) return '';
  if (e.end == null) { const r = S.run[id], el = r ? performance.now() - r.start : 0; return `⠋ ${e.tool.name} · ${L('en cours', 'running')}${el > 1500 ? ' ' + fmtDur(el) : ''}`; }
  return `${e.err ? '✗' : '✓'} ${e.tool.name} · ${fmtDur(e.end - e.ts)}`;
}
const mediaUrl = (agent, tool, n) => `/api/media?proj=${encodeURIComponent(S.cur.proj)}&id=${encodeURIComponent(S.cur.id)}&agent=${encodeURIComponent(agent)}&tool=${encodeURIComponent(tool)}&n=${n}`;
function termModel(id) {
  const buf = S.term[id] || [], last = buf[buf.length - 1], lines = [], more = (n) => ({ c: 'dim', t: `… +${n} ${L('lignes', 'lines')}` });
  const pic = S.cur && buf.slice(-12).reverse().find((e) => e.img), fresh = pic && performance.now() - pic.picAt < (S.live ? 8000 : 2500 / spd());   // a picture a tool returned (screenshot, image file) stays up for a few seconds whatever comes next, then for the next few calls: a screenshot is usually followed by a click or two
  if (pic && (fresh || (buf.length - buf.indexOf(pic) <= 4 && (pic === last || !/^(edit|write|read)$/.test(last.k))))) return { view: 'image', title: pic.k === 'read' ? base(pic.tool.d.file) : pic.tool.name.split('__').pop(), imgs: Array.from({ length: Math.min(pic.img, 3) }, (_, n) => mediaUrl(id, pic.id, n)), more: pic.img - 3, lines, stat: statOf(last, id) };
  if (last && (last.k === 'edit' || last.k === 'write' || last.k === 'read')) {
    const d = last.tool.d, rows = (txt, c) => String(txt || '').split('\n').slice(0, 14).map((t) => ({ c, t }));
    if (last.k === 'read') {
      if (last.out == null) lines.push({ c: 'run', t: L('Ouverture du fichier…', 'Opening file…') });
      else { const r = last.out.split('\n'); r.slice(0, 26).forEach((x) => { const m = x.match(/^\s*(\d+)\t(.*)$/); lines.push({ c: 'ctx', n: m ? m[1] : '', t: m ? m[2] : x }); }); if (r.length > 26) lines.push(more(r.length - 26)); }
    } else {
      if (last.k === 'edit') lines.push(...rows(d.old, 'del'), ...rows(d.new, 'add')); else lines.push(...rows(d.text, 'add'));
      if (last.out) lines.push({ c: last.err ? 'err' : 'dim', t: (last.err ? '✗ ' : '✓ ') + last.out.split('\n')[0].slice(0, 140) });
    }
    return { view: 'editor', title: `${base(d.file)} — ${last.k === 'read' ? L('lecture', 'read-only') : L('Éditeur', 'Editor')}`, tab: { file: base(d.file), path: (d.file || '').split('/').slice(-4, -1).join(' › ') }, lines, stat: statOf(last, id) };
  }
  for (const e of buf.slice(-10)) {
    const d = e.tool.d || {}, out = (n) => { if (e.out == null) return; const r = e.out.split('\n'); r.slice(0, n).forEach((t) => lines.push({ c: e.err ? 'err' : 'out', t })); if (r.length > n) lines.push(more(r.length - n)); };
    if (e.k === 'cmd') { lines.push({ c: 'cmd', t: d.text.split('\n').slice(0, 3).join('\n') }); if (d.note) lines.push({ c: 'dim', t: '# ' + d.note }); out(12); if (e.end == null) lines.push({ c: 'run', t: L('en cours…', 'running…') }); }
    else { lines.push({ c: 'tool', t: `${e.tool.name}(${e.k === 'read' || e.k === 'edit' || e.k === 'write' ? base(d.file) : (e.tool.arg || '').slice(-70)})` }); if (e.k === 'grep' || e.k === 'glob' || e.k === 'web') out(6); if (e.end == null && e.k !== 'todo') lines.push({ c: 'run', t: '…' }); }
  }
  return { view: 'term', lines: lines.slice(-60), stat: statOf(last, id) };
}
const lineHtml = (l, view) => view === 'editor'
  ? `<div class="ln ${l.c}"><b>${esc(l.n != null ? l.n : l.c === 'add' ? '+' : l.c === 'del' ? '−' : '')}</b>${esc(l.t) || ' '}</div>`
  : `<div class="tl ${l.c}">${l.c === 'cmd' ? '<span class="ps">❯</span> ' : l.c === 'tool' ? '<span class="dotg">●</span> ' : l.c === 'run' ? '<span class="spin"></span>' : ''}${esc(l.t)}</div>`;

// ---------- screen sharing: a real video-call presentation (window + presenter camera) ----------
// One pane per agent that shares its screen (one at a time, or up to four with ⚙ "Several screens at once").
// A pane stays while its agent is busy: a call running, or thinking between two calls until it speaks its report, finishes, or its turn ends.
// Another agent only takes a pane after the one there was up for a moment, and the swap is a fade of the content, not a hide and show.
const SHARE_CAP = 45000, SHARE_DWELL = 3000, SHARE_GRACE = 1500;
const shareCap = () => (prefs.multiShare && !document.body.classList.contains('narrow') ? 4 : 1);
const paneOf = (id) => (S.shares.get(id) || {}).el || null;
const primaryShare = () => { let b = null; for (const [id, s] of S.shares) if (!b || s.since < S.shares.get(b).since) b = id; return b; };   // the longest up: what the video export shows
function busy(id) {
  const r = S.run[id]; if (r && !/^(Task|Agent)$/.test(r.name)) return true;   // the lead waiting on its sub-agents is not working on its own screen
  return S.resAt[id] != null && S.clock - S.resAt[id] < SHARE_CAP && (id === 'main' ? !S.turnOver : S.status[id] !== 'done');
}
const paneHTML = () => '<div class="pwin term"><div class="pbar"><i class="r"></i><i class="y"></i><i class="g"></i><span class="ptitle"></span><span class="pbadge"></span></div><div class="pbody"></div><div class="pstat"></div></div><div class="ptodo" style="display:none"></div><div class="pcap"></div><div class="pcam tile working"></div>';
function paintShares() {   // the container, the presenter marks on the tiles, and the stage around it
  const box = $('#shares'), n = S.shares.size, pic = [...S.shares.values()].some((s) => s.el.classList.contains('pic'));
  box.classList.toggle('on', n > 0); box.dataset.n = n; box.classList.toggle('pic', pic); document.body.classList.toggle('presenting', n > 0);
  document.querySelectorAll('.tile.presenter').forEach((t) => { if (!S.shares.has(t.id.slice(2))) t.classList.remove('presenter', 'capshown'); });
  for (const id of S.shares.keys()) { const t = $('#t-' + id); if (t) t.classList.add('presenter'); }
  const k = n + (pic ? 'p' : ''); if (k !== S.shareK) { S.shareK = k; layout(); }   // the stage is laid out again only when the screens change size
}
function share(id) {
  if (S.boost > 1 || !S.agents[id]) return; const cur = S.shares.get(id);
  if (cur) { renderPane(cur.el, id); return; }
  if (S.shares.size < shareCap()) {
    const el = document.createElement('div'); el.className = 'pane'; el.innerHTML = paneHTML(); $('#shares').appendChild(el);
    S.shares.set(id, { el, since: S.vclock }); renderPane(el, id); paintShares(); AUD.tone(880, .12, 'sine', .05); return;
  }
  let take = null; for (const [o, s] of S.shares) if (!busy(o) || S.vclock - s.since >= dwell()) { if (!take || s.since < S.shares.get(take).since) take = o; }
  if (take) swapPane(take, id);   // otherwise the agent waits: a screen does not jump away from someone who just started
}
const dwell = () => SHARE_DWELL / Math.max(1, spd() / 1.2);
function swapPane(from, to) {   // the same pane changes hands: its content fades out and in, the stage does not move
  const s = S.shares.get(from); S.shares.delete(from); S.shares.set(to, { el: s.el, since: S.vclock }); const el = s.el, tok = (el._swap = (el._swap || 0) + 1);
  const t = $('#t-' + from); if (t) t.classList.remove('presenter', 'capshown');
  el.classList.add('swap'); setTimeout(() => { if (el._swap !== tok) return; delete el.dataset.cam; delete el.dataset.img; delete el.dataset.k; if (S.shares.has(to)) renderPane(el, to); el.classList.remove('swap'); paintShares(); }, 180);
  paintShares();
}
function unshare(id) { const s = S.shares.get(id); if (!s) return; S.shares.delete(id); s.el.remove(); const t = $('#t-' + id); if (t) t.classList.remove('presenter', 'capshown'); paintShares(); }
function closeAllShares() { for (const id of [...S.shares.keys()]) unshare(id); }
function tickShares(dt) {   // a pane whose agent is no longer busy goes, after a short grace, to someone else at work, or closes
  if (!S.playing || S.hold) return; S.vclock += dt;
  for (const [id, s] of [...S.shares]) {
    if (busy(id)) { s.idle = 0; continue; } s.idle = (s.idle || 0) + dt; if (s.idle < SHARE_GRACE / Math.max(1, spd() / 1.2)) continue;
    const next = Object.keys(S.run).find((o) => !S.shares.has(o) && busy(o) && $('#t-' + o) && $('#t-' + o).style.display !== 'none');
    if (next) swapPane(id, next); else unshare(id);
  }
}
function renderPane(el, id) {
  const p = S.agents[id]; if (!p) return; const m = termModel(id), q = (c) => el.querySelector(c);
  q('.pwin').className = 'pwin ' + (m.view === 'term' ? 'term' : m.view); if (el.classList.toggle('pic', m.view === 'image') !== (el.dataset.pic === '1')) { el.dataset.pic = m.view === 'image' ? '1' : ''; paintShares(); }   // a picture gets a taller window
  q('.ptitle').textContent = m.view === 'term' ? `${p.name} — zsh — 96×24` : m.title;
  const pb = q('.pbody'), shown = m.view === 'image' ? m.imgs.join(' ') : '';
  if (shown) { if (pb.dataset.img !== shown) pb.innerHTML = m.imgs.map((u) => `<img src="${esc(u)}" alt="">`).join('') + (m.more > 0 ? `<span class="pmore">+${m.more}</span>` : ''); }   // the same pictures are left in place: redrawing them would make them blink
  else pb.innerHTML = (m.view === 'editor' ? `<div class="ptab"><span>${esc(m.tab.file)}</span><em>${esc(m.tab.path)}</em></div>` : '') + m.lines.map((l) => lineHtml(l, m.view)).join('') + (m.view === 'term' ? '<div class="tl"><span class="ps">❯</span> <span class="cursor"></span></div>' : '');
  pb.dataset.img = shown; pb.scrollTop = m.view === 'term' ? pb.scrollHeight : 0; q('.pstat').textContent = m.stat;
  const td = S.todos[id], tl = q('.ptodo'), tk = td && td.length ? prefs.lang + '\n' + td.map((x) => x.s + ' ' + x.c).join('\n') : ''; tl.style.display = tk ? '' : 'none'; el.classList.toggle('has-todo', !!tk);
  if (tk && tl.dataset.k !== tk) {   // redrawn only when it changes, so it stays where you scrolled it; the task in progress is brought into view
    tl.innerHTML = `<h5>${L('Tâches', 'Tasks')} · ${td.filter((x) => x.s === 'completed').length}/${td.length}</h5>` + td.map((x) => `<div class="td ${x.s}"><i>${x.s === 'completed' ? '☑' : x.s === 'in_progress' ? '◐' : '☐'}</i>${esc(x.c)}</div>`).join('');
    const cur = tl.querySelector('.in_progress'); tl.scrollTop = cur ? Math.max(0, cur.offsetTop - tl.clientHeight / 2) : 0;
  }
  tl.dataset.k = tk;
  q('.pbadge').textContent = `🖥 ${p.name} ${L('partage son écran', 'is sharing their screen')}`;
  const cam = q('.pcam'); if (el.dataset.cam !== id) { cam.innerHTML = avatarSVG(p, undefined, 'c' + p.gid + '_') + `<div class="tag"><b>${esc(p.name)}</b></div>`; el.dataset.cam = id; }
  const tile = $('#t-' + id); for (const c of ['speaking', 'thinking', 'celebrate']) cam.classList.toggle(c, c === 'speaking' ? S.speakers.has(id) : !!(tile && tile.classList.contains(c))); setFrame(cam, id);   // the camera in the corner moves like the tile
}
function setCaption(id, text) {   // the presenter's line is the caption of its own screen, and its tile bubble steps aside
  const el = paneOf(id); if (!el) return; el.querySelector('.pcap').textContent = text;
  const t = $('#t-' + id); if (t) t.classList.toggle('capshown', !!text);
}
