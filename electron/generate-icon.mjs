import sharp from "sharp";
import { mkdirSync, readFileSync, rmSync } from "fs";
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, "icon.svg");
const iconsetDir = join(__dirname, "icon.iconset");
const icnsPath = join(__dirname, "icon.icns");

const svg = readFileSync(svgPath);

// macOS iconset sizes
const sizes = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

// Clean and create iconset directory
rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

// Generate all sizes
await Promise.all(
  sizes.map(({ name, size }) =>
    sharp(svg, { density: Math.round((72 * size) / 1024) * 10 })
      .resize(size, size)
      .png()
      .toFile(join(iconsetDir, name)),
  ),
);

// Convert to .icns using macOS iconutil
execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);

// Also generate a 1024px PNG for Electron's icon option (used on Linux/Windows)
await sharp(svg, { density: 720 })
  .resize(1024, 1024)
  .png()
  .toFile(join(__dirname, "icon.png"));

// Clean up iconset directory
rmSync(iconsetDir, { recursive: true, force: true });

console.log("Generated icon.icns and icon.png");
