// the speaker always gets the spotlight (and keeps it until someone else talks)
function setFocus(id) {
  if (S.focus === id) return; const o = $('#t-' + S.focus); if (o) o.classList.remove('focus'); S.focus = id; const t = $('#t-' + id);
  if (t) { t.classList.add('focus'); $('#stage').scrollTo({ top: 0, behavior: 'smooth' }); }
}
function fly(fromId, toId, emoji) {
  const a = $('#t-' + fromId), b = $('#t-' + toId); if (!a || !b || document.body.classList.contains('tree')) return;
  const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect(); if (!r1.width || !r2.width) return;
  const x1 = r1.left + r1.width / 2 - 14, y1 = r1.top + r1.height / 2 - 14, x2 = r2.left + r2.width / 2 - 14, y2 = r2.top + r2.height / 2 - 14;
  const el = document.createElement('div'); el.className = 'fly'; el.textContent = emoji; document.body.appendChild(el);
  el.animate([{ transform: `translate(${x1}px,${y1}px) scale(.6)`, opacity: 1 }, { transform: `translate(${(x1 + x2) / 2}px,${Math.min(y1, y2) - 60}px) scale(1.6) rotate(-12deg)`, opacity: 1, offset: .5 }, { transform: `translate(${x2}px,${y2}px) scale(.8)`, opacity: .15 }],
    { duration: 900 / Math.min(2, spd()), easing: 'ease-in-out' }).onfinish = () => el.remove();
}
function popTile(id) { const t = $('#t-' + id); if (!t) return; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }

// ---------- finished agents leave the call ----------
function poof(tile, color) {
  const r = tile.getBoundingClientRect(); if (!r.width) return; const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ring = document.createElement('div'); ring.className = 'puff'; Object.assign(ring.style, { width: '40px', height: '40px', border: `3px solid ${color}`, background: 'none' }); document.body.appendChild(ring);
  ring.animate([{ transform: `translate(${cx - 20}px,${cy - 20}px) scale(.3)`, opacity: .9 }, { transform: `translate(${cx - 20}px,${cy - 20}px) scale(${Math.max(3, r.width / 40)})`, opacity: 0 }], { duration: 800, easing: 'ease-out' }).onfinish = () => ring.remove();
  for (let i = 0; i < 18; i++) {
    const d = document.createElement('div'), a = (i / 18) * Math.PI * 2 + Math.random() * .5, dist = 50 + Math.random() * Math.min(110, r.width / 2), sz = 5 + Math.random() * 9;
    d.className = 'puff'; Object.assign(d.style, { width: sz + 'px', height: sz + 'px', background: i % 3 ? color : '#fff' }); document.body.appendChild(d);
    d.animate([{ transform: `translate(${cx}px,${cy}px) scale(1)`, opacity: 1 }, { transform: `translate(${cx + Math.cos(a) * dist}px,${cy + Math.sin(a) * dist - 20}px) scale(0)`, opacity: 0 }],
      { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.4,1)', delay: 120 }).onfinish = () => d.remove();
  }
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; const c = $('#toasts'); c.appendChild(t); while (c.children.length > 3) c.firstChild.remove(); setTimeout(() => t.remove(), 3100); }
const BYE = { en: ['Bye, everyone!', 'Off I go. 👋', 'Thanks, see you!', 'My work here is done.', 'Catch you later!', 'Logging off, bye!', 'That’s a wrap!', 'Good luck with the rest!', 'Mic drop. 🎤', 'Leaving the call… ☕'],
  fr: ['Salut tout le monde !', 'Je file. 👋', 'Merci, à plus !', 'Ma mission est terminée.', 'À tout à l’heure !', 'Je me déconnecte, ciao !', 'C’est dans la boîte !', 'Bon courage pour la suite !', 'Mic drop. 🎤', 'Je quitte l’appel… ☕'] };
function byeLine(id) { const P = BYE[FR() ? 'fr' : 'en'], seed = hash(id + String(S.clock | 0)); let l = P[seed % P.length]; if (l === S.lastBye) l = P[(seed + 1) % P.length]; return (S.lastBye = l); }
function vanish(id) {
  S.gone.add(id); const t = $('#t-' + id), p = S.agents[id]; if (!t || !p) return;
  toast(`${p.name} ${L('a quitté l’appel', 'left the call')} 👋`);
  if (t.style.display === 'none' || document.body.classList.contains('tree')) return;
  S.leaving.add(id); const say = prefs.banter && !S.hurry && !S.speakers.has(id), go = () => { t.classList.remove('bye'); if (!S.leaving.has(id)) return; t.classList.add('vanishing'); poof(t, p.shirt); AUD.tone(660, .35, 'sine', .07); AUD.tone(330, .5, 'sine', .06, .12);
    setTimeout(() => { S.leaving.delete(id); t.classList.remove('vanishing'); if (S.gone.has(id)) t.style.display = 'none'; }, 1250); };
  if (say) { const b = t.querySelector('.bubble'), line = byeLine(id); b.innerHTML = `<small>👋</small>${esc(line)}`; t.classList.add('bye'); t._byeT = setTimeout(go, 1500); } else go();   // a short goodbye before the poof
}
setInterval(() => {
  if (!S.playing) return; S.clock += 500 * spd();
  if (!prefs.vanish) return;
  for (const id in S.doneAt) if (S.status[id] === 'done' && !S.gone.has(id) && S.clock - S.doneAt[id] >= vanishMs()) vanish(id);
}, 500);

// ---------- speaking tiles ----------
const mouths = new Map();
// A custom character shows one of its pictures: talking (mouth open) wins, then celebrating, then thinking, else at rest; one it does not have falls back to rest.
function setFrame(el, id, mouthOpen) {
  const svg = el && el.querySelector('svg'), c = S.agents[id] && S.agents[id].custom; if (!svg || !c) return; const t = $('#t-' + id);
  const f = mouthOpen && c.talk ? 'talk' : c.celebrate && t && t.classList.contains('celebrate') ? 'celebrate' : c.think && t && t.classList.contains('thinking') && !S.speakers.has(id) ? 'think' : 'idle';
  if (svg.dataset.f !== f) svg.dataset.f = f;
}
function startTalk(id, text, label) {
  const t = $('#t-' + id); if (!t) return; endThought(id); stopMumble(); TH.next[id] = Date.now() + 8000;   // a spoken line takes the bubble and the floor
  S.spokeAt = performance.now(); S.fill = 0; S.mused = false;
  if (!S.speakers.size && !(S.focusLock > Date.now())) setFocus(id); S.gone.delete(id); if (S.doneAt[id] != null) S.doneAt[id] = S.clock; t.style.display = ''; t.classList.add('speaking'); S.speakers.add(id); S.say[id] = { text, label }; AUD.duck(true);
  const shown0 = pieces(text), first = shown0.length > 1 ? shown0[0] : text; const b = t.querySelector('.bubble'); b.innerHTML = (label ? `<small>${esc(label)}</small>` : '') + esc(first);
  const pane = paneOf(id), cam = pane && pane.querySelector('.pcam'); if (cam) { setPaneCaption(id, first); cam.classList.add('speaking'); }
  const m = t.querySelector('.mouthE'); let open = false; clearInterval(mouths.get(id));
  mouths.set(id, setInterval(() => {
    if (!m) { const lv0 = S.level[id], op = lv0 ? lv0() > 0.05 : (open = !open); setFrame(t, id, op); if (cam) setFrame(cam, id, op); return; }   // custom character: its open-mouth picture while the voice is loud
    const pm = cam && cam.querySelector('.mouthE'), lv = S.level[id]; if (lv) { const v = lv(); const ry = (.9 + Math.min(4.2, v * 28)).toFixed(1), rx = (4.8 - Math.min(1.1, v * 6)).toFixed(1); m.setAttribute('ry', ry); m.setAttribute('rx', rx); if (pm) { pm.setAttribute('ry', ry); pm.setAttribute('rx', rx); } }
    else { open = !open; m.setAttribute('ry', open ? 4.2 : 1.1); m.setAttribute('rx', open ? 4 : 4.7); if (pm) { pm.setAttribute('ry', open ? 4.2 : 1.1); pm.setAttribute('rx', open ? 4 : 4.7); } }
  }, 70));
  if (document.body.classList.contains('tree')) renderTree();
}

function thought(id, em) { const t = $('#t-' + id); if (!t || t.style.display === 'none') return; const el = t.querySelector('.thought'); el.textContent = em; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
setInterval(() => {   // now and then a busy agent has a little thought; never while someone is talking
  if (!prefs.banter || !S.playing || S.speakers.size || document.hidden) return; const busy = Object.keys(S.agents).filter((id) => id !== 'user' && agentState(id, Date.now()).k === 'working' && $('#t-' + id) && $('#t-' + id).style.display !== 'none');
  if (busy.length && Math.random() < 0.5) { const id = busy[Math.floor(Math.random() * busy.length)], tl = S.lastTool[id] || ''; thought(id, /^Bash/.test(tl) ? '⌨️' : /^(Grep|Glob|Read)/.test(tl) ? '🔍' : ['💭', '🎧', '🧠', '☕', '🎵'][Math.floor(Math.random() * 5)]); }
}, 7000);
function oops(id) { if (!prefs.banter || !S.playing || S.recomputing) return; const t = $('#t-' + id); if (!t || t.style.display === 'none' || (t._oops && Date.now() - t._oops < 4000)) return; t._oops = Date.now(); t.classList.remove('oops'); void t.offsetWidth; t.classList.add('oops'); thought(id, '😬'); }
function confetti() {
  S.wrap = true;   // the lead is done: if the end of its last message was never read, it is read now (see wrapUp)
  if (!prefs.banter || document.hidden) return; const box = $('#center'), cols = ['#f5c04a', '#7c9cff', '#ff7a6b', '#5ad19a', '#c58bff'];
  for (let i = 0; i < 26; i++) { const c = document.createElement('i'); c.className = 'confetti'; c.style.left = Math.random() * 100 + '%'; c.style.background = cols[i % cols.length]; c.style.animationDelay = Math.random() * 0.6 + 's'; c.style.animationDuration = 1.8 + Math.random() * 1.4 + 's'; box.appendChild(c); setTimeout(() => c.remove(), 4200); }
}
function stopTalk(id) {
  captionClear(id); S.spokeAt = performance.now();
  clearInterval(mouths.get(id)); mouths.delete(id); S.speakers.delete(id); if (!S.speakers.size) AUD.duck(false); if (S.focus === id && S.speakers.size) setFocus([...S.speakers][0]);
  const cam = paneOf(id) && paneOf(id).querySelector('.pcam'); if (cam) { setPaneCaption(id, ''); cam.classList.remove('speaking'); const pm = cam.querySelector('.mouthE'); if (pm) { pm.setAttribute('ry', .9); pm.setAttribute('rx', 4.6); } }
  const t = $('#t-' + id); if (!t) return;
  t.classList.remove('speaking'); const m = t.querySelector('.mouthE'); if (m) { m.setAttribute('ry', .9); m.setAttribute('rx', 4.6); }
  setFrame(t, id); if (cam) setFrame(cam, id);
}
const clearSpeaking = () => [...S.speakers].forEach(stopTalk);
