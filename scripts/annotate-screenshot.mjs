#!/usr/bin/env node
// Reusable screenshot annotator for docs/quickstart/.
//
// For each figure listed in FIGURES below, reads the raw PNG from
// docs/quickstart/raw/, overlays SVG annotations (arrows, callouts,
// labels, numbered circles, blur masks), writes the result to
// docs/quickstart/<name>.png.
//
// Coordinates are absolute pixels in the source image (origin top-left).
// Style is kept consistent across figures: red Inter-ish sans-serif text,
// 4px stroke arrows with a triangular head, 28px white-bordered numbered
// circles. Tune at the top of the file if needed.
//
// Run: node scripts/annotate-screenshot.mjs
//      node scripts/annotate-screenshot.mjs --only release-page
//
// Adding a new figure: append an entry to FIGURES with raw filename,
// output filename, and a list of annotations.

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const Dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(Dirname, "..");
const RAW_DIR = join(ROOT, "docs/quickstart/raw");
const OUT_DIR = join(ROOT, "docs/quickstart");

// ---------- Style ----------
const COLOR = "#dc2626"; // red-600 — readable on light + dark UI screenshots
const STROKE_WIDTH = 2;
const ARROW_HEAD_SIZE = 12;
const CALLOUT_RADIUS = 18;
const FONT_FAMILY = '"Inter", "Helvetica Neue", "Helvetica", "Arial", sans-serif';
const LABEL_FONT_SIZE = 22;
const LABEL_PADDING = 8;
const LABEL_BG = "rgba(255,255,255,0.95)";

// ---------- Figures ----------
const FIGURES = [
  {
    name: "release-page",
    source: "release-page.png",
    output: "release-page.png",
    annotations: [
      // Mac (Apple Silicon) — _aarch64.dmg, row 2
      {
        kind: "arrow-with-label",
        from: { x: 880, y: 416 },
        to: { x: 620, y: 416 },
        label: "Mac (M1/2/3/4)",
        labelAt: { x: 895, y: 410 },
      },
      // Windows — _x64-setup.exe, row 7
      {
        kind: "arrow-with-label",
        from: { x: 880, y: 686 },
        to: { x: 620, y: 686 },
        label: "Windows",
        labelAt: { x: 895, y: 680 },
      },
      // Mac (Intel) — _x64.dmg, row 9
      {
        kind: "arrow-with-label",
        from: { x: 880, y: 794 },
        to: { x: 620, y: 794 },
        label: "Mac (Intel)",
        labelAt: { x: 895, y: 788 },
      },
    ],
  },

  {
    name: "02-drag-to-applications",
    source: "raw-01.png",
    output: "02-drag-to-applications.png",
    // 664 × 404. App icon ~ (180, 200). Applications shortcut ~ (485, 200).
    annotations: [
      {
        kind: "arrow-with-label",
        from: { x: 220, y: 200 },
        to: { x: 425, y: 200 },
        label: "Drag to Applications",
        labelAt: { x: 235, y: 80 },
      },
    ],
  },

  {
    name: "03-damaged-dialog",
    source: "raw-02.png",
    output: "03-damaged-dialog.png",
    // 274 × 306. "Cancel" button bottom row ~ (137, 285).
    annotations: [
      {
        kind: "arrow-with-label",
        from: { x: 230, y: 285 },
        to: { x: 175, y: 285 },
        label: "Click Cancel — don't trash",
        labelAt: { x: 5, y: 30 },
      },
    ],
  },

  {
    name: "03-terminal-xattr",
    source: "raw-03.png",
    output: "03-terminal-xattr.png",
    // 648 × 195. The xattr command line is around y=70, full width.
    annotations: [
      {
        kind: "arrow-with-label",
        from: { x: 200, y: 130 },
        to: { x: 200, y: 90 },
        label: "Run this command",
        labelAt: { x: 220, y: 145 },
      },
    ],
  },

  {
    name: "04-disclaimer",
    source: "raw-04.png",
    output: "04-disclaimer.png",
    // 1363 × 1113. Green button "I understand — continue" bottom-right of
    // the card. Approx (1050, 980).
    annotations: [
      {
        kind: "arrow-with-label",
        from: { x: 1200, y: 870 },
        to: { x: 1100, y: 970 },
        label: "Click to enter the app",
        labelAt: { x: 1100, y: 855 },
      },
    ],
  },

  {
    name: "05-empty-app",
    source: "raw-05.png",
    output: "05-empty-app.png",
    // 1372 × 1119. Sidebar items at:
    //   Today    ~y=165, Classes ~y=215, History ~y=265
    //   Settings ~y=1055, About  ~y=1090
    // Main area: "Welcome" panel center ~x=685, y=560.
    annotations: [
      // Sidebar — Today
      {
        kind: "arrow-with-label",
        from: { x: 280, y: 105 },
        to: { x: 175, y: 105 },
        label: "Today — what needs attention",
        labelAt: { x: 295, y: 100 },
      },
      // Sidebar — Classes
      {
        kind: "arrow-with-label",
        from: { x: 280, y: 155 },
        to: { x: 175, y: 155 },
        label: "Classes — every class + grades",
        labelAt: { x: 295, y: 150 },
      },
      // Sidebar — History
      {
        kind: "arrow-with-label",
        from: { x: 280, y: 200 },
        to: { x: 175, y: 200 },
        label: "History — homework over time",
        labelAt: { x: 295, y: 195 },
      },
      // Sidebar — Settings (bottom)
      {
        kind: "arrow-with-label",
        from: { x: 280, y: 1055 },
        to: { x: 175, y: 1055 },
        label: "Settings — children, schedule, notifications",
        labelAt: { x: 295, y: 1030 },
      },
      // Sidebar — About
      {
        kind: "arrow-with-label",
        from: { x: 280, y: 1090 },
        to: { x: 175, y: 1090 },
        label: "About — version + links",
        labelAt: { x: 295, y: 1098 },
      },
      // Main area — arrow tip in empty space above the welcome heading
      {
        kind: "arrow-with-label",
        from: { x: 1100, y: 460 },
        to: { x: 880, y: 460 },
        label: "Main page",
        labelAt: { x: 1115, y: 455 },
      },
    ],
  },

  {
    name: "07b-children-list",
    source: "raw-08.png",
    output: "07b-children-list.png",
    // 702 × 515. Each child row: line 1 = name (KEEP), line 2 = email,
    // lines 3-4 = wrapped homework URL.
    blurs: [
      // First child "Ivy":
      //   email line — short (TeacherEase email is ~25 chars).
      { rect: { x: 75, y: 85, w: 250, h: 25 } },
      //   URL line 1 — long, reaches almost to Edit button.
      { rect: { x: 75, y: 115, w: 435, h: 25 } },
      //   URL wrap line — short.
      { rect: { x: 75, y: 145, w: 250, h: 25 } },
      // Second child "Ivy Wang" — same three lines, ~155 px below.
      { rect: { x: 75, y: 240, w: 250, h: 25 } },
      { rect: { x: 75, y: 270, w: 435, h: 25 } },
      { rect: { x: 75, y: 300, w: 250, h: 25 } },
    ],
    annotations: [],
  },

  {
    name: "07c-fetch-now",
    source: "raw-09.png",
    output: "07c-fetch-now.png",
    // 688 × 703. "Fetch now" button at ~(110, 440).
    // "Last successful fetch" header at ~y=525.
    blurs: [
      // First child name "Ivy" in last-successful list (~y=575)
      { rect: { x: 50, y: 565, w: 110, h: 25 } },
      // Second child name "Ivy Wang" (~y=620)
      { rect: { x: 50, y: 615, w: 150, h: 25 } },
    ],
    annotations: [
      {
        kind: "arrow-with-label",
        from: { x: 380, y: 440 },
        to: { x: 200, y: 440 },
        label: "Click to pull data now",
        labelAt: { x: 395, y: 435 },
      },
      {
        kind: "arrow-with-label",
        from: { x: 380, y: 525 },
        to: { x: 245, y: 525 },
        label: "Latest fetch time",
        labelAt: { x: 395, y: 520 },
      },
    ],
  },

  {
    name: "07d-today",
    source: "raw-10.png",
    output: "07d-today.png",
    // 1532 × 1183.
    // KEEP visible: page title, "X classes need attention" + counts,
    // Attention/Homework section headers, class names, scores, dates.
    // BLUR: child names in hero, assignment titles, homework descriptions.
    blurs: [
      // Hero row 1 — child name "Ivy" — narrow blur, short name.
      { rect: { x: 480, y: 100, w: 75, h: 40 } },
      // Hero row 2 — child name "Ivy Wang" — wider blur, long name.
      { rect: { x: 480, y: 245, w: 165, h: 40 } },
      // Whole Attention list — single blur covering all rows. Header
      // ("Attention" + count badge) and "RECENT" eyebrow stay visible
      // above; section ends at "OLDER (8)" toggle which stays visible.
      { rect: { x: 290, y: 460, w: 1010, h: 360 } },
      // Whole Homework list — single bulk blur. Header "Homework for
      // today" stays visible above. Rows include class names (KEEP per
      // user, but acceptable to blur) and assignment descriptions.
      { rect: { x: 290, y: 920, w: 1010, h: 280 } },
    ],
    annotations: [],
  },

  {
    name: "09a-google-security",
    source: "raw-13.png",
    output: "09a-google-security.png",
    // 2760 × 1916. Google Account → Security & sign-in (retina capture
    // ~2x the size of typical app screenshots). Text scale 2.5x for
    // readability; arrow scale 1.3x so the stroke + head stay thin/small.
    scale: 2.5,
    arrowScale: 1.3,
    // Blur Recent activity rows + everything below 2-Step Verification.
    blurs: [
      // Recent security activity — 3 rows + Review link inside card.
      // Source y range 680-1080 for the rows.
      { rect: { x: 1300, y: 680, w: 1280, h: 410 } },
      // Everything below 2-Step Verification (Passkeys / Password /
      // Skip password). Source y starts at ~1450, ends at image edge 1916.
      { rect: { x: 1300, y: 1450, w: 1280, h: 466 } },
    ],
    annotations: [
      // Arrow pointing at the "2-Step Verification" row. Row sits at
      // source y ≈ 1370, text starts at x ≈ 1500. Card extends to ~2380.
      // Arrow comes from the right (empty area past the card).
      {
        kind: "arrow-with-label",
        from: { x: 2440, y: 1370 },
        to: { x: 2200, y: 1370 },
        label: "Click",
        labelAt: { x: 2470, y: 1385 },
      },
    ],
  },

  {
    name: "10b-notifications-panel",
    source: "raw-18.png",
    output: "10b-notifications-panel.png",
    // 710 × 954. Notifications settings panel. The "Email" section
    // row shows "smtp.gmail.com · <real-gmail>@gmail.co..." — the
    // gmail address needs to be blurred before publishing.
    blurs: [
      // Gmail recipient text in the Email section header row.
      // x covers the "qiushiwang0702@gmail.co..." span, leaving
      // "smtp.gmail.com · " readable on the left.
      { rect: { x: 260, y: 200, w: 290, h: 40 }, sigma: 14 },
    ],
    annotations: [],
  },

  {
    name: "09d-app-password",
    source: "raw-16.png",
    output: "09d-app-password.png",
    // 1118 × 936. "Generated app password" dialog. The 16-character
    // password sits in a white box centered around y=305. Blur the
    // password text only — keep the box + label visible so the figure
    // still communicates the layout.
    blurs: [
      // Password text band — covers "bigv nctw pcuv tlfv" with margin.
      // High sigma so the characters become unreadable.
      { rect: { x: 280, y: 240, w: 570, h: 140 }, sigma: 30 },
    ],
    annotations: [],
  },

  {
    name: "09b-enable-2sv",
    source: "raw-14.png",
    output: "09b-enable-2sv.png",
    // 2592 × 1834. Google Account → 2-Step Verification setup page (retina).
    // Match 09a sizing for consistency across the auth-setup figures.
    scale: 2.5,
    arrowScale: 1.3,
    // Blur the 4 "Second steps" rows (Passkeys / Google prompt /
    // Authenticator / Phone number) — these expose how many devices /
    // phone numbers / passkeys the user has. Card spans x≈360-2240,
    // first row starts ≈y=1020, last row ends ≈y=1620.
    blurs: [{ rect: { x: 480, y: 1020, w: 1760, h: 600 } }],
    annotations: [
      // Arrow pointing at the "Turn on 2-Step Verification" button.
      // Button center ≈ (1295, 1740). Arrow comes from the right side.
      {
        kind: "arrow-with-label",
        from: { x: 1900, y: 1740 },
        to: { x: 1620, y: 1740 },
        label: "Click",
        labelAt: { x: 1930, y: 1755 },
      },
    ],
  },

  {
    name: "08-history",
    source: "raw-12.png",
    output: "08-history.png",
    // 1547 × 1179. History page with month dropdown + day groups +
    // homework cards. Each card: class + description on left, date
    // pill (e.g. "Tue 5/5") on right at x≈1230.
    // Bulk blur covers content column, dates remain visible.
    blurs: [{ rect: { x: 285, y: 195, w: 920, h: 765 } }],
    annotations: [],
  },

  {
    name: "07e-classes",
    source: "raw-11.png",
    output: "07e-classes.png",
    // 1548 × 1181. Each class row has: class name (large) + teacher name
    // (small subtitle below). 9 rows. Teacher names need blur.
    // Rows roughly: y=140, 250, 360, 470, 580, 690, 800, 910, 1020. Each ~110px tall.
    // Subtitle is below the class name — roughly y_row + 40.
    blurs: [
      // Bulk blur covering the class+teacher name column for all 8 rows.
      // Status badges + progress bars to the right stay visible.
      // Loses the class names too, but per user's "block the section"
      // simplification this is acceptable.
      { rect: { x: 350, y: 150, w: 460, h: 850 } },
    ],
    annotations: [],
  },
];

// ---------- SVG helpers ----------
// Per-figure `scale` multiplier (default 1) lets retina screenshots
// (e.g. 2760px-wide Google Account pages) keep arrows + labels
// visually proportional. scale=2 doubles stroke, font, padding, etc.
function styleFor(scale = 1, arrowScale = scale) {
  return {
    stroke: STROKE_WIDTH * arrowScale,
    headSize: ARROW_HEAD_SIZE * arrowScale,
    calloutRadius: CALLOUT_RADIUS * scale,
    fontSize: LABEL_FONT_SIZE * scale,
    padding: LABEL_PADDING * scale,
    rectStroke: 1.5 * scale,
  };
}

function arrowMarkerDef(s) {
  return `
    <defs>
      <marker id="arrowhead" markerWidth="${s.headSize}" markerHeight="${s.headSize}"
              refX="${s.headSize - 2}" refY="${s.headSize / 2}" orient="auto">
        <polygon points="0 0, ${s.headSize} ${s.headSize / 2}, 0 ${s.headSize}" fill="${COLOR}" />
      </marker>
    </defs>
  `;
}

function arrow(s, from, to) {
  return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
                stroke="${COLOR}" stroke-width="${s.stroke}"
                marker-end="url(#arrowhead)" stroke-linecap="round" />`;
}

function label(s, text, at) {
  const charWidth = s.fontSize * 0.55;
  const w = text.length * charWidth + s.padding * 2;
  const h = s.fontSize + s.padding * 2;
  return `
    <rect x="${at.x - s.padding}" y="${at.y - s.fontSize - s.padding / 2}"
          width="${w}" height="${h}" rx="6" ry="6"
          fill="${LABEL_BG}" stroke="${COLOR}" stroke-width="${s.rectStroke}" />
    <text x="${at.x}" y="${at.y + s.padding / 2}"
          font-family='${FONT_FAMILY}' font-size="${s.fontSize}"
          font-weight="600" fill="${COLOR}">${escapeXml(text)}</text>
  `;
}

function callout(s, num, at) {
  return `
    <circle cx="${at.x}" cy="${at.y}" r="${s.calloutRadius}"
            fill="${COLOR}" stroke="white" stroke-width="${s.rectStroke * 2}" />
    <text x="${at.x}" y="${at.y + s.fontSize / 2 - 3}" text-anchor="middle"
          font-family='${FONT_FAMILY}' font-size="${s.fontSize}"
          font-weight="700" fill="white">${num}</text>
  `;
}

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderAnnotation(s, a) {
  switch (a.kind) {
    case "arrow":
      return arrow(s, a.from, a.to);
    case "label":
      return label(s, a.text, a.at);
    case "callout":
      return callout(s, a.number, a.at);
    case "arrow-with-label":
      return arrow(s, a.from, a.to) + label(s, a.label, a.labelAt);
    default:
      throw new Error(`Unknown annotation kind: ${a.kind}`);
  }
}

// ---------- Driver ----------
const BLUR_SIGMA = 12;

async function applyBlurs(buffer, blurs) {
  if (!blurs || blurs.length === 0) return buffer;
  let out = buffer;
  for (const b of blurs) {
    const { x, y, w, h } = b.rect;
    // Extract → blur → composite back at the same position.
    const region = await sharp(out).extract({ left: x, top: y, width: w, height: h }).toBuffer();
    const blurred = await sharp(region)
      .blur(b.sigma ?? BLUR_SIGMA)
      .toBuffer();
    out = await sharp(out)
      .composite([{ input: blurred, top: y, left: x }])
      .toBuffer();
  }
  return out;
}

async function annotate(fig) {
  const sourcePath = join(RAW_DIR, fig.source);
  const outputPath = join(OUT_DIR, fig.output);
  const buffer = await readFile(sourcePath);
  const { width, height } = await sharp(buffer).metadata();

  // Apply blur regions FIRST (these modify source pixels), then composite
  // the SVG overlay (annotations sit on top of blurred regions if they
  // overlap, which is the right order — arrows over censored areas).
  const blurred = await applyBlurs(buffer, fig.blurs);

  const annotations = fig.annotations ?? [];
  const s = styleFor(fig.scale ?? 1, fig.arrowScale ?? fig.scale ?? 1);
  const overlay = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
         viewBox="0 0 ${width} ${height}">
      ${arrowMarkerDef(s)}
      ${annotations.map((a) => renderAnnotation(s, a)).join("\n")}
    </svg>
  `;

  await mkdir(OUT_DIR, { recursive: true });
  await sharp(blurred)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  const blurCount = (fig.blurs ?? []).length;
  console.log(
    `  wrote ${outputPath} (${width}×${height}, ${annotations.length} annotation${annotations.length === 1 ? "" : "s"}, ${blurCount} blur${blurCount === 1 ? "" : "s"})`,
  );
}

async function main() {
  const onlyArg = process.argv.indexOf("--only");
  const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : null;
  const targets = only ? FIGURES.filter((f) => f.name === only) : FIGURES;
  if (targets.length === 0) {
    console.error(
      `no figure matches name=${only}; available: ${FIGURES.map((f) => f.name).join(", ")}`,
    );
    process.exit(1);
  }
  for (const fig of targets) {
    console.log(`annotating ${fig.name}...`);
    await annotate(fig);
  }
  console.log(`done (${targets.length} figure${targets.length === 1 ? "" : "s"}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
