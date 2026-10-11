// =====================================================================
//  state
// =====================================================================
const S = { owner: null, errRun: {}, exQ: [], agents: {}, events: [], idx: 0, playing: false, token: 0, status: {}, tc: {}, cur: null, live: true, userPaused: false, boost: 1, stopAt: 0,
            speakers: new Set(), say: {}, lastTool: {}, level: {}, detail: null, collapsed: new Set(), title: '', idle: false, locked: true, logTo: 0, trOk: true,
            clock: 0, doneAt: {}, gone: new Set(), leaving: new Set(), demo: false, hold: false, late: [], byK: new Map(), pos: 0 };
const VANISH_MS = 120000;   // a finished agent leaves the call after 2 minutes (playback time)
// Live: how far the call is behind the real session, and what to do about it (speak faster, say less, skip decoration) so it keeps the rhythm of the real conversation
const lagMs = (i = S.idx) => {   // how much newer the newest event of the session is than the one being played: 0 when the call is up to date, however long the session has been idle
  if (!S.live || !S.events.length) return 0; const e = S.events[Math.max(0, Math.min(i, S.events.length - 1))];
  return Math.max(0, S.events[S.events.length - 1]._t - e._t);
};
function stampT(from) { for (let k = from; k < S.events.length; k++) S.events[k]._t = Math.max(S.events[k].ts || 0, k ? S.events[k - 1]._t : 0); }   // the time of an event as the call got it: one that arrives late with an older stamp (an order typed while the lead was busy) is not "far behind"
const lagFactor = () => { const l = lagMs() / 1000; return l < 6 ? 1 : l < 15 ? 1.15 : l < 30 ? 1.3 : 1.5; };   // steps, so the cached audio of a line is reused
const caughtUp = () => !S.live || lagMs() < 6000;
const nearLive = () => !S.live || lagMs() < 30000;   // an answer to what was just said (a word after an order, a thank-you after a report) still fits here: reading the line took longer than 6 s and the session went on meanwhile
const spd = () => (S.live ? 1.12 * lagFactor() : +$('#speed').value) * (S.boost || 1);
const nameOf = (id) => (S.agents[id] || {}).name || id;

// ---------- text prep ----------
const plain = (t) => String(t).replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/https?:\/\/\S+/g, 'link').replace(/[#*_>|~\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
function short(t, max = 230) {
  const s = plain(t); if (s.length <= max) return s;
  const cut = s.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
// make code-ish text pronounceable
const PER = /^(?:s|sec|ms|min|h|hr|j|jour|d|day|mois|mo|month|an|yr|year)$/i;
function slashSay(m, pre, lead, body) {   // word/word (pre: the character before it, put back as it is): only a file path is named by its last part; anything else keeps every word, so the voice says what the caption shows ("and/or", "client/server", "2/3")
  const tail = (body.match(/[.-]+$/) || [''])[0], core = body.slice(0, body.length - tail.length), segs = core.split('/').filter(Boolean), last = segs[segs.length - 1] || '';
  if (segs.every((s) => /^\d+(?:[.,]\d+)?$/.test(s))) return m;   // a fraction, a date, 24/7: the voice reads those by itself
  if (lead || segs.length > 2 || core.endsWith('/') || /\.[A-Za-z][A-Za-z0-9]{0,9}$/.test(last)) return pre + last.replace(/[._-]/g, ' ') + tail;   // it looks like a path: a leading ./ ~/ or /, two slashes or more, a folder/, or an extension
  return PER.test(last) ? m : pre + segs.join(' ') + tail;   // km/h, req/s: a unit, left to the voice
}
const speakable = (t) => t.replace(/https?:\/\/(?:www\.)?([\w-]+(?:\.[\w-]+)*)\S*?(?=[.,;:!?)\]]*(?:\s|$))/g, '$1').replace(/(^|[^\wÀ-ÿ/.~@+-])((?:~|\.\.?|[A-Za-z]:)?\/)?((?:[\wÀ-ÿ.@+-]+\/)+[\wÀ-ÿ.+-]*)/g, slashSay).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_`*#<>{}\[\]|\\=~^]/g, ' ')
  .replace(/\s*[—–]\s*/g, ', ').replace(/\(([^)]{0,40})\)/g, ', $1,').replace(/\s+/g, ' ').trim();

// ---------- translation (local claude CLI) ----------
const trMem = new Map(), trPending = new Map();
const baseText = (ev, max) => short(ev.text, max || (S.live ? (ev.kind === 'order' ? 220 : 180) : (ev.kind === 'order' ? 200 : 230)));
function ensureTr(texts) {
  texts = [...new Set(texts)].filter((t) => t && !trMem.has(t)).filter((t) => langOf(t) !== 'fr');   // already French: nothing to translate
  const waits = texts.filter((t) => trPending.has(t)).map((t) => trPending.get(t)), fresh = texts.filter((t) => !trPending.has(t));
  if (fresh.length) {
    const pr = fetch('/api/translate', { method: 'POST', body: JSON.stringify({ texts: fresh }) }).then((r) => r.json()).then((d) => {
      (d.texts || []).forEach((fr, i) => trMem.set(fresh[i], fr)); S.trOk = d.ok !== false; if (!S.trOk) loadHealth(); else updateHint();
      clearTimeout(S.relog); S.relog = setTimeout(() => renderLog(true), 500);
    }).catch(() => { S.trOk = false; loadHealth(); }).finally(() => fresh.forEach((t) => trPending.delete(t)));
    fresh.forEach((t) => trPending.set(t, pr)); waits.push(pr);
  }
  return Promise.all(waits);
}
function trNew(from) {   // live: start translating every new line the moment it arrives (small parallel calls)
  if (!FR()) return; for (let k = from; k < S.events.length; k++) if (!quiet(S.events[k])) ensureTr([baseText(S.events[k])]);
}
function prefetchTr(i) {
  if (!FR() || S.live) return; const t = [];
  for (let k = i; k < Math.min(S.events.length, i + 120) && t.length < 24; k++) if (!quiet(S.events[k])) t.push(baseText(S.events[k]));
  ensureTr(t);
}
function spoken(ev) {
  let t = baseText(ev); if (FR() && trMem.has(t)) t = trMem.get(t);
  if (ev.kind === 'order') return `${nameOf(ev.to)}, ${t}`;
  if (ev.kind === 'report') return L('Terminé. ', 'Done. ') + t;
  return t;
}
async function loadHealth() { try { S.health = await (await fetch('/api/health')).json(); } catch {} updateHint(); }
function trProblem() {   // why translation can't work, with what to do about it
  const h = S.health || {};
  if (h.claude === null && !h.apiKey) return L('Claude Code est introuvable : installez-le (npm i -g @anthropic-ai/claude-code) ou indiquez son chemin dans le réglage « agentStandup.claudePath ».', 'Claude Code not found: install it (npm i -g @anthropic-ai/claude-code) or set its path in the “agentStandup.claudePath” setting.');
  if (/another Claude Code session|nested/i.test(h.trError || '')) return L('VS Code a été lancé depuis une session Claude Code : relancez VS Code normalement (Dock, Spotlight) pour activer la traduction.', 'VS Code was started from inside a Claude Code session: restart VS Code normally (Dock, Spotlight) to enable translation.');
  if (/login|log in|auth|api key|401|credential|not logged/i.test(h.trError || '')) return L('Claude Code n’est pas connecté : lancez « claude » une fois dans un terminal pour vous connecter.', 'Claude Code is not logged in: run “claude” once in a terminal to sign in.');
  return L('Traduction indisponible pour l’instant : vérifiez que « claude » fonctionne dans un terminal.', 'Translation unavailable right now: check that “claude” works in a terminal.');
}
function updateHint() {
  const h = $('#trHint'), oa = TTS.engine === 'openai', noFr = !oa && FR() && TTS.server && !TTS.pool.fr.length, noTts = !oa && prefs.voice && !TTS.server && TTS.platform !== '', ttsError = (S.health || {}).ttsError, ttsBad = prefs.voice && prefs.tts.url.trim() && ttsError, noRadio = prefs.music && RADIO.err, other = elsewhere(), bad = (FR() && !S.trOk) || noFr || noTts || ttsBad || noRadio || other;
  h.style.display = bad ? '' : 'none';
  h.textContent = other ? L('Le son est joué dans une autre fenêtre Agent Standup. Cliquez sur 🔈 pour le reprendre ici.', 'Sound is playing in another Agent Standup window. Click 🔈 to take it over here.') : noRadio ? L('Radio injoignable : vérifiez votre connexion ou changez de station.', 'Radio unreachable: check your connection or pick another station.') : ttsBad ? L('Serveur de voix : ', 'Voice server: ') + ttsError + (/^HTTP 401/.test(ttsError) && !S.health.ttsKey ? L(' (définissez OPENAI_API_KEY là où tourne le serveur)', ' (set OPENAI_API_KEY where the server runs)') : '') : noFr ? L('Aucune voix française installée (Windows : Paramètres › Heure et langue › Voix).', 'No French voice installed (Windows: Settings › Time & language › Speech).') : noTts ? L('Aucune voix système trouvée : les agents marmonneront.', 'No system voice found: agents will mumble.') : trProblem();
}

S.pin = Q.get('pin') ? { id: Q.get('pin'), proj: Q.get('proj') || '' } : null;   // a window opened for one session stays on it
