#!/usr/bin/env node
// Generates assets/icon.png (512x512) from an SVG using Puppeteer or Chrome.
const { execSync } = require('child_process');
const { writeFileSync, mkdirSync } = require('fs');
const path = require('path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#8b7bff"/><stop offset=".55" stop-color="#6a55ff"/><stop offset="1" stop-color="#ffb547"/>
</linearGradient></defs>
<rect width="512" height="512" rx="96" fill="url(#g)"/>
<g fill="#fff" transform="translate(64 64) scale(8)">
<ellipse cx="12.6" cy="21.2" rx="4" ry="5"/>
<ellipse cx="19.6" cy="13.2" rx="4" ry="5"/>
<ellipse cx="28.4" cy="13.2" rx="4" ry="5"/>
<ellipse cx="35.4" cy="21.2" rx="4" ry="5"/>
<path d="M24 24.4c-6 0-10.8 5.6-10.8 10 0 3.4 2.8 5.2 5.8 5.2 2.2 0 3.4-1 5-1s2.8 1 5 1c3 0 5.8-1.8 5.8-5.2 0-4.4-4.8-10-10.8-10z"/>
</g></svg>`;

const out = path.join(__dirname, '..', 'assets', 'icon.png');
mkdirSync(path.dirname(out), { recursive: true });

// Use rsvg-convert if available, otherwise fall back to sips
const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
writeFileSync(svgPath, SVG);

try {
  execSync(`which rsvg-convert`, { stdio: 'ignore' });
  execSync(`rsvg-convert -w 512 -h 512 "${svgPath}" -o "${out}"`);
  console.log('Icon generated with rsvg-convert');
} catch {
  // Fall back: use sips (macOS) to convert SVG → PNG
  try {
    // sips doesn't handle SVG well, so use qlmanage
    execSync(`qlmanage -t -s 512 -o "${path.dirname(out)}" "${svgPath}" 2>/dev/null`);
    const qlOut = svgPath + '.png';
    const { renameSync, existsSync } = require('fs');
    if (existsSync(qlOut)) renameSync(qlOut, out);
    console.log('Icon generated with qlmanage');
  } catch {
    console.log('Could not generate icon automatically — place a 512x512 PNG at assets/icon.png');
  }
}
