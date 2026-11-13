// Starts the three.js blueprint on #bp. If it cannot run (no WebGL 2, or a file failing to load), the screen stays black
// under the logo: there is no other version to fall back on (the sheet it is made from would eat the memory this saves).
// WebGL 2 is asked for first, so a game that has none doesn't download three.js for nothing.
const canvas = document.getElementById('bp');
const ready = () => document.documentElement.classList.add('bp-ready');
const fail = (e) => {
    if (e) console.error(e);
    if (canvas) canvas.remove();
    ready();   // the curtain lifts onto black, the logo on it
};
// (its own canvas: asking #bp would fix its context's settings before three.js chooses them). Let go once answered: a
// live context costs GPU memory for the whole load, beside three.js's own (audit 20, CLI-7).
const probe = document.createElement('canvas').getContext('webgl2');
const gl2 = !!probe;
if (probe) { const lose = probe.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
if (!canvas || !gl2) fail();
else {
    canvas.addEventListener('bp-ready', ready);
    import('./bp.js').then(({ start }) => start(canvas)).then((ok) => { if (!ok) fail(); }, fail);
}
