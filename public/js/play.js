// =====================================================================
//  playback loop
// =====================================================================
const SPK = new Set(['say', 'report', 'order', 'user']);
function aheadSpeakable(i, limit) { let n = 0; for (let k = i, m = Math.min(S.events.length, i + 800); k < m; k++) if (SPK.has(S.events[k].kind) && ++n > limit) break; return n; }
const isSub = (id) => id !== 'main' && id !== 'user';
async function run(i) {
  const token = ++S.token; S.playing = true; S.idle = false; S.hurry = false; S.boost = 1; S.spokeAt = performance.now(); S.fill = 0; S.exQ = []; S.errRun = {}; S.wrap = false; S.mainSaid = null; S.owed = false; S.syncTs = (S.events[i] && S.events[i].ts) || Date.now(); syncUI(); AUD.init();
  if (i === 0 && prefs.epi && !S.live) { await card(L('ÉPISODE 1', 'EPISODE 1'), S.title); if (token !== S.token) return; }
  while (token === S.token) {
    const lim = S.stopAt || S.events.length; S.pos = i;
    if (S.live && S.late.length) { await converse(S.late.shift(), token); if (token !== S.token) return; continue; }   // a line that turned out to be a report after it was read
    if (i >= lim) { if (S.live && !S.stopAt) { if (!S.idle) { S.idle = true; syncUI(); } if (await wrapUp(token)) continue; await smallTalk(token); await sleep(350); continue; } break; }
    if (S.idle) { S.idle = false; syncUI(); }
    if (S.live) {   // way behind: skip ahead to stay current, but only count what is actually said: sub-agents produce thousands of silent tool events
      const rem = S.events.length - i;
      if (rem > 300 || aheadSpeakable(i, 16) > 16 || lagMs(i) > 60000) {   // only a really big backlog is skipped; before that, lines are shortened instead
        let k = S.events.length, back = 0; while (k > i && back < 8) { k--; if (SPK.has(S.events[k].kind)) back++; }
        let to = rem > 300 ? Math.max(k, S.events.length - 14) : k; for (let u = i; u < to; u++) if (S.events[u].kind === 'user') { to = u; break; }   // never over a line of yours: what you asked is always said, shortened if need be
        if (to > i) { i = to; recomputeStatus(i); paintStatus(); }
      }
    }
    const q = S.live ? aheadSpeakable(i, 14) : 0;   // lines waiting to be said: the more of them, the shorter each one is read, but it is always read
    const lg = lagMs(i) / 1000; S.pace = !S.live ? 0 : Math.min(q > 7 ? 70 : q > 3 ? 130 : 260, lg > 30 ? 70 : lg > 15 ? 130 : lg > 6 ? 200 : 260); S.hurry = q > 12 || lg > 45;   // voices are only skipped when more than a dozen lines are queued
    S.boost = S.hurry || (S.live && S.events.length - i > 60) ? 3 : 1;
    const ev = S.events[i]; S.idx = i; tally(ev); if (S.live && ev.ts > S.since) S.since = ev.ts;   // said once: a reload or a return to this session does not read it again
    if (!S.live && (ev.kind === 'say' || ev.kind === 'report' || ev.kind === 'order' || ev.kind === 'tools')) { await ponder(i, token); if (token !== S.token) return; }
    if (ev.kind === 'usage' || ev.kind === 'compact') { if (ev.kind === 'compact' && S.live && prefs.banter) toast(`${nameOf(ev.agent)}: ${L('contexte compacté 🗜', 'context compacted 🗜')}`); i++; continue; }
    if (ev.kind === 'finish') { applyStatus(ev); paintStatus(); i++; continue; }
    const backlog = S.live ? S.events.length - i : 0, quick = S.live ? Math.min(1, 40 / Math.max(1, backlog)) : 1;   // live: hundreds of tool events from parallel sub-agents must not take minutes to scroll past
    if (ev.kind === 'results') { applyResults(ev, S.boost > 1); await sleep((S.boost === 1 && S.present === ev.agent && ev.items.some((it) => it.img) ? (S.live ? 900 : 1800) : S.demo ? 900 : S.live ? 30 * quick : 80) / spd()); i++; continue; }   // a picture gets a moment on screen
    if (ev.kind === 'tools') { applyStatus(ev); tickTools(ev); AUD.click(); OFFICE.kick(ev.tools[ev.tools.length - 1].name); paintStatus(); if (S.live && S.owed && ev.agent === 'main') { await leadAck(ev, token); if (token !== S.token) return; } if (quick === 1) await smallTalk(token); await sleep((S.demo ? 1100 : S.live ? 110 * quick : 250) / spd()); i++; continue; }
    const group = [ev]; let j = i + 1;   // sub-agents talking back-to-back were running in parallel: they talk over each other
    if (ev.kind === 'order') {   // several orders in a row (a parallel launch): the new agents all appear now, the first order is read, the others are named in one line
      while (j < Math.min(S.events.length, i + 40) && group.length < 8) { const e2 = S.events[j]; if (e2.kind === 'usage' || e2.kind === 'compact') { tally(e2); j++; continue; } if (e2.kind === 'order' && e2.agent === ev.agent) { group.push(e2); j++; } else break; }
      if (group.length > 1) { for (const g of group) applyStatus(g); paintStatus(); }
    }
    else if (isSub(ev.agent) && ev.kind !== 'order') {
      while (j < Math.min(S.events.length, i + 28) && group.length < 3) {
        const e2 = S.events[j];
        if (e2.kind === 'usage' || e2.kind === 'compact') { tally(e2); j++; continue; }
        if (e2.kind === 'finish') { applyStatus(e2); j++; continue; }
        if (e2.kind === 'tools') { tally(e2); tickTools(e2); applyStatus(e2); j++; continue; }
        if (e2.kind === 'results') { tally(e2); applyResults(e2, true); j++; continue; }
        if (e2.kind !== 'order' && isSub(e2.agent) && !group.some((g) => g.agent === e2.agent)) { group.push(e2); j++; } else break;
      }
    }
    if (FR() && !S.hurry) { prefetchTr(i); await Promise.race([ensureTr(group.map((g) => baseText(g))), sleep(S.live ? 7000 : 14000)]); if (token !== S.token) return; }
    prefetchQuips(i); warmTTS(i);
    const playOne = (g) => {
      applyStatus(g); g._as = g.kind; if (g.agent === 'user') S.owed = true; else if (g.agent === 'main') S.owed = false;   // your order waits for a word from the lead
      const label = g.kind === 'order' ? `${L('pour', 'to')} ${nameOf(g.to)}` : g.kind === 'report' ? `${L('rapport à', 'report to')} ${nameOf(g.to)}` : '', line = talkLine(g);
      startTalk(g.agent, line, label);
      if (g.kind === 'order') { S.status[g.to] = 'working'; AUD.join(); setTimeout(() => { paintStatus(); fly(g.agent, g.to, '📨'); popTile(g.to); }, 30); }
      if (g.kind === 'report') { AUD.ding(); setTimeout(() => { fly(g.agent, g.to, '✅'); popTile(g.agent); }, 30); }
      const said = clipSpeech(line, S.pace); if (g.agent === 'main' && g.kind === 'say') { const full = plain(g.text), key = said.replace(/…$/, '').trim().slice(-30), pos = key ? full.indexOf(key) : -1, n = pos >= 0 ? pos + key.length : said.length; S.mainSaid = { ev: g, said: n, full: n >= full.length - 5 }; }
      return speakLine(said, S.agents[g.agent], true, token, sessFr(said, g), g.kind === 'user').then(() => { if (token === S.token) stopTalk(g.agent); });
    };
    let plays;
    if (ev.kind === 'order' && group.length > 1) {   // the first order in full, then "Also Remy on X, Iris on Y"
      const rest = group.slice(1), line = `${L('Et aussi ', 'Also ')}${rest.map((o) => `${nameOf(o.to)}${L(' sur ', ' on ')}${(o.title || short(o.text, 60)).replace(/[.。]\s*$/, '')}`).join(', ')}.`;
      setTimeout(() => rest.forEach((o, k) => setTimeout(() => { fly(o.agent, o.to, '📨'); popTile(o.to); }, k * 120)), 30);
      plays = [playOne(ev).then(() => { if (token !== S.token) return; startTalk(ev.agent, line, ''); return speakLine(clipSpeech(line, S.pace), S.agents[ev.agent], true, token).then(() => { if (token === S.token) stopTalk(ev.agent); }); })];
    }
    else if (S.live) { plays = []; let chain = Promise.resolve(); for (const g of group) { chain = chain.then(() => (token === S.token ? playOne(g) : null)); plays.push(chain); } } else plays = group.map(playOne);   // live: one voice at a time so each can be heard; replay keeps the overlapping chatter
    S.idx = j - 1; paintStatus(); await Promise.all(plays); if (token !== S.token) return;
    for (const g of (ev.kind === 'order' ? group.slice(0, 3) : group)) { await converse(g, token); if (token !== S.token) return; }   // a parallel launch: the first three answer, as long as the call keeps up
    i = j;
  }
  if (token === S.token) {
    S.playing = false; clearSpeaking(); syncUI();
    if (!S.exporting && !S.stopAt && !S.live) { S.idx = S.events.length - 1; paintStatus(); if (prefs.epi) await card(L('FIN', 'THE END'), L('Aucun agent n’a été maltraité durant ce tournage.', 'No agents were harmed.'), 2600); openRecap(); }
  }
}
function clipSpeech(t, cap) {   // the bubble keeps the full text; the voice reads the first sentence(s) up to cap characters
  t = String(t).replace(/\s+/g, ' ').trim(); if (!cap || t.length <= cap) return t;
  const m = t.slice(0, cap + 40).match(/^.{20,}?[.!?](?=\s|$)/); if (m && m[0].length <= cap + 30) return m[0];
  return t.slice(0, cap).replace(/\s+\S*$/, '') + '…';
}
function pause() { S.playing = false; S.hurry = false; S.boost = 1; S.token++; synth && synth.cancel(); AUD.stopAll(); clearSpeaking(); clearThoughts(); $('#card').classList.remove('on'); syncUI(); }
function togglePlay() {
  if (S.locked) return;
  if (S.playing) { S.userPaused = true; pause(); } else { claimAudio(); S.userPaused = false; run(S.idx >= S.events.length - 1 && !S.live ? (recomputeStatus(0), 0) : S.live ? S.pos : S.idx); }   // live: from the first line not said yet (the one that was cut, if any)
}
function seekTo(i) {
  pause(); i = Math.max(0, Math.min(S.events.length - 1, i)); S.idx = i; recomputeStatus(i); paintStatus(); S.userPaused = false; run(i);
}

// Freeze the call at one exact moment (used for screenshots: ?demo=1&at=<event index>).
function showMoment(i) {
  S.hold = true; pause(); recomputeStatus(i); S.idx = i; const e = S.events[i];
  if (e.kind === 'tools') {
    tickTools(e);
    for (let k = i + 1; k < Math.min(S.events.length, i + 10); k++) { const r = S.events[k]; if (r.kind === 'results' && r.agent === e.agent && r.items.some((it) => e.tools.some((t) => t.id === it.id))) applyResults(r); }
  } else if (!quiet(e)) startTalk(e.agent, spoken(e), '');
  paintStatus();
}

