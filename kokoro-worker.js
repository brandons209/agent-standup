#!/usr/bin/env node
// Kokoro worker: loads the Kokoro-82M model once, then reads one JSON request per stdin line ({ id, text, voice, speed, out }),
// writes a 16-bit WAV to `out` and answers { id, ok, seconds } or { id, ok: false, error }. Started by kokoro.js.
const fs = require('fs'), path = require('path'), readline = require('readline'), { createRequire } = require('module');
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const send = (o) => fs.writeSync(1, JSON.stringify(o) + '\n');
const finite = (samples) => { for (let i = 0; i < samples.length; i++) if (samples[i] !== samples[i]) return false; return true; };   // a quantised model can return NaN for a whole line, which would be written as silence
function wav(samples, rate) {   // Float32 in [-1, 1] → 16-bit mono WAV
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); buf.writeInt16LE(Math.round(s < 0 ? s * 32768 : s * 32767), 44 + i * 2); }
  return buf;
}
const FILE = { q8: 'model_quantized', q4: 'model_q4', fp32: 'model', fp16: 'model_fp16', q4f16: 'model_q4f16' };   // the file transformers.js keeps for each dtype, under models/<MODEL>/onnx/
// The model takes 510 phonemes per call (about 480 letters of plain English, 300 when the line is full of numbers) and kokoro-js cuts the rest without a word:
// a line that does not fit is made in parts and joined. LONG is what the tokenizer throws instead of cutting (see main).
const LONG = new Error('too long for one call'), QUIET = 0.003;
const CUTS = [[/[.!?…]+["'”’»)\]]*\s+(?![\sa-zà-ÿ])|\s*\n\s*/g, 0.45], [/[,;:—–]\s+/g, 0.2], [/\s+/g, 0.05]];   // where a line may be cut, best first, each with the pause it gets in seconds at speed 1: the end of a sentence, a comma, a space
function halve(s) {   // two parts at the cut nearest the middle, so no part is a stray word; a text with no space at all is cut in the middle
  for (const [re, gap] of CUTS) { let at = 0; for (const m of s.matchAll(re)) { const i = m.index + m[0].length; if (i < s.length && Math.abs(i - s.length / 2) < Math.abs(at - s.length / 2)) at = i; } if (at) return [s.slice(0, at), s.slice(at), gap]; }
  const at = Math.ceil(s.length / 2); return [s.slice(0, at), s.slice(at), 0];
}
function join(parts, rate) {   // [audio, pause, audio, …] → one Float32Array. The model puts about 0.3 s of silence before and 0.45 s after what it says: kept at the two ends of the line, removed at each join, where the pause decides
  const cut = parts.map((p, i) => { if (typeof p === 'number') return new Float32Array(Math.round(p * rate)); const s = p.audio; let a = 0, z = s.length; if (i) while (a < z && Math.abs(s[a]) < QUIET) a++; if (i < parts.length - 1) while (z > a && Math.abs(s[z - 1]) < QUIET) z--; return s.subarray(a, z); });
  const out = new Float32Array(cut.reduce((n, c) => n + c.length, 0)); let at = 0; for (const c of cut) { out.set(c, at); at += c.length; } return out;
}
async function main() {
  const dir = process.env.AGENT_STANDUP_KOKORO_DIR, dtype = process.env.AGENT_STANDUP_KOKORO_DTYPE || 'q4';
  const req = createRequire(path.join(dir, 'node_modules', 'x.js'));   // resolve from the install folder, not from the extension
  const tf = req('@huggingface/transformers'); tf.env.cacheDir = path.join(dir, 'models');
  const { KokoroTTS } = req('kokoro-js'), load = () => KokoroTTS.from_pretrained(MODEL, { dtype, device: 'cpu' });
  let tts; try { tts = await load(); } catch (e) {
    // transformers.js writes the model straight to its final name and never checks it again: a download cut short (the worker killed while the model
    // was being fetched, e.g. by a reload of the window) leaves a file that fails to load every time after. Drop this model's files and fetch them once more.
    const onnx = path.join(dir, 'models', ...MODEL.split('/'), 'onnx'), name = FILE[dtype] || 'model'; let dropped = 0;
    for (const ext of ['.onnx', '.onnx_data']) { try { fs.unlinkSync(path.join(onnx, name + ext)); dropped++; } catch {} }
    if (!dropped) throw e; console.error('kokoro: the ' + dtype + ' model could not be loaded (' + String((e && e.message) || e).slice(0, 80) + '); fetching it again'); tts = await load();
  }
  const tok = tts.tokenizer;   // kokoro-js calls it with truncation on, which drops every phoneme past the model's limit and says nothing: count them all here and refuse instead
  if (tok) tts.tokenizer = (t, o) => { const r = tok(t, { ...o, truncation: false }); if (r.input_ids.dims.at(-1) > (tok.model_max_length || 512)) throw LONG; return r; };
  const make = async (text, o) => { let a = await tts.generate(text, o); if (!finite(a.audio)) { a = await tts.generate(text, o); if (!finite(a.audio)) throw new Error('the model returned NaN'); } return a; };   // made once more; if it fails again the server hands the line to a system voice
  const parts = async (text, o) => {   // → [audio] when the line fits (the usual case, made exactly as before), else [audio, pause, audio, …] in the order of the text
    try { return [await make(text, o)]; } catch (e) { if (e !== LONG) throw e; }
    const [a, b, gap] = halve(text); return [...await parts(a, o), gap / o.speed, ...await parts(b, o)];
  };
  send({ ready: true });
  for await (const line of readline.createInterface({ input: process.stdin })) {
    let m; try { m = JSON.parse(line); } catch { continue; }
    try {
      const ps = await parts(String(m.text).trim(), { voice: m.voice, speed: +m.speed || 1 }), rate = ps[0].sampling_rate, audio = ps.length > 1 ? join(ps, rate) : ps[0].audio;
      fs.writeFileSync(m.out, wav(audio, rate)); send({ id: m.id, ok: true, seconds: audio.length / rate });
    }
    catch (e) { send({ id: m.id, ok: false, error: String((e && e.message) || e).slice(0, 200) }); }
  }
}
main().catch((e) => { console.error(String((e && e.stack) || e)); process.exit(1); });
