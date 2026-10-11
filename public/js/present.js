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
  if (silent || !last) return;
  setTicker(ev.agent, last); if (S.present === ev.agent) { renderPresent(); armPresent(); }
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
  S.run[ev.agent] = { id: k.id, start: performance.now(), ts: k.ts, name: k.name }; setTicker(ev.agent, buf[buf.length - 1]); showPresent(ev.agent);
}
setInterval(() => {   // live "running…" counters
  if (!S.playing) return;
  for (const id in S.run) { const el = performance.now() - S.run[id].start, tag = $('#t-' + id + ' .ticker .el'); if (tag) tag.textContent = el > 1500 ? fmtDur(el) : ''; }
  if (S.present && S.run[S.present]) { const m = termModel(S.present); $('#pstat').textContent = m.stat; }
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
function renderPresent() {
  const id = S.present, p = S.agents[id]; if (!p) return; const m = termModel(id);
  $('#present .pwin').className = 'pwin ' + (m.view === 'term' ? 'term' : m.view); if ($('#present').classList.toggle('pic', m.view === 'image') !== S.picUp) { S.picUp = m.view === 'image'; layout(); }   // a picture gets a taller window
  $('#ptitle').textContent = m.view === 'term' ? `${p.name} — zsh — 96×24` : m.title;
  const pb = $('#pbody'), shown = m.view === 'image' ? m.imgs.join(' ') : '';
  if (shown) { if (pb.dataset.img !== shown) pb.innerHTML = m.imgs.map((u) => `<img src="${esc(u)}" alt="">`).join('') + (m.more > 0 ? `<span class="pmore">+${m.more}</span>` : ''); }   // the same pictures are left in place: redrawing them would make them blink
  else pb.innerHTML = (m.view === 'editor' ? `<div class="ptab"><span>${esc(m.tab.file)}</span><em>${esc(m.tab.path)}</em></div>` : '') + m.lines.map((l) => lineHtml(l, m.view)).join('') + (m.view === 'term' ? '<div class="tl"><span class="ps">❯</span> <span class="cursor"></span></div>' : '');
  pb.dataset.img = shown; pb.scrollTop = m.view === 'term' ? pb.scrollHeight : 0; $('#pstat').textContent = m.stat;
  const td = S.todos[id], el = $('#ptodo'), tk = td && td.length ? prefs.lang + '\n' + td.map((x) => x.s + ' ' + x.c).join('\n') : ''; el.style.display = tk ? '' : 'none'; $('#present').classList.toggle('has-todo', !!tk);
  if (tk && el.dataset.k !== tk) {   // redrawn only when it changes, so it stays where you scrolled it; the task in progress is brought into view
    el.innerHTML = `<h5>${L('Tâches', 'Tasks')} · ${td.filter((x) => x.s === 'completed').length}/${td.length}</h5>` + td.map((x) => `<div class="td ${x.s}"><i>${x.s === 'completed' ? '☑' : x.s === 'in_progress' ? '◐' : '☐'}</i>${esc(x.c)}</div>`).join('');
    const cur = el.querySelector('.in_progress'); el.scrollTop = cur ? Math.max(0, cur.offsetTop - el.clientHeight / 2) : 0;
  }
  el.dataset.k = tk;
  $('#pbadge').textContent = `🖥 ${p.name} ${L('partage son écran', 'is sharing their screen')}`;
  if (S.camFor !== id) { $('#pcam').innerHTML = avatarSVG(p, undefined, 'c' + p.gid + '_') + `<div class="tag"><b>${esc(p.name)}</b></div>`; S.camFor = id; }
  $('#pcam').classList.toggle('speaking', S.speakers.has(id));
}
function armPresent() {   // stays up while a command is still running, then ~4 s after the last action (~9 s when it shows a picture)
  clearTimeout(presentTimer); if (S.hold) return;
  presentTimer = setTimeout(() => { if (S.present && S.run[S.present] && S.playing) armPresent(); else hidePresent(); }, ($('#present').classList.contains('pic') ? 9000 : 4200) / Math.max(1, spd() / 1.2));
}
function showPresent(id) {
  if (S.boost > 1 || (S.speakers.size && !S.speakers.has(id))) return;   // catching up, or someone else has the floor
  const first = S.present !== id; S.present = id; $('#present').classList.add('on'); document.body.classList.add('presenting'); document.querySelectorAll('.tile.presenter').forEach((t) => t.classList.remove('presenter')); const pt = $('#t-' + id); if (pt) pt.classList.add('presenter'); renderPresent(); if (first) { layout(); AUD.tone(880, .12, 'sine', .05); }
  armPresent();
}
function hidePresent() {
  clearTimeout(presentTimer); if (!S.present) return; S.present = null; $('#present').classList.remove('on'); document.body.classList.remove('presenting'); document.querySelectorAll('.tile.presenter').forEach((t) => t.classList.remove('presenter')); $('#pcap').textContent = ''; layout();
}
