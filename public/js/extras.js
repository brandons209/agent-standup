// =====================================================================
//  support the dev
// =====================================================================
const coffeeMsg = () => L('Ce développeur a été remplacé par ses propres agents. Un café pour sa reconversion ? ☕', 'This dev was replaced by his own agents. Spare a coffee for his career change? ☕');
function openExternal(url) { if (EMBED) window.parent.postMessage({ agentStandup: 'openExternal', url }, '*'); else window.open(url, '_blank', 'noopener'); }   // VS Code webviews must ask the extension
function renderCoffee() {
  const on = !!SUPPORT.url, b = $('#mCoffee'); b.style.display = on ? '' : 'none'; $('#mCoffeeT').textContent = L('☕ Offrir un café au développeur', '☕ Buy the (replaced) dev a coffee'); b.title = coffeeMsg();
  const h = $('#bCoffee'); h.style.display = on ? '' : 'none'; h.title = coffeeMsg(); h.setAttribute('aria-label', coffeeMsg());
}
$('#bCoffee').onclick = () => openExternal(SUPPORT.url);
$('#mCoffee').onclick = () => { $('#menu').classList.remove('on'); openExternal(SUPPORT.url); };

// =====================================================================
//  recap
// =====================================================================
const fmt = (ms) => { const s = Math.round(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d}j ${h % 24}h` : h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };

// ---------- highlights: jump to the moments that matter when replaying ----------
function computeHighlights() {
  const out = [], ev = S.events; let firstErr = -1, gap = { ms: 0, i: -1 }, prevT = null, comp = [], R = {}, loops = [];
  ev.forEach((e, i) => {
    if (e.kind === 'usage' || e.kind === 'finish') return;
    if (e.kind === 'results' && firstErr < 0 && e.items.some((it) => it.err)) firstErr = i;
    if (e.kind === 'compact') comp.push(i);
    if (prevT != null && e.kind !== 'user' && e.t - prevT <= 3600000 && e.t - prevT > gap.ms) gap = { ms: e.t - prevT, i };   // a wait for the human (the next event is their prompt) is not an agent wait
    if (e.kind !== 'compact') prevT = e.t;
    const d = loopStep(R, e); if (d && loops.length < 3 && !loops.some((l) => l.agent === e.agent)) loops.push({ i, agent: e.agent, d });
  });
  if (firstErr >= 0) out.push({ i: firstErr, k: 'err', t: '✗ ' + L('première erreur', 'first error') });
  if (gap.ms >= 30000) out.push({ i: gap.i, k: 'wait', t: '⏱ ' + L('plus longue attente ', 'longest wait ') + fmtDur(gap.ms) });
  if (comp.length) out.push({ i: comp[0], k: 'compact', t: `🗜 ${L('compactage', 'compaction')}${comp.length > 1 ? ' ×' + comp.length : ''}` });
  loops.forEach((l) => out.push({ i: l.i, k: 'loop', t: `🔁 ${nameOf(l.agent)} ${l.d.kind === 'errors' ? L('échoue en boucle ?', 'failing in a loop?') : L('boucle ?', 'looping?')}` }));
  out.sort((a, b) => a.i - b.i); return out;
}
// Where a short clip starts: one spoken line before the first error or loop when there is one (so it is seen coming), otherwise before the lead first hands out work.
function clipStart() {
  const ev = S.events, h = computeHighlights().find((x) => x.k === 'err' || x.k === 'loop'), at = h ? h.i : ev.findIndex((e) => e.kind === 'order'); if (at < 0) return 0;
  let i = at; while (i > 0 && at - i < 12 && !SPK.has(ev[--i].kind));
  return i;
}
function renderHighlights() {
  const box = $('#hl'); if (!box) return; const hs = S.live ? [] : computeHighlights();
  box.classList.toggle('has', hs.length > 0); box.innerHTML = hs.length ? `<span class="dim" style="font-size:11.5px">${L('Moments clés', 'Highlights')}</span>` + hs.map((h) => `<button class="hlc" data-i="${h.i}">${esc(h.t)}</button>`).join('') : '';
}
$('#hl').onclick = (e) => { const b = e.target.closest('.hlc'); if (b && !S.live) seekTo(+b.dataset.i); };
function openRecap() {
  const per = {}, files = {}; let tools = 0, cmds = 0, errs = 0; const tk = {}, A = (id) => (per[id] = per[id] || { id, tools: 0, files: new Set(), t0: null, t1: null });
  S.events.forEach((e) => {
    if (e.kind === 'usage') { const u = (tk[e.agent] = tk[e.agent] || { i: 0, o: 0, r: 0, w: 0 }); u.i += e.u.i; u.o += e.u.o; u.r += e.u.r; u.w += e.u.w; }
    if (e.kind === 'results') e.items.forEach((it) => { if (it.err) errs++; });
    if (e.kind === 'order') A(e.to).t0 = e.t; if (e.kind === 'report') A(e.agent).t1 = e.t;
    if (e.kind === 'tools') e.tools.forEach((t) => { tools++; A(e.agent).tools++; if (t.name === 'Bash') cmds++; const d = t.d || {};
      if ((d.kind === 'edit' || d.kind === 'write') && d.file) { A(e.agent).files.add(d.file); (files[d.file] = files[d.file] || { n: 0, who: new Set() }).n++; files[d.file].who.add(nameOf(e.agent)); } });
  });
  const last = S.events.length ? S.events[S.events.length - 1].t : 0, rows = Object.values(per).filter((a) => a.id !== 'user' && S.agents[a.id]).sort((a, b) => b.tools - a.tools).slice(0, 18), fl = Object.entries(files).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
  const k = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`, totTok = Object.values(tk).reduce((n, u) => n + tokTotal(u), 0);
  $('#recap .box').innerHTML = `<h1>${L('Récap de l’épisode', 'Episode recap')}</h1>
    <div class="kpis">${k(Math.max(0, Object.keys(S.agents).length - 2), 'agents')}${k(tools, L('appels d’outils', 'tool calls'))}${k(cmds, L('commandes', 'commands'))}${k(errs, L('outils en erreur', 'tool errors'))}${totTok ? k('⚡ ' + fmtTok(totTok), L('jetons', 'tokens')) : ''}${k(Object.keys(files).length, L('fichiers modifiés', 'files changed'))}${k(fmt(last), L('durée', 'duration'))}</div>
    <h3>${L('Agents les plus actifs', 'Busiest agents')}</h3><table><tr><th></th><th>${L('Rôle', 'Role')}</th><th>${L('Outils', 'Tools')}</th><th>${L('Fichiers', 'Files')}</th><th>${L('Jetons', 'Tokens')}</th><th>${L('Durée', 'Time')}</th></tr>
    ${rows.map((a) => `<tr><td><b>${esc(nameOf(a.id))}</b></td><td>${esc(S.agents[a.id].role)}</td><td>${a.tools}</td><td>${a.files.size || ''}</td><td title="${tk[a.id] ? esc(tokTip(tk[a.id])) : ''}">${tk[a.id] ? '⚡ ' + fmtTok(tokTotal(tk[a.id])) : ''}</td><td>${a.t0 != null && a.t1 != null ? fmt(a.t1 - a.t0) : ''}</td></tr>`).join('')}</table>
    <h3>${L('Fichiers touchés', 'Files touched')}</h3>${fl.length ? `<table>${fl.map(([f, v]) => `<tr><td class="f">${esc(f)}</td><td>×${v.n}</td><td>${esc([...v.who].join(', '))}</td></tr>`).join('')}</table>` : `<div class="dim">${L('Aucune modification.', 'No edits.')}</div>`}
    ${SUPPORT.url ? `<div class="coffee"><span>${esc(coffeeMsg())}</span><button class="btn" id="recapCoffee">☕ ${L('Offrir un café', 'Buy a coffee')}</button></div>` : ''}
    <p style="text-align:right;margin:18px 0 0"><button class="btn" id="recapMd">📋 ${L('Copier en Markdown', 'Copy as Markdown')}</button> <button class="cta" id="recapx">${L('Fermer', 'Close')}</button></p>`;
  const md = [`# Agent Standup — ${S.title || L('épisode', 'session')}`, `_${new Date().toLocaleString()}_ · ${Math.max(0, Object.keys(S.agents).length - 2)} agents · ${tools} ${L('appels d’outils', 'tool calls')} · ${cmds} ${L('commandes', 'commands')} · ${errs} ${L('erreurs', 'errors')}${totTok ? ' · ⚡ ' + fmtTok(totTok) + ' tokens' : ''}`, '', '## Standup'];
  rows.forEach((a) => { let rep = ''; for (let i = S.events.length - 1; i >= 0; i--) { const e = S.events[i]; if (e.agent === a.id && (e.kind === 'report' || (a.id === 'main' && e.kind === 'say'))) { rep = spoken(e).replace(/\s+/g, ' ').trim().slice(0, 240); break; } }
    md.push(`- **${nameOf(a.id)}** (${S.agents[a.id].role}) — ${a.tools} ${L('outils', 'tools')}${a.files.size ? `, ${a.files.size} ${L('fichiers', 'files')}` : ''}${tk[a.id] ? `, ⚡ ${fmtTok(tokTotal(tk[a.id]))}` : ''}${rep ? `\n  > ${rep}` : ''}`); });
  if (fl.length) { md.push('', '## ' + L('Fichiers touchés', 'Files touched')); fl.forEach(([f, v]) => md.push(`- \`${f}\` ×${v.n} (${[...v.who].join(', ')})`)); }
  md.push('', '_Made with Agent Standup — https://atoll92.github.io/agent-standup/_');
  $('#recapMd').onclick = async () => { const txt = md.join('\n'); let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch {} } $('#recapMd').textContent = ok ? '✓ ' + L('Copié', 'Copied') : L('Copie impossible', 'Copy failed'); setTimeout(() => ($('#recapMd').textContent = '📋 ' + L('Copier en Markdown', 'Copy as Markdown')), 2000); };
  if ($('#recapCoffee')) $('#recapCoffee').onclick = () => openExternal(SUPPORT.url);
  $('#recapx').onclick = () => $('#recap').classList.remove('on'); $('#recap').classList.add('on');
}

// =====================================================================
//  episode mode: title cards and reactions
// =====================================================================
const REACT = { fr: { ack: ['Compris, chef.', 'C’est parti.', 'Encore du boulot…', 'Je m’en occupe.', 'Ok ok ok.'], done: ['Ça compile chez moi.', 'Oh là là, encore des bugs.', 'Qui a écrit ce code ?', 'Super, on a fini.', 'Classique.'] },
                en: { ack: ['Got it, boss.', 'On it.', 'More work, great.', 'I’ll handle it.', 'Okay okay okay.'], done: ['Works on my machine.', 'Oh man, more bugs.', 'Who wrote this code?', 'Nice, we are done.', 'Classic.'] } };
const quipMem = new Map();
function prefetchQuips(i) {
  if (!prefs.epi) return; const texts = [];
  for (let k = i; k < Math.min(S.events.length, i + 60) && texts.length < 6; k++) if (S.events[k].kind === 'report') texts.push(baseText(S.events[k], 160));
  const need = texts.filter((t) => !quipMem.has(t)); if (!need.length) return; need.forEach((t) => quipMem.set(t, null));
  fetch('/api/quips', { method: 'POST', body: JSON.stringify({ texts: need, lang: FR() ? 'fr' : 'en' }) }).then((r) => r.json()).then((d) => (d.texts || []).forEach((q, i) => d.ok && q && q !== need[i] && quipMem.set(need[i], q))).catch(() => {});
}

// Little lines that make the call feel alive. They never appear in the transcript and never replace real content: they are short, local (no API) and can be turned off in ⚙.
const ACK = {
  en: { tests: ['Running the tests, as usual.', 'Tests? Always.', 'Let’s see what breaks.', 'Green or red, I’ll tell you.'], review: ['Putting on my reviewer glasses.', 'Reading everything twice.', 'I’ll be nice. Maybe.', 'Auditing, brb.'], explore: ['Off to explore the codebase.', 'Grepping like there’s no tomorrow.', 'Time to dig.', 'I’ll find it.'],
    fix: ['Bug hunting time.', 'I smell a bug.', 'Debugger mode: on.', 'Who broke this?'], docs: ['Writing it up.', 'Documentation, my favorite.', 'Words incoming.'], ui: ['Pixels, here I come.', 'Making it pretty.', 'Let me look at the layout.'], cleanup: ['Cleaning up the mess.', 'Tidying time.', 'Deleting things. Carefully.'],
    perf: ['Let’s make it fast.', 'Profiling, one moment.', 'Chasing milliseconds.'], any: ['On it!', 'Got it, boss.', 'Reading the brief.', 'Consider it done. Probably.', 'Okay okay okay.', 'Say no more.', 'Already on my way.', 'Roger that.', 'Coffee first. Then this.'] },
  fr: { tests: ['Je lance les tests, comme d’hab.', 'Des tests ? Toujours.', 'On va voir ce qui casse.', 'Vert ou rouge, je te dirai.'], review: ['Je mets mes lunettes de relecteur.', 'Je relis tout deux fois.', 'Je serai gentil. Peut-être.', 'Audit en cours, je reviens.'], explore: ['Je pars explorer le code.', 'Je grep comme si c’était la fin du monde.', 'Allez, on creuse.', 'Je vais le trouver.'],
    fix: ['L’heure de la chasse aux bugs.', 'Je sens un bug.', 'Mode débogueur : activé.', 'Qui a cassé ça ?'], docs: ['Je rédige ça.', 'La doc, mon truc préféré.', 'Des mots arrivent.'], ui: ['Pixels, me voilà.', 'On va rendre ça joli.', 'Je regarde la mise en page.'], cleanup: ['Je nettoie ce désordre.', 'Séance de rangement.', 'Je supprime. Prudemment.'],
    perf: ['On va rendre ça rapide.', 'Je profile, un instant.', 'À la chasse aux millisecondes.'], any: ['Je m’en occupe !', 'Compris, chef.', 'Je lis le brief.', 'C’est comme fait. Sûrement.', 'Ok ok ok.', 'Pas un mot de plus.', 'Je suis déjà parti.', 'Reçu cinq sur cinq.', 'D’abord un café. Ensuite ça.'] },
};
const ACK_RE = [['tests', /test|qa\b|spec|jest|vitest|coverage/], ['review', /review|audit|check|inspect|lint|critique/], ['explore', /explor|search|research|find|investigat|look|map|scan/], ['fix', /fix|bug|debug|error|crash|broken/], ['docs', /\bdoc|readme|write|changelog|spec/], ['ui', /\bui\b|design|css|style|layout|front|page|component/], ['cleanup', /refactor|clean|tidy|dead code/], ['perf', /perf|speed|slow|optimi|latenc|profil/]];
function ackLine(ev) {
  // classify on role and title only: the prompt text is too noisy
  const R = ACK[FR() ? 'fr' : 'en'], text = `${ev.title || ''} ${(S.agents[ev.to] || {}).role || ''}`.toLowerCase(), cat = (ACK_RE.find(([, re]) => re.test(text)) || [])[0];
  const pool = cat && hash(String(ev.ts)) % 4 ? R[cat] : R.any, seed = hash(String(ev.ts) + ev.to); let line = pool[seed % pool.length];
  if (line === S.lastAck) line = pool[(seed + 1) % pool.length]; S.lastAck = line; return line;
}
