// Draws Landfall's logo from landfall/brand/logo.svg:
//   landfall/brand/logo.png              512×512, the CurseForge / Wago project image
//   landfall/Landfall/Media/Icon.tga   64×64, the in-game icon (addon list, settings page); the game loads TGA
// Run: node tools/landfall-logo.js   (rerun only when logo.svg changes; both outputs are committed)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const svg = fs.readFileSync(path.join(ROOT, "landfall", "brand", "logo.svg"));

await sharp(svg, { density: 144 }).resize(512, 512).png().toFile(path.join(ROOT, "landfall", "brand", "logo.png"));

const SIZE = 64;
const { data, info } = await sharp(svg, { density: 144 }).resize(SIZE, SIZE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// uncompressed true-colour TGA, 32 bits (BGRA), rows stored top to bottom (8 alpha bits + top-left origin)
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
fs.writeFileSync(path.join(ROOT, "landfall", "Landfall", "Media", "Icon.tga"), Buffer.concat([head, px]));

// previews at the sizes people see it (not shipped)
fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
for (const s of [128, 64, 32]) {
  await sharp(svg, { density: 144 }).resize(s, s).png().toFile(path.join(ROOT, "build", `landfall-logo-${s}.png`));
}
console.log("wrote landfall/brand/logo.png and landfall/Landfall/Media/Icon.tga");
