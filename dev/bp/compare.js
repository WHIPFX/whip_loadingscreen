// The blueprint sheet (dev/sheet, played as a web page by its stage.js) and the three.js screen (html/bp) at the same
// moments, side by side, with what differs: for checking the screen after a change to the sheet or to bp/.
//
//   node dev/bp/compare.js <outDir> [width height] [t1,t2,...]
//   CHROME=<chromium 103's chrome.exe> node dev/bp/compare.js ...    in FiveM's browser
//
// Both pages are without the logo (the logo's I lights a random icon each time). Writes cmp-<t>.png (the two at half
// size over their difference x4), live-<t>.png (the sheet) and new-<t>.png (the screen), and prints the mean difference.
const fs = require('fs');
const path = require('path');
const { open, sleep } = require('./cdp');
const { serve } = require('./serve');

const [outDir = 'compare', W = '1920', H = '1080', times = '3,9,20,47'] = process.argv.slice(2);
// the two pages, made here: the sheet played (beside its own files), and the screen's blueprint alone
const PAGES = {
    '/__sheet/__live.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="sheet.css"><link rel="stylesheet" href="blueprint.css"></head>
<body><div id="stage" aria-hidden="true"></div><script src="blueprint.js"></script><script src="stage.js"></script></body></html>`,
    '/__new.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="css/loading.css"><link rel="stylesheet" href="bp/bp.css"></head>
<body><canvas id="bp" aria-hidden="true"></canvas><div id="curtain"></div><script type="module" src="bp/start.js"></script></body></html>`,
};

(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const { server, base: BASE } = await serve(0, PAGES);
    const c = await open();
    const shots = {};
    try {
        await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
        await c.send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
        const ts = times.split(',').map(Number);
        // the sheet: every animation paused at t (stage.js holds the parts it brings in to the same moment)
        await c.send('Page.navigate', { url: `${BASE}/__sheet/__live.html` });
        await sleep(3000);
        for (const t of ts) {
            const pause = `document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ${t * 1000}; }); true`;
            await c.eval(pause); await sleep(700); await c.eval(pause); await sleep(300);
            shots['live-' + t] = Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
        }
        await c.send('Page.navigate', { url: `${BASE}/__new.html` });
        for (let i = 0; i < 60; i++) { await sleep(250); if (await c.eval('!!window.__bp')) break; }
        if (!(await c.eval('!!window.__bp'))) throw new Error('the three.js blueprint did not start');
        await sleep(2000);
        for (const t of ts) {
            await c.eval(`(document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 5000; }), window.__bp.hold(${t}), true)`);
            await sleep(500);
            shots['new-' + t] = Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
        }
        console.log('stats', JSON.stringify(await c.eval('window.__bp.stats()')));
        for (const t of ts) {
            const a = shots['live-' + t].toString('base64'), b = shots['new-' + t].toString('base64');
            const url = await c.eval(`(async () => {
                const load = (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; return i.decode().then(() => i); };
                const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
                const w = A.width, h = A.height;
                const cv = document.createElement('canvas'); cv.width = w; cv.height = h * 1.5; const g = cv.getContext('2d');
                g.drawImage(A, 0, 0, w, h, 0, 0, w / 2, h / 2); g.drawImage(B, 0, 0, w, h, w / 2, 0, w / 2, h / 2);
                const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; const tg = tmp.getContext('2d');
                tg.drawImage(A, 0, 0); const da = tg.getImageData(0, 0, w, h); tg.drawImage(B, 0, 0); const db = tg.getImageData(0, 0, w, h);
                let sum = 0;
                for (let i = 0; i < da.data.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(da.data[i + k] - db.data[i + k]); sum += d; da.data[i + k] = Math.min(255, d * 4); }
                tg.putImageData(da, 0, 0);
                g.drawImage(tmp, 0, 0, w, h, 0, h / 2, w, h);
                window.__diff = (sum / (w * h * 3)).toFixed(2);
                return cv.toDataURL('image/png');
            })()`);
            fs.writeFileSync(path.join(outDir, `cmp-${t}.png`), Buffer.from(url.split(',')[1], 'base64'));
            fs.writeFileSync(path.join(outDir, `live-${t}.png`), shots['live-' + t]);
            fs.writeFileSync(path.join(outDir, `new-${t}.png`), shots['new-' + t]);
            console.log(`t=${t}s mean difference ${await c.eval('window.__diff')} (0-255)`);
        }
        if (c.errors.length) console.log('page errors:', JSON.stringify(c.errors.map((e) => e.exception && e.exception.description || e.text)).slice(0, 1500));
    } finally {
        c.close();
        server.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
