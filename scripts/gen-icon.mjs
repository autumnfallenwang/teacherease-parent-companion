// One-off icon generator. Reads an inline SVG design, renders it to a 1024x1024
// PNG at `src-tauri/icons/_source.png`, then `pnpm tauri icon` regenerates the
// full multi-platform icon set from that source.
//
// Design: warm ivory rounded-square background with a bold teal pennant-flag
// glyph. Flat and minimal. The pennant nods to the app's actual job — flagging
// assignments that need attention — without being literal about graduation or
// grading. Single color on single background; reads cleanly at 32px.
//
// Usage:
//   node scripts/gen-icon.mjs
//   pnpm tauri icon src-tauri/icons/_source.png

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const Dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(Dirname, "..");

const SIZE = 1024;
const RADIUS = 229; // 22.37% of 1024 — macOS Big Sur icon mask radius

// Flipped palette per user feedback: light background, dark foreground.
const BG = "#F5EFDF";
const FG = "#2E8B8E";

// Pennant geometry. The flag hangs off a pole that runs top-to-bottom. The
// pennant itself is a pointed triangle cutting to the right, giving the icon
// a clear sense of motion without being literal about "notification".
//
// All coords are in the 1024x1024 canvas. The pole sits slightly left of
// center so the pennant's rightward extension balances the composition.

const POLE_X = 360; // vertical pole position (left of center)
const POLE_TOP = 180; // top of pole
const POLE_BOTTOM = 844; // bottom of pole
const POLE_WIDTH = 60; // thickness of the pole
const FINIAL_RADIUS = 50; // decorative ball on top of the pole

// Pennant: a triangle whose apex points right, base attached to the pole.
const PENNANT_TOP = 240; // top of the pennant (below the finial)
const PENNANT_BOTTOM = 540; // bottom of the pennant
const PENNANT_BASE_X = POLE_X; // base sits on the pole's left edge
const PENNANT_TIP_X = 820; // rightmost point of the triangle
const PENNANT_TIP_Y = (PENNANT_TOP + PENNANT_BOTTOM) / 2; // vertically centered

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <!-- Ivory rounded-square background -->
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="${BG}"/>

  <!-- Pole, with rounded top/bottom edges so it reads as a single clean line -->
  <rect x="${POLE_X}" y="${POLE_TOP}" width="${POLE_WIDTH}"
        height="${POLE_BOTTOM - POLE_TOP}"
        rx="${POLE_WIDTH / 2}" ry="${POLE_WIDTH / 2}" fill="${FG}"/>

  <!-- Finial: a simple filled circle on top of the pole -->
  <circle cx="${POLE_X + POLE_WIDTH / 2}" cy="${POLE_TOP}" r="${FINIAL_RADIUS}" fill="${FG}"/>

  <!-- Pennant: pointed flag extending to the right -->
  <path d="M ${PENNANT_BASE_X} ${PENNANT_TOP}
           L ${PENNANT_TIP_X} ${PENNANT_TIP_Y}
           L ${PENNANT_BASE_X} ${PENNANT_BOTTOM}
           Z"
        fill="${FG}"/>
</svg>`;

const outPath = resolve(REPO_ROOT, "src-tauri/icons/_source.png");
writeFileSync(outPath.replace(/\.png$/, ".svg"), svg);
await sharp(Buffer.from(svg)).png().resize(SIZE, SIZE).toFile(outPath);
console.log(`wrote ${outPath}`);
console.log(`next: pnpm tauri icon ${outPath}`);
