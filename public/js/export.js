// =====================================================================
//  video export (own canvas compositor + recorded WebAudio mix)
// =====================================================================
const imgCache = {};
function avatarImg(p, m, st) {   // m: 0 silent, 1 speaking (closed), 2 speaking (open)
  const k = p.id + m + (st || ''); if (imgCache[k]) return imgCache[k];
  const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSVG(p, { m, working: st === 'working', done: st === 'done' })); return (imgCache[k] = im);
}
const mediaMem = new Map();
function mediaImg(url) { let im = mediaMem.get(url); if (!im) { im = new Image(); im.src = url; mediaMem.set(url, im); if (mediaMem.size > 24) mediaMem.delete(mediaMem.keys().next().value); } return im; }
function wrap(c, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) break; } else cur = t; }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…'); return lines;
}
function tileOnCanvas(c, id, x, y, w, h, big) {
  const p = S.agents[id], sp = S.speakers.has(id), st = S.status[id], open = sp && Math.floor(performance.now() / 120) % 2, im = avatarImg(p, sp ? (open ? 2 : 1) : 0, st);
  if (im.complete && im.naturalWidth) c.drawImage(im, x, y, w, h);
  c.lineWidth = sp ? 4 : 2; c.strokeStyle = sp ? (p.lead ? '#f5c04a' : '#7c9cff') : st === 'working' ? '#f0a020' : 'rgba(255,255,255,.14)'; c.strokeRect(x, y, w, h);
  c.font = `bold ${big ? 16 : 12}px sans-serif`; const nm = p.name + (st === 'done' ? ' ✓' : ''); c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(x + 6, y + h - (big ? 30 : 22), c.measureText(nm).width + 12, big ? 24 : 18); c.fillStyle = '#fff'; c.fillText(nm, x + 12, y + h - (big ? 12 : 8));
  if (!big && S.lastTool[id] && st === 'working') { c.font = '10px monospace'; c.fillStyle = 'rgba(15,20,35,.85)'; c.fillRect(x, y, w, 15); c.fillStyle = '#ffd24a'; c.fillText((prefs.hideCode ? S.lastTool[id].split(' ')[0] : S.lastTool[id]).slice(0, Math.floor(w / 6)), x + 4, y + 11); }
  if (big && sp && S.say[id]) { c.font = '15px sans-serif'; const Ls = wrap(c, S.say[id].text, w - 40, 4), bh = Ls.length * 19 + 14; c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x + 10, y + 10, w - 20, bh, 10); c.fill(); c.fillStyle = '#1b1d27'; Ls.forEach((l, i) => c.fillText(l, x + 20, y + 30 + i * 19)); }
}
const SITE = 'atoll92.github.io/agent-standup';
function drawFrame(cv, mark = 0) {   // mark: 1 = a clip to share (site address in the corner), 2 = its end card
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, hide = prefs.hideCode; c.fillStyle = '#12131a'; c.fillRect(0, 0, W, H);   // hide: code, outputs, file names and the session title are masked; what agents say is kept
  if (mark === 2) { c.textAlign = 'center'; c.font = '900 76px "Comic Sans MS",sans-serif'; c.fillStyle = '#e9eaf0'; c.fillText('Agent Standup', W / 2, H / 2 - 24); c.font = '28px sans-serif'; c.fillStyle = '#cdd6f4'; c.fillText(L('Vos agents Claude Code en appel d’équipe', 'Your Claude Code agents as a live team call'), W / 2, H / 2 + 36); c.font = 'bold 26px sans-serif'; c.fillStyle = '#f5c04a'; c.fillText(SITE, W / 2, H / 2 + 96); c.textAlign = 'start'; return; }
  c.font = 'bold 20px "Comic Sans MS",sans-serif'; c.fillStyle = '#e9eaf0'; c.fillText('🎥 ' + ((!hide && S.title) || 'Agent Standup'), 20, 32);
  if (mark) { c.font = '13px sans-serif'; c.textAlign = 'right'; const w = c.measureText(SITE).width; c.fillStyle = '#12131a'; c.fillRect(W - 32 - w, 8, w + 32, 34); c.fillStyle = '#8b90a8'; c.fillText(SITE, W - 20, 30); c.textAlign = 'start'; }
  const ids = Object.keys(S.agents).filter((id) => id === 'main' || id === 'user' || (S.status[id] && !S.gone.has(id))), sp = [...S.speakers].filter((id) => S.agents[id]).slice(0, 3), big = sp.length ? sp : ['main', 'user'];
  const pres = S.present && S.agents[S.present], m = pres && termModel(S.present), bw = Math.min(480, (W - 40) / big.length - 12), bh = pres ? (m.view === 'image' ? 420 : 330) : bw * 0.75;   // a picture gets a taller window
  if (pres) {
    const x = 20, y = 50, w = W - 40, ed = m.view === 'editor', col = { cmd: '#e6edf3', out: '#aab2c5', err: '#ff7b72', tool: '#8b95b0', dim: '#6b7089', run: '#ffd24a', add: '#9be9a8', del: '#ffa198', ctx: '#d6dae6' };
    c.fillStyle = ed ? '#1a1b26' : '#0d1117'; c.beginPath(); c.roundRect(x, y, w, bh, 12); c.fill(); c.fillStyle = '#1c1f2b'; c.fillRect(x, y, w, 28);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((cl, i) => { c.fillStyle = cl; c.beginPath(); c.arc(x + 16 + i * 18, y + 14, 5, 0, 7); c.fill(); });
    c.font = '13px sans-serif'; c.fillStyle = '#9aa0b4'; c.fillText(ed ? (hide ? m.title.split(' — ').pop() : m.title) : m.view === 'image' ? (hide ? '' : m.title) : S.agents[S.present].name + ' — zsh', x + 90, y + 19); c.font = '14px monospace';
    if (m.view === 'image') {   // masked like the code: a picture from the session is replaced by an empty frame
      const im = hide ? null : mediaImg(m.imgs[0]), ax = x + 14, ay = y + 38, aw = w - 238, ah = bh - 82, k = im && im.complete && im.naturalWidth ? Math.min(aw / im.naturalWidth, ah / im.naturalHeight, 1.5) : 0;
      if (k) c.drawImage(im, ax + (aw - im.naturalWidth * k) / 2, ay + (ah - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      else { c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.roundRect(ax + aw / 2 - 170, ay + 10, 340, ah - 20, 10); c.fill(); c.font = '64px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#6b7089'; c.fillText('🖼', ax + aw / 2, ay + ah / 2 + 22); c.textAlign = 'start'; }
      c.font = '14px monospace';
    }
    const rows = ed ? m.lines.slice(0, 13) : m.lines.slice(-13), cw = c.measureText('M').width;
    rows.forEach((l, i) => {
      const yy = y + 52 + i * 21, pre = l.c === 'cmd' ? '❯ ' : l.c === 'tool' ? '● ' : ed && l.n ? String(l.n).padStart(4) + '  ' : l.c === 'add' ? '+ ' : l.c === 'del' ? '− ' : '', txt = String(l.t).split('\n')[0].slice(0, 112 - pre.length);
      const keep = !hide || l.c === 'run' ? txt.length : l.c === 'tool' ? txt.indexOf('(') + 1 : 0;   // masked: only our own words stay ("running…", the tool's name), the rest becomes bars of the same length
      if (l.c === 'add' || l.c === 'del') { c.fillStyle = l.c === 'add' ? 'rgba(63,185,80,.16)' : 'rgba(248,81,73,.16)'; c.fillRect(x, yy - 15, w, 21); } c.fillStyle = col[l.c] || '#d6dae6'; c.fillText(pre + txt.slice(0, keep), x + 14, yy);
      if (keep < txt.length) { c.globalAlpha = 0.4; for (const b of txt.slice(keep).matchAll(/\S+/g)) c.fillRect(x + 14 + (pre.length + keep + b.index) * cw, yy - 10, b[0].length * cw - 3, 10); c.globalAlpha = 1; }
    });
    c.font = '12px monospace'; c.fillStyle = '#8b95b0'; c.fillText(m.stat, x + 14, y + bh - 8);
    c.fillStyle = 'rgba(240,160,32,.94)'; c.beginPath(); c.roundRect(x + 12, y + bh - 34, 300, 24, 12); c.fill(); c.fillStyle = '#201400'; c.font = 'bold 13px sans-serif'; c.fillText('🖥 ' + S.agents[S.present].name + ' ' + L('partage son écran', 'is sharing their screen'), x + 24, y + bh - 17);
    tileOnCanvas(c, S.present, x + w - 210, y + bh - 160, 196, 147, false);
  } else big.forEach((id, i) => tileOnCanvas(c, id, 20 + i * (bw + 12), 50, bw, bh, true));
  const others = ids.filter((id) => (pres ? id !== S.present : !big.includes(id))).sort((a, b) => (S.status[b] === 'working') - (S.status[a] === 'working')).slice(0, 14), tw = 160, th = 120, cols = Math.floor((W - 40) / (tw + 8)), ty = 50 + bh + 14;
  others.forEach((id, i) => tileOnCanvas(c, id, 20 + (i % cols) * (tw + 8), ty + Math.floor(i / cols) * (th + 8), tw, th, false));
  const lead = sp[0] && S.say[sp[0]];
  if (lead) { c.font = '22px sans-serif'; const Ls = wrap(c, `${nameOf(sp[0])} : ${lead.text}`, W - 80, 2); c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(0, H - 22 - Ls.length * 28, W, Ls.length * 28 + 22); c.fillStyle = '#fff'; Ls.forEach((l, i) => c.fillText(l, 40, H - 12 - (Ls.length - 1 - i) * 28 - 6)); }
  const cd = $('#card'); if (cd.classList.contains('on')) { c.fillStyle = '#05060c'; c.fillRect(0, 0, W, H); c.textAlign = 'center'; c.font = '900 90px "Comic Sans MS",sans-serif'; c.fillStyle = '#d8372b'; c.fillText(cd.querySelector('h1').textContent, W / 2 + 5, H / 2 + 5); c.fillStyle = '#fff'; c.fillText(cd.querySelector('h1').textContent, W / 2, H / 2); c.font = '26px sans-serif'; c.fillStyle = '#cdd6f4'; if (!hide) c.fillText(cd.querySelector('p').textContent.slice(0, 80), W / 2, H / 2 + 60); c.textAlign = 'start'; }
}
let recorder = null;
const REC_TYPES = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'];   // MP4 (H.264 + AAC) where the browser can record it: X, phones and most chat apps refuse .webm
async function exportVideo(from = 0, to = 0, clip = 0) {   // clip: length in ms of a short cut to share; it starts where the replay is, or at clipStart() when the replay is at rest or nearly over
  if (recorder) { recorder.stop(); return; }
  const wasLive = S.live, here = !wasLive && S.idx > 0 && aheadSpeakable(S.idx, 3) >= 3 ? S.idx : -1; if (wasLive) await setMode('replay'); pause(); claimAudio(); AUD.init(); await AUD.ctx.resume(); AUD.muted = false; AUD.apply();
  const back = S.idx; if (clip) from = here >= 0 ? here : clipStart();
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720, stream = new MediaStream([...cv.captureStream(30).getTracks(), ...AUD.rec.stream.getTracks()]);
  const mime = REC_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) || '', ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm', chunks = [], t0 = performance.now(); let outro = false;
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4e6 }); recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const timer = setInterval(() => {
    const el = performance.now() - t0; drawFrame(cv, clip ? (outro ? 2 : 1) : 0);
    if (clip && S.playing && !S.stopAt && el > clip - 4000) S.stopAt = S.idx + 1;   // the line being said is finished rather than cut…
    if (clip && S.playing && el > clip + 8000) pause();                              // …unless it is a very long one
    $('#pill').textContent = `⏹ ${Math.max(0, Math.min(100, Math.round((clip ? el / clip : (S.idx - from) / ((to || S.events.length) - from)) * 100)))}%`;
  }, 33), done = new Promise((res) => (recorder.onstop = res));
  S.exporting = true; S.stopAt = to || 0; S.idx = from; recomputeStatus(from); recorder.start(500); run(from);
  const poll = setInterval(() => { if (!S.playing && recorder) { const rec = recorder; outro = !!clip; setTimeout(() => recorder === rec && rec.stop(), clip ? 2600 : 900); clearInterval(poll); } }, 300);
  await done; clearInterval(timer); clearInterval(poll); S.exporting = false; S.stopAt = 0; recorder = null;
  if (clip) { pause(); S.idx = back; recomputeStatus(back); paintStatus(); }   // back where the replay was, so the same clip can be taken again
  syncUI();
  const blob = new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' }); window.__lastExport = blob.size; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `agent-standup${clip ? '-clip' : ''}.${ext}`; a.click();
}

