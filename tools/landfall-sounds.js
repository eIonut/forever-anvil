// Synthesizes Landfall's two sounds (original: additive synthesis, no samples) as WAV in build/landfall-sounds/.
// tools/landfall-sounds.ps1 then encodes them to landfall/Landfall/Media/Sounds/*.mp3 for the game.
// Run: node tools/landfall-sounds.js; powershell -ExecutionPolicy Bypass -File tools/landfall-sounds.ps1
//
// Arriving in a zone (quiet on purpose: you hear them often):
//   swell     a soft, warm chord swelling in, with a bell on top
//   horn      a distant horn call, two notes
//   bells     three bells falling gently
//   harp      a harp rising
// A first visit or a new area:
//   chime     two plucked notes rising and a sparkle
//   sparkle   a scatter of high bells
// A place far above your level:
//   drum      three war-drum beats under a low, uneasy horn
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../build/landfall-sounds");
const RATE = 44100;

let seed = 7654321; // seeded, so every run writes the same files
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));
const note = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
};

/** A decaying sine (a partial of a bell). */
function partial(buf, t0, freq, amp, decay, attack = 0.003) {
  const start = Math.floor(t0 * RATE);
  const len = Math.min(buf.length - start, Math.ceil(decay * 7 * RATE));
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    buf[start + i] += amp * Math.min(1, t / attack) * Math.exp(-t / decay) * Math.sin(phase + 2 * Math.PI * freq * t);
  }
}

function bell(buf, t0, freq, amp, ring = 1) {
  [[1, 1, 1.4], [2.76, 0.32, 0.5], [5.4, 0.12, 0.22]].forEach(([r, a, d]) => {
    if (freq * r < 18000) partial(buf, t0, freq * r, amp * a, d * ring);
  });
}

/** A soft pad note: a few harmonics, slow in, slow out, slightly detuned pairs for warmth. */
function pad(buf, t0, freq, amp, length, attack = 0.7, release = 1.2) {
  const start = Math.floor(t0 * RATE);
  const len = Math.min(buf.length - start, Math.ceil((length + release) * RATE));
  const parts = [[1, 1], [2, 0.35], [3, 0.12]];
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) ** 2 * (t > length ? Math.exp(-(t - length) / (release / 3)) : 1);
    let s = 0;
    for (const [h, a] of parts) {
      s += a * (Math.sin(2 * Math.PI * freq * h * t) + Math.sin(2 * Math.PI * freq * h * 1.003 * t)) / 2;
    }
    buf[start + i] += amp * env * s;
  }
}

/** A brass note: harmonics that brighten as it swells. */
function brass(buf, t0, freq, amp, length, attack = 0.12) {
  const start = Math.floor(t0 * RATE);
  const len = Math.min(buf.length - start, Math.ceil((length + 0.6) * RATE));
  const phases = Array.from({ length: 10 }, () => rand() * Math.PI * 2);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) * (t > length ? Math.exp(-(t - length) / 0.2) : 1);
    const bright = 0.3 + 0.35 * env;
    let s = 0;
    for (let k = 1; k <= 10; k++) {
      if (freq * k > 12000) break;
      s += (bright ** (k - 1) / k) * Math.sin(phases[k - 1] + 2 * Math.PI * freq * k * t * (1 + 0.003 * Math.sin(2 * Math.PI * 5 * t)));
    }
    buf[start + i] += amp * env * s;
  }
}

/** A deep drum: a falling sine thump and a little noise for the skin. */
function drum(buf, t0, amp) {
  const start = Math.floor(t0 * RATE);
  const len = Math.min(buf.length - start, Math.ceil(0.9 * RATE));
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const f = 48 + 70 * Math.exp(-t / 0.05);
    phase += 2 * Math.PI * f / RATE;
    const body = Math.sin(phase) * Math.exp(-t / 0.28);
    const skin = (rand() * 2 - 1) * Math.exp(-t / 0.02) * 0.3;
    buf[start + i] += amp * (body + skin);
  }
}

/** A plucked string (Karplus-Strong). */
function pluck(buf, t0, freq, amp, length = 1.4) {
  const start = Math.floor(t0 * RATE);
  const period = Math.max(2, Math.round(RATE / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = rand() * 2 - 1;
  const len = Math.min(buf.length - start, Math.ceil(length * RATE));
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % period;
    const v = ring[idx];
    ring[idx] = 0.4985 * (ring[idx] + ring[next]);
    idx = next;
    buf[start + i] += amp * v * Math.min(1, i / 60);
  }
}

/** Schroeder reverb: a hall's tail, mixed in. */
function reverb(buf, mix = 0.3, feedback = 0.84) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  const alls = [225, 556, 441].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  const out = new Float32Array(buf.length);
  for (let n = 0; n < buf.length; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.b[c.i];
      c.b[c.i] = buf[n] + y * feedback;
      c.i = (c.i + 1) % c.d;
      s += y;
    }
    s /= combs.length;
    for (const a of alls) {
      const y = a.b[a.i];
      const v = s + y * 0.5;
      a.b[a.i] = v;
      a.i = (a.i + 1) % a.d;
      s = y - v * 0.5;
    }
    out[n] = buf[n] * (1 - mix) + s * mix;
  }
  return out;
}

/** Peak to `peakDb`, fade at the end, 16-bit mono WAV. */
function write(name, buf, peakDb = -3) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 10 ** (peakDb / 20) / peak : 1;
  const fade = Math.floor(0.3 * RATE);
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    const f = i > buf.length - fade ? (buf.length - i) / fade : 1;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * gain * f)) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.concat([head, data]));
  console.log(`${name}.wav  ${(buf.length / RATE).toFixed(2)} s`);
}

fs.mkdirSync(OUT, { recursive: true });

// arrive: a warm open chord swelling in (C, G, E), then one clear bell over it
{
  const b = buffer(4);
  pad(b, 0, note("C3"), 0.5, 1.4);
  pad(b, 0.05, note("G3"), 0.4, 1.35);
  pad(b, 0.1, note("E4"), 0.25, 1.3);
  bell(b, 0.55, note("G5"), 0.35, 1.4);
  bell(b, 0.55, note("C6"), 0.12, 1.2);
  write("swell", reverb(b, 0.35), -6);
}

// discover: two plucks a fifth apart, and a high sparkle as the stamp lands
{
  const b = buffer(2.4);
  pluck(b, 0.0, note("E5"), 0.6, 1.6);
  pluck(b, 0.12, note("B5"), 0.6, 1.6);
  bell(b, 0.12, note("E6"), 0.4, 0.9);
  bell(b, 0.22, note("B6"), 0.25, 0.7);
  write("chime", reverb(b, 0.3), -4);
}

// horn: a distant call, a fifth up, held
{
  const b = buffer(4);
  brass(b, 0.0, note("G3"), 0.5, 0.7, 0.18);
  brass(b, 0.0, note("G2"), 0.25, 0.7, 0.18);
  brass(b, 0.8, note("D4"), 0.5, 1.4, 0.15);
  brass(b, 0.8, note("G3"), 0.3, 1.4, 0.15);
  write("horn", reverb(b, 0.45, 0.86), -7);
}

// bells: three falling gently
{
  const b = buffer(3.6);
  [["C6", 0], ["G5", 0.4], ["E5", 0.8]].forEach(([n, t]) => bell(b, t, note(n), 0.5, 1.6));
  write("bells", reverb(b, 0.35), -6);
}

// harp: rising through a major chord
{
  const b = buffer(3);
  ["C4", "E4", "G4", "C5", "E5", "G5", "C6"].forEach((n, i) => pluck(b, 0.01 + i * 0.08, note(n), 0.5, 2));
  write("harp", reverb(b, 0.35), -6);
}

// sparkle: high bells scattered like light
{
  const b = buffer(2.2);
  ["E6", "B6", "G#6", "E7", "B6", "E7"].forEach((n, i) => bell(b, 0.02 + i * 0.07 + rand() * 0.03, note(n), 0.35 - i * 0.03, 0.6));
  write("sparkle", reverb(b, 0.35), -5);
}

// drum: three war-drum beats under a low, uneasy horn
{
  const b = buffer(3.2);
  drum(b, 0.0, 1);
  drum(b, 0.42, 0.85);
  drum(b, 0.84, 1);
  brass(b, 0.3, note("D3"), 0.22, 1.6, 0.5);
  brass(b, 0.3, note("D#3"), 0.16, 1.6, 0.5);
  write("drum", reverb(b, 0.3), -3);
}
