// =====================================================================
//  conversation: short exchanges between agents at the right moments, built from what really happened in the session
// =====================================================================
const CHAT = { quiet: 0.45, normal: 1, lively: 1.8 }, chatMul = () => CHAT[prefs.chat] || 1;   // normal unless chosen otherwise
const EXW = { en: { edit: ['edit', 'edits'], call: ['tool call', 'tool calls'], error: ['error', 'errors'] }, fr: { edit: ['modification', 'modifications'], call: ['appel d’outil', 'appels d’outils'], error: ['erreur', 'erreurs'] } };
const P = (k, n) => { const w = EXW[FR() ? 'fr' : 'en'][k]; return `${n} ${n === 1 ? w[0] : w[1]}`; };
const EXCH = {
  en: { done: ['All done.', 'Finished.', 'Okay, that’s done.', 'Done on my side.', 'That’s wrapped up.'],
    ask: ['Quick question: is that the whole scope?', 'Anything else I should touch?', 'Any constraints I should know about?', 'Should I check with you before big changes?'],
    askBack: ['Just that, thanks.', 'No, keep it focused.', 'Use your judgment.', 'Nothing special, go ahead.', 'That’s all, thanks.'],
    ok: [(f) => `Nice, ${f.what} and no errors.`, (f) => (f.file ? `Good, ${f.file} looks fine.` : 'Good, that looks fine.'), (f, b) => `Perfect${f.dur ? ', that took ' + f.dur : ''}. Thanks ${b}.`, (f) => `Great, ${f.what}. Clean.`],
    err: [(f) => `I saw ${P('error', f.errs)} along the way. All good now?`, (f) => `${P('error', f.errs)} on the way, is it solid?`],
    errBack: ['Yes, they were just retries.', 'All fixed in the end.', 'Yes, a few hiccups, nothing serious.', 'It’s solid now.'],
    slow: [(f) => `That took ${f.dur}. Anything blocking you?`, (f) => `${f.dur}, that was long. All fine?`], slowBack: ['No, it was just a big one.', 'Nothing blocking, just a lot to read.', 'All fine, it was heavy.'],
    chime: [(b) => `Good job, ${b}.`, () => 'Nice one.', (b) => `Great, ${b}.`],
    trouble: [(b) => `${b}, you okay? That’s a lot of errors.`, (b) => `${b}, need a hand with those errors?`], troubleBack: ['Working on it.', 'Yes, almost got it.', 'Give me a minute.', 'I’m on it, thanks.'],
    sync: ['Quick sync: where are we?', 'Status check, everyone?', 'Let’s do a quick round.'], syncAns: [(a) => `Still on it: ${a}.`, (a) => `${a}, going well.`, (a) => `Currently ${a}.`] },
  fr: { done: ['Terminé.', 'C’est fini.', 'Voilà, c’est fait.', 'Fini de mon côté.', 'C’est bouclé.'],
    ask: ['Petite question : c’est tout ce qu’il y a à faire ?', 'Il y a autre chose à toucher ?', 'Des contraintes que je dois connaître ?', 'Je te préviens avant les gros changements ?'],
    askBack: ['Juste ça, merci.', 'Non, reste concentré.', 'Fais au mieux.', 'Rien de spécial, vas-y.', 'C’est tout, merci.'],
    ok: [(f) => `Bien, ${f.what} et aucune erreur.`, (f) => (f.file ? `Bien, ${f.file} a l’air bon.` : 'Bien, ça a l’air bon.'), (f, b) => `Parfait${f.dur ? ', ça a pris ' + f.dur : ''}. Merci ${b}.`, (f) => `Super, ${f.what}. Propre.`],
    err: [(f) => `J’ai vu ${P('error', f.errs)} en route. Tout est bon maintenant ?`, (f) => `${P('error', f.errs)} en chemin, c’est solide ?`],
    errBack: ['Oui, c’étaient juste des essais.', 'Tout est réglé à la fin.', 'Oui, quelques accrocs, rien de grave.', 'C’est solide maintenant.'],
    slow: [(f) => `Ça a pris ${f.dur}. Quelque chose te bloque ?`, (f) => `${f.dur}, c’était long. Tout va bien ?`], slowBack: ['Non, c’était juste un gros morceau.', 'Rien ne bloque, il y avait beaucoup à lire.', 'Tout va bien, c’était lourd.'],
    chime: [(b) => `Bon boulot, ${b}.`, () => 'Joli.', (b) => `Super, ${b}.`],
    trouble: [(b) => `${b}, ça va ? Ça fait beaucoup d’erreurs.`, (b) => `${b}, besoin d’un coup de main avec ces erreurs ?`], troubleBack: ['Je m’en occupe.', 'Oui, j’y suis presque.', 'Donne-moi une minute.', 'Je gère, merci.'],
    sync: ['Petit point rapide : où en est-on ?', 'Point d’étape, tout le monde ?', 'On fait un tour de table rapide.'], syncAns: [(a) => `Toujours dessus : ${a}.`, (a) => `${a}, ça avance bien.`, (a) => `En ce moment : ${a}.`] },
};
const exPick = (arr, seed, ...args) => { let k = seed % arr.length; if (arr[k] === S.lastX && arr.length > 1) k = (k + 1) % arr.length; S.lastX = arr[k]; return typeof arr[k] === 'function' ? arr[k](...args) : arr[k]; };
function exchFacts(i, agent) {   // what this agent did since it received its order: edits, tool calls, errors, the last file, how long it took
  const ev = S.events; let o = -1;
  for (let k = i; k >= Math.max(0, i - 600); k--) if (ev[k].kind === 'order' && ev[k].to === agent) { o = k; break; }
  const f = { tools: 0, edits: 0, errs: 0, file: '', dur: '', ms: 0 };
  for (let k = o >= 0 ? o : Math.max(0, i - 250); k <= i; k++) {
    const e = ev[k]; if (e.agent !== agent) continue;
    if (e.kind === 'tools') for (const t of e.tools) { f.tools++; if (/^(Edit|Write|MultiEdit|NotebookEdit)/.test(t.name)) { f.edits++; f.file = base((t.d || {}).file || t.arg) || f.file; } }
    else if (e.kind === 'results') f.errs += e.items.filter((it) => it.err).length;
  }
  if (o >= 0 && ev[i].ts && ev[o].ts) { f.ms = Math.max(0, ev[i].ts - ev[o].ts); f.dur = fmtShort(f.ms); }
  f.what = f.edits ? P('edit', f.edits) : f.tools ? P('call', f.tools) : L('rien à signaler', 'nothing to report'); return f;
}
const exVisible = (id) => S.agents[id] && !S.gone.has(id) && $('#t-' + id) && $('#t-' + id).style.display !== 'none';
async function sayLine(id, line, label, token) { startTalk(id, line, label); logChat(id, line, label); await speakLine(line, S.agents[id], true, token); if (token === S.token) stopTalk(id); }   // a line cut short (pause, seek) must not close the bubble of whoever speaks next
async function exSay(id, line, token) {   // one line of an exchange, then a short human pause
  if (!exVisible(id) || token !== S.token) return false; await sayLine(id, line, '💬', token);
  if (token !== S.token) return false; await sleep((150 + Math.random() * 250) / spd()); return token === S.token;
}
const exReady = () => prefs.banter && !S.hurry && S.boost <= 1 && !S.recomputing && !S.speakers.size && caughtUp() && performance.now() - (S.exAt || 0) > (S.live ? 22000 : 9000 / spd()) / chatMul();
const exLog = (kind) => { (S.exLog = S.exLog || []).push(kind); };
function noteTrouble(agent, ok) {   // three errors in a row: someone asks if everything is alright
  if (ok) { S.errRun[agent] = 0; return; } if (!prefs.banter || S.recomputing) return;
  S.errRun[agent] = (S.errRun[agent] || 0) + 1; if (S.errRun[agent] === 3) (S.exQ = S.exQ || []).push(agent);
}
function pickOther(not, prefer) { const ids = Object.keys(S.agents).filter((id) => id !== 'user' && !not.includes(id) && exVisible(id)); const pr = ids.filter(prefer || (() => false)); const a = pr.length ? pr : ids; return a.length ? a[Math.floor(Math.random() * a.length)] : null; }
async function handoffX(g, seed, token) {   // an order: the new agent asks a question, the lead answers
  const E = EXCH[FR() ? 'fr' : 'en'], b = g.to, a = g.agent; if (!exVisible(a) || !exVisible(b)) return false; exLog('handoff');
  return (await exSay(b, exPick(E.ask, seed), token)) && (await exSay(a, exPick(E.askBack, seed >>> 3), token));
}
async function reportX(g, i, seed, token) {   // a report: the receiver reacts to what really happened
  const E = EXCH[FR() ? 'fr' : 'en'], b = g.agent, a = g.to; if (a === 'user' || !exVisible(a) || !exVisible(b)) return false; const f = exchFacts(i, b);
  if (f.errs > 0) { exLog('report-errors'); return (await exSay(a, exPick(E.err, seed, f), token)) && (await exSay(b, exPick(E.errBack, seed >>> 3), token)); }
  if (f.ms >= 120000) { exLog('report-slow'); return (await exSay(a, exPick(E.slow, seed, f), token)) && (await exSay(b, exPick(E.slowBack, seed >>> 3), token)); }
  exLog('report-ok'); if (!(await exSay(a, exPick(E.ok, seed, f, nameOf(b)), token))) return false;
  const c = (seed >>> 5) % 100 < 35 ? pickOther([a, b]) : null; if (c) await exSay(c, exPick(E.chime, seed >>> 7, nameOf(b)), token); return true;
}
async function troubleX(token) {   // someone keeps failing: a colleague checks in
  const E = EXCH[FR() ? 'fr' : 'en']; while (S.exQ && S.exQ.length) {
    const x = S.exQ.shift(); if (!exVisible(x)) continue; const h = pickOther([x], (id) => id === 'main'); if (!h) continue; const seed = hash('t' + x + Date.now());
    exLog('trouble'); return (await exSay(h, exPick(E.trouble, seed, nameOf(x)), token)) && (await exSay(x, exPick(E.troubleBack, seed >>> 3), token));
  }
  return false;
}
async function syncX(g, token) {   // every few minutes of the session: the lead asks where everyone is, the busy agents answer
  if (chatMul() < 0.9 || !g.ts || g.ts - (S.syncTs || 0) < 180000 || !exVisible('main')) return false;
  const now = Date.now(), busy = Object.keys(S.agents).filter((id) => id !== 'user' && id !== 'main' && exVisible(id) && agentState(id, now).k === 'working').slice(0, 3); if (busy.length < 2) return false;
  S.syncTs = g.ts; const E = EXCH[FR() ? 'fr' : 'en'], seed = hash('s' + g.ts); exLog('sync');
  if (!(await exSay('main', exPick(E.sync, seed), token))) return false;
  for (const [n, id] of busy.entries()) { const act = (S.act[id] || '').replace(/^\S+\s/, '') || L('au travail', 'working'); if (!(await exSay(id, exPick(E.syncAns, seed >>> (n + 1), act.charAt(0).toLowerCase() + act.slice(1)), token))) return false; }
  return true;
}
async function converse(g, token) {   // after a line has been said: an exchange when it suits, else the usual one-liners
  if (S.hurry || S.boost > 1) return; const i = S.events.indexOf(g), seed = hash('x' + g.ts + g.agent), roll = (seed % 1000) / 1000, m = chatMul();
  if (exReady()) {
    let ran = false;
    if (g.kind === 'order' && g.agent !== 'user' && roll < 0.25 * m) ran = await handoffX(g, seed, token);
    else if (g.kind === 'report' && roll < 0.55 * m) ran = await reportX(g, i, seed, token);
    if (!ran && token === S.token && S.exQ && S.exQ.length && exReady()) ran = await troubleX(token);
    if (!ran && token === S.token && exReady()) ran = await syncX(g, token);
    if (ran) { S.exAt = performance.now(); return; } if (token !== S.token) return;
  }
  await react(g, token);
}
// What is said out loud for an order or a report: a natural lead-in, then the text
function talkLine(g) {
  const E = EXCH[FR() ? 'fr' : 'en'], seed = hash('l' + g.ts + g.agent), t = spoken(g);
  if (g.kind === 'report') return t.replace(/^(Terminé\.|Done\.)\s*/, E.done[seed % E.done.length] + ' ');
  return t;
}
async function react(ev, token) {
  if ((!prefs.epi && !prefs.banter) || S.boost > 1 || S.hurry || !nearLive()) return; const seed = hash(String(ev.ts) + ev.agent), R = REACT[FR() ? 'fr' : 'en']; let who, line, thanks = false;
  if (ev.kind === 'order') { if (!prefs.banter && seed % 100 > 55) return; who = ev.to; line = prefs.banter ? ackLine(ev) : R.ack[seed % R.ack.length]; }
  else if (ev.kind === 'report') {
    const r = seed % 100, joke = prefs.epi ? 60 : prefs.chat === 'quiet' ? -1 : 35;   // a remark from someone else, or (a little less often) a word of thanks from whoever receives the report
    if (r <= joke) { if (!caughtUp()) return; const others = Object.keys(S.status).concat(['main']).filter((x) => x !== ev.agent && S.agents[x] && !S.gone.has(x)); who = others[(seed >>> 3) % others.length]; line = quipMem.get(baseText(ev, 160)) || R.done[seed % R.done.length]; }
    else if (prefs.banter && r <= joke + 25 && ev.to !== 'user' && S.agents[ev.to] && !S.gone.has(ev.to)) { who = ev.to; line = varied('thanks', seed >>> 3); thanks = true; }
    else return;
  }
  else return;
  if (!S.agents[who]) return; await sayLine(who, line, thanks || (ev.kind === 'order' && prefs.banter) ? '💬' : '🎬', token);
}
// Small talk: when nobody has said anything for a while, someone fills the silence the way people do in video calls. At most three per silence, further and further apart; any other line starts the count again.
const FILL = {
  en: { share: ['Can everyone see my screen?', 'Bear with me, it’s loading.', 'Sorry, my machine is slow today.', 'Is this big enough for everyone?', 'One second… almost there.', 'Tell me if I’m going too fast.'],
    busy: ['Still here, just heads-down.', 'Sorry, I was on mute.', 'Quick update: still on it.', 'No blockers on my side.', 'Can you hear me?', 'Is it just me, or is it quiet?', 'I’ll have an update in a minute.'],
    wait: ['Can you hear me?', 'You guys still here?', 'Hello? I think you’re on mute.', 'Did we lose someone?', 'Is it my connection?', 'Shall we take this offline?', 'Let’s circle back when you’re ready.', 'I’ll give everyone a minute back.', 'Any other business?', 'Sorry, go ahead. No, you go.'] },
  fr: { share: ['Vous voyez bien mon écran ?', 'Deux secondes, ça charge.', 'Désolé, ma machine rame aujourd’hui.', 'C’est assez gros pour tout le monde ?', 'Une seconde… j’y suis presque.', 'Dites-moi si je vais trop vite.'],
    busy: ['Toujours là, je suis dessus.', 'Pardon, j’étais en muet.', 'Petit point : j’avance.', 'Pas de point bloquant de mon côté.', 'Vous m’entendez ?', 'C’est moi, ou c’est calme ?', 'Je vous fais un retour dans une minute.'],
    wait: ['Vous m’entendez ?', 'Vous êtes toujours là ?', 'Allô ? Je crois que ton micro est coupé.', 'On a perdu quelqu’un ?', 'C’est ma connexion ?', 'On en reparle en off ?', 'On refait un point quand tu veux.', 'Je vous rends une minute.', 'D’autres sujets ?', 'Pardon, vas-y. Non, toi d’abord.'] },
};
// A little more talk between agents: a word of thanks when a report comes in, a word from whoever has been thinking for a long time.
const TALK = {
  en: { thanks: ['Thanks, that helps.', 'Got it, thanks.', 'Noted. I’ll take it from here.', 'Perfect, that’s what I needed.', 'Thanks, good work.', 'Good to know, thanks.', 'Understood, thank you.', 'Great, one less thing to worry about.'],
    think: ['Hmm, let me think.', 'Give me a second, I’m thinking.', 'Interesting… let me think this through.', 'One moment, I’m working it out.', 'Hang on, I want to get this right.', 'Let me double-check something.', 'Still thinking… almost there.', 'That one needs a bit of thought.'] },
  fr: { thanks: ['Merci, ça m’aide.', 'Bien reçu, merci.', 'C’est noté. Je prends la suite.', 'Parfait, c’est ce qu’il me fallait.', 'Merci, bon boulot.', 'Bon à savoir, merci.', 'Compris, merci.', 'Super, un souci de moins.'],
    think: ['Hmm, laissez-moi réfléchir.', 'Une seconde, je réfléchis.', 'Intéressant… je creuse ça.', 'Un instant, je fais le point.', 'Attendez, je veux être sûr.', 'Je vérifie un truc.', 'Je réfléchis encore… j’y suis presque.', 'Ça demande un peu de réflexion.'] },
};
function varied(kind, seed) { const P = TALK[FR() ? 'fr' : 'en'][kind]; let line = P[seed % P.length]; if (line === S.lastTalk) line = P[(seed + 1) % P.length]; return (S.lastTalk = line); }   // never the same line twice in a row
// Who is thinking once this event has happened: the agent whose tool just answered, the lead after your message or a report, a sub-agent that just got its order. After a line or a tool call, nobody is.
const thinkerOf = (e) => (e.kind === 'results' ? e.agent : e.kind === 'user' ? 'main' : e.kind === 'report' || e.kind === 'finish' || e.kind === 'order' ? e.to : null);
const before = (i) => { let k = i - 1; while (k >= 0 && (S.events[k].kind === 'usage' || S.events[k].kind === 'compact')) k--; return S.events[k]; };
async function ponder(i, token) {   // replay: an agent that really took a long time (40 s or more) before this line or call says so first, about every other time
  const ev = S.events[i], p = before(i); if (!prefs.banter || prefs.chat === 'quiet' || S.boost > 1 || S.hurry || !p || !S.agents[ev.agent] || thinkerOf(p) !== ev.agent || ev.ts - p.ts < 40000 || hash('t' + ev.ts) % 100 > 55) return;
  const line = varied('think', hash(String(ev.ts))); await sayLine(ev.agent, line, '💭', token);
}
// Live: you gave an order and the lead starts on its tools without a word (about one time in three): it says what it is starting with, from the tool call itself, so you know it heard you and what it is on
const LEAD = {
  en: { in: ['Got it.', 'Okay.', 'On it.', 'Sure.', 'Right.'], read: 'Let me look at ', edit: 'I’m editing ', write: 'I’m writing ', cmd: 'I’m running ', note: 'I’m running a command: ', grep: 'Let me search the code.', glob: 'Let me see which files we have.', todo: 'Let me lay out a plan.', web: 'Let me check the web.', question: 'I have a question for you.', any: 'Let me get started.', and: ' and ' },
  fr: { in: ['D’accord.', 'Compris.', 'Très bien.', 'Entendu.', 'Ça marche.'], read: 'Je regarde ', edit: 'Je modifie ', write: 'J’écris ', cmd: 'Je lance ', note: 'Je lance une commande : ', grep: 'Je cherche dans le code.', glob: 'Je regarde quels fichiers on a.', todo: 'Je fais mon plan.', web: 'Je vais voir sur le web.', question: 'J’ai une question pour vous.', any: 'Je m’y mets.', and: ' et ' },
};
function toolLine(ev, W) {   // what an agent is doing, said in its own words, from its tool call
  const d = ev.tools[0].d || {}, k = d.kind === 'text' ? d.what : d.kind; let what = W[k] || W.any;
  if (k === 'read' || k === 'edit' || k === 'write') { const files = [...new Set(ev.tools.filter((t) => (t.d || {}).kind === k).map((t) => base(t.d.file)).filter(Boolean))].slice(0, 2); what = files.length ? what + files.join(W.and) + '.' : W.any; }
  else if (k === 'cmd') { const note = (d.note || '').trim().replace(/[.\s]+$/, ''), cmd = String(d.text || '').trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 26); what = note ? W.note + note + '.' : cmd ? what + cmd + '.' : W.any; }
  return what;
}
async function leadAck(ev, token) {
  if (!prefs.banter || !S.agents.main) { S.owed = false; return; } if (S.hurry || S.boost > 1 || !nearLive() || S.speakers.size) return; S.owed = false;   // reading your order took a while: the first tool is rarely less than 6 s old; if now is a bad moment, the next tool will do
  const W = LEAD[FR() ? 'fr' : 'en']; await sayLine('main', `${W.in[hash('k' + ev.ts) % W.in.length]} ${toolLine(ev, W)}`, '💬', token);
}
// A sub-agent that finishes its task says so, with a little flourish, and celebrates: once per agent. Right after it read its report out, only the celebration.
const DONE = {
  en: ['Wrapped up! 🎉', 'And that’s a wrap.', 'Done and dusted.', 'Nailed it.', 'Mission accomplished.', 'Ta-da! All done.', 'Another one off the list.', 'That’s me finished. High five?', 'Done. I’ll take my coffee now. ☕', 'Shipped it.'],
  fr: ['Et voilà ! 🎉', 'C’est dans la boîte.', 'Terminé, et bien terminé.', 'Mission accomplie.', 'Tadaa ! C’est fini.', 'Un de moins sur la liste.', 'J’ai fini. On se tape dans la main ?', 'Fini. Je vais prendre un café. ☕', 'Livré !', 'Plié !'],
};
async function doneQuip(id, token) {
  if (S.quipped[id]) return; S.quipped[id] = true; celebrate(id);
  if (!S.live || !prefs.banter || !S.agents[id] || S.hurry || S.boost > 1 || !nearLive() || S.speakers.size || performance.now() - (S.reportAt[id] || -1e9) < 3000) return;   // its report was just read out: the dance says the rest
  const P = DONE[FR() ? 'fr' : 'en'], seed = hash('d' + id + (S.cur ? S.cur.id : '')); let line = P[seed % P.length]; if (line === S.lastDone) line = P[(seed + 1) % P.length]; S.lastDone = line;
  await sayLine(id, line, '🎉', token);
}
// Live: a sub-agent at work says now and then what it is doing, in turn with everyone else. Only when the call is up to date and quiet, never twice in a row
// from the same agent, and a line that cannot be said now is dropped, not kept for later: five agents at work must not fill the call.
const NARR = {
  en: { read: 'Reading ', edit: 'Editing ', write: 'Writing ', cmd: 'Running ', note: 'Running: ', grep: 'Searching the code.', glob: 'Looking at which files we have.', todo: 'Updating my plan.', web: 'Checking the web.', question: 'I have a question.', any: 'On it.', and: ' and ',
    err: ['Hmm, that failed. Checking why.', 'That did not work. Let me look.', 'An error. Give me a second.', 'Not what I expected. Looking into it.'] },
  fr: { read: 'Je lis ', edit: 'Je modifie ', write: 'J’écris ', cmd: 'Je lance ', note: 'Je lance : ', grep: 'Je cherche dans le code.', glob: 'Je regarde quels fichiers on a.', todo: 'Je mets mon plan à jour.', web: 'Je vais voir sur le web.', question: 'J’ai une question.', any: 'Je m’y mets.', and: ' et ',
    err: ['Hmm, ça a planté. Je regarde pourquoi.', 'Ça n’a pas marché. Je regarde.', 'Une erreur. Deux secondes.', 'Pas ce que j’attendais. Je creuse.'] },
};
async function narrate(ev, token, err) {
  const id = ev.agent, t = $('#t-' + id), now = performance.now();
  if (!S.live || !prefs.narrate || !prefs.banter || prefs.chat === 'quiet' || !isSub(id) || !caughtUp() || S.hurry || S.boost > 1 || S.speakers.size || TH.voice) return;
  if (now - S.spokeAt < 5000 || now - (S.narrAt || 0) < 6000 || now - ((S.narrBy || {})[id] || 0) < 12000 / chatMul() || !t || t.style.display === 'none' || t.classList.contains('musing')) return;
  const W = NARR[FR() ? 'fr' : 'en'], line = err ? W.err[hash('e' + ev.ts) % W.err.length] : toolLine(ev, W); if (!line) return;
  S.narrAt = now; (S.narrBy = S.narrBy || {})[id] = now; await sayLine(id, line, '🛠', token);
}
async function wrapUp(token) {   // live, once the lead is done: the part of its last message that the clipped reading left out, so you know what was done
  if (!S.wrap || S.speakers.size || !prefs.voice && !prefs.banter) return false; S.wrap = false;
  let k = S.events.length - 1; while (k >= 0 && !(S.events[k].agent === 'main' && S.events[k].kind === 'say')) k--; if (k < 0) return false; const e = S.events[k], m = S.mainSaid;
  const wk = S.cur && S.cur.id + '/' + e.k; if (S.wrapped === wk || e.ts <= (S.from || 0)) return false; S.wrapped = wk;   // once per message, by key (the object is new after a reload): the lead's state can flip to done several times (a short command, a silence) without a new message
  const full = plain(e.text); let rest = m && m.ev === e ? full.slice(m.said).trim() : full; if (m && m.ev === e && m.full) return false; if (!m || m.ev !== e) rest = full;
  rest = rest.replace(/^[^\w\p{L}]+/u, ''); if (rest.length < 25) return false; const line = (m && m.ev === e ? L('Pour résumer : ', 'To sum up: ') : '') + short(rest, 520);
  await sayLine('main', line, '🎉', token); return true;
}
async function smallTalk(token) {
  if (prefs.chat === 'quiet') return;   // quiet: nothing to fill the silences, only the real exchanges
  const n = S.fill || 0, last = S.events[S.events.length - 1]; if (!prefs.banter || n > 2 || !last || S.speakers.size || S.hurry || S.boost > 1 || (document.hidden && !S.exporting)) return;
  const quiet = performance.now() - S.spokeAt, here = Object.keys(S.agents).filter((id) => id !== 'user' && $('#t-' + id) && $('#t-' + id).style.display !== 'none'), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const p = before(S.events.length), muser = S.live && !n && !S.mused && p ? thinkerOf(p) : null, think = !!muser && here.includes(muser) && quiet > 6000 && Date.now() - p.ts > 20000 && Date.now() - p.ts < 180000;   // live: 20 s without a word from whoever is thinking, once per silence
  if (!think && (quiet < (S.live ? 45000 : 12000 / spd()) * [1, 2.5, 6][n] || (S.live && Date.now() - last.ts > 6e5))) return;   // live: a session untouched for ten minutes is a call that is over
  const busy = here.filter((id) => agentState(id, Date.now()).k === 'working'), sharer = [...S.shares.keys()].find((x) => here.includes(x)), who = think ? muser : sharer || pick(busy.length ? busy : here); if (!who) return;   // whoever shares their screen speaks, so the screen stays up
  const P = FILL[FR() ? 'fr' : 'en'][S.shares.has(who) ? 'share' : busy.length ? 'busy' : 'wait']; let line = think ? varied('think', Math.floor(Math.random() * 97)) : pick(P); if (!think && line === S.lastFill) line = P[(P.indexOf(line) + 1) % P.length]; if (!think) S.lastFill = line;
  startTalk(who, line, think ? '💭' : '💬'); logChat(who, line, think ? '💭' : '💬'); if (think) S.mused = true; else S.fill = n + 1; await speakLine(line, S.agents[who], true, token); stopTalk(who);
}
async function card(text, sub, ms = 2500) {
 
  const c = $('#card'); c.innerHTML = `<div><h1>${esc(text)}</h1><p>${esc(sub || '')}</p></div>`; c.classList.add('on'); AUD.tone(392, .5, 'triangle', .12); AUD.tone(523, .6, 'triangle', .12, .25);
  await sleep(ms / Math.min(2, spd())); c.classList.remove('on');
}

