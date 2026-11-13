// The loading screen as ONE file that plays on its own, for a PC screen or a stream: double-click it, or run the
// launcher written beside it to open it full screen in Edge. Nothing in it is fetched: the css and scripts are inline,
// three.js and bp's modules are data: URLs in an import map (a page opened from disk may not load module files), and
// the scene and its texture pages are data: URLs too. The mouse pointer is hidden. Never sent to players.
//
//   node dev/standalone.js [folder]     (default: dev/standalone; writes whip-loading-screen.html and the launcher)
//   node dev/standalone.js [folder] --timer
//       the same blueprint with a countdown where the logo was (dev/timer): whip-timer.html and its own launcher
//   node dev/standalone.js [folder] --slides
//       the loading screen, and Space puts words where the logo is (dev/slides): whip-slides.html and its launcher
//
// Run it again after any change to html/ (after `node dev/blueprint.js`, for a new blueprint), or to dev/timer or
// dev/slides. Each of those has settings.js (put at the top of the page), <name>.css (its font named by file, made a
// data: URL here) and <name>.js.

const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'html');
const MODES = {
    timer: { page: 'whip-timer.html', launcher: 'Play timer full screen.bat', font: 'barlow-700-latin.woff2', logo: false,
             markup: '<div id="timer" role="timer"></div>\n<div id="fade"></div>',
             says: 'Plays the whip timer full screen: Space starts and stops it. Alt+F4 closes it.' },
    slides: { page: 'whip-slides.html', launcher: 'Play slides full screen.bat', font: 'barlow-600-latin.woff2', logo: true,
              markup: '<div id="slide" aria-live="polite"></div>',
              says: 'Plays the whip loading screen full screen: Space shows the next words. Alt+F4 closes it.' },
};
const args = process.argv.slice(2);
const MODE_NAME = Object.keys(MODES).find((k) => args.includes('--' + k)) || null;
const MODE = MODE_NAME && MODES[MODE_NAME];
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'standalone'));
const PAGE = MODE ? MODE.page : 'whip-loading-screen.html';

const read = (p) => fs.readFileSync(path.join(HTML, p));
const text = (p) => read(p).toString('utf8');
const dataUrl = (mime, buf) => `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;

// Exactly once, or the build stops: a change to bp.js must not leave a file it loads behind.
function swap(src, from, to, what) {
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error(`${what}: expected ${JSON.stringify(from)} once, found it ${n} times`);
    return src.replace(from, to);
}

// A script's text inside <script>: nothing in it may close the tag.
const inline = (src) => src.replace(/<\/(script)/gi, '<\\/$1');

// ---- bp's modules, rewired to the import map and the embedded files
let bp = text('bp/bp.js');
bp = swap(bp, "from './vendor/three.module.min.js'", "from 'three'", 'bp.js three import');
bp = swap(bp, "from './anim.js'", "from 'bp-anim'", 'bp.js anim import');
bp = swap(bp, "base: new URL('./', import.meta.url).href", "base: ''", 'bp.js base');
bp = swap(bp, "fetch(opts.base + 'scene.json')", "fetch(globalThis.BP_FILES['scene.json'])", 'bp.js scene fetch');
bp = swap(bp, 'im.src = opts.base + p.file;', 'im.src = globalThis.BP_FILES[p.file];', 'bp.js texture pages');

let start = text('bp/start.js');
start = swap(start, "import('./bp.js')", "import('bp-main')", 'start.js');

const anim = text('bp/anim.js');
if (/^\s*import\s/m.test(anim)) throw new Error('anim.js now imports something: add it to the import map');
const three = read('bp/vendor/three.module.min.js');
if (/^\s*import\s|from\s*["']\.\.?\//m.test(three.toString('utf8'))) {
    throw new Error('three.module.min.js imports another file: add it to the import map');
}

// ---- the files bp loads: the scene and every texture page it names
const sceneBuf = read('bp/scene.json');
const scene = JSON.parse(sceneBuf.toString('utf8'));
const files = { 'scene.json': dataUrl('application/json', sceneBuf) };
for (const p of scene.pages) files[p.file] = dataUrl('image/webp', read(path.join('bp', p.file)));

const importMap = {
    imports: {
        three: dataUrl('text/javascript', three),
        'bp-anim': dataUrl('text/javascript', anim),
        'bp-main': dataUrl('text/javascript', bp),
    },
};

// ---- the page: index.html's body, everything inline
const index = text('index.html');
let body = index.slice(index.indexOf('<body>') + '<body>'.length, index.indexOf('</body>'))
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>\s*/g, '');   // the three script tags, inlined below instead

// ---- a mode's page: its markup in place of the logo (the logo's note and its div out), or after it; its font inline
const modeFile = (p) => fs.readFileSync(path.join(__dirname, MODE_NAME, p), 'utf8');
let modeCss = '';
if (MODE) {
    const at = body.indexOf('<div id="logo"');
    const end = body.indexOf('</div>', at);
    const note = body.lastIndexOf('<!--', at);
    if (at < 0 || body.indexOf('<div id="logo"', at + 1) >= 0 || end < 0 || !body.slice(note, at).includes('THE WHIP LOGO')) {
        throw new Error(`index.html: the logo is not where the ${MODE_NAME} page expects it`);
    }
    const after = end + '</div>'.length;
    body = MODE.logo ? body.slice(0, after) + '\n' + MODE.markup + body.slice(after)
        : body.slice(0, note) + MODE.markup + '\n\n' + body.slice(after).replace(/^\s+/, '');
    const font = dataUrl('font/woff2', fs.readFileSync(path.join(__dirname, 'sheet', 'fonts', MODE.font)));
    modeCss = swap(modeFile(MODE_NAME + '.css'), `url('${MODE.font}')`, `url('${font}')`, MODE_NAME + '.css font');
}

const logoScripts = `<script>
${inline(text('js/icons.js'))}
</script>
<script>
${inline(text('js/logo.js'))}
</script>`;
const modeScript = MODE ? `<script>
${inline(modeFile(MODE_NAME + '.js'))}
</script>` : '';

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>whip — ${MODE_NAME || 'loading'}</title>
${MODE ? `<script>\n${inline(modeFile('settings.js'))}</script>\n` : ''}<style>
${text('css/loading.css')}
${text('bp/bp.css')}
${MODE ? modeCss + '\n' : ''}/* standalone: no pointer over the screen */
html, body { cursor: none; }
</style>
<script>globalThis.BP_FILES = ${JSON.stringify(files)};</script>
<script type="importmap">${JSON.stringify(importMap)}</script>
</head>
<body>${body}
<script type="module">
${inline(start)}
</script>
${!MODE ? logoScripts : MODE.logo ? logoScripts + '\n' + modeScript : modeScript}
</body>
</html>
`;

// ---- the launcher: Edge full screen (kiosk) on a profile of its own, so it opens even while Edge is already open
const LAUNCHER = MODE ? MODE.launcher : 'Play full screen.bat';
const launcher = [
    '@echo off',
    'rem ' + (MODE ? MODE.says : 'Plays the whip loading screen full screen. Alt+F4 closes it.'),
    `rem (Or double-click ${PAGE} and press F11 in any browser.)`,
    `start "" msedge --kiosk "%~dp0${PAGE}" --edge-kiosk-type=fullscreen --no-first-run --user-data-dir="%TEMP%\\${PAGE.replace(/\.html$/, '')}"`,
    '',
].join('\r\n');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, PAGE), page);
fs.writeFileSync(path.join(OUT, LAUNCHER), launcher);
console.log(`wrote ${path.join(OUT, PAGE)} (${(Buffer.byteLength(page) / 1048576).toFixed(1)} MB) and "${LAUNCHER}"`);
