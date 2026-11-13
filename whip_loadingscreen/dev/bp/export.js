// The blueprint as a scene for the three.js screen (html/bp/bp.js): every piece of the sheet photographed flat by the
// browser that draws it, packed into texture pages, with where it lies and its animations' keyframes as the browser
// holds them. The screen lays the pieces on one tilted plane and plays the keyframes: the same picture, for a fraction
// of the memory the sheet itself would take.
//
//   node dev/blueprint.js        writes the sheet, then runs this (on its own: node dev/bp/export.js)
//
// Reads dev/sheet (blueprint.js and blueprint.css, written by dev/blueprint.js) and writes html/bp/scene.json and
// html/bp/atlas-N.webp. Needs Chrome (C:/Program Files/Google/Chrome); nothing in dev/ is sent to players.
const fs = require('fs');
const path = require('path');
const { open } = require('./cdp');
const { writeFlatPage, SETUP } = require('./flat');

const OUT = path.join(__dirname, '..', '..', 'html', 'bp');
// Texture pixels per sheet unit, as the live page draws each kind: a layer under a perspective is rastered at one
// pixel per its own CSS pixel, and the sheet's SVG is built at half size (dev/blueprint.js RES), so the drawing on
// it (the grid, streets, house, captions, wires) is half a pixel per unit; the HTML on it (cards, prompts, talk,
// dialog) one. Photographed at the same, they come out exactly as soft as the live ones, and small.
const SIGMA_SVG = 0.5, SIGMA_HTML = 1;
const sigmaOf = (mode) => (mode === 'svg' ? SIGMA_SVG : SIGMA_HTML);
const PAGE_W = 4096;       // a texture page's width; each page is only as tall as what is packed on it
const PAD = 6;             // pixels between pictures, so the smaller mip levels do not bleed into neighbours
const XMIN = -100, YMIN = -800;

const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

(async () => {
    const c = await open();
    try {
        await c.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });
        await c.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
        await c.send('Page.navigate', { url: writeFlatPage() });
        await c.sleep(1200);
        const meta = await c.eval(SETUP);
        await c.eval(`document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => true)`);
        await c.eval(fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8'));
        await c.sleep(300);
        const scene = await c.eval('BPX.read()');
        scene.meta = Object.assign(meta, { sigmaSvg: SIGMA_SVG, sigmaHtml: SIGMA_HTML, xmin: XMIN, ymin: YMIN });
        console.log(`read: ${scene.anims.length} animations, ${scene.caps.length} pictures to take`);

        // ---- photograph each piece alone, its top left at the page's top left
        const shots = [];
        for (const cap of scene.caps) {
            await c.eval(`BPX.isolate(${JSON.stringify(cap.id)})`);
            const px = cap.rect.x - XMIN, py = cap.rect.y - YMIN;
            await c.eval(`(() => { document.getElementById('flat').style.transform = 'translate(${-px}px, ${-py}px) scale(2)';
                return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))); })()`);
            if (cap.rect.w > 1600 || cap.rect.h > 1200) throw new Error(`${cap.id} (${cap.mode}) is ${cap.rect.w} x ${cap.rect.h}: larger than the page`);
            const r = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: cap.rect.w, height: cap.rect.h, scale: sigmaOf(cap.mode) } });
            const buf = Buffer.from(r.data, 'base64');
            const s = pngSize(buf);
            shots.push({ cap, buf, w: s.w, h: s.h });
        }
        console.log(`took ${shots.length} pictures`);

        // ---- pack them: shelves, tallest first, onto pages PAGE_W wide
        const order = shots.slice().sort((a, b) => b.h - a.h);
        const pages = [];
        let page = null, x = 0, y = 0, shelf = 0;
        const newPage = () => { page = { items: [], h: 0 }; pages.push(page); x = PAD; y = PAD; shelf = 0; };
        newPage();
        for (const s of order) {
            if (x + s.w + PAD > PAGE_W) { x = PAD; y += shelf + PAD; shelf = 0; }
            if (y + s.h + PAD > PAGE_W) { newPage(); }
            s.page = pages.length - 1; s.x = x; s.y = y;
            page.items.push(s);
            x += s.w + PAD; shelf = Math.max(shelf, s.h);
            page.h = Math.max(page.h, y + s.h + PAD);
        }
        // ---- draw each page in the browser and save it
        fs.mkdirSync(OUT, { recursive: true });
        for (const old of fs.readdirSync(OUT)) if (/^atlas-\d+\.webp$/.test(old)) fs.unlinkSync(path.join(OUT, old));
        const sprites = {};
        for (let p = 0; p < pages.length; p++) {
            const pg = pages[p];
            const h = Math.ceil(pg.h / 4) * 4;
            await c.eval(`(() => { window.__atlas = document.createElement('canvas'); __atlas.width = ${PAGE_W}; __atlas.height = ${h}; return true; })()`);
            for (const s of pg.items) {
                await c.eval(`(() => { const im = new Image(); im.src = 'data:image/png;base64,${s.buf.toString('base64')}';
                    return im.decode().then(() => { __atlas.getContext('2d').drawImage(im, ${s.x}, ${s.y}); return true; }); })()`);
                const r = s.cap.rect;
                sprites[s.cap.id] = { p, u0: s.x / PAGE_W, v0: s.y / h, u1: (s.x + s.w) / PAGE_W, v1: (s.y + s.h) / h,
                    x: r.x, y: r.y, w: s.w / sigmaOf(s.cap.mode), h: s.h / sigmaOf(s.cap.mode), mode: s.cap.mode };
            }
            const url = await c.eval(`__atlas.toDataURL('image/webp', 0.9)`);
            const buf = Buffer.from(url.split(',')[1], 'base64');
            fs.writeFileSync(path.join(OUT, `atlas-${p}.webp`), buf);
            console.log(`atlas-${p}.webp ${PAGE_W} x ${h}, ${pg.items.length} pictures, ${(buf.length / 1024).toFixed(0)} KB`);
            pg.size = [PAGE_W, h];
        }
        scene.sprites = sprites;
        scene.pages = pages.map((pg, i) => ({ file: `atlas-${i}.webp`, w: pg.size[0], h: pg.size[1] }));
        delete scene.caps;
        fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene));
        console.log(`scene.json ${(fs.statSync(path.join(OUT, 'scene.json')).size / 1024).toFixed(0)} KB`);
        if (c.errors.length) console.log('page errors:', JSON.stringify(c.errors).slice(0, 600));
    } finally {
        c.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
