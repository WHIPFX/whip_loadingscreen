// Runs INSIDE the flat page (dev/bp/flat.js), injected by dev/bp/export.js. window.BPX:
//   BPX.read()        every piece of the blueprint: where it is (sheet units), what it is, and its animations as the
//                     browser held them (getKeyframes: values already worked out by the browser). It reads the running
//                     animations first, then turns them all off, so every piece is measured and photographed at rest.
//   BPX.isolate(id)   only capture `id` painted, in the state it is photographed in.
// The flat page's (0, 0) is sheet (XMIN, YMIN).
(function () {
    'use strict';
    const XMIN = -100, YMIN = -800;
    const sheetRect = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.left + window.scrollX + XMIN, y: b.top + window.scrollY + YMIN, w: b.width, h: b.height };
    };
    const num = (v) => parseFloat(v) || 0;
    const attrs = (el, names) => { const o = {}; for (const n of names) o[n] = el.getAttribute(n); return o; };

    // ---- animations: read while they run (running), each distinct one kept once (anims), each use with its element
    let running = null;          // Map: element -> [{ pseudo, data }]
    const anims = [];
    const animKey = new Map();
    const uses = [];
    function snapshot() {
        running = new Map();
        for (const a of document.getAnimations()) {
            const el = a.effect && a.effect.target;
            if (!el) continue;
            const t = a.effect.getTiming();
            const data = {
                name: a.animationName, duration: t.duration, delay: t.delay, easing: t.easing,
                keyframes: a.effect.getKeyframes().map((k) => {
                    const o = { offset: k.computedOffset, easing: k.easing };
                    for (const p of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) o[p] = k[p];
                    return o;
                }),
            };
            if (!running.has(el)) running.set(el, []);
            running.get(el).push({ pseudo: a.effect.pseudoElement || null, data });
        }
    }
    function animsOf(el, pseudo) {
        return (running.get(el) || []).filter((r) => r.pseudo === (pseudo || null)).map((r) => {
            const key = r.data.name + '|' + r.data.delay;
            if (!animKey.has(key)) { anims.push(r.data); animKey.set(key, anims.length - 1); }
            const i = animKey.get(key);
            const props = new Set();
            for (const k of anims[i].keyframes) for (const p of Object.keys(k)) if (p !== 'offset' && p !== 'easing') props.add(p);
            const use = { a: i, base: {} };
            uses.push({ el, pseudo: pseudo || null, props: [...props], use });
            return use;
        });
    }

    // ---- captures: what gets photographed, and how it is shown for it
    const caps = [];
    const capEls = new Map();
    function capture(els, mode, margin, opts) {
        els = Array.isArray(els) ? els : [els];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const el of els) {
            const r = (opts && opts.rect) || sheetRect(el);
            x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
        }
        const id = 'c' + caps.length;
        caps.push({ id, mode, rect: { x: x0 - margin, y: y0 - margin, w: x1 - x0 + 2 * margin, h: y1 - y0 + 2 * margin } });
        capEls.set(id, { els, mode, opts: opts || {} });
        return id;
    }
    // SVG pieces near one another photographed together: their boxes grown by `gap` that touch make one
    function clusters(els, gap, margin) {
        const items = els.map((el) => ({ els: [el], r: sheetRect(el) })).filter((c) => c.r.w > 0 || c.r.h > 0);
        for (let merged = true; merged;) {
            merged = false;
            outer: for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
                const a = items[i].r, b = items[j].r;
                if (a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h) {
                    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
                    items[i] = { els: items[i].els.concat(items[j].els), r: { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y } };
                    items.splice(j, 1);
                    merged = true;
                    break outer;
                }
            }
        }
        return items.map((c) => capture(c.els, 'svg', margin, { rect: c.r }));
    }

    // ---- the pieces
    function prompt(ip) {
        const col = ip.querySelector('.ip-col');
        const keys = [...col.querySelectorAll('.ip-key')].map((k) => {
            const r = sheetRect(k);
            return { cap: capture(k, 'key', 16), cx: r.x + r.w / 2, cy: r.y + r.h / 2, anims: animsOf(k) };
        });
        const labels = [...col.querySelectorAll('.ip-label')].map((l) => ({ cap: capture(l, 'label', 20), anims: animsOf(l) }));
        const rr = ip.querySelector('.ip-ringsvg rect');
        const ring = Object.assign(sheetRect(rr), {
            rx: num(rr.getAttribute('rx')), sw: num(rr.getAttribute('stroke-width')), dash: num(rr.getAttribute('stroke-dasharray')),
            cap: rr.getAttribute('stroke-linecap') || 'butt', stroke: rr.getAttribute('stroke'), anims: animsOf(rr),
        });
        return { col: animsOf(col), keys, labels, ring };
    }
    function card(c) {
        const step = (/\brun(\d+)\b/.exec(c.className) || [])[1];
        return { cap: capture(c, 'card', 3), rect: sheetRect(c), radius: num(getComputedStyle(c).borderTopLeftRadius),
            step: step === undefined ? -1 : +step, shadow: getComputedStyle(c).boxShadow, anims: animsOf(c) };
    }
    function objective(run) {
        const anchor = run.querySelector(':scope > .ob-anchor');
        const ob = anchor.querySelector('.bp-ob');
        const disc = ob.querySelector('.bp-ob-disc');
        const scale = ob.getBoundingClientRect().width / ob.offsetWidth;
        return {
            scale, anchor: animsOf(anchor), ob: animsOf(ob), ring: animsOf(disc, '::after'),
            white: capture(ob, 'capsule', 30 * scale), blue: capture(ob, 'capsule-blue', 30 * scale),
            titles: [...ob.querySelectorAll('.bp-ob-titles > span')].map((s) => ({ cap: capture(s, 'title', 10 * scale), anims: animsOf(s) })),
        };
    }
    function talk(run) {
        const st = run.querySelector(':scope > .st');
        return [...st.querySelectorAll('.st-row')].map((row) => {
            const cs = getComputedStyle(row);
            const face = row.querySelector('.st-face');
            const text = row.querySelector('.st-text');
            const fr = sheetRect(face);
            return {
                rect: sheetRect(row), radius: num(cs.borderTopLeftRadius), border: num(cs.borderTopWidth), padRight: num(cs.paddingRight),
                bg: cs.backgroundColor, borderColor: cs.borderTopColor, shadow: cs.boxShadow, anims: animsOf(row),
                face: { cap: capture(face, 'face', 8), cx: fr.x + fr.w / 2, cy: fr.y + fr.h / 2, r: fr.w / 2,
                    ring: num(getComputedStyle(face, '::after').borderTopWidth), ringColor: getComputedStyle(face, '::after').borderTopColor,
                    anims: animsOf(face, '::after') },
                text: Object.assign(sheetRect(text), { anims: animsOf(text) }),
                lines: [...text.querySelectorAll('span')].map((s) => ({ cap: capture(s, 'line', 2), anims: animsOf(s) })),
            };
        });
    }
    function dialog(run) {
        const dg = run.querySelector('.dg');
        const scale = dg.getBoundingClientRect().width / dg.offsetWidth;
        return {
            fade: animsOf(dg),
            cells: [...dg.querySelectorAll('.dg-cell')].map((cell) => {
                const panel = cell.querySelector('.dg-panel');
                const caret = cell.querySelector('.dg-caret');
                return { cap: capture(panel, 'cell', 40 * scale), anims: animsOf(cell),
                    caret: caret ? { cap: capture(caret, 'caret', 1), anims: animsOf(caret) } : null };
            }),
        };
    }
    function overlay(g) {
        const kids = [...g.children];
        const caption = kids[0], street = kids[1];
        if (caption.tagName !== 'text' || street.tagName !== 'g') throw new Error('the run overlay is not caption, street, wires');
        const t = street.getAttribute('transform');
        if (t && !/translate\(0 0\)/.test(t)) throw new Error('copy 0 street is moved: ' + t);
        const ring = street.querySelector('.gb-ring');
        const out = { art: clusters([caption].concat([...street.children].filter((e) => e !== ring)), 40, 6), wires: [], gb: null };
        if (ring) {
            out.gb = { x: num(ring.getAttribute('x')), y: num(ring.getAttribute('y')), w: num(ring.getAttribute('width')), h: num(ring.getAttribute('height')),
                rx: num(ring.getAttribute('rx')), sw: num(ring.getAttribute('stroke-width')), cap: ring.getAttribute('stroke-linecap') || 'butt',
                pathLength: num(ring.getAttribute('pathLength')), dash: num(ring.getAttribute('stroke-dasharray')), stroke: ring.getAttribute('stroke'),
                anims: animsOf(ring) };
            // what lies over the ring in the drawing (the bay's icon) must be photographed apart from what lies under it
            const after = [...street.children].slice([...street.children].indexOf(ring) + 1);
            out.gbOver = after.length;
        }
        for (const p of kids.slice(2)) {
            if (p.tagName !== 'path') throw new Error('a wire is not a path');
            out.wires.push(Object.assign(attrs(p, ['d', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-dasharray', 'class']), { anims: animsOf(p) }));
        }
        return out;
    }
    function sheetArt() {
        const pat = document.getElementById('w-sheet');
        const kids = [...pat.children];
        ['M0 1599', 'M0 1400', 'M0 1490'].forEach((s, i) => {
            if (!(kids[2 + i].getAttribute('d') || '').startsWith(s)) throw new Error('the sheet pattern changed: ' + s);
        });
        const minor = document.getElementById('w-minor');
        const mp = minor.querySelector('path');
        const grid = {
            minor: { size: num(minor.getAttribute('width')), d: mp.getAttribute('d'), sw: num(mp.getAttribute('stroke-width')), o: num(mp.getAttribute('stroke-opacity')), color: mp.getAttribute('stroke') },
            major: { d: kids[1].getAttribute('d'), sw: num(kids[1].getAttribute('stroke-width')), o: num(kids[1].getAttribute('stroke-opacity')), color: kids[1].getAttribute('stroke') },
            tile: { w: num(pat.getAttribute('width')), h: num(pat.getAttribute('height')) },
            lines: kids.slice(2, 5).map((p) => attrs(p, ['d', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray'])),
        };
        // the rest of the pattern (the house, the title block): its own drawing at sheet (0, 0), to photograph
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', grid.tile.w / 2); svg.setAttribute('height', grid.tile.h / 2);
        svg.setAttribute('viewBox', `0 0 ${grid.tile.w} ${grid.tile.h}`);
        svg.style.cssText = `position: absolute; left: ${-XMIN / 2}px; top: ${-YMIN / 2}px; overflow: visible`;
        for (const k of kids.slice(5)) svg.appendChild(k.cloneNode(true));
        document.getElementById('flat').appendChild(svg);
        return { grid, art: clusters([...svg.children], 40, 6) };
    }
    // the stage's own layers: its ground, the tilt, the sweep, the depth of field's bands, the shades over it
    function stage(root) {
        const persp = [...root.children].find((d) => d.style.perspective);
        const plane = persp.firstElementChild;
        const sweep = root.querySelector('.a-sweep');
        const bands = [...root.querySelectorAll('[class^="a-tilt"]')].map((b) => ({
            cls: b.className, top: num(b.style.top), h: num(b.style.height), mask: b.style.maskImage || b.style.webkitMaskImage,
            blur: getComputedStyle(b).backdropFilter,
        }));
        const shades = [...root.children].slice(-3).map((l) => l.style.background);
        return {
            ground: root.style.background, perspective: persp.style.perspective, perspectiveOrigin: persp.style.perspectiveOrigin,
            plane: { left: num(plane.style.left), top: num(plane.style.top), w: num(plane.style.width), h: num(plane.style.height),
                origin: plane.style.transformOrigin, transform: plane.style.transform },
            sweep: { left: num(sweep.style.left), top: num(sweep.style.top), w: num(sweep.style.width), h: num(sweep.style.height),
                background: sweep.style.background, blend: getComputedStyle(sweep).mixBlendMode, anims: animsOf(sweep) },
            bands, shades,
        };
    }

    window.BPX = {
        read(rootHtml) {
            // the stage's root, put back hidden so its animations (the sweep) run and its styles resolve
            const root = window.__bpRoot;
            root.style.visibility = 'hidden';
            root.style.position = 'absolute'; root.style.left = '-5000px'; root.style.top = '0px';
            document.body.appendChild(root);
            const drift = document.querySelector('.a-move');
            snapshot();
            const driftUse = animsOf(drift);
            const freeze = document.createElement('style');
            freeze.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
            document.head.appendChild(freeze);
            const st = stage(root);
            const runs = {};
            for (const key of ['ra', 'rb', 'rc']) {
                const run = document.querySelector(`.bp-run.${key}[data-k="0"]`);
                const g = document.querySelector(`g.${key}[data-k="0"]`);
                runs[key] = {
                    v: +/\bbp-v(\d)\b/.exec(run.className)[1],
                    overlay: overlay(g),
                    cards: [...run.querySelectorAll(':scope > .dc-card')].map(card),
                    objective: objective(run),
                    talk: talk(run),
                    prompts: [...run.querySelectorAll(':scope > .ip')].map(prompt),
                    dialog: dialog(run),
                };
            }
            const doorWrap = [...document.querySelectorAll('div[data-k="0"]')].find((d) => !d.classList.contains('bp-run'));
            const door = prompt(doorWrap.querySelector('.ip'));
            const sheet = sheetArt();
            for (const u of uses) {
                const cs = getComputedStyle(u.el, u.pseudo);
                for (const p of u.props) u.use.base[p] = cs[p];
            }
            root.remove();
            return { drift: driftUse, stage: st, runs, door, sheet, anims, caps };
        },
        isolate(id) {
            const c = capEls.get(id);
            let st = document.getElementById('bpx-iso');
            if (!st) { st = document.createElement('style'); st.id = 'bpx-iso'; document.head.appendChild(st); }
            for (const el of document.querySelectorAll('.bpx-cap')) el.classList.remove('bpx-cap');
            for (const el of c.els) el.classList.add('bpx-cap');
            st.textContent = `
                * { visibility: hidden !important; }
                .bpx-cap, .bpx-cap * { visibility: visible !important; }
                .bpx-cap.dc-card { box-shadow: none !important; }
                .bpx-cap.bp-ob .bp-ob-titles, .bpx-cap.bp-ob .bp-ob-titles * { visibility: hidden !important; }
                ${c.mode === 'capsule-blue' ? '.bpx-cap .bp-ob-disc::after { border-color: #60a5fa !important; }' : ''}
                .ip-label.bpx-cap { opacity: 1 !important; }
                .bp-ob-titles > span.bpx-cap { opacity: 1 !important; transform: none !important; }
                .st-text > span.bpx-cap { opacity: 1 !important; }
                .st-text { overflow: visible !important; }
                .st-face.bpx-cap::after { border-color: transparent !important; }
                .bpx-cap .dg-caret { visibility: hidden !important; }
                .dg-caret.bpx-cap { visibility: visible !important; }
            `;
            return c.mode;
        },
    };
})();
