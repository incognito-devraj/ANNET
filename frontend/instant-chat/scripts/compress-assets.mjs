import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ASSETS = resolve("public/assets");

async function compress(file, opts) {
  const input  = resolve(ASSETS, file);
  // Output as WebP — far smaller than PNG at same visual quality
  const output = resolve(ASSETS, file.replace(/\.png$/i, ".webp"));

  const original = readFileSync(input).length;

  await sharp(input)
    .webp(opts)
    .toFile(output);

  const compressed = readFileSync(output).length;
  const saved = (((original - compressed) / original) * 100).toFixed(1);
  console.log(`✓ ${file}`);
  console.log(`  ${(original/1024).toFixed(0)} KB  →  ${(compressed/1024).toFixed(0)} KB  (${saved}% smaller) → ${file.replace(/\.png$/i, ".webp")}`);
  return output;
}

console.log("\n── Compressing assets ──────────────────────\n");

await compress("logo.png", {
  quality: 82,       // high visual quality — glossy logo needs it
  lossless: false,
  effort: 6,         // 0–6, higher = better compression
});

await compress("Cinematic Blue Earth Horizon.png", {
  quality: 72,       // photo — lossy is fine, saves a lot
  lossless: false,
  effort: 6,
});

console.log("\n────────────────────────────────────────────\n");
console.log("Remember to update src/pages/Landing.tsx to point to .webp files.\n");
