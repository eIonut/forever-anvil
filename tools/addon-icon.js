// Draws the addon's in-game icon (minimap button, menu header, addon list) from the site's crest
// (public/img/logo.svg) as a 64×64 TGA with transparency: the game loads TGA and BLP textures, not PNG or SVG.
//   node tools/addon-icon.js  →  addon/ForeverAnvil/Media/Icon.tga   (committed: rerun only when the crest changes)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SIZE = 64;
const OUT = path.join(process.cwd(), "addon", "ForeverAnvil", "Media", "Icon.tga");
const svg = fs.readFileSync(path.join(process.cwd(), "public", "img", "logo.svg"));

const { data, info } = await sharp(svg, { density: 384 }).resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// uncompressed true-colour TGA, 32 bits (BGRA), rows stored top to bottom (descriptor: 8 alpha bits + top-left origin)
const head = Buffer.alloc(18);
head[2] = 2;
head.writeUInt16LE(info.width, 12);
head.writeUInt16LE(info.height, 14);
head[16] = 32;
head[17] = 0x28;
const px = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < px.length; i += 4) {
  px[i] = data[i + 2];
  px[i + 1] = data[i + 1];
  px[i + 2] = data[i];
  px[i + 3] = data[i + 3];
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([head, px]));
// a PNG copy to look at (not shipped)
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(path.join(process.cwd(), "build", "addon-icon-preview.png"));
console.log("wrote", path.relative(process.cwd(), OUT));
