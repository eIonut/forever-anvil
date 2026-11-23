// Draws Landfall's divider (landfall/Landfall/Media/Divider.tga): a white ornamental rule, tinted gold in game,
// opened from its middle when a card shows. A line that fades towards its ends, a diamond in the middle with
// a short bar either side, and two small dots. The game loads TGA. Run: node tools/landfall-media.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../landfall/Landfall/Media");
const W = 512;
const H = 32;
const clamp = (v) => Math.max(0, Math.min(1, v));
// soft-edged shape: 1 inside, fading over `soft` pixels outside
const soft = (d, edge = 1) => clamp(1 - d / edge);

function alpha(px, py) {
  const cx = W / 2;
  const cy = H / 2;
  const dx = px - cx;
  const dy = py - cy;
  const u = Math.abs(dx) / cx; // 0 in the middle, 1 at the ends
  let a = 0;
  // the rule: 1.6 px thick with a faint glow, fading out to the ends
  const fade = Math.pow(clamp(1 - u), 1.4);
  a = Math.max(a, soft(Math.abs(dy) - 0.8) * fade);
  a = Math.max(a, 0.18 * clamp(1 - Math.abs(dy) / 5) * fade);
  // the diamond, and its outline ring
  const diamond = Math.abs(dx) + Math.abs(dy);
  a = Math.max(a, soft(diamond - 7));
  a = Math.max(a, 0.55 * soft(Math.abs(diamond - 11) - 0.6));
  // short thicker bars beside the diamond
  if (Math.abs(dx) > 14 && Math.abs(dx) < 46) a = Math.max(a, soft(Math.abs(dy) - 1.6) * (1 - (Math.abs(dx) - 14) / 40));
  // two dots further out
  for (const ox of [-70, 70]) a = Math.max(a, soft(Math.hypot(dx - ox, dy) - 2.2));
  return clamp(a);
}

const head = Buffer.alloc(18);
head[2] = 2;
head.writeUInt16LE(W, 12);
head.writeUInt16LE(H, 14);
head[16] = 32;
head[17] = 8 | 0x20; // 8 alpha bits, top-left origin
const px = Buffer.alloc(W * H * 4);
const SS = 4; // supersampling, for smooth edges
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    let sum = 0;
    for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) sum += alpha(i + (a + 0.5) / SS, j + (b + 0.5) / SS);
    const o = (j * W + i) * 4;
    px[o] = px[o + 1] = px[o + 2] = 255;
    px[o + 3] = Math.round((sum / (SS * SS)) * 255);
  }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "Divider.tga"), Buffer.concat([head, px]));
console.log("wrote landfall/Landfall/Media/Divider.tga");

// Plaque.tga: the bronze style's plaque, in colour (not tinted in game). 256×128, drawn as three slices
// (ends 0-64 and 192-256, a middle that stretches): dark bronze with cut corners, a bright bevelled rim,
// a thin inner rule, a diamond at each end, and a soft shadow around it.
{
  const PW = 256;
  const PH = 128;
  const M = 10; // margin for the shadow
  const CUT = 18; // the cut corners
  const lerp = (a, b, t) => a + (b - a) * t;
  // distance inside the plaque's shape (cut-corner rectangle), negative outside
  const inside = (x, y) => {
    const l = x - M, r = PW - M - x, t = y - M, b = PH - M - y;
    const edge = Math.min(l, r, t, b);
    const corner = Math.min(l, r) + Math.min(t, b) - CUT; // the 45° cuts
    return Math.min(edge, corner / Math.SQRT2);
  };
  const plaque = Buffer.alloc(PW * PH * 4);
  for (let j = 0; j < PH; j++) {
    for (let i = 0; i < PW; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sa = 0; sa < SS; sa++) for (let sb = 0; sb < SS; sb++) {
        const x = i + (sa + 0.5) / SS;
        const y = j + (sb + 0.5) / SS;
        const d = inside(x, y);
        let cr, cg, cb, ca;
        if (d < 0) {
          // shadow outside the rim
          cr = cg = cb = 0;
          ca = 0.55 * clamp(1 + d / M) ** 2;
        } else {
          const v = (y - M) / (PH - 2 * M); // 0 top, 1 bottom
          // the body: warm dark bronze, a touch lighter at the top
          cr = lerp(58, 30, v); cg = lerp(42, 21, v); cb = lerp(24, 12, v); ca = 0.94;
          // the rim: bright bronze, lit from above
          if (d < 3.2) {
            const lit = lerp(1, 0.55, v);
            cr = 217 * lit; cg = 170 * lit; cb = 98 * lit; ca = 1;
          } else if (d < 4.4) {
            cr = 40; cg = 27; cb = 14; ca = 1; // a dark line inside the rim
          }
          // the inner rule
          if (Math.abs(d - 8) < 0.7) { cr = 150; cg = 113; cb = 60; ca = 1; }
          // a diamond at each end, on the inner rule's level
          for (const cx of [M + 16, PW - M - 16]) {
            const dd = Math.abs(x - cx) + Math.abs(y - PH / 2);
            if (dd < 7) { cr = 228; cg = 188; cb = 112; ca = 1; }
            else if (dd < 8.5) { cr = 40; cg = 27; cb = 14; ca = 1; }
          }
        }
        r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
      }
      const n = SS * SS;
      const o = (j * PW + i) * 4;
      const alpha = a / n;
      // BGRA, colour un-premultiplied
      plaque[o] = alpha > 0 ? Math.round(b / a) : 0;
      plaque[o + 1] = alpha > 0 ? Math.round(g / a) : 0;
      plaque[o + 2] = alpha > 0 ? Math.round(r / a) : 0;
      plaque[o + 3] = Math.round(alpha * 255);
    }
  }
  const ph = Buffer.alloc(18);
  ph[2] = 2;
  ph.writeUInt16LE(PW, 12);
  ph.writeUInt16LE(PH, 14);
  ph[16] = 32;
  ph[17] = 8 | 0x20;
  fs.writeFileSync(path.join(OUT, "Plaque.tga"), Buffer.concat([ph, plaque]));
  console.log("wrote landfall/Landfall/Media/Plaque.tga");
}
