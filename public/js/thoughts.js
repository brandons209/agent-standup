// =====================================================================
//  inner thoughts: an agent that has been at work for a while thinks to itself, in a bubble it does not say. What it thinks is real: its own reasoning when the session kept it
//  (rarely: Claude Code mostly stores a signature), otherwise what it is on right now (the command it waits for, the files it goes between, its to-do item, a failure, its task).
//  One time in five the thought escapes as a mumble: its own voice, low and muffled. Live only, never while it speaks, off with the little lines or in Quiet.
// =====================================================================
const TH = { since: {}, next: {}, said: {}, last: 0, voice: null };
const THINK = {
  en: { run: ['Still running… {x}.', 'Come on… {x}.', '{x}. Any second now.'], err: ['Why did that fail?', 'That error again… what am I missing?', 'Not what I expected from “{x}”.'], two: ['{a}, then {b}… what links them?', '{a} and {b}. It has to be in one of them.'], one: ['Something in {a} does not add up.', '{a}… where was that part again?'], again: ['Back to {a}. Again.', '{a}, once more. I am missing something.'],
    todo: ['One thing at a time: {x}.', '{x}… then the next one.'], next: ['After this: {x}.'], grep: ['Where is “{x}” hiding?', '“{x}”… it has to be somewhere.'], web: ['“{x}”… let’s see what comes up.'], grep0: ['It has to be somewhere in here.', 'Where is that thing hiding?'], task: ['{x}. Stay on it.', '{x}… getting there, I think.'] },
  fr: { run: ['Toujours en cours… {x}.', 'Allez… {x}.', '{x}. Ça arrive.'], err: ['Pourquoi ça a planté ?', 'Encore cette erreur… qu’est-ce que je rate ?', 'Pas ce que j’attendais de « {x} ».'], two: ['{a}, puis {b}… quel est le lien ?', '{a} et {b}. C’est forcément dans l’un des deux.'], one: ['Il y a un truc dans {a} qui ne colle pas.', '{a}… c’était où, déjà ?'], again: ['Retour à {a}. Encore.', '{a}, une fois de plus. Je rate quelque chose.'],
    todo: ['Une chose à la fois : {x}.', '{x}… puis la suite.'], next: ['Après ça : {x}.'], grep: ['Où se cache « {x} » ?', '« {x} »… c’est forcément quelque part.'], web: ['« {x} »… voyons ce que ça donne.'], grep0: ['C’est forcément quelque part là-dedans.', 'Où est-ce que ça se cache ?'], task: ['{x}. On reste dessus.', '{x}… j’y arrive, je crois.'] },
};
function thoughtFor(id) {
  const now = Date.now(), W = THINK[FR() ? 'fr' : 'en'], seen = (TH.said[id] = TH.said[id] || []), cut = (x, n) => { x = String(x || '').replace(/\s+/g, ' ').trim(); return (x.length > n ? x.slice(0, n).replace(/\s+\S*$/, '') : x).replace(/[.…,;:\s]+$/, ''); };   // the line it goes into brings its own punctuation
  const real = realThought(id); if (real) return real;   // its own words first, always: the rest is only for when there are none (left)
  const buf = (S.term[id] || []).slice(-8), last = buf[buf.length - 1], r = S.run[id], hot = [], out = [], add = (to, k, v) => { for (const tpl of W[k]) to.push(tpl.replace(/\{(\w+)\}/g, (m, key) => v[key]).replace(/([?!])[.…]+/g, '$1').replace(/([?!]) (\p{Ll})/u, (m, a, b) => a + ' ' + b.toUpperCase())); };   // "Why is it slow?" keeps its own mark, without a full stop after it
  const cmd = (t) => String(t || '').trim().replace(/^(?:cd\s+\S+\s*(?:&&|;)\s*)+/, '').replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, '').split(/\s+(?:&&|\|\||[|;>])/)[0].split(/\s+/).slice(0, 3).join(' ');   // the command itself: not the folder it starts from, nor what it is piped into
  const what = (e) => { const d = e.tool.d || {}; return cut(d.note || (d.kind === 'cmd' ? cmd(d.text) : base(d.file) || e.tool.name), 60); }, fname = (f) => (f.length > 30 ? f.slice(0, 14) + '…' + f.slice(-13) : f);
  if (last && last.k === 'cmd' && r && r.id === last.id && now - (r.ts || now) > 20000) add(hot, 'run', { x: what(last) });   // a command that takes its time
  if (last && last.err) add(hot, 'err', { x: what(last) });
  const files = buf.filter((e) => /^(read|edit|write)$/.test(e.k)).map((e) => fname(base((e.tool.d || {}).file))).filter(Boolean), uniq = [...new Set(files)], f = uniq[uniq.length - 1];
  if (f && files.filter((x) => x === f).length >= 3) add(out, 'again', { a: f }); else if (uniq.length > 1) add(out, 'two', { a: uniq[uniq.length - 2], b: f }); else if (f) add(out, 'one', { a: f });
  const td = S.todos[id] || [], cur = td.find((x) => x.s === 'in_progress'), nx = td.find((x) => x.s === 'pending'); if (cur) add(out, 'todo', { x: cut(cur.c, 70) }); if (nx) add(out, 'next', { x: cut(nx.c, 70) });
  const g = buf.slice(-3).reverse().find((e) => e.k === 'grep' && (e.tool.d || {}).pattern); if (g) { const pat = String(g.tool.d.pattern).trim(); if (/^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,28}$/u.test(pat)) add(out, 'grep', { x: pat }); else add(out, 'grep0', {}); }   // a regular expression between quotes reads like noise
  const w = buf.slice(-3).reverse().find((e) => e.k === 'web' && (e.tool.d || {}).query); if (w) add(out, 'web', { x: cut(w.tool.d.query, 50) });
  const p = S.agents[id]; if (isSub(id) && p && p.role && p.role !== p.type && !/^(agent|explore|plan|claude|general-purpose)$/i.test(p.role)) add(out, 'task', { x: cut(p.role, 60) });   // a task with a title of its own, not the kind of agent
  const fresh = (a) => a.filter((x) => !seen.includes(x)), h = fresh(hot), o = fresh(out), pool = h.length && (!o.length || Math.random() < 0.6) ? h : o; if (!pool.length) return null;
  const line = pool[Math.floor(Math.random() * pool.length)]; seen.push(line); if (seen.length > 6) seen.shift(); return line;
}
function realThought(id, peek) {   // the next sentence of the agent's own reasoning for the work it is on (kept by the session for some of its steps); null when there is none, or when all of it has been shown
  const th = S.th[id]; if (!th || Date.now() - th.ts > 600000) return null;
  if (!th.ss) {   // a sentence ends on . ! ? … followed by a space and a capital: "db/schema.sql", "1.25.8" and "example.com" stay whole
    const ss = [], lines = th.text.split('\n').map((l) => plain(l.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);   // each line of its notes on its own (a list item, a step), without its mark
    lines.forEach((t, k) => {
      const re = /[.!?…]+["”’»)]*\s+(?=["“«(]?[A-ZÀ-ÖØ-Þ])/g; let from = 0, m; while ((m = re.exec(t))) { ss.push(t.slice(from, m.index + m[0].length).trim()); from = m.index + m[0].length; }
      const tail = t.slice(from).trim(); if (tail && (k < lines.length - 1 || th.text.length < 880 || /[.!?…]["”’»)]*$/.test(tail))) ss.push(tail);   // the server keeps the first 900 characters: a last sentence cut there is left out
    });
    th.ss = ss.filter((x) => x.length >= 12).map((x) => (x.length > 120 ? x.slice(0, 120).replace(/\s+\S*$/, '') + '…' : x)); th.i = 0;
  }
  return th.i < th.ss.length ? (peek ? th.ss[th.i] : th.ss[th.i++]) : null;
}
function showThought(id, text) {
  const t = $('#t-' + id); if (!t || t.style.display === 'none' || S.speakers.has(id) || t.classList.contains('bye')) return false;
  t.querySelector('.bubble').innerHTML = `<small>💭</small>${esc(text)}`; t.classList.add('musing'); clearTimeout(t._thT); t._thT = setTimeout(() => endThought(id), Math.min(9000, 3500 + text.length * 55)); return true;
}
function endThought(id) {
  const t = $('#t-' + id); if (!t || !t.classList.contains('musing')) return; clearTimeout(t._thT); t.classList.remove('musing'); if (TH.voice && TH.voice.id === id) stopMumble();
  if (!S.speakers.has(id) && !t.classList.contains('bye')) t.querySelector('.bubble').innerHTML = '';
}
const clearThoughts = () => { document.querySelectorAll('.tile.musing').forEach((t) => endThought(t.id.slice(2))); stopMumble(); };
function stopMumble() { const v = TH.voice; if (v) { TH.voice = null; try { v.src.stop(); } catch {} } }
async function mumble(id, text) {   // lips closed: the mouth does not move, the music does not make room, and anyone who starts to speak cuts it
  const p = S.agents[id], t = $('#t-' + id); if (!p || !t || !prefs.voice || AUD.off() || !AUD.ctx || S.speakers.size || TH.voice) return;
  if (!TTS.server || prefs.vstyle === 'animal' || prefs.vstyle === 'sims') { const o = AUD.murmur(0.5 + (p.vi % 5) / 10, Math.min(2.2, estMs(text) / 1000), 0.4); if (o) { TH.voice = { id, src: o }; o.addEventListener('ended', () => { if (TH.voice && TH.voice.src === o) TH.voice = null; }); } return; }   // the babble is a voice too: whoever starts to speak cuts it
  const fr = frVoice(text), voice = TTS.voiceFor(p, fr), token = S.token; if (!voice) return; let buf; try { buf = await TTS.buf(speakable(plain(text)), voice, TTS.rate(), true, fr); } catch { return; }   // made like a line prepared ahead: it never delays a real one
  if (token !== S.token || S.speakers.size || TH.voice || !t.classList.contains('musing')) return;   // someone spoke meanwhile, or the thought is gone
  const c = AUD.ctx, src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(); src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 1100; g.gain.value = 0.2; let stops = [];
  if (prefs.vstyle === 'natural' || prefs.vstyle === 'kokoro') src.connect(lp); else { const ch = fxChain(c, src, fxFor(p)); stops = ch.stops; ch.node.connect(lp); }
  lp.connect(g); g.connect(AUD.voice); AUD.live.add(src); TH.voice = { id, src };
  src.onended = () => { AUD.live.delete(src); stops.forEach((o) => { try { o.stop(); } catch {} }); if (TH.voice && TH.voice.src === src) TH.voice = null; }; src.start();
}
setInterval(() => {   // who gets a thought: someone at work for a while and silent; two at most on screen, a few seconds apart, each agent every half minute or so
  const now = Date.now(); if (!S.live || !S.playing || S.recomputing || !prefs.banter || prefs.chat === 'quiet' || S.hurry || S.boost > 1 || (document.hidden && !S.exporting) || !atTail()) return;
  const ready = [];
  for (const p of Object.values(S.agents)) {
    const id = p.id, t = $('#t-' + id); if (id === 'user' || !t) continue;
    if (t.style.display === 'none' || S.gone.has(id) || agentState(id, now).k !== 'working') { delete TH.since[id]; endThought(id); continue; }   // done, or waiting: the thought goes with the work
    TH.since[id] = TH.since[id] || now; if (!S.speakers.has(id) && !t.classList.contains('musing') && now - TH.since[id] > 15000 && now > (TH.next[id] || 0) && !S.events.slice(S.pos).some((e) => e.agent === id && SPK.has(e.kind))) ready.push(id);   // not when a line of its own is about to be read
  }
  if (!ready.length || now - TH.last < 5000 || document.querySelectorAll('.tile.musing').length >= 2) return;
  const own = ready.filter((id) => realThought(id, true)), from = own.length ? own : ready;   // whoever has reasoning of its own to show goes first
  const id = from[Math.floor(Math.random() * from.length)], text = thoughtFor(id); TH.next[id] = now + (text ? 28000 + Math.random() * 24000 : 8000) / chatMul(); if (!text || !showThought(id, text)) return;
  TH.last = now; if (Math.random() < 0.2) mumble(id, text);
}, 1500);

// ---------- hierarchy tree ----------
function renderTree() {
  if (!document.body.classList.contains('tree')) return;
  const kids = {}, parent = {}, last = {}, cnt = {};
  for (let i = 0; i <= S.idx && i < S.events.length; i++) {
    const e = S.events[i];
    if (e.kind === 'order' && !parent[e.to]) { parent[e.to] = e.agent; (kids[e.agent] = kids[e.agent] || []).push(e.to); }
    if (e.kind === 'tools') { cnt[e.agent] = (cnt[e.agent] || 0) + e.tools.length; last[e.agent] = e.tools[e.tools.length - 1]; }
  }
  const node = (id) => {
    const p = S.agents[id], st = S.status[id], k = kids[id] || [], open = !S.collapsed.has(id), lt = last[id]; if (!p) return '';
    return `<li><span class="caret" data-c="${id}">${k.length ? (open ? '▾' : '▸') : ''}</span><span class="node ${st || ''} ${S.speakers.has(id) ? 'speaking' : ''}" data-n="${id}">
      <span class="dot" style="background:${p.shirt}"></span><b>${esc(p.name)}</b><span class="r">${esc(p.role)}</span>${(() => { const a = agentState(id, Date.now()); return a.k !== 'idle' ? `<span class="stc ${a.k}">${esc(a.txt)}</span>` : ''; })()}
      ${cnt[id] ? `<span class="r">🔧${cnt[id]}</span>` : ''}${k.length ? `<span class="r">👥${k.length}</span>` : ''}${lt && st === 'working' ? `<span class="tl">${esc(lt.name)} ${esc(lt.arg || '')}</span>` : ''}</span>
      ${k.length && open ? `<ul>${k.map(node).join('')}</ul>` : ''}</li>`;
  };
  $('#tree').innerHTML = `<ul>${node('user').replace(/<\/li>\s*$/, `<ul>${node('main')}</ul></li>`)}</ul>`;
}
$('#tree').onclick = (e) => {
  const c = e.target.closest('[data-c]'), n = e.target.closest('[data-n]');
  if (c) { S.collapsed.has(c.dataset.c) ? S.collapsed.delete(c.dataset.c) : S.collapsed.add(c.dataset.c); renderTree(); } else if (n) openDetail(n.dataset.n);
};

// ---------- agent detail ----------
function openDetail(id) { const p = S.agents[id]; if (!p) return; S.detail = id; $('#dname').textContent = `${p.name} · ${p.role}`; renderDetail(); $('#detail').classList.add('on'); }
function renderDetail() {
  if (!S.detail) return; const id = S.detail, evs = S.events.slice(0, S.idx + 1).filter((e) => e.agent === id || e.to === id);
  const order = evs.find((e) => e.kind === 'order' && e.to === id), tools = evs.filter((e) => e.agent === id && e.kind === 'tools').flatMap((e) => e.tools);
  const counts = {}; tools.forEach((t) => (counts[t.name] = (counts[t.name] || 0) + 1));
  const u = S.usage[id], tokHtml = u && tokTotal(u) ? `<h3>${L('Jetons', 'Tokens')} · ⚡ ${fmtTok(tokTotal(u))}</h3><div class="dim">${L('entrée', 'input')} ${fmtTok(u.i)} · ${L('sortie', 'output')} ${fmtTok(u.o)} · ${L('écriture cache', 'cache write')} ${fmtTok(u.w)} · ${L('lecture cache', 'cache read')} ${fmtTok(u.r)}</div>` : '';
  $('#dbody').innerHTML = tokHtml + (order ? `<h3>${L('Consigne de', 'Prompt from')} ${esc(nameOf(order.agent))}</h3><pre>${esc(order.text)}</pre>` : '') +
    `<h3>${L('Outils', 'Tools')} (${tools.length})</h3><div>${Object.entries(counts).map(([n, c]) => `${esc(n)} ×${c}`).join(' · ') || '—'}</div>` +
    `<h3>${L('Activité récente', 'Recent activity')}</h3>` + (S.term[id] || []).slice(-30).reverse().map((e) => `<details><summary>${e.end == null ? '⠋' : e.err ? '✗' : '✓'} ${esc(e.tool.name)} <span class="dim">${e.end != null ? fmtDur(e.end - e.ts) : L('en cours', 'running')}</span> — ${esc((e.tool.arg || '').slice(-60))}</summary><pre>${esc((e.tool.d && e.tool.d.kind === 'cmd' ? '$ ' + e.tool.d.text + '\n' : '') + (e.out || ''))}</pre>${e.img && S.cur ? `<img class="dimg" src="${esc(mediaUrl(id, e.id, 0))}" alt="" loading="lazy">` : ''}</details>`).join('') +
    evs.filter((e) => e.agent === id && (e.kind === 'say' || e.kind === 'report')).map((e) => `<h3>${e.kind === 'report' ? L('Rapport final', 'Final report') : L('A dit', 'Said')}</h3><pre>${esc(e.text)}</pre>`).join('');
}
$('#dclose').onclick = () => { S.detail = null; $('#detail').classList.remove('on'); };

// ---------- timeline (replay only) ----------
let gantt = { rows: [], n: 0 }, ganttQ = false;
function computeGantt() {
  const rows = {}, order = [];
  S.events.forEach((e, i) => { if (e.kind === 'order') { rows[e.to] = rows[e.to] || { id: e.to, start: i, end: S.events.length, ticks: [], talks: [] }; order.push(e.to); } });
  S.events.forEach((e, i) => { const r = rows[e.agent]; if (!r) return; if (e.kind === 'report') r.end = i; if (e.kind === 'tools') r.ticks.push(i); if (e.kind === 'say' || e.kind === 'report') r.talks.push(i); });
  gantt = { rows: [...new Set(order)].map((id) => rows[id]), n: S.events.length };
  const cv = $('#gantt'); cv.height = Math.max(56, Math.min(110, gantt.rows.length * 4 + 10)); cv.style.height = cv.height + 'px';
}
function drawGantt() {
  if (S.live || ganttQ) return; ganttQ = true;
  requestAnimationFrame(() => {
    ganttQ = false; const cv = $('#gantt'), W = cv.clientWidth, H = +cv.height, dpr = devicePixelRatio || 1; if (!W) return;
    cv.width = W * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr); if (!gantt.n) return;
    const rh = Math.max(2, (H - 8) / Math.max(1, gantt.rows.length)), X = (i) => (i / gantt.n) * W;
    gantt.rows.forEach((r, k) => {
      const y = 4 + k * rh, p = S.agents[r.id]; if (!p) return; const live = S.idx >= r.start;
      c.globalAlpha = live ? (S.status[r.id] === 'done' ? .55 : .95) : .3; c.fillStyle = p.shirt;
      c.fillRect(X(r.start), y, Math.max(2, X(Math.min(r.end, live ? Math.max(S.idx, r.start) : r.end)) - X(r.start)), Math.max(1.5, rh - 1)); c.globalAlpha = 1;
      c.fillStyle = '#fff'; r.talks.forEach((t) => c.fillRect(X(t) - 1, y, 2.5, Math.max(1.5, rh - 1)));
    });
    c.fillStyle = '#ffd24a'; c.fillRect(X(S.idx), 0, 2, H);
  });
}
$('#gantt').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo(Math.floor(((e.clientX - r.left) / r.width) * S.events.length)); };

