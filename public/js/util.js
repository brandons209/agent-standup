// =====================================================================
//  helpers, prefs, i18n
// =====================================================================
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SUPPORT = { url: 'https://www.buymeacoffee.com/bored_dev_and_his_robots' };   // e.g. 'https://www.buymeacoffee.com/yourname' — the coffee button stays hidden while this is empty
const CID = Math.random().toString(36).slice(2, 12);   // identifies this window for the audio-ownership handshake
const Q = new URLSearchParams(location.search);
const EMBED = Q.get('embed') === '1' || window.parent !== window;

let prefs = { lang: 'en', voice: true, roster: true, banter: true, reactions: false, office: false, officeVol: 0.8, vstyle: 'cartoon', notify: false, epi: false, vanish: true, multiShare: false, names: '', narrate: true, music: false, station: 'fip', musicVol: 0.35, view: 'call', layout: 'speaker', hideCode: false };
const TTS_DEFAULTS = { url: '', model: 'tts-1', format: 'wav', voice: '', pool: '', voices: {} };
{ let loc = {}; try { loc = JSON.parse(localStorage.getItem('cc.prefs') || '{}') || {}; } catch {}   // the settings file (shared by every window) and this origin's copy: the more recent one wins
  const sv = window.SAVED_PREFS && typeof window.SAVED_PREFS === 'object' ? window.SAVED_PREFS : {}; Object.assign(prefs, (sv._t || 0) > (loc._t || 0) ? sv : loc); }
{ const t = prefs.tts && typeof prefs.tts === 'object' ? prefs.tts : {}; prefs.tts = { ...TTS_DEFAULTS, ...t, voices: t.voices && typeof t.voices === 'object' && !Array.isArray(t.voices) ? { ...t.voices } : {} }; }
if (prefs.vstyle === 'babble') prefs.vstyle = 'animal', prefs.vstyleChosen = true;
if (!prefs.vstyleChosen && (prefs.vstyle === 'animal' || prefs.vstyle === 'sims')) prefs.vstyle = 'cartoon';   // the gibberish styles are opt-in: understandable voices by default
if (!prefs.notifyChosen) prefs.notify = true;   // “tell me when the agents are done” is on unless the person chose otherwise
let prefsTimer = null;
const savePrefs = () => { prefs._t = Date.now(); try { localStorage.setItem('cc.prefs', JSON.stringify(prefs)); } catch {} clearTimeout(prefsTimer); prefsTimer = setTimeout(() => { fetch('/api/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(prefs) }).catch(() => {}); }, 400); };
const flushPrefs = () => { clearTimeout(prefsTimer); prefs._t = Date.now(); try { localStorage.setItem('cc.prefs', JSON.stringify(prefs)); } catch {} return fetch('/api/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(prefs) }).catch(() => {}); };
// Languages: French and English live in the code as pairs L(french, english); every other language is a catalogue public/locales/<code>.json mapping the English text to its translation.
// A missing string falls back to English, so a half-translated language still works. See public/locales/README.md to add one.
const LANGS = [['en', 'English', 'en'], ['fr', 'Français', 'fr'], ['zh-TW', '繁體中文', 'zh-Hant-TW'], ['zh-CN', '简体中文', 'zh-Hans-CN'], ['es', 'Español', 'es'], ['de', 'Deutsch', 'de'], ['da', 'Dansk', 'da'], ['pt-BR', 'Português (Brasil)', 'pt-BR'], ['ja', '日本語', 'ja']];
let LOC = {};
const FR = () => prefs.lang === 'fr';
const FR_W = /\b(le|la|les|des|une|un|et|est|pour|dans|que|qui|pas|sur|avec|je|tu|nous|vous|ce|cette|ça|du|au|aux|mais|sont|été|fait|plus|ne|ont|il|elle|ils|elles|très|aussi|donc|bien|tout|voici|voilà|merci|oui|non|comme|où|déjà|encore)\b/gi, EN_W = /\b(the|and|is|are|to|of|in|that|with|for|this|it|on|you|we|not|have|has|was|be|will|can|from|your|at|as|but|all|now|also|done|here|there|which|what|then|just|so)\b/gi;
const langOf = (t) => {   // 'fr' or 'en' when a line clearly reads as one of them, else null: the voice then follows the interface language
  t = String(t || ''); const fr = (t.match(FR_W) || []).length + (t.match(/[éèêàçùâîôûœ]/g) || []).length, en = (t.match(EN_W) || []).length;
  return fr >= 2 && fr > en * 1.5 ? 'fr' : en >= 2 && en > fr * 1.5 ? 'en' : null;
};
const tr = (en) => (prefs.lang === 'en' || prefs.lang === 'fr' ? en : LOC[en] || en);
const L = (fr, en) => (FR() ? fr : tr(en));
async function loadLocale(code) { LOC = {}; if (code === 'en' || code === 'fr') return; try { const r = await fetch('/locales/' + encodeURIComponent(code) + '.json'); if (r.ok) LOC = await r.json(); } catch {} }
async function setLang(code, save) {
  if (!LANGS.some((l) => l[0] === code)) code = 'en'; prefs.lang = code; await loadLocale(code); if (save) { prefs.langChosen = true; savePrefs(); }
  if (FR()) fetch('/api/warm').catch(() => {}); AUD.stopAll(); synth && synth.cancel(); applyLang(); if (FR()) prefetchTr(S.idx);
}

