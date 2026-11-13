// The blueprint sheet laid flat: dev/sheet (blueprint.js and blueprint.css, written by dev/blueprint.js, with
// sheet.css's fonts and settings) in a page where the sheet is not tilted, not drifting and one CSS pixel is one
// sheet unit. export.js photographs the pieces here and reads their animations.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const SHEET = path.join(__dirname, '..', 'sheet');

/** Writes the flat page into a temp folder; its <base> points at dev/sheet. Returns its URL. */
function writeFlatPage() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-flat-'));
    const file = path.join(dir, 'flat.html');
    fs.writeFileSync(file, `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<base href="${pathToFileURL(SHEET).href}/">
<link rel="stylesheet" href="sheet.css">
<link rel="stylesheet" href="blueprint.css">
<style>
html, body { margin: 0; overflow: visible !important; background: transparent !important; width: auto !important; height: auto !important; }
#flat { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.a-move { will-change: auto !important; }
</style>
<script src="blueprint.js"></script>
</head><body><div id="flat"></div></body></html>`);
    return pathToFileURL(file).href;
}

/**
 * In the page: puts the sheet's moving layer (.a-move: the drawing and every Director run, prompt and talk on it)
 * into #flat at twice its size, so 1 CSS px = 1 sheet unit, its top left at sheet (XMIN, YMIN). Every copy and run is
 * put in (the live page leaves out what is not in play). Returns the sheet's numbers from the markup.
 */
const SETUP = `(() => {
    const host = document.createElement('div');
    host.innerHTML = window.WhipBlueprint;
    const root = host.firstElementChild;
    const defs = root.querySelector('svg');
    const move = root.querySelector('.a-move');
    const flat = document.getElementById('flat');
    flat.append(defs, move);
    flat.style.transform = 'scale(2)';
    move.style.left = '0px'; move.style.top = '0px';
    for (const el of document.querySelectorAll('[data-k]')) el.style.display = '';
    window.__bpRoot = root;   // the rest of the stage (its ground, the sweep, the bands): page.js reads it
    const per = Number(root.getAttribute('data-per'));
    const svg = move.querySelector('svg');
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    return { per, viewBox: vb, seen: root.getAttribute('data-seen').split(' ').map(Number), moveW: move.offsetWidth, moveH: move.offsetHeight };
})()`;

module.exports = { writeFlatPage, SETUP, SHEET };
