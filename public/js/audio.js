// =====================================================================
//  audio: sound effects + text-to-speech (server `say` → WebAudio)
// =====================================================================
const AUD = {
  ctx: null, muted: false, live: new Set(), lastClick: 0,
  off() { return this.muted || !!S.hush || !!(S.owner && S.owner !== CID); },   // muted here, not turned on yet (S.hush: no click since the page opened), or another window holds the sound
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    let c; try { c = this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    this.sfx = c.createGain(); this.amb = c.createGain(); this.amb.connect(this.sfx); this.voice = c.createGain(); this.music = c.createGain(); this.rec = c.createMediaStreamDestination();
    [this.sfx, this.voice].forEach((g) => { g.connect(c.destination); g.connect(this.rec); });
    this.music.gain.value = 0; this.music.connect(c.destination);   // radio music is for your ears only: it is never part of video exports
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); let last = 0;   // office room tone
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.3; src.connect(lp).connect(g).connect(this.amb); src.start(); this.apply(); OFFICE.start();
  },
  apply() { if (!this.ctx) return; this.sfx.gain.value = prefs.office && !this.off() ? 1 : 0; this.voice.gain.value = prefs.voice && !this.off() ? 1 : 0; this.applyMusic(); RADIO.sync();  },
  // Music fades down quickly when an agent starts talking and comes back slowly once the room is quiet.
  applyMusic() { if (!this.ctx) return; this.amb.gain.setTargetAtTime((this.ducked ? 0.35 : 1) * (prefs.officeVol ?? 0.8), this.ctx.currentTime, 0.25); const v = prefs.music && !this.off() ? (prefs.musicVol ?? 0.35) * (this.ducked ? 0.16 : 1) : 0; this.music.gain.setTargetAtTime(v, this.ctx.currentTime, this.ducked ? 0.12 : 0.7); },
  blip(f) { if (!this.ctx || this.off()) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.1); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25); },
  alert() {   // a soft two-note chime for "your agents are done"; separate from the office sounds so it works with ambience off
    if (!this.ctx || this.off()) return; const c = this.ctx;
    [[784, 0], [1047, 0.16], [1319, 0.32]].forEach(([f, w]) => { const t = c.currentTime + w, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.95); });
  },
  duck(on) { clearTimeout(this.duckT); if (on) { this.ducked = true; this.applyMusic(); } else this.duckT = setTimeout(() => { this.ducked = false; this.applyMusic(); }, 900); },
  tone(freq, dur, type = 'sine', vol = 0.12, when = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur);
  },
  click() {
    if (!this.ctx || !prefs.office || performance.now() - this.lastClick < 70) return; this.lastClick = performance.now();
    const c = this.ctx, n = c.sampleRate * 0.03, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = b; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800 + Math.random() * 1500; const g = c.createGain(); g.gain.value = 0.18; s.connect(hp).connect(g).connect(this.amb); s.start();
  },
  join() { this.tone(523, .14, 'triangle', .1); this.tone(784, .2, 'triangle', .1, .12); },
  ding() { this.tone(988, .5, 'triangle', .14); this.tone(1318, .5, 'sine', .06, .02); },
  murmur(pitch, dur, vol = 1) {   // cartoon mumble, used when there is no real voice (vol: lower for a thought that escapes)
    if (!this.ctx || !prefs.voice) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(); o.type = 'sawtooth';
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08 * vol, t + 0.05); g.gain.setValueAtTime(0.08 * vol, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
    const base = 85 + pitch * 70; for (let x = 0; x < dur; x += 0.11) { o.frequency.setValueAtTime(base * (0.8 + Math.random() * 0.55), t + x); bp.frequency.setValueAtTime(500 + Math.random() * 900, t + x); }
    o.connect(bp).connect(g).connect(this.voice); o.start(t); o.stop(t + dur + 0.05); this.live.add(o); o.onended = () => this.live.delete(o); return o;
  },
  stopAll() { for (const s of this.live) { try { s.stop(); } catch {} } this.live.clear(); },
};

// Office ambience, all synthesised (no audio files): keyboards that follow real activity, a coffee machine, and small room noises.
const OFFICE = {
  nb: null, ty: [0, 1, 2].map(() => ({ n: 0, at: 0, pan: 0 })), pt: 0, prev: 0, nextCoffee: 22000, nextMisc: 9000, timer: null,
  ok() { return AUD.ctx && prefs.office && !AUD.off() && S.playing; },
  noise() { const c = AUD.ctx; if (!this.nb) { this.nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = this.nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return this.nb; },
  out(pan) { const c = AUD.ctx; if (!c.createStereoPanner) return AUD.amb; const p = c.createStereoPanner(); p.pan.value = pan; p.connect(AUD.amb); return p; },
  hit(t, out, o) {   // one short filtered noise burst (+ optional low thump): the building block of keys, clicks, doors, paper
    const c = AUD.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise(); f.type = o.type || 'bandpass'; f.frequency.value = o.f; f.Q.value = o.q || 1;
    g.gain.setValueAtTime(o.v, t); g.gain.exponentialRampToValueAtTime(0.001, t + o.d); s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 1.5, o.d + 0.02);
    if (o.thump) { const x = c.createOscillator(), xg = c.createGain(); x.frequency.setValueAtTime(o.thump, t); x.frequency.exponentialRampToValueAtTime(o.thump * 0.4, t + 0.05); xg.gain.setValueAtTime(o.v * 0.7, t); xg.gain.exponentialRampToValueAtTime(0.001, t + 0.06); x.connect(xg).connect(out); x.start(t); x.stop(t + 0.07); }
  },
  key(heavy, pan) { const v = (0.6 + Math.random() * 0.6) * (heavy ? 0.3 : 0.15); this.hit(AUD.ctx.currentTime, this.out(pan), { f: (heavy ? 1500 : 2600) + Math.random() * 1400, q: 1.2, v, d: heavy ? 0.07 : 0.035, thump: heavy ? 170 : 240 }); },
  mouse(pan) { const o = this.out(pan), t = AUD.ctx.currentTime; this.hit(t, o, { type: 'highpass', f: 3200, v: 0.14, d: 0.02 }); this.hit(t + 0.07, o, { type: 'highpass', f: 2600, v: 0.08, d: 0.02 }); },
  burst(n, pan) { if (!this.ok()) return; for (let k = 0; k < n; k++) setTimeout(() => this.ok() && this.key(k === n - 1, pan), k * (65 + Math.random() * 70)); },
  kick(tool) {   // a real tool call just happened: somebody types it, clicks it or scrolls through it
    if (!this.ok()) return; const pan = Math.random() * 1.6 - 0.8;
    if (/^(Bash|Edit|Write|MultiEdit|NotebookEdit)/.test(tool || '')) this.burst(5 + Math.floor(Math.random() * 7), pan); else this.mouse(pan);
  },
  chip(text) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200); },
  wob(freq, depth, base) { const c = AUD.ctx, g = c.createGain(), l = c.createOscillator(), lg = c.createGain(); g.gain.value = base; l.frequency.value = freq; lg.gain.value = depth; l.connect(lg).connect(g.gain); return { g, l }; },
  coffee() {
    const c = AUD.ctx, t = c.currentTime + 0.1, out = AUD.amb, nb = this.noise(), L = [];
    const run = (node, a, b) => { node.start(a); node.stop(b); };
    // grinder: growly motor + beans (0 – 2.4 s)
    const gs = c.createBufferSource(); gs.buffer = nb; gs.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.6;
    const env = c.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.2, t + 0.2); env.gain.setValueAtTime(0.2, t + 2.1); env.gain.linearRampToValueAtTime(0, t + 2.5);
    const w = this.wob(42, 0.4, 0.6); gs.connect(bp).connect(env).connect(w.g).connect(out); run(gs, t, t + 2.6); run(w.l, t, t + 2.6);
    const m = c.createOscillator(); m.type = 'sawtooth'; m.frequency.setValueAtTime(70, t); m.frequency.linearRampToValueAtTime(96, t + 0.4); const mf = c.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 260; const mg = c.createGain(); mg.gain.setValueAtTime(0, t); mg.gain.linearRampToValueAtTime(0.1, t + 0.2); mg.gain.setValueAtTime(0.1, t + 2.1); mg.gain.linearRampToValueAtTime(0, t + 2.5); m.connect(mf).connect(mg).connect(out); run(m, t, t + 2.6);
    // pour: gurgling water (3.0 – 6.4 s) with bubbles
    const ps = c.createBufferSource(); ps.buffer = nb; ps.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const pe = c.createGain(); pe.gain.setValueAtTime(0, t + 3); pe.gain.linearRampToValueAtTime(0.13, t + 3.4); pe.gain.setValueAtTime(0.13, t + 6); pe.gain.linearRampToValueAtTime(0, t + 6.5);
    const pw = this.wob(7, 0.5, 0.6); ps.connect(lp).connect(pe).connect(pw.g).connect(out); run(ps, t + 3, t + 6.6); run(pw.l, t + 3, t + 6.6);
    for (let k = 0; k < 18; k++) { const bt = t + 3.3 + Math.random() * 3, o = c.createOscillator(), bg = c.createGain(), f0 = 260 + Math.random() * 380; o.frequency.setValueAtTime(f0, bt); o.frequency.exponentialRampToValueAtTime(f0 * 1.9, bt + 0.07); bg.gain.setValueAtTime(0.05, bt); bg.gain.exponentialRampToValueAtTime(0.001, bt + 0.09); o.connect(bg).connect(out); run(o, bt, bt + 0.1); }
    // steam hiss (6.3 – 7.8 s)
    const ss = c.createBufferSource(); ss.buffer = nb; ss.loop = true; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200; const se = c.createGain(); se.gain.setValueAtTime(0, t + 6.3); se.gain.linearRampToValueAtTime(0.1, t + 6.6); se.gain.linearRampToValueAtTime(0, t + 7.8); ss.connect(hp).connect(se).connect(out); run(ss, t + 6.3, t + 7.9);
    setTimeout(() => this.ok() && (AUD.tone(1760, 0.1, 'sine', 0.07), AUD.tone(1760, 0.1, 'sine', 0.07, 0.2)), 8000);
    this.chip(L10('☕ Quelqu’un se fait un café…', '☕ Someone is making coffee…'));
  },
  misc() {
    const c = AUD.ctx, t = c.currentTime + 0.05, pan = Math.random() * 1.8 - 0.9, o = this.out(pan), r = Math.floor(Math.random() * 5);
    if (r === 0) { const x = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); x.type = 'sawtooth'; x.frequency.setValueAtTime(170, t); x.frequency.linearRampToValueAtTime(260, t + 0.35); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 4; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.08); g.gain.linearRampToValueAtTime(0, t + 0.4); x.connect(f).connect(g).connect(o); x.start(t); x.stop(t + 0.45); }   // chair creak
    else if (r === 1) { for (let k = 0; k < 2; k++) { const x = c.createOscillator(), g = c.createGain(), w = this.wob(32, 0.5, 0.5), tt = t + k * 0.42; x.type = 'square'; x.frequency.value = 150; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.07, tt + 0.02); g.gain.setValueAtTime(0.07, tt + 0.22); g.gain.linearRampToValueAtTime(0, tt + 0.26); x.connect(g).connect(w.g).connect(o); x.start(tt); x.stop(tt + 0.3); w.l.start(tt); w.l.stop(tt + 0.3); } }   // phone buzzing on the desk
    else if (r === 2) { this.hit(t, o, { type: 'lowpass', f: 380, v: 0.22, d: 0.2, thump: 90 }); this.hit(t + 0.5, o, { type: 'lowpass', f: 260, v: 0.12, d: 0.14, thump: 70 }); }   // a door, far away
    else if (r === 3) { this.hit(t, o, { type: 'highpass', f: 2500, v: 0.07, d: 0.45 }); }   // paper shuffling
    else { this.hit(t, o, { f: 900, q: 8, v: 0.18, d: 0.05, thump: 420 }); this.hit(t + 0.14, o, { f: 760, q: 8, v: 0.18, d: 0.05, thump: 360 }); }   // knock-knock on a meeting-room door
  },
  tick() {
    const now = performance.now(), dt = Math.min(500, now - (this.prev || now)); this.prev = now; if (!this.ok()) return;
    this.pt += dt; const working = Object.keys(S.status).filter((id) => S.status[id] === 'working' && !S.gone.has(id)).length;
    for (let i = 0; i < Math.min(3, working); i++) {   // background typists, one per busy agent (max 3)
      const y = this.ty[i]; if (this.pt < y.at) continue;
      if (y.n <= 0) { if (Math.random() < 0.55) { y.n = 6 + Math.floor(Math.random() * 20); y.pan = Math.random() * 1.6 - 0.8; } else { y.at = this.pt + 500 + Math.random() * 2500; continue; } }
      y.n--; this.key(y.n === 0, y.pan); y.at = this.pt + (y.n === 0 ? 900 + Math.random() * 2400 : 70 + Math.random() * 90 + (Math.random() < 0.1 ? 220 : 0));
    }
    if (this.pt > this.nextMisc) { this.misc(); this.nextMisc = this.pt + 18000 + Math.random() * 30000; }
    if (this.pt > this.nextCoffee) { this.coffee(); this.nextCoffee = this.pt + 90000 + Math.random() * 90000; }
  },
  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 60); },
};
const L10 = (fr, en) => L(fr, en);
const STATIONS = [['fip', 'FIP', 'fip'], ['groove', 'FIP Groove', 'fipgroove'], ['jazz', 'FIP Jazz', 'fipjazz'], ['electro', 'FIP Electro', 'fipelectro'], ['reggae', 'FIP Reggae', 'fipreggae'], ['rock', 'FIP Rock', 'fiprock'], ['new', 'FIP Nouveautés', 'fipnouveautes'], ['pop', 'FIP Pop', 'fippop']]
  .map(([id, name, slug]) => ({ id, name, url: `https://icecast.radiofrance.fr/${slug}-midfi.mp3` }));
const RADIO = {   // live web radio through WebAudio (so it can be faded when agents talk)
  el: null, cur: null, err: false,
  sync() {
    if (!AUD.ctx) return;
    if (!this.el) {
      const a = (this.el = new Audio()); a.crossOrigin = 'anonymous'; a.preload = 'none';
      a.addEventListener('error', () => { this.err = !!this.cur; updateHint(); }); a.addEventListener('playing', () => { this.err = false; updateHint(); });
      AUD.ctx.createMediaElementSource(a).connect(AUD.music);
    }
    const want = prefs.music && !AUD.off(), url = (STATIONS.find((s) => s.id === prefs.station) || STATIONS[0]).url;
    if (want) { if (this.cur !== url) { this.cur = url; this.err = false; this.el.src = url; } if (this.el.paused) this.el.play().catch(() => {}); }
    else if (this.cur) { this.cur = null; this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }   // stop downloading; it reconnects live next time
  },
};
const synth = window.speechSynthesis;
const estMs = (text) => Math.min(9000, 900 + text.length * 42) / spd();

const NOVELTY = /grandma|grandpa|rocko|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|kathy|ralph|hysterical|deranged|pipe/i;
const GOOD = /premium|enhanced|natural|siri|neural|améli|amelie|thomas|jacques|audrey|marie|eddy|flo\b|reed|sandy|shelley|samantha|daniel|karen|moira|serena|oliver|google|hortense|julie|paul|denise|henri|eloise|zira|david|hazel|mark|aria|guy/i;
const voiceScore = (n) => (/premium|enhanced|natural|neural|siri/i.test(n) ? 100 : 0) + (GOOD.test(n) ? 30 : 0) - (NOVELTY.test(n) ? 200 : 0);
function rankVoices(list) {   // list of names → best distinct voices first
  const seen = new Set(), out = [];
  [...list].sort((a, b) => voiceScore(b) - voiceScore(a)).forEach((n) => { const base = n.replace(/\s*\(.*$/, ''); if (voiceScore(n) > -100 && !seen.has(base)) { seen.add(base); out.push(n); } });
  return out.slice(0, 5);
}
const ttsVoiceOf = (key) => { const v = prefs.tts.voices; return key && Object.hasOwn(v, key) && typeof v[key] === 'string' ? v[key].trim() : ''; };
const TTS = {
  server: false, engine: 'system', platform: '', pool: { fr: [], en: [] }, cache: new Map(), made: new Map(), q: [], busy: false, now: 0, oaGen: 0, oaReported: false,
  pick(p) {   // OpenAI engine: a voice chosen for this character, else the pool, else the default voice
    const key = p.id === 'main' ? 'lead' : p.id === 'user' ? 'you' : (p.custom && p.custom.name ? p.custom.name.toLowerCase() : ''), v = ttsVoiceOf(key);
    if (v) return { voice: v, picked: true };
    const pool = prefs.tts.pool.split(',').map((s) => s.trim()).filter(Boolean);
    return pool.length ? { voice: pool[(p.vi >>> 2) % pool.length], picked: false } : prefs.tts.voice.trim() ? { voice: prefs.tts.voice.trim(), picked: false } : null;
  },
  async init() {
    const gen = ++this.oaGen; this.oaReported = false;
    this.engine = 'system'; this.server = false; this.pool = { fr: [], en: [] }; this.cache.clear(); this.made.clear(); this.q = [];
    try {
      if (prefs.tts.url.trim() && (prefs.tts.voice.trim() || prefs.tts.pool.trim())) {
        await flushPrefs(); if (gen !== this.oaGen) return;
        const o = await (await fetch('/api/voices?engine=openai')).json(); if (gen !== this.oaGen) return;
        if (o.available) { this.server = true; this.engine = 'openai'; this.platform = o.platform || ''; return; }
      }
      if (prefs.vstyle === 'kokoro') {   // natural voices installed on demand; until they are, the system voices stay in use
        const k = await (await fetch('/api/voices?engine=kokoro')).json(); if (gen !== this.oaGen) return;
        if (k.available && k.ready) { this.server = true; this.engine = 'kokoro'; this.platform = k.platform || ''; for (const l of ['fr', 'en']) this.pool[l] = k.voices.filter((v) => v.locale.startsWith(l + '_')).map((v) => v.name); return; }
      }
      const d = await (await fetch('/api/voices')).json(); if (gen !== this.oaGen) return; this.platform = d.platform || ''; if (!d.available) return; this.server = true;
      for (const l of ['fr', 'en']) this.pool[l] = rankVoices(d.voices.filter((v) => v.locale.startsWith(l + '_')).map((v) => v.name)); } catch {}
  },
  voiceFor(p, fr = FR()) { if (this.engine === 'openai') return (this.pick(p) || {}).voice || null; const pool = this.pool[fr ? 'fr' : 'en']; return pool.length ? (p.id === 'main' ? pool[0] : pool[(p.vi >>> 2) % pool.length]) : null; },
  rate() { return Math.round(Math.max(120, Math.min(330, 178 * (S.live ? 1.12 * lagFactor() * (S.boost > 1 ? 1.25 : 1) : +$('#speed').value))) / 10) * 10; },
  rateAt(k, boost) { const i = S.idx, b = S.boost; S.idx = k; S.boost = boost; const r = this.rate(); S.idx = i; S.boost = b; return r; },   // the rate rate() will give once playback is at event k
  buf(text, voice, rate, ahead, fr = FR()) {   // ahead: made in advance (see warmTTS); otherwise the line is wanted now
    const vt = this.engine + '|' + voice + '|' + fr + '|' + text, K = (r) => this.engine + '|' + voice + '|' + fr + '|' + r + '|' + text, key = K(rate), got = this.made.get(vt) || [];   // got: the rates at which this text is ready in this voice
    if (!ahead && S.live && !got.includes(rate)) { const r = got.find((x) => Math.abs(x - rate) <= rate * 0.2 && this.cache.has(K(x))); if (r) return this.cache.get(K(r)); }   // made ahead at the rate of a moment ago (the call fell behind or caught up since): played as it is, a second of silence is worse than a slightly different pace
    if (!this.cache.has(key)) {
      this.cache.set(key, fetch(`/api/tts?engine=${this.engine}&voice=${encodeURIComponent(voice)}&rate=${rate}&text=${encodeURIComponent(text)}&lang=${fr ? 'fr' : 'en'}`).then((r) => { if (!r.ok) throw new Error('tts'); return r.arrayBuffer(); }).then((b) => AUD.ctx.decodeAudioData(b)));
      if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value);
      this.cache.get(key).then(() => { this.made.set(vt, [...(this.made.get(vt) || []), rate]); if (this.made.size > 120) this.made.delete(this.made.keys().next().value); }, () => this.cache.delete(key));
      if (!ahead) { this.now++; const end = () => { this.now--; this.pump(); }; this.cache.get(key).then(end, end); }   // a line wanted now never waits behind the ones made ahead: they stop being started until it is ready
    }
    return this.cache.get(key);
  },
  pump() {   // the lines made ahead: one at a time, in the order they will be said
    if (this.busy || this.now || !this.q.length) return; const j = this.q.shift(); this.busy = true;
    const end = () => { this.busy = false; this.pump(); }; this.buf(j.text, j.voice, j.rate, true, j.fr).then(end, end);
  },
};
// The lines to come are synthesized ahead of time, so that a voice starts with its line and not a second later. What is made must be what will be asked for: the same text (the lead-in, the part
// that is read when the call is behind), the same voice and the same rate. So this follows what run() will do with the next events if nothing else arrives before then: how it groups them
// (sub-agents back to back, orders in a row) and how it sets the pace. Keep the two in step: a difference costs nothing but the benefit (the line is then made when it is said).
function paceAt(k) {
  if (!S.live) return { pace: 0, boost: 1 };
  const q = aheadSpeakable(k, 14), lg = lagMs(k) / 1000, hurry = q > 12 || lg > 45;   // hurry: the line is shown without a voice
  return { hurry, pace: Math.min(q > 7 ? 70 : q > 3 ? 130 : 260, lg > 30 ? 70 : lg > 15 ? 130 : lg > 6 ? 200 : 260), boost: hurry || S.events.length - k > 60 ? 3 : 1 };
}
function warmTTS(i) {   // called by run() before each line (i is that line) and when new events arrive (i is the first of them)
  if (!TTS.server || !AUD.ctx || AUD.off() || !prefs.voice || prefs.vstyle === 'animal' || prefs.vstyle === 'sims') return;
  const fresh = i <= S.idx, from = fresh ? i : S.idx + 1, len = S.events.length, jobs = []; let n = 0; if (!fresh && !S.playing) return;   // new events while a line is being read: the lines after it are planned again, they may now be read shorter and faster
  for (let k = from; k < Math.min(len, from + 400) && n < 4;) {
    const e = S.events[k]; if (quiet(e)) { k++; continue; }
    if (S.live && len - k > 300) break;   // a backlog that run() skips
    const group = [e]; let j = k + 1;
    if (e.kind === 'order') { while (j < Math.min(len, k + 40) && group.length < 8) { const e2 = S.events[j]; if (e2.kind === 'usage' || e2.kind === 'compact') j++; else if (e2.kind === 'order' && e2.agent === e.agent) { group.push(e2); j++; } else break; } }
    else if (isSub(e.agent)) { while (j < Math.min(len, k + 28) && group.length < 3) { const e2 = S.events[j]; if (quiet(e2)) j++; else if (e2.kind !== 'order' && isSub(e2.agent) && !group.some((g) => g.agent === e2.agent)) { group.push(e2); j++; } else break; } }
    const pl = paceAt(k), many = e.kind === 'order' && group.length > 1, rate = TTS.rateAt(many || !S.live ? k : j - 1, pl.boost);
    for (const g of many ? [e] : group) {   // orders in a row: only the first is read out
      n++; const p = S.agents[g.agent], bt = baseText(g); if ((pl.hurry && g.kind !== 'user') || !p || (FR() && !trMem.has(bt) && langOf(bt) !== 'fr')) continue;   // not translated yet: what will be said is not known
      const said = clipSpeech(talkLine(g), pl.pace), text = speakable(said), fr = sessFr(said, g), voice = TTS.voiceFor(p, fr); if (text && voice) jobs.push({ k, text, voice, rate, fr });
    }
    k = j;
  }
  TTS.q = (fresh ? [] : TTS.q.filter((x) => x.k < from)).concat(jobs); TTS.pump();   // the lines of the group being read keep their place at the front
}

// ---- Cartoon voices: the same system voice, given a character by a small WebAudio chain (pitch, vibrato, robot, radio…), or syllable "babble" in the spirit of Animal Crossing.
const VFX = [{ rate: 1.26 }, { rate: 0.86, low: 7 }, { ring: 75, rate: 1.02 }, { rate: 1.08, vib: [5.5, 0.006] }, { band: [420, 3200], drive: 1 }, { rate: 0.74, vib: [9, 0.003], lp: 2200 }, { rate: 1.16, vib: [7, 0.004] }];
const fxFor = (p) => (p.id === 'main' ? { rate: 0.95, low: 4 } : p.id === 'user' ? {} : VFX[(p.vi >>> 3) % VFX.length]);
function fxChain(c, src, fx) {   // returns the last node; `stops` are oscillators to stop when the line ends
  const stops = []; let node = src; const link = (n) => { node.connect(n); node = n; };
  if (fx.rate) src.playbackRate.value = fx.rate;
  if (fx.low) { const f = c.createBiquadFilter(); f.type = 'lowshelf'; f.frequency.value = 250; f.gain.value = fx.low; link(f); }
  if (fx.band) { const a = c.createBiquadFilter(), b = c.createBiquadFilter(); a.type = 'highpass'; a.frequency.value = fx.band[0]; b.type = 'lowpass'; b.frequency.value = fx.band[1]; link(a); link(b); }
  if (fx.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fx.lp; link(f); }
  if (fx.drive) { const w = c.createWaveShaper(), k = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = (i - 128) / 128; k[i] = Math.tanh(x * 4) * 0.8; } w.curve = k; link(w); }
  if (fx.vib) { const d = c.createDelay(0.05), l = c.createOscillator(), lg = c.createGain(); d.delayTime.value = 0.012; l.frequency.value = fx.vib[0]; lg.gain.value = fx.vib[1]; l.connect(lg).connect(d.delayTime); l.start(); stops.push(l); link(d); }
  if (fx.ring) { const o = c.createOscillator(), rm = c.createGain(), dry = c.createGain(), wet = c.createGain(), mix = c.createGain(); rm.gain.value = 0; o.frequency.value = fx.ring; o.connect(rm.gain); o.start(); stops.push(o);
    dry.gain.value = 0.35; wet.gain.value = 0.9; node.connect(dry); node.connect(rm).connect(wet); dry.connect(mix); wet.connect(mix); node = mix; }
  return { node, stops };
}
const FORM = { a: [800, 1200], e: [530, 1840], i: [300, 2300], o: [500, 900], u: [350, 800], y: [320, 2100] };   // vowel formants (F1, F2)
const VOW = 'aeiouyàâäéèêëîïôöùûü';
const vowelKey = (ch) => ({ à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u' }[ch] || ch);
// Gibberish "speech" instead of words, in the spirit of Animal Crossing (one blip per letter) and Simlish (flowing syllables with a sentence melody).
// It needs no system voice and no translation, so it sounds the same on every machine and in every language; the words stay on screen.
async function speakBabble(text, p, gain, token) {
  const c = AUD.ctx, sims = prefs.vstyle === 'sims', clean = speakable(text).toLowerCase(), dur = estMs(text) / 1000, noise = OFFICE.noise();
  const base = p.lead ? 150 : p.id === 'user' ? 190 : 200 + ((p.vi >>> 2) % 9) * 30, an = c.createAnalyser(); an.fftSize = 256;
  const g = c.createGain(); g.gain.value = gain * (sims ? 0.4 : 0.45 * Math.max(0.7, Math.min(1.25, 300 / base))); an.connect(g); g.connect(AUD.voice);   // a high voice's blips came out twice as loud as the lead's: evened out
  const clauses = clean.match(/[^.!?;:]+[.!?;:]*/g) || [clean], nodes = []; let t = c.currentTime + 0.03; const end = t + dur;
  let tail = 0; const track = (o) => { AUD.live.add(o); nodes.push(o); tail = t; };   // tail: when the last sound starts
  const vowelGroups = (w) => w.match(new RegExp(`[^${VOW}]*[${VOW}]+(?:[^${VOW}]+(?![${VOW}]))?`, 'g')) || [w];
  const nSyl = clauses.reduce((n, cl) => n + (cl.match(/[a-zà-ÿ0-9]+/g) || []).reduce((m, w) => m + vowelGroups(w).length, 0) + 1.5, 0) || 1, unit = Math.max(0.08, Math.min(0.2, dur / nSyl));
  const letterStep = Math.max(0.045, Math.min(0.085, dur / Math.max(8, clean.length)));
  const burst = (at, hp, len, v) => { const s = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain(); s.buffer = noise; f.type = 'highpass'; f.frequency.value = hp; e.gain.setValueAtTime(v, at); e.gain.exponentialRampToValueAtTime(0.001, at + len); s.connect(f).connect(e).connect(an); s.start(at, Math.random(), len + 0.02); track(s); };
  for (const cl of clauses) {
    if (t >= end) break;
    const q = /\?\s*$/.test(cl), ex = /!\s*$/.test(cl), words = cl.match(/[a-zà-ÿ0-9]+/g) || []; let wi = 0;
    for (const w of words) {
      if (t >= end) break; const prog = wi++ / Math.max(1, words.length), m = (q ? 0.95 + 0.32 * prog : 1.12 - 0.24 * prog) * (ex ? 1.08 : 1);   // melody: falls through a statement, climbs through a question
      if (!sims) {
        for (const ch of w) {
          const code = ch.charCodeAt(0), f = base * m * 2 ** (((code % 7) * 2 - 4 + (VOW.includes(ch) ? 3 : 0)) / 12), vw = [...'aeiou'][code % 5];
          const o = c.createOscillator(), bp = c.createBiquadFilter(), env = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (1 + ((code % 3) - 1) * 0.07), t + letterStep);
          bp.type = 'bandpass'; bp.frequency.value = FORM[vw][0] * 1.3; bp.Q.value = 1.4; env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + 0.008); env.gain.setTargetAtTime(0, t + 0.008, letterStep * 0.2);   // a blip, not a click: a rounder start and a short tail, same notes and rhythm
          o.connect(bp).connect(env).connect(an); o.start(t); o.stop(t + letterStep * 1.5); track(o); t += letterStep;
        }
        t += letterStep * 0.8;
      } else {
        for (const [si, syl] of vowelGroups(w).entries()) {
          if (t >= end) break; const v = syl.match(new RegExp(`[${VOW}]`)), vk = v ? vowelKey(v[0]) : 'e', on = syl[0], [F1, F2] = FORM[vk] || FORM.e, hash = (syl.charCodeAt(0) * 7 + syl.length * 3) % 11;
          const f0 = base * m * (si === 0 ? 1.06 : 1) * (1 + (hash - 5) * 0.012), len = unit * (0.85 + (hash % 3) * 0.12), on0 = VOW.includes(on) ? 0 : /[sfzhxcjv]/.test(on) ? 1 : /[tkpbdgq]/.test(on) ? 2 : 3;
          if (on0 === 1) { burst(t, /[sxzc]/.test(on) ? 4200 : 1800, 0.07, 0.35); t += 0.05; } else if (on0 === 2) { burst(t, 1400, 0.025, 0.5); t += 0.02; }
          const o = c.createOscillator(), b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(), g2 = c.createGain(), env = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.04, t); o.frequency.linearRampToValueAtTime(f0 * 0.97, t + len); vib.frequency.value = 5.5; vg.gain.value = f0 * 0.012; vib.connect(vg).connect(o.frequency);
          b1.type = b2.type = 'bandpass'; b1.Q.value = 7; b2.Q.value = 9; const nasal = on0 === 3 ? 0.55 : 1; b1.frequency.setValueAtTime(F1 * nasal, t); b1.frequency.linearRampToValueAtTime(F1, t + 0.06); b2.frequency.setValueAtTime(F2 * (on0 === 3 ? 0.75 : 1), t); b2.frequency.linearRampToValueAtTime(F2, t + 0.07); g2.gain.value = 0.55;
          env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(1.6, t + 0.02); env.gain.setValueAtTime(1.6, t + len * 0.6); env.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(b1).connect(env); o.connect(b2).connect(g2).connect(env); env.connect(an); o.start(t); vib.start(t); o.stop(t + len + 0.02); vib.stop(t + len + 0.02); track(o); track(vib); t += len * 0.92;
        }
        t += unit * 0.35;
      }
    }
    t += unit * (sims ? 1.2 : 2.4);
  }
  const data = new Uint8Array(an.fftSize); S.level[p.id] = () => { an.getByteTimeDomainData(data); let s = 0; for (const v of data) { const x = (v - 128) / 128; s += x * x; } return Math.sqrt(s / data.length) * 2.2; };
  const lastN = nodes[nodes.length - 1]; if (lastN) captionRun(p.id, text, (tail - c.currentTime) * 1000 + 150);   // the subtitles follow the real length of the babble, not the estimate it was cut from
  await new Promise((res) => { if (lastN) lastN.onended = res; setTimeout(res, lastN ? (t - c.currentTime) * 1000 + 600 : Math.max(100, (Math.min(t, end) - c.currentTime) * 1000 + 80)); });   // the line ends when its last sound does (a long last word used to go on after it), or when Pause stops it
  nodes.forEach((o) => AUD.live.delete(o)); delete S.level[p.id];
}
async function speakServer(text, p, gain, token, fr = FR()) {
  const voice = TTS.voiceFor(p, fr); if (!voice) throw new Error('no voice');
  let buf; try { buf = await TTS.buf(speakable(text), voice, TTS.rate(), false, fr); } catch (e) { if (TTS.engine === 'openai' && !TTS.oaReported) { TTS.oaReported = true; loadHealth(); } throw e; }
  if (token !== S.token) return;
  const c = AUD.ctx, src = c.createBufferSource(); src.buffer = buf;
  const an = c.createAnalyser(); an.fftSize = 256; const g = c.createGain(); g.gain.value = gain; let stops = [];
  if (prefs.vstyle === 'natural' || prefs.vstyle === 'kokoro' || (TTS.engine === 'openai' && (TTS.pick(p) || {}).picked)) src.connect(an); else { const ch = fxChain(c, src, fxFor(p)); stops = ch.stops; ch.node.connect(an); }
  an.connect(g); g.connect(AUD.voice);
  const data = new Uint8Array(an.fftSize);
  S.level[p.id] = () => { an.getByteTimeDomainData(data); let s = 0; for (const v of data) { const x = (v - 128) / 128; s += x * x; } return Math.sqrt(s / data.length); };   // drives the mouth
  AUD.live.add(src);
  const ms = buf.duration * 1000 / (src.playbackRate.value || 1);   // how long it really lasts: the character's effect plays the clip slower or faster than it was made
  captionRun(p.id, text, ms); await new Promise((res) => { src.onended = res; setTimeout(res, ms + 1000); src.start(); });   // the line ends when its sound ends (or when Pause stops it); the timer only covers a sound that never starts
  try { src.stop(); } catch {} AUD.live.delete(src); delete S.level[p.id]; stops.forEach((o) => { try { o.stop(); } catch {} });
}
function speakBrowser(text, p, token, fr = FR()) {   // fallback where no server voice exists (Windows/Linux)
  return new Promise((resolve) => {
    const vs = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(fr ? 'fr' : 'en')); if (!vs.length) return resolve(false);
    const ranked = rankVoices(vs.map((v) => v.name)), voice = vs.find((v) => v.name === (p.id === 'main' ? ranked[0] : ranked[(p.vi >>> 2) % ranked.length])) || vs[0];
    const parts = speakable(text).match(/[^.!?;:]+[.!?;:]*/g) || [text]; synth.cancel(); let i = 0, done = false, started = false, t0 = 0, said = 0; const all = parts.reduce((n, x) => n + x.length, 0);
    const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
    setTimeout(() => { if (!started && !done) { synth.cancel(); fin(false); } }, 2500);   // engine never started (e.g. inside a webview)
    setTimeout(() => { if (!done) { synth.cancel(); fin(true); } }, Math.max(45000, text.length * 160));   // a voice that never reports its end is cut, not left talking over the next line
    const next = () => {
      if (i >= parts.length || done || token !== S.token) return fin(true);
      if (t0 && said >= 20) { const el = performance.now() - t0; captionRun(p.id, text, el * all / said, el); }   // the length of the audio is not known in advance here: the subtitles are set again on the pace the voice really has, after each sentence
      said += parts[i].length; const part = parts[i++].trim(); if (!part) return next();
      const u = new SpeechSynthesisUtterance(part); u.lang = fr ? 'fr-FR' : 'en-US'; u.voice = voice; u.pitch = prefs.vstyle === 'natural' ? 0.95 + ((p.vi >>> 5) % 5) * 0.03 : p.id === 'main' ? 0.8 : [1.5, 0.6, 1.2, 1.7, 0.9, 0.5, 1.35][(p.vi >>> 3) % 7]; u.rate = Math.min(1.7, 0.97 * spd());
      u.onstart = () => { started = true; if (!t0) { t0 = performance.now(); captionRun(p.id, text, estMs(text)); } }; u.onend = () => setTimeout(next, 120); u.onerror = () => fin(started); synth.speak(u);
    };
    next();
  });
}
// Subtitles: a long line is shown one piece (sentence, or clause of a long sentence) at a time, the piece being said. The split is by characters, spread over the audio's real length when known.
function pieces(text) {
  const out = [];
  for (const sen of String(text).split(/(?<=[.!?…]["')\]]*)\s+/)) {
    const t = sen.trim(); if (!t) continue;
    if (t.length <= 110) { out.push(t); continue; }
    let cur = '';
    for (const part of t.split(/(?<=[,;:—])\s+/)) { if (cur && cur.length + part.length > 90) { out.push(cur); cur = part; } else cur = cur ? cur + ' ' + part : part; }
    if (cur) out.push(cur);
  }
  return out;
}
const capTimers = new Map();   // agent id → timers that advance its subtitle
function captionClear(id) { (capTimers.get(id) || []).forEach(clearTimeout); capTimers.delete(id); }
function setCaption(id, text) {
  const t = $('#t-' + id), b = t && t.querySelector('.bubble'), say = S.say[id]; if (!b || !say) return;
  b.innerHTML = (say.label ? `<small>${esc(say.label)}</small>` : '') + esc(text); setPaneCaption(id, text);
}
function captionRun(id, text, totalMs, from = 0) {   // from: how far into the line the voice already is, when the timing is corrected along the way
  captionClear(id); const ps = pieces(text); if (ps.length < 2 || !(totalMs > 0)) return;
  const n = ps.reduce((a, x) => a + x.length, 0), timers = []; let at = 0, cur = ps[0];
  for (const x of ps) { const when = at - from; if (when <= 0) cur = x; else timers.push(setTimeout(() => setCaption(id, x), when)); at += totalMs * x.length / n; }
  setCaption(id, cur); capTimers.set(id, timers);
}
const frVoice = (t) => (langOf(t) ?? (FR() ? 'fr' : 'en')) === 'fr';   // a French line gets a French voice whatever the interface language, and the other way round
// A line of the session that is too short to tell ("OK.", a file name) does not follow the interface language: in a French session watched in English, the lead would change voice for that
// one line and change back. It follows, in this order: the whole line it is cut from, what the same character said just before (its voice goes on) or says next, the language of the session so far.
// The session's language is counted once per line as the events arrive; in French, a line counts for what is said, i.e. its translation once it is there.
const SL = { ev0: null, ui: null, n: 0, fr: 0, en: 0, pend: [] };
function sessLang() {   // 'fr' or 'en': the majority among the lines of the session that langOf can decide; null when there is none
  const ev = S.events, ui = FR(), add = (t) => { const lo = langOf(t); if (lo) SL[lo]++; };
  if (ev[0] !== SL.ev0 || ui !== SL.ui || ev.length < SL.n) Object.assign(SL, { ev0: ev[0], ui, n: 0, fr: 0, en: 0, pend: [] });   // another session, or another interface language
  for (; SL.n < ev.length; SL.n++) { const e = ev[SL.n]; if (quiet(e) || typeof e.text !== 'string') continue; const t = baseText(e); if (!ui) add(t); else if (trMem.has(t)) add(trMem.get(t)); else if (langOf(t) === 'fr') SL.fr++; else SL.pend.push(t); }
  if (SL.pend.length) SL.pend = SL.pend.filter((t) => !trMem.has(t) || add(trMem.get(t)));   // translations that have arrived since
  return SL.fr > SL.en ? 'fr' : SL.en > SL.fr ? 'en' : null;
}
function sessFr(text, ev) {   // for the lines that come from the session (ev: the event, when there is one); the little built-in lines keep frVoice, they are written in the interface language
  let lo = langOf(text);
  if (!lo && ev) {
    const now = (e) => { const t = baseText(e); return langOf(FR() && trMem.has(t) ? trMem.get(t) : t); }, at = S.events.indexOf(ev, Math.max(0, S.idx - 60)); lo = now(ev);
    for (let k = at - 1, n = 0; !lo && k >= 0 && k > at - 5000 && n < 6; k--) { const e = S.events[k]; if (e.agent === ev.agent && !quiet(e) && typeof e.text === 'string') { lo = now(e); n++; } }
    for (let k = at + 1, n = 0; !lo && at >= 0 && k < S.events.length && k < at + 5000 && n < 6; k++) { const e = S.events[k]; if (e.agent === ev.agent && !quiet(e) && typeof e.text === 'string') { lo = now(e); n++; } }   // its first words: what it says next, when that is already there
  }
  return (lo ?? sessLang() ?? (FR() ? 'fr' : 'en')) === 'fr';
}
async function speakLine(text, p, primary, token, fr = frVoice(text), always = false) {   // always: your own lines are voiced even when the call is behind
  captionRun(p.id, text, estMs(text));
  if (AUD.off() || !prefs.voice) { if (!AUD.off() && prefs.office) AUD.murmur(0.5 + (p.vi % 5) / 10, estMs(text) / 1000); return sleep(estMs(text)); }
  if (S.hurry && !always) return sleep(estMs(text));
  if ((prefs.vstyle === 'animal' || prefs.vstyle === 'sims') && AUD.ctx) { try { await speakBabble(text, p, primary ? 1 : 0.5, token); return; } catch {} }
  if (TTS.server && AUD.ctx) { try { await speakServer(text, p, primary ? 1 : 0.5, token, fr); return; } catch {} }
  if (primary && synth && !EMBED && (await speakBrowser(text, p, token, fr))) return;
  if (token !== S.token) return;   // paused while a voice was being tried: no mumble after the fact
  const ms = estMs(text), o = AUD.murmur(0.5 + (p.vi % 5) / 10, ms / 1000); captionRun(p.id, text, ms);
  return o ? new Promise((res) => { o.addEventListener('ended', res); setTimeout(res, ms + 500); }) : sleep(ms);   // the mumble that stands in for a voice: the line ends with it, also when Pause stops it
}

