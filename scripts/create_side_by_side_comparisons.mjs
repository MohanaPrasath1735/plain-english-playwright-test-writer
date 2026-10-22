import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const compareDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885\\qa_comparison';

const pairs = [
  {
    id: 1,
    title: 'Problem 1: Rotated Verdict Stamps & Badges Contrast & Opacity',
    before: path.join(compareDir, 'problem1_verdict_stamps_before_light.png'),
    after: path.join(compareDir, 'problem1_verdict_stamps_after_light.png'),
    out: path.join(compareDir, 'problem1_side_by_side.png'),
    notes: 'Before: Opacity 0.92 reduced contrast to 3.97:1 (WCAG AA failure). After: Deep semantic green/red/amber tokens with 100% opacity (>6.1:1 contrast).'
  },
  {
    id: 2,
    title: 'Problem 2: Timeline Station Badge Contrast in Light Theme',
    before: path.join(compareDir, 'problem2_timeline_stations_before_light.png'),
    after: path.join(compareDir, 'problem2_timeline_stations_after_light.png'),
    out: path.join(compareDir, 'problem2_side_by_side.png'),
    notes: 'Before: .station-badge.badge-pass had #15803d on #dcfce7 (3.97:1). After: #166534 bold on #dcfce7 (6.10:1).'
  },
  {
    id: 3,
    title: 'Problem 3: Timeline Station 1 Name Wrapping / Truncation',
    before: path.join(compareDir, 'problem3_station_title_before_light.png'),
    after: path.join(compareDir, 'problem3_station_title_after_light.png'),
    out: path.join(compareDir, 'problem3_side_by_side.png'),
    notes: 'Before: Font size 13px wrapped Syne text into "Understan\\nd". After: 11px font with 800 weight fits "1. Understand" cleanly.'
  },
  {
    id: 4,
    title: 'Problem 4: Timeline Toggle Button Awkward 3-Line Wrapping in col-tc',
    before: path.join(compareDir, 'problem4_col_tc_button_before_light.png'),
    after: path.join(compareDir, 'problem4_col_tc_button_after_light.png'),
    out: path.join(compareDir, 'problem4_side_by_side.png'),
    notes: 'Before: 72px column squeezed button text into 3 lines. After: 96px column with nowrap creates a clean single-line pill button.'
  },
  {
    id: 5,
    title: 'Problem 5: Dark Theme Subtle Text Contrast in Site Check',
    before: path.join(compareDir, 'problem5_safety_hint_dark_before.png'),
    after: path.join(compareDir, 'problem5_safety_hint_dark_after.png'),
    out: path.join(compareDir, 'problem5_side_by_side.png'),
    notes: 'Before: #64748b on #0a0d14 was 4.08:1. After: #94a3b8 on #0a0d14 is 7.30:1 (exceeds WCAG AA).'
  }
];

async function generateSideBySide() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const p of pairs) {
    const beforeB64 = fs.readFileSync(p.before).toString('base64');
    const afterB64 = fs.readFileSync(p.after).toString('base64');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #f8fafc;
            display: inline-block;
          }
          .header {
            margin-bottom: 16px;
          }
          h2 {
            margin: 0 0 6px 0;
            font-size: 18px;
            color: #38bdf8;
          }
          .notes {
            font-size: 13px;
            color: #94a3b8;
          }
          .grid {
            display: flex;
            gap: 20px;
          }
          .card {
            background: #1e293b;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #334155;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
          .card-title {
            padding: 8px 14px;
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .card-title.before {
            background: #7f1d1d;
            color: #fecaca;
          }
          .card-title.after {
            background: #14532d;
            color: #bbf7d0;
          }
          .card img {
            display: block;
            max-width: 650px;
            height: auto;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <div id="container">
          <div class="header">
            <h2>${p.title}</h2>
            <div class="notes">${p.notes}</div>
          </div>
          <div class="grid">
            <div class="card">
              <div class="card-title before">BEFORE FIX (Defect)</div>
              <img src="data:image/png;base64,${beforeB64}" />
            </div>
            <div class="card">
              <div class="card-title after">AFTER FIX (Verified)</div>
              <img src="data:image/png;base64,${afterB64}" />
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html);
    const container = await page.$('#container');
    if (container) {
      await container.screenshot({ path: p.out });
      console.log(`Generated side-by-side: ${path.basename(p.out)}`);
    }
  }

  await browser.close();
}

generateSideBySide().catch(err => {
  console.error(err);
  process.exit(1);
});
