// whip_loadingscreen — builds the blueprint behind the logo.
//
//   node dev/blueprint.js
//
// Writes the sheet as a web page into dev/sheet: blueprint.js (the markup) and blueprint.css (its styles and
// animations), generated: change this file and run it again, never those two. Speed and blur are set in
// dev/sheet/sheet.css. Then, at its end, it runs dev/bp/export.js (it needs Chrome), which photographs that sheet into
// what the screen draws with three.js: html/bp/scene.json and atlas-*.webp. Nothing in dev/ is sent to players.
//
// What it draws: a blueprint sheet tilted in 3D and drifting, with a garage lockup, a shop's talk and an NPC
// conversation, a public garage, a house, three Director runs whose cards light up in turn (each row's shop and
// conversation go with its run), a garage bay outline drawing itself, and three 3D interaction prompts choosing options. All on a 1920 x 1080 stage, covering the screen.
//
// Kept light, because a layer under a perspective is drawn at the screen's full resolution however small it
// ends up: the sheet is built at half size and scaled back up in 3D (RES). It reaches every corner of the stage,
// so it runs off the screen into the distance rather than ending on it. Everything, the prompts included, lies
// flat in the sheet's one plane: no 3D object stands out of it.
//
// The Director's objective card lies on the sheet too, above the card the run is on, and moves along with it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', 'html');     // the screen (its icons, read below)
const SHEET = path.join(__dirname, 'sheet');         // where the sheet is written
const r1 = (n) => String(Math.round(n * 10) / 10);
const FONT = "'IBM Plex Mono', monospace";

// whip's interaction icons, from this resource's own copy
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(HTML, 'js', 'icons.js'), 'utf8'), sandbox);
const GLYPHS = sandbox.window.WhipIcons.glyphs;
const FULL = sandbox.window.WhipIcons.fullBleed;
const glyphSvg = (name, size, x, y) => GLYPHS[name]
    .replace(/<(path|circle|rect)([^>]*?)\/>/g, '<$1$2></$1>')
    .replace('<svg ', `<svg width="${r1(size)}" height="${r1(size)}"${x !== undefined ? ` x="${r1(x)}" y="${r1(y)}"` : ''} `);

// A full-stage layer.
const LAYER = (cls, style) => `<div class="${cls}" style="position: absolute; left: 0; top: 0; width: 1920px; height: 1080px;${style ? ' ' + style : ''}"></div>`;

// ---------------------------------------------------------------- the sheet's geometry
// 5100 x 4200, its pivot (local 1500, 2700) on the middle of the stage, tipped back 55° and turned 30°. The
// content repeats every PER down the sheet, and the sheet drifts that far each loop.
const PW = 5100, PH = 4200, OX = 1500, OY = 2700, PER = 1600;
const RES = 0.5;
// The part of the sheet the stage can show: its corners land on (274, -604), (124, 3064), (4976, 2110) and
// (4386, 4074), with a margin. YMIN is above the tile's top, where the tile before it shows.
const XMIN = -100, XMAX = 5200, YMIN = -800;
// The moving layer: from YMIN down to a whole period below the sheet's foot, as it drifts up one period a loop.
const MOVE_H = PH + PER - YMIN;

// ---------------------------------------------------------------- the drawing (one tile, PW x PER)
const L = '#d6e9ff', SHEET_BG = '#0c2a4c';
const sheet = [];
// The helpers draw into `out`: the sheet, which every row shares, or one run's own street (drawInto).
let out = sheet;
const drawInto = (fn) => { const prev = out; out = []; fn(); const s = out.join(''); out = prev; return s; };
const ln = (d, o, w, extra) => out.push(`<path d="${d}" fill="none" stroke="${L}" stroke-opacity="${o}" stroke-width="${w}"${extra || ''}></path>`);
const poche = (d, o) => out.push(`<path d="${d}" fill="${L}" fill-opacity="0.16" fill-rule="evenodd" stroke="${L}" stroke-opacity="${o || 0.85}" stroke-width="2.2"></path>`);
const rect = (x, y, w, h, o, extra) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${L}" stroke-opacity="${o}" stroke-width="2"${extra || ''}></rect>`);
const textSvg = (x, y, s, size, o, anchor, rot) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" letter-spacing="3" fill="${L}" fill-opacity="${o}"${anchor ? ` text-anchor="${anchor}"` : ''}${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${s}</text>`;
const text = (...a) => out.push(textSvg(...a));
const DASH = ' stroke-dasharray="10 8"';
// A car seen from above, nose toward +y (the road).
function car(cx, cy, len, w) {
    rect(cx - w / 2, cy - len / 2, w, len, 0.8, ' rx="34"');
    ln(`M${cx - w / 2 + 14} ${cy + len / 2 - 104}Q${cx} ${cy + len / 2 - 80} ${cx + w / 2 - 14} ${cy + len / 2 - 104}`, 0.7, 2);
    rect(cx - w / 2 + 22, cy - len / 2 + 110, w - 44, len * 0.38, 0.55, ' rx="12"');
    ln(`M${cx - w / 2 + 18} ${cy - len / 2 + 74}Q${cx} ${cy - len / 2 + 58} ${cx + w / 2 - 18} ${cy - len / 2 + 74}`, 0.6, 1.8);
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
        out.push(`<rect x="${cx + sx * (w / 2 + 2) - 5}" y="${cy + sy * len * 0.31 - 26}" width="10" height="52" fill="${L}" fill-opacity="0.5"></rect>`);
    }
}

// THE LAYOUT, so nothing lies on anything else. The Director runs have the top of each tile (y 110-760, a branch card
// down to 850 where the street row has nothing yet: its captions start at 880) and the title block beside them. The
// street row (y 760-1340) goes home, its prompt, the shop talk, the garage (or the fuel
// stop, or the bank), its prompt, the house, its prompt, each prompt in a clear gap beside what it belongs to
// (PROMPT_GAP wide); then the road. The home, the garage's slot and their prompts are each run's own (STREET).
const PROMPT_GAP = { home: [650, 1290], garage: [2480, 2985], door: [3860, 4340] };

// the tile's edge
ln(`M0 ${PER - 1}H${PW}`, 0.12, 1.4);
// the road
ln(`M0 1400H${PW}M0 1580H${PW}`, 0.6, 2.4);
ln(`M0 1490H${PW}`, 0.45, 2, ' stroke-dasharray="60 40"');

// ---------------------------------------------------------------- the homes: Mirror Park plans
// Three of whip_homes_mirrorpark' designs, copied from its client.lua: the footprint (`poly`, metres, in the
// interior's own frame, y north) and the outside doors ([name, x, y]; door 01 is the front, turned to face the road).
// The interiors' walls are not in that data, so a plan is the outline, its doors and its room count, at HOME_S units a
// metre (the cars are at 100: a site plan beside them), its front on HOME_FRONT, left-aligned on HOME_X.
const HOMES = {
    mp_d08: { rooms: 5, poly: [[2.1, 5.55], [2.1, 7.48], [6.68, 7.48], [6.68, -7.52], [2.1, -7.52], [2.1, -2.96], [0.25, -2.96], [0.25, -0.99], [-2.8, -0.99], [-7.61, -0.99], [-7.61, 5.55], [-2.8, 5.55]],
        doors: [['01', 6.68, 2.68], ['02', 0.36, -1.41], ['03', 2.5, -2.82], ['05', -3.03, 5.55], ['06', -5.08, -0.99]] },
    mp_h2: { rooms: 4, poly: [[-7.25, -0.36], [-3.01, -0.36], [-3.01, -5.63], [3.09, -5.63], [3.09, -0.41], [7.16, -0.41], [7.16, 5.43], [-7.25, 5.43], [-7.25, 3.93], [-7.58, 3.72], [-7.62, 3.69], [-7.62, 1.44], [-7.6, 1.43], [-7.27, 1.21], [-7.25, 1.21]],
        doors: [['01', 3.8, -0.43], ['02', -3.04, -0.86]] },
    mp_d18: { rooms: 3, poly: [[-7.25, 0.54], [-2.79, 0.54], [-2.79, -1.66], [4.01, -1.66], [4.01, 0.54], [7.25, 0.54], [7.25, 2.24], [7.06, 2.24], [7.06, 4.29], [7.25, 4.29], [7.25, 6], [6.73, 6], [6.73, 6.42], [4.01, 6.42], [4.01, 6], [0.51, 6], [0.51, 5.81], [-1.44, 5.81], [-1.44, 6], [-2.79, 6], [-2.79, 6.42], [-3.78, 6.42], [-4.22, 7.06], [-5.4, 7.06], [-5.84, 6.42], [-6.74, 6.42], [-6.74, 6], [-7.25, 6]],
        doors: [['01', -4.14, 0.79], ['03', -0.2, 5.81], ['04', 7.06, 3]] },
};
const HOME_X = 60, HOME_FRONT = 1300, HOME_W = PROMPT_GAP.home[0] - 50 - HOME_X, HOME_S = 36;
const WALL = 0.35, DOOR_W = 0.95;   // metres

// The outline moved d inward (a miter, clamped where a corner is sharp): the walls' inner face.
function inset(poly, d) {
    const n = poly.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n]; area += ax * by - bx * ay; }
    const sgn = area > 0 ? 1 : -1;
    const lines = poly.map((a, i) => {
        const b = poly[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
        return [a[0] - ey / len * sgn * d, a[1] + ex / len * sgn * d, ex, ey];
    });
    return poly.map((v, i) => {
        const [px, py, ux, uy] = lines[(i - 1 + n) % n], [qx, qy, vx, vy] = lines[i];
        const den = ux * vy - uy * vx;
        if (Math.abs(den) < 1e-9) return [qx, qy];
        const t = ((qx - px) * vy - (qy - py) * vx) / den;
        const m = [px + ux * t, py + uy * t];
        return Math.hypot(m[0] - v[0], m[1] - v[1]) > d * 3 ? [qx, qy] : m;
    });
}
// The outline without its slivers: points closer than 15 cm to the last one kept.
const tidy = (poly) => poly.filter((p, i) => i === 0 || Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) >= 0.15);

// One home's plan, turned so door 01's wall faces the road: its walls, its outside doors (an opening and a swing,
// with a path from the front door to the road), its width above it, its address and room count in its widest part,
// and `extra` (a line under those, a sign by the path). Returns where its front door meets the path, for the prompt.
function homePlan(design, address, extra) {
    const h = HOMES[design];
    const poly = tidy(h.poly);
    const n = poly.length;
    const nearest = (x, y) => {   // the nearest edge to a point: [index, the point on it, its unit direction]
        let best = null;
        for (let i = 0; i < n; i++) {
            const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], len2 = ex * ex + ey * ey;
            const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / len2));
            const q = [a[0] + ex * t, a[1] + ey * t], dist = Math.hypot(q[0] - x, q[1] - y), len = Math.sqrt(len2);
            if (!best || dist < best.dist) best = { dist, q, u: [ex / len, ey / len] };
        }
        return best;
    };
    // turned so the front door's wall runs along the road, the house behind it
    const front = nearest(h.doors[0][1], h.doors[0][2]);
    const cx = poly.reduce((s, p) => s + p[0], 0) / n, cy = poly.reduce((s, p) => s + p[1], 0) / n;
    let r = -Math.atan2(front.u[1], front.u[0]);
    const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
    if (rot(front.q, r)[1] > rot([cx, cy], r)[1]) r += Math.PI;
    const R = poly.map((p) => rot(p, r));
    const xs = R.map((p) => p[0]), ys = R.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if ((x1 - x0) * HOME_S > HOME_W) throw new Error(`${design} is ${Math.round((x1 - x0) * HOME_S)} wide at HOME_S; the room is ${HOME_W}`);
    const T = (p) => { const q = rot(p, r); return [HOME_X + (q[0] - x0) * HOME_S, HOME_FRONT - (q[1] - y0) * HOME_S]; };
    const pathOf = (pts) => 'M' + pts.map((p) => T(p).map(r1).join(' ')).join('L') + 'Z';
    poche(pathOf(poly) + ' ' + pathOf(inset(poly, WALL)));

    // the inward side of an edge: the side the outline's middle is on
    const inward = (q, u) => {
        const nrm = [-u[1], u[0]];
        return (cx - q[0]) * nrm[0] + (cy - q[1]) * nrm[1] > 0 ? nrm : [-nrm[0], -nrm[1]];
    };
    let walk = null;
    h.doors.forEach(([name, x, y], i) => {
        const { q, u } = nearest(x, y);
        const nI = inward(q, u), w = DOOR_W / 2;
        const p = (a, b) => [q[0] + u[0] * a + nI[0] * b, q[1] + u[1] * a + nI[1] * b];
        // the opening: the wall cut out, as the house's front door is
        out.push(`<path d="${pathOf([p(-w, -0.08), p(w, -0.08), p(w, WALL + 0.08), p(-w, WALL + 0.08)])}" fill="${SHEET_BG}"></path>`);
        // the swing: the leaf open into the house, and its arc back to the far jamb
        const [hx, hy] = T(p(-w, WALL)), [lx, ly] = T(p(-w, WALL + DOOR_W)), [jx, jy] = T(p(w, WALL));
        const sweep = ((lx - hx) * (jy - hy) - (ly - hy) * (jx - hx)) > 0 ? 1 : 0;
        ln(`M${r1(hx)} ${r1(hy)}L${r1(lx)} ${r1(ly)}A${r1(DOOR_W * HOME_S)} ${r1(DOOR_W * HOME_S)} 0 0 ${sweep} ${r1(jx)} ${r1(jy)}`, 0.6, 1.6, DASH);
        if (i === 0) walk = T(p(0, -0.1));
    });
    // the front path, to the road, the door's width
    const pw = DOOR_W / 2 * HOME_S;
    ln(`M${r1(walk[0] - pw)} ${r1(walk[1])}V1394M${r1(walk[0] + pw)} ${r1(walk[1])}V1394`, 0.5, 1.6, ' stroke-dasharray="14 10"');
    // its width, above it
    const top = HOME_FRONT - (y1 - y0) * HOME_S, left = HOME_X, right = HOME_X + (x1 - x0) * HOME_S;
    ln(`M${r1(left)} ${r1(top - 40)}H${r1(right)}M${r1(left)} ${r1(top - 52)}V${r1(top - 28)}M${r1(right)} ${r1(top - 52)}V${r1(top - 28)}`, 0.7, 1.6);
    text(r1((left + right) / 2), r1(top - 52), (x1 - x0).toFixed(2), 20, 0.7, 'middle');
    // the labels: their whole block inside the walls, where its corners are furthest from them (on the sheet, in the
    // mono type's own measure: 0.6 em a letter and the 3 px between)
    const lines = [[address, 30, 0.75], [`${h.rooms} ROOMS`, 20, 0.5]].concat(extra ? [[extra, 20, 0.6]] : []);
    const bw = Math.max(...lines.map(([s, size]) => s.length * size * 0.6 + (s.length - 1) * 3)) + 16;
    const bh = (lines.length - 1) * 40 + 40;
    const S = poly.map(T);
    const inside = ([px, py]) => {
        let yes = false;
        for (let i = 0, j = S.length - 1; i < S.length; j = i++) {
            const [ax, ay] = S[i], [bx, by] = S[j];
            if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) yes = !yes;
        }
        return yes;
    };
    const clear = ([px, py]) => {
        let m = Infinity;
        for (let i = 0; i < S.length; i++) {
            const [ax, ay] = S[i], [bx, by] = S[(i + 1) % S.length], ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey || 1;
            const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2));
            m = Math.min(m, Math.hypot(ax + ex * t - px, ay + ey * t - py));
        }
        return m;
    };
    let spot = null;
    for (let gx = HOME_X; gx < right; gx += 6) for (let gy = top; gy < HOME_FRONT; gy += 6) {
        const pts = [[gx - bw / 2, gy - bh / 2], [gx + bw / 2, gy - bh / 2], [gx - bw / 2, gy + bh / 2], [gx + bw / 2, gy + bh / 2], [gx, gy - bh / 2], [gx, gy + bh / 2]];
        if (!pts.every(inside)) continue;
        const score = Math.min(...pts.map(clear));
        if (score > WALL * HOME_S + 6 && (!spot || score > spot.score)) spot = { score, x: gx, y: gy };
    }
    if (!spot) throw new Error(`${design}: no room inside it for "${address}"`);
    lines.forEach(([s, size, o], i) => text(r1(spot.x), r1(spot.y - bh / 2 + 30 + i * 40), s, size, o, 'middle'));
    return walk;
}

// ---------------------------------------------------------------- the garage's slot: a public garage, a fuel stop, a bank
// Each in the same room (x 1870-2430, y 920-1380) with its name above it; the prompt beside it is the run's (STREET).
const BAY0 = 1870, BAYW = 280, BAYS = 2;
// a public garage: two bays, a car in the first; the second wears whip's garage bay outline (bayOutline, below)
function garageSlot() {
    for (let i = 0; i <= BAYS; i++) ln(`M${BAY0 + i * BAYW} 920V1380`, 0.6, 2.2);
    ln(`M${BAY0} 920H${BAY0 + BAYS * BAYW}`, 0.6, 2.2);
    for (let i = 0; i < BAYS; i++) text(BAY0 + i * BAYW + BAYW / 2, 1366, String(i + 1).padStart(2, '0'), 22, 0.55, 'middle');
    car(BAY0 + BAYW * 0.5, 1140, 380, 170);
    text(BAY0 + BAYW * BAYS / 2, 900, `PUBLIC GARAGE · ${BAYS} BAYS`, 22, 0.55, 'middle');
}
// a fuel stop: a canopy over an island of two pumps, a car at one with the hose to it, the other lane empty
function fuelSlot() {
    rect(1884, 934, 532, 432, 0.45, DASH + ' rx="8"');
    poche('M2122 992H2198V1308H2122Z');
    for (const y of [1030, 1186]) {
        rect(2134, y, 52, 84, 0.8, ' rx="8"');
        rect(2144, y + 12, 32, 22, 0.55, ' rx="3"');
        ln(`M2134 ${y + 64}H2186`, 0.55, 1.6);
    }
    ln('M2134 1084Q2100 1100 2088 1196', 0.7, 2.2, ' stroke-dasharray="6 6"');
    car(2000, 1150, 380, 170);
    ln('M2310 1010V1230M2288 1204L2310 1230L2332 1204', 0.5, 2.2);
    text(2150, 900, 'FUEL · 2 PUMPS', 22, 0.55, 'middle');
}
// a bank on the street: its walls, the doors to the road, the ATM in the wall beside them, the counter and the vault
function bankSlot() {
    poche('M1884 944H2416V1330H1884Z M1900 960V1314H2400V960Z');
    out.push(`<rect x="2090" y="1312" width="160" height="20" fill="${SHEET_BG}"></rect>`);
    ln('M2090 1314L2090 1244A70 70 0 0 1 2160 1314M2250 1314L2250 1244A70 70 0 0 0 2180 1314', 0.6, 1.6, DASH);
    out.push(`<rect x="2296" y="1318" width="84" height="26" rx="4" fill="${SHEET_BG}" stroke="${L}" stroke-opacity="0.85" stroke-width="2"></rect>`);
    rect(2312, 1324, 52, 12, 0.6, ' rx="2"');
    ln('M1940 1060H2330V1120', 0.7, 2.2);
    for (const x of [2020, 2120, 2220]) ln(`M${x} 1040V1080`, 0.5, 1.6);
    out.push(`<circle cx="1990" cy="1200" r="54" fill="none" stroke="${L}" stroke-opacity="0.7" stroke-width="2"></circle>`);
    ln('M1990 1146V1254M1936 1200H2044', 0.4, 1.4);
    text(2150, 1210, 'FLEECA', 30, 0.75, 'middle');
    text(2150, 900, 'FLEECA BANK · ATM', 22, 0.55, 'middle');
}
// a house, its front door on the road
{
    const ox = 2910, oy = 640;
    // A path drawn at the house's own origin, moved to (ox, oy): x, y pairs, H's x and V's y.
    const P = (d) => d.replace(/([MLHV])([^MLHVZA]*)/g, (m, cmd, args) => {
        const n = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
        if (cmd === 'H') return 'H' + n.map((v) => v + ox).join(' ');
        if (cmd === 'V') return 'V' + n.map((v) => v + oy).join(' ');
        const out = [];
        for (let i = 0; i < n.length; i += 2) out.push(`${n[i] + ox} ${n[i + 1] + oy}`);
        return cmd + out.join(' ');
    });
    poche(P('M120 140H900V700H120Z M134 154V686H886V154Z'));
    for (const [x, y, w, h] of [[500, 154, 8, 226], [500, 450, 8, 236], [134, 420, 166, 8], [370, 420, 130, 8], [700, 154, 8, 266], [508, 420, 252, 8], [830, 420, 56, 8]]) {
        poche(`M${x + ox} ${y + oy}h${w}v${h}h${-w}Z`);
    }
    sheet.push(`<rect x="${380 + ox}" y="${686 + oy}" width="80" height="14" fill="#0c2a4c"></rect>`);
    ln(P('M380 700L380 770') + `A80 80 0 0 0 ${460 + ox} ${700 + oy}`, 0.6, 1.6, DASH);
    ln(P('M508 380L578 380') + `A70 70 0 0 1 ${508 + ox} ${450 + oy}`, 0.6, 1.6, DASH);
    ln(P('M300 428L300 498') + `A70 70 0 0 0 ${370 + ox} ${428 + oy}`, 0.6, 1.6, DASH);
    rect(170 + ox, 186 + oy, 190, 62, 0.7, ' rx="10"'); rect(214 + ox, 286 + oy, 100, 52, 0.6, ' rx="4"');
    rect(540 + ox, 182 + oy, 124, 176, 0.75, ' rx="6"'); rect(728 + ox, 196 + oy, 132, 150, 0.75, ' rx="6"');
    sheet.push(`<circle cx="${320 + ox}" cy="${530 + oy}" r="44" fill="none" stroke="${L}" stroke-opacity="0.7" stroke-width="1.8"></circle>`);
    // the labels in each room's clear part, off the furniture and the door swings
    text(420 + ox, 395 + oy, 'LIVING', 24, 0.75, 'middle'); text(260 + ox, 620 + oy, 'KITCHEN', 22, 0.7, 'middle');
    text(640 + ox, 400 + oy, 'BED 01', 20, 0.7, 'middle'); text(795 + ox, 400 + oy, 'BED 02', 20, 0.7, 'middle');
    text(697 + ox, 660 + oy, 'LOUNGE', 22, 0.7, 'middle');
    ln(P('M120 100H900M120 88V112M900 88V112'), 0.7, 1.6); text(510 + ox, 88 + oy, '7.80', 20, 0.7, 'middle');
    text(660 + ox, 750 + oy, '14 MIRROR PARK', 22, 0.6, 'middle');
}
// the title block, at the end of the Director runs' row
rect(3720, 240, 520, 200, 0.75);
ln('M3720 300H4240M3720 370H4240M4020 370V440', 0.5, 1.6);
text(3740, 285, 'WHIP FRAMEWORK', 28, 0.8); text(3740, 350, 'SHEET 07 · MIRROR PARK', 22, 0.6);
text(3740, 420, 'DIRECTOR RUN', 20, 0.6); text(4040, 420, 'REV D', 20, 0.6);

const pct = (t, T) => (Math.max(0, Math.min(T, t)) / T * 100).toFixed(2) + '%';
const kf = (name, stops) => `@keyframes ${name} { ${stops.map(([p, body]) => `${p} { ${body} }`).join(' ')} }`;
// whip's text face (whip_core/html/css/fonts.css), bundled in dev/sheet/fonts: Barlow, every weight real. Titles are
// Bricolage Grotesque (the objective card's).
const UI_FONT = "'Barlow', 'Segoe UI', sans-serif", UI_FONT_DISPLAY = "'Bricolage Grotesque', 'Barlow', sans-serif";
// The words' widths, as the screen measures them: Barlow at each weight sized here (dev/sheet/fonts), in ems, ' ' to '~'.
// The letters summed run a little over the real line (under 2%), so what fits by them fits.
const BARLOW = {
    500: '.20 .33 .30 .67 .56 .84 .68 .15 .29 .29 .40 .50 .26 .40 .28 .43 .57 .35 .54 .52 .57 .52 .52 .48 .53 .53 .35 .31 .50 .50 .50 .48 .82 .63 .62 .61 .62 .60 .57 .61 .65 .26 .58 .62 .57 .72 .67 .62 .59 .58 .61 .59 .57 .64 .60 .88 .60 .59 .55 .39 .43 .39 .46 .50 .21 .52 .55 .53 .55 .54 .37 .54 .54 .26 .25 .51 .24 .83 .54 .56 .56 .56 .37 .49 .37 .54 .49 .74 .50 .48 .45 .33 .18 .33 .51',
    600: '.20 .34 .33 .68 .57 .83 .69 .16 .32 .32 .40 .49 .27 .40 .27 .45 .57 .35 .55 .53 .59 .53 .53 .49 .53 .53 .36 .31 .49 .49 .49 .50 .82 .65 .62 .61 .62 .59 .56 .61 .64 .26 .58 .62 .57 .72 .67 .62 .60 .59 .61 .59 .58 .64 .61 .88 .62 .60 .55 .40 .45 .40 .47 .51 .22 .52 .56 .53 .56 .54 .38 .55 .54 .26 .25 .52 .24 .83 .54 .56 .56 .56 .38 .49 .37 .54 .50 .76 .52 .49 .46 .35 .19 .35 .52',
    700: '.20 .34 .36 .69 .57 .83 .71 .17 .35 .35 .40 .49 .27 .41 .27 .47 .57 .35 .56 .54 .61 .54 .54 .50 .54 .53 .36 .32 .49 .49 .49 .52 .82 .67 .62 .61 .62 .58 .56 .61 .63 .26 .58 .63 .57 .72 .67 .62 .60 .59 .61 .60 .59 .63 .62 .88 .63 .62 .56 .42 .47 .42 .47 .52 .23 .53 .57 .54 .57 .55 .39 .56 .55 .26 .25 .53 .24 .84 .55 .56 .57 .57 .38 .50 .38 .55 .52 .78 .54 .50 .46 .38 .20 .38 .53',
};
for (const w of Object.keys(BARLOW)) BARLOW[w] = BARLOW[w].split(' ').map(Number);
const BARLOW_MORE = { '…': 0.85, '’': 0.2, '“': 0.36, '”': 0.36, '·': 0.24 };
const em = (s, weight) => [...s].reduce((w, ch) => w + (BARLOW[weight || 500][ch.charCodeAt(0) - 32] || BARLOW_MORE[ch] || 0.6), 0);

// ---------------------------------------------------------------- the Director runs: the editor's cards at 2x, played back
// THREE RUNS, a different one on each row, so the rows on screen at once (never more than three) are never the same.
// Every copy of the tile holds all three and shows one; which one moves on by one each loop, at the moment the sheet
// jumps back a tile, so the drift stays seamless: copy k shows run (k + loop + RUN_FIRST) mod 3, and the jump puts
// copy k - 1 where copy k was, showing the run copy k just showed. RUN_FIRST picks the run in the middle of the screen
// first: the Airport run, then the Sultan, then the delivery.
//
// A run: its cards (x, y on the tile), its wires ([from, out pin row, to]), the cards the run goes through in order
// (`path`, each lighting at at(i) of the run's T-second clock), the objective card's title for each of them, and the
// conversation its row's dialog capsule plays (DLG, below).
// The path's cards are the top lane, their tops at y 200 or more so the objective card above them clears the road
// of the tile above; a branch's cards are under them, at y 520 or more (clear of the lane's card above them), and end
// by y 850 (the street row's captions start at 880).
// THE BOARD, the editor's card style (director.css .dr-board, base.css --dr-solid-*): each card's head painted in its
// kind's colour (KIND), the title in dark ink and its step in the run at the end; the outcomes plain words, the bad
// ones red (BAD); the fields small labels over their values; cards on a hard shadow (navy here, not the editor's
// charcoal: closer to the blueprint, as the classic cards were); the wires in the colour
// of the card they leave, red dots from an outcome that went wrong. Its head, pin row and padding are canvas.js
// STYLES.board (42, 26, 8). At CS times the editor's size (the Board's cards are taller than the classic ones were at
// 2x: at 1.75 a branch card still fits under its lane and clears the street row's captions, y 880).
const CS = 1.75;
const cs = (n) => `${r1(n * CS)}px`;
const KIND = { events: [255, 123, 107], goals: [255, 210, 63], flow: [178, 188, 206], dialog: [79, 209, 197], world: [255, 166, 77], player: [190, 156, 255], scenario: [157, 180, 255] };
const BAD = new Set(['Car lost', 'Out of time', 'Failed', 'Walked away']);
// (The cards' own: the classic cards' navy here, not the editor's charcoal rgb(29, 30, 35).)
const RED = '#f87171', INK = 'rgb(10, 12, 18)', BOARD_CARD = 'rgba(16, 22, 34, 0.96)';
const CARD_W = 230 * CS, HEAD = 42 * CS, PAD = 8 * CS, ROW = 26 * CS;
// The card's edge and its hard lift (director.css .dr-card's 1px edge, --dr-board-lift). Every state's list is edge,
// glow, lift, so a lit card's glow eases in and out rather than jumping (a box-shadow animates shadow by shadow).
const CARD_LIFT = `${cs(6)} ${cs(6)} 0 rgba(0, 0, 0, 0.55)`;
const CARD_SHADOW = `0 0 0 ${cs(1)} rgba(255, 255, 255, 0.08), 0 0 0 0 rgba(74, 222, 128, 0), ${CARD_LIFT}`;
const STARTED = (x, y) => ({ kind: 'events', title: 'Scenario Started', x, y, ins: [], outs: ['Out'], body: [['', 'When the run begins']] });
const SUCCEED = (x, y) => ({ kind: 'scenario', title: 'Succeed', x, y, ins: ['In'], outs: [], body: [['', 'The run ends: done']] });
const FAIL = (x, y) => ({ kind: 'scenario', title: 'Fail', x, y, ins: ['In'], outs: [], body: [['', 'The run ends: failed']] });
const RUNS = [
    {   // the Sultan, stolen and sold to a mechanic: seven cards, a Car lost branch
        key: 'ra', name: 'Steal the Sultan', T: 12, at: (i) => 0.6 + i * 1.5, move: 0.45,
        cards: {
            c1: STARTED(160, 250),
            c2: { kind: 'goals', title: 'Goal: Steal the Car', x: 760, y: 210, ins: ['In'], outs: ['In the car', 'Car lost', 'Out of time'], body: [['Car ', 'Sultan RS · WHIP 07']] },
            c3: { kind: 'goals', title: 'Goal: Deliver the Car', x: 1360, y: 240, ins: ['In'], outs: ['Delivered', 'Car lost', 'Out of time'], body: [['To ', 'The mechanic’s garage']] },
            c4: { kind: 'dialog', title: 'Haggle', x: 1960, y: 200, ins: ['In'], outs: ['Deal', 'Walked away'], who: 'Mechanic', quote: '“Two grand. It’s hot.”' },
            c5: { kind: 'player', title: 'Pay', x: 2560, y: 220, ins: ['In'], outs: ['Paid', 'Failed'], body: [['Amount ', '$3,250 · cash'], ['For ', 'The Sultan']] },
            c6: SUCCEED(3160, 230),
            c7: FAIL(1960, 560),
        },
        wires: [['c1', 0, 'c2'], ['c2', 0, 'c3'], ['c3', 0, 'c4'], ['c4', 0, 'c5'], ['c5', 0, 'c6'], ['c3', 1, 'c7']],
        path: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
        objectives: ['Job started', 'Steal the Sultan RS', 'Bring it to the mechanic', 'Haggle for a better price', 'You got paid $3,250', 'Job done'],
        // the Haggle, the mechanic buying (they buy from the player: its opening price, Ask for more): $4,000 asked is
        // too much but within its patience, so it meets halfway ($2,750); $3,250 is within what it will pay: a deal,
        // and Pay pays it
        dialog: { speaker: 'Mechanic', T: 12, pages: [
            ['I can give you $2,000 for the Sultan.', ['Deal: $2,000', 'Ask for more', 'Forget it'],
                [[0, 1.3], [1, 0.9], ['$', 0.35], ['$4', 0.3], ['$40', 0.3], ['$400', 0.3], ['$4000', 0.8], ['wait', 0.35]]],
            ['Too much. I can do $2,750.', ['Deal: $2,750', 'Ask for more', 'Forget it'],
                [[0, 1.3], [1, 0.8], ['$', 0.35], ['$3', 0.3], ['$32', 0.3], ['$325', 0.3], ['$3250', 0.8], ['wait', 0.35]]],
        ] },
    },
    {   // a delivery: four cards, long wires, slower
        key: 'rb', name: 'Rush Delivery', T: 12, at: (i) => 0.6 + i * 2.4, move: 0.6,
        cards: {
            b1: STARTED(160, 250),
            b2: { kind: 'goals', title: 'Goal: Collect', x: 1160, y: 210, ins: ['In'], outs: ['Collected', 'Out of time'], body: [['Item ', 'Sealed package'], ['How many ', '1']] },
            b3: { kind: 'goals', title: 'Goal: Bring Item To', x: 2160, y: 200, ins: ['In'], outs: ['Brought', 'Out of time'], body: [['To ', 'The Vinewood office'], ['Within ', '3 m']] },
            b4: SUCCEED(3160, 230),
        },
        wires: [['b1', 0, 'b2'], ['b2', 0, 'b3'], ['b3', 0, 'b4']],
        path: ['b1', 'b2', 'b3', 'b4'],
        objectives: ['Job started', 'Collect the package', 'Bring it to Vinewood', 'Job done'],
        // two Dialog Lines, one answer with a cost
        dialog: { speaker: 'Dock worker', T: 9, pages: [
            ['You the courier? It’s sealed. Don’t open it.', ['That’s me', 'What’s in it?', 'Bribe him [$200]', 'Wrong guy'], [[0, 1.3], [1, 1.0]]],
            ['Don’t ask. Vinewood office, three minutes, or it’s your neck.', ['On my way', 'Make it four'], [[0, 1.6], [1, 0.9], [0, 1.0]]],
        ] },
    },
    {   // a fare to the airport: nine cards, two lanes, the second a passenger who gives up
        key: 'rc', name: 'Airport Run', T: 11, at: (i) => 0.6 + i * 1.3, move: 0.45,
        cards: {
            d1: STARTED(160, 250),
            d2: { kind: 'world', title: 'Spawn NPC', x: 760, y: 210, ins: ['In'], outs: ['Out', 'Failed'], body: [['NPC ', 'The passenger']] },
            d3: { kind: 'goals', title: 'Goal: Go To', x: 1360, y: 240, ins: ['In'], outs: ['Arrived', 'Out of time'], body: [['Objective ', 'Pick up the passenger'], ['Within ', '10 m']] },
            d4: { kind: 'dialog', title: 'NPC Says', x: 1960, y: 200, ins: ['In'], outs: ['Out'], who: 'Passenger', quote: '“LSIA, and step on it.”' },
            d5: { kind: 'goals', title: 'Goal: Go To', x: 2560, y: 220, ins: ['In'], outs: ['Arrived', 'Out of time'], body: [['Objective ', 'Drive to LSIA'], ['Within ', '15 m']] },
            d6: SUCCEED(3160, 230),
            d7: FAIL(1360, 600),
            d8: { kind: 'dialog', title: 'NPC Says', x: 1960, y: 600, ins: ['In'], outs: ['Out'], who: 'Passenger', quote: '“Forget it. I’ll walk.”' },
            d9: FAIL(2560, 600),
        },
        wires: [['d1', 0, 'd2'], ['d2', 0, 'd3'], ['d3', 0, 'd4'], ['d4', 0, 'd5'], ['d5', 0, 'd6'], ['d2', 1, 'd7'], ['d3', 1, 'd8'], ['d8', 0, 'd9']],
        path: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
        objectives: ['Job started', 'Head to Del Perro Pier', 'Pick up the passenger', 'Hear where they’re going', 'Drive to LSIA', 'Job done'],
        // two Dialog Lines, one answer with a chance
        dialog: { speaker: 'Passenger', T: 9, pages: [
            ['You my ride? My flight leaves in twenty.', ['Hop in', 'Fare’s $420', 'Wrong car'], [[0, 1.2], [1, 1.0]]],
            ['Robbery. Fine. LSIA, and step on it.', ['Buckle up', 'Long way [30%]'], [[0, 1.2], [1, 1.1], [0, 0.9]]],
        ] },
    },
];
const RUN_FIRST = 1;   // copy k shows run (k + loop + RUN_FIRST) mod 3: copy 1, the first in the middle, shows RUNS[2]

const pinOut = (c, r) => [c.x + CARD_W, c.y + HEAD + PAD + ROW * r + ROW / 2];
const pinIn = (c) => [c.x, c.y + HEAD + PAD + ROW / 2];
const wireD = (a, b) => {
    const dx = Math.max(90, Math.abs(b[0] - a[0]) * 0.5);
    return `M${r1(a[0])} ${r1(a[1])}C${r1(a[0] + dx)} ${r1(a[1])} ${r1(b[0] - dx)} ${r1(b[1])} ${r1(b[0])} ${r1(b[1])}`;
};

/** Each card's step in its run, as the Board numbers them (canvas.js stepsOf): from the cards nothing leads into, left
 *  to right, along the wires in their outcomes' order, each card once. [id] = 1, 2 ... */
function stepsOf(run) {
    const into = new Set(run.wires.map((w) => w[2]));
    const queue = Object.keys(run.cards).filter((id) => !into.has(id)).sort((a, b) => run.cards[a].x - run.cards[b].x);
    const steps = {};
    let n = 0;
    while (queue.length) {
        const id = queue.shift();
        if (steps[id]) continue;
        steps[id] = ++n;
        run.wires.filter((w) => w[0] === id).sort((a, b) => a[1] - b[1]).forEach((w) => { if (!steps[w[2]]) queue.push(w[2]); });
    }
    return steps;
}

function cardHtml(run, id) {
    const c = run.cards[id];
    const wired = new Set(run.wires.filter((w) => w[0] === id).map((w) => w[1]));
    const pin = (side, label, on) => `<div class="dc-pin ${side}${on ? ' wired' : ''}${BAD.has(label) ? ' bad' : ''}">`
        + (side === 'out' ? `<span>${label}</span><i></i>` : `<i></i><span>${label}</span>`) + '</div>';
    let body = '';
    if (c.body) body = c.body.map(([k, v]) => `<div class="dc-line">${k.trim() ? `<span>${k.trim()}</span>` : ''}<em>${v}</em></div>`).join('');
    if (c.who) body = `<div class="dc-who">${c.who}</div><div class="dc-quote">${c.quote}</div>`;
    const step = run.path.indexOf(id);
    const n = run.steps[id];
    const cls = 'dc-card k-' + c.kind + (step >= 0 ? ' run' + step : '');
    return `<div class="${cls}" style="left: ${c.x}px; top: ${c.y}px">`
        + `<div class="dc-head"><span class="dc-title">${c.title}</span>${n ? `<span class="dc-step">${String(n).padStart(2, '0')}</span>` : ''}</div>`
        + `<div class="dc-pins"><div class="dc-col">${c.ins.map((l) => pin('in', l, true)).join('')}</div>`
        + `<div class="dc-col out">${c.outs.map((l, r) => pin('out', l, wired.has(r))).join('')}</div></div>`
        + (body ? `<div class="dc-body">${body}</div>` : '') + `</div>`;
}

// whip_core's `objective` glyph (html/js/glyphs.js): a flag
const FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M6 21V3.4"></path><path d="M6 4.4h11.6l-2.6 4.2 2.6 4.2H6" fill="currentColor" stroke-width="1.4"></path></svg>';

const runCss = [];
for (const run of RUNS) {
    const { key, T, at, path: steps } = run;
    const last = steps.length - 1;
    const sel = (s) => `.${key} ${s}`;
    // each card lights as the run reaches it; each wire flows while the run is on it, then stays green
    steps.forEach((id, i) => {
        const t = at(i);
        const base = `box-shadow: ${CARD_SHADOW}`;
        const ran = `box-shadow: 0 0 0 ${cs(1.5)} rgba(74, 222, 128, 0.65), 0 0 ${cs(11)} ${cs(1)} rgba(74, 222, 128, 0.25), ${CARD_LIFT}`;
        const pulse = `box-shadow: 0 0 0 ${cs(2.5)} #4ade80, 0 0 ${cs(23)} ${cs(6)} rgba(74, 222, 128, 0.5), ${CARD_LIFT}`;
        const stops = [['0%', base], [pct(t - 0.01, T), base], [pct(t + 0.15, T), pulse], [pct(t + 0.8, T), ran]];
        if (i === last) for (let k = 1; k <= 3; k++) stops.push([pct(t + 0.8 + k * 0.6 - 0.3, T), pulse], [pct(t + 0.8 + k * 0.6, T), ran]);
        stops.push([pct(T - 0.7, T), ran], ['100%', base]);
        runCss.push(kf(`${key}Run${i}`, stops), `${sel('.run' + i)} { animation: ${key}Run${i} ${T}s linear infinite; }`);
    });
    for (let i = 0; i < last; i++) {
        const a = at(i) + 0.3, b = at(i + 1);
        runCss.push(kf(`${key}Flow${i}`, [['0%', 'opacity: 0'], [pct(a, T), 'opacity: 0'], [pct(a + 0.1, T), 'opacity: 1'], [pct(b, T), 'opacity: 1'], [pct(b + 0.15, T), 'opacity: 0'], ['100%', 'opacity: 0']]),
            `${sel('.wf' + i)} { animation: ${key}Flow${i} ${T}s linear infinite, wDash 0.7s linear infinite; }`,
            kf(`${key}Ran${i}`, [['0%', 'opacity: 0'], [pct(b - 0.05, T), 'opacity: 0'], [pct(b + 0.15, T), 'opacity: 1'], [pct(T - 0.7, T), 'opacity: 1'], ['100%', 'opacity: 0']]),
            `${sel('.wr' + i)} { animation: ${key}Ran${i} ${T}s linear infinite; }`);
    }

    // THE OBJECTIVE CARD, on the sheet: whip_core's own (css/ui.css §10, the .ob-card capsule), lying above the card
    // the run is on and moving to the next as the green reaches it. That card's objective shows and the ring lights
    // blue for a moment, as a changed objective does in game. In with the first card, out as the cards let go; the
    // run's own clock, so it stays in step.
    const obIn = at(0), obOut = T - 0.7;
    const off = 'opacity: 0; transform: translateX(28px)', on = 'opacity: 1; transform: translateX(0)';
    runCss.push(kf(`${key}ObCard`, [['0%', off], [pct(obIn, T), off], [pct(obIn + 0.35, T), on], [pct(obOut, T), on], [pct(obOut + 0.35, T), off], ['100%', off]]),
        `${sel('.bp-ob')} { animation: ${key}ObCard ${T}s linear infinite; }`);
    const white = 'border-color: #ffffff', blue = 'border-color: #60a5fa';
    const ring = [['0%', white]];
    steps.forEach((_, i) => ring.push([pct(at(i), T), white], [pct(at(i) + 0.05, T), blue], [pct(at(i) + 1.0, T), blue], [pct(at(i) + 1.2, T), white]));
    ring.push(['100%', white]);
    runCss.push(kf(`${key}ObRing`, ring), `${sel('.bp-ob-disc::after')} { animation: ${key}ObRing ${T}s linear infinite; }`);
    run.objectives.forEach((_, i) => {
        const tIn = at(i);
        const hidden = 'opacity: 0; transform: translateY(8px)', shown = 'opacity: 1; transform: translateY(0)', gone = 'opacity: 0; transform: translateY(-8px)';
        const stops = [['0%', hidden], [pct(tIn, T), hidden], [pct(tIn + 0.25, T), shown]];
        if (i === last) stops.push(['100%', shown]);
        else stops.push([pct(at(i + 1), T), shown], [pct(at(i + 1) + 0.2, T), gone], ['100%', gone]);
        runCss.push(kf(`${key}ObT${i}`, stops), `${sel('.bp-ob-t' + i)} { animation: ${key}ObT${i} ${T}s linear infinite; }`);
    });
    // its anchor: the top middle of each card of the path in turn, eased there as the run reaches it
    const cards = steps.map((id) => run.cards[id]);
    const anchor = (c) => `transform: translate(${c.x + CARD_W / 2}px, ${c.y}px)`;
    const ease = 'animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1)';
    const move = [['0%', anchor(cards[0])]];
    cards.forEach((c, i) => move.push([pct(at(i), T), `${anchor(cards[Math.max(0, i - 1)])}; ${ease}`], [pct(at(i) + run.move, T), anchor(c)]));
    move.push(['100%', anchor(cards[last])]);
    runCss.push(kf(`${key}ObMove`, move), `${sel('.ob-anchor')} { animation: ${key}ObMove ${T}s linear infinite; }`);

    run.objective = `<div class="bp-ob"><div class="bp-ob-disc"><div class="bp-ob-icon">${FLAG}</div></div>`
        + `<div class="bp-ob-body"><div class="bp-ob-titles">${run.objectives.map((t, i) => `<span class="bp-ob-t${i}">${t}</span>`).join('')}</div>`
        + `<div class="bp-ob-row">${run.name}</div></div></div>`;
    run.steps = stepsOf(run);
    run.html = Object.keys(run.cards).map((id) => cardHtml(run, id)).join('')
        + `<div class="ob-anchor"><div class="ob-lift">${run.objective}</div></div>`;
}
runCss.push('@keyframes wDash { from { stroke-dashoffset: 72 } to { stroke-dashoffset: 0 } }');

// Which run a copy shows, loop by loop: three loops long, one third each. bp-v{p} shows its run in the p-th third.
// Hard switches (step-end), on the loop's own boundary: the percentages are exact to well under a frame.
const visCss = [
    '@keyframes bpV0 { 0% { visibility: visible } 33.3333333%, 100% { visibility: hidden } }',
    '@keyframes bpV1 { 0% { visibility: hidden } 33.3333333% { visibility: visible } 66.6666667%, 100% { visibility: hidden } }',
    '@keyframes bpV2 { 0% { visibility: hidden } 66.6666667%, 100% { visibility: visible } }',
    ...[0, 1, 2].map((p) => `.bp-v${p} { animation: bpV${p} calc(var(--bp-loop, 107s) * 3) step-end infinite; }`),
    // the same thirds by opacity, for what sets its own visibility inside a run (the dialog's cells)
    '@keyframes bpO0 { 0% { opacity: 1 } 33.3333333%, 100% { opacity: 0 } }',
    '@keyframes bpO1 { 0% { opacity: 0 } 33.3333333% { opacity: 1 } 66.6666667%, 100% { opacity: 0 } }',
    '@keyframes bpO2 { 0% { opacity: 0 } 66.6666667%, 100% { opacity: 1 } }',
    ...[0, 1, 2].map((p) => `.bp-o${p} { position: absolute; left: 0; top: 0; animation: bpO${p} calc(var(--bp-loop, 107s) * 3) step-end infinite; }`),
];
const phaseOf = (k, v) => (((v - k - RUN_FIRST) % 3) + 3) % 3;

// ---------------------------------------------------------------- the garage bay outline (whip's house look)
const BX = BAY0 + BAYW * (BAYS - 1), BY = 920, BW = BAYW, BH = 420;   // short of the bay's number (y 1366)
function bayOutline() {
    const inset = 18, rx = 34;
    const w = BW - inset * 2, h = BH - inset * 2, per = 2 * (w + h) - (8 - 2 * Math.PI) * rx;
    const cx = BX + BW / 2, cy = BY + BH / 2, r = 64;
    return `<rect x="${BX + 6}" y="${BY + 6}" width="${BW - 12}" height="${BH - 12}" rx="${rx + 8}" fill="rgba(10, 12, 18, 0.3)" stroke="rgba(255, 255, 255, 0.3)" stroke-width="2"></rect>`
        + `<rect class="gb-ring" x="${BX + inset}" y="${BY + inset}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" pathLength="${r1(per)}" stroke-dasharray="${r1(per)}"></rect>`
        // the icon lies on the sheet but turned to face the viewer (30° on this sheet)
        + `<g transform="rotate(30 ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(10, 12, 18, 0.78)" stroke="#ffffff" stroke-width="6"></circle>`
        + `<g style="color: #ffffff">${glyphSvg('garage', r * 1.25, cx - r * 0.625, cy - r * 0.625)}</g></g>`;
}

// ---------------------------------------------------------------- the 3D interaction prompts
// As in game: the selected option sits on the spot and the column slides through it, the others dimmed; the
// label rides beside the selected key; a press fills the hold ring and pops the key.
//
// Each sits in its PROMPT_GAP, its spot in the street row. The column slides up to (options - 1) keys either way:
// three options fit the row's height (y 776-1324) with the spot at 1050; four need the spot at 1000, the keys above it
// rising into the gap between the runs' cards (x 650-742 and 2480-2572 are clear there) and stopping short of the road.
//
// An option is [icon, label] or [icon, label, after]: `after` is what its label says once pressed, until the
// selection moves on (the for-sale sign's price asks "Purchase?"). A label too long for its room is set smaller, to
// 70% at the least, as the game's own 3D label is (whip_core/html/interact3d/label.html).
const KEY = 92, STEP = KEY * 1.24, STACK_A = 0.42, SLIDE = 0.35;
const LABEL_PX = 46, LABEL_MIN = 0.7;   // the label's size (Barlow 700, as label.html), and the least it is set to
const LABEL_X = KEY + 26;               // its left edge, from the key's
const SPOT_Y = 1050, SPOT_Y4 = 1000;
const promptCss = [];
function promptTimeline(p) {
    let t = 0, sel = p.seq[0][0];
    const points = [], press = [];
    for (const [s, d] of p.seq) {
        if (s === 'press') { press.push(t); t += d; continue; }
        if (s !== sel) { points.push([t, sel, s]); sel = s; }
        t += d;
    }
    return { T: t, switches: points, press };
}
function promptHtml(p) {
    const { T, switches, press } = promptTimeline(p);
    const n = p.opts.length;
    const col = [['0%', `transform: translateY(${r1(-STEP * p.seq[0][0])}px)`]];
    for (const [t, from, to] of switches) {
        col.push([pct(t, T), `transform: translateY(${r1(-STEP * from)}px)`], [pct(t + SLIDE, T), `transform: translateY(${r1(-STEP * to)}px)`]);
    }
    col.push(['100%', `transform: translateY(${r1(-STEP * p.seq[0][0])}px)`]);
    promptCss.push(kf(p.id + 'Col', col), `.${p.id}-col { animation: ${p.id}Col ${T}s cubic-bezier(0.4, 0, 0.2, 1) ${-p.delay}s infinite; }`);
    for (let i = 0; i < n; i++) {
        const op = (s) => (s === i ? 1 : STACK_A);
        const stops = [['0%', `opacity: ${op(p.seq[0][0])}; transform: scale(1)`]];
        for (const [t, from, to] of switches) stops.push([pct(t, T), `opacity: ${op(from)}; transform: scale(1)`], [pct(t + SLIDE, T), `opacity: ${op(to)}; transform: scale(1)`]);
        for (const tp of press) {
            const selAt = (() => { let s = p.seq[0][0]; for (const [t, , to] of switches) if (t <= tp) s = to; return s; })();
            if (selAt === i) stops.push([pct(tp + 0.95, T), 'opacity: 1; transform: scale(1)'], [pct(tp + 1.07, T), 'opacity: 1; transform: scale(1.16)'], [pct(tp + 1.3, T), 'opacity: 1; transform: scale(1)']);
        }
        stops.push(['100%', `opacity: ${op(p.seq[0][0])}; transform: scale(1)`]);
        stops.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
        promptCss.push(kf(`${p.id}K${i}`, stops), `.${p.id}-k${i} { animation: ${p.id}K${i} ${T}s cubic-bezier(0.4, 0, 0.2, 1) ${-p.delay}s infinite; }`);
    }
    // the labels: the selected option's shows; a press on one with `after` swaps its label for that, until the
    // selection moves on. Each label (l: its own, a: its after) fades on its own track.
    const first = p.seq[0][0];
    const fades = {}, vis = { ['l' + first]: true }, shown = { [first]: 'l' };
    const set = (k, on, t, d) => {
        if ((vis[k] || false) === on) return;
        (fades[k] = fades[k] || []).push([t, d, `opacity: ${on ? 1 : 0}`, 'linear']);
        vis[k] = on;
    };
    const events = switches.map(([t, from, to]) => ({ t, from, to })).concat(press.map((tp) => ({ t: tp + 1.3, press: true }))).sort((a, b) => a.t - b.t);
    let sel = first;
    for (const e of events) {
        if (e.press) {
            if (p.opts[sel][2]) { set('l' + sel, false, e.t, 0.15); set('a' + sel, true, e.t, 0.15); shown[sel] = 'a'; }
            continue;
        }
        set(shown[e.from] + e.from, false, e.t, SLIDE * 0.7);
        set('l' + e.to, true, e.t, SLIDE * 0.7);
        shown[e.to] = 'l';
        sel = e.to;
    }
    if (sel !== first || shown[sel] !== 'l') throw new Error(`${p.id}: its sequence must end back on option ${first}, its own label showing`);
    for (const k of Object.keys(fades)) {
        const start = k === 'l' + first ? 'opacity: 1' : 'opacity: 0';
        promptCss.push(track(`${p.id}${k}`, T, start, fades[k]), `.${p.id}-${k} { animation: ${p.id}${k} ${T}s linear ${-p.delay}s infinite; }`);
    }
    const per = 4 * (KEY + 16 - 2 * 32) + 2 * Math.PI * 32;
    const ring = [['0%', `opacity: 0; stroke-dashoffset: ${r1(per)}`]];
    for (const tp of press) {
        ring.push([pct(tp, T), `opacity: 0; stroke-dashoffset: ${r1(per)}`], [pct(tp + 0.05, T), `opacity: 1; stroke-dashoffset: ${r1(per)}`],
            [pct(tp + 0.95, T), `opacity: 1; stroke-dashoffset: 0`], [pct(tp + 1.3, T), `opacity: 0; stroke-dashoffset: 0`]);
    }
    ring.push(['100%', `opacity: 0; stroke-dashoffset: ${r1(per)}`]);
    promptCss.push(kf(p.id + 'Ring', ring), `.${p.id}-ring { animation: ${p.id}Ring ${T}s linear ${-p.delay}s infinite; }`);

    const keys = p.opts.map(([g], i) => {
        const size = FULL[g] ? KEY : KEY * 0.46 / 0.78;
        return `<div class="ip-key ${p.id}-k${i}" style="top: ${r1(i * STEP)}px">${glyphSvg(g, size)}</div>`;
    }).join('');
    // a label set smaller when it is too long for the room, as the game's is; never below 70%
    const label = (s, i, k) => {
        const need = em(s, 700);
        const size = Math.min(LABEL_PX, Math.floor(p.room / need));
        if (size < LABEL_PX * LABEL_MIN) throw new Error(`${p.id}: the label "${s}" needs ${Math.round(need * LABEL_PX)} px; its room is ${p.room}`);
        return `<div class="ip-label ${p.id}-${k}${i}" style="top: ${r1(i * STEP)}px${size < LABEL_PX ? `; font-size: ${size}px` : ''}${k === 'l' && i === first ? '; opacity: 1' : ''}">${s}</div>`;
    };
    const labels = p.opts.map(([, l, after], i) => label(l, i, 'l') + (after ? label(after, i, 'a') : '')).join('');
    return { keys, labels, per };
}

// The prompts lie flat on the sheet, as the cards do: drawn in its plane, they tilt and drift with it.
// The selected key sits on the prompt's spot. `gap` is its PROMPT_GAP: the key at its start, the label to its end.
function makePrompt(id, gap, opts, seq, delay) {
    const p = { id, opts, seq, delay, at: [gap[0] + KEY / 2, opts.length > 3 ? SPOT_Y4 : SPOT_Y], room: gap[1] - gap[0] - LABEL_X };
    const { keys, labels, per } = promptHtml(p);
    return `<div class="ip" style="left: ${r1(p.at[0] - KEY / 2)}px; top: ${r1(p.at[1] - KEY / 2)}px">`
        + `<div class="ip-col ${p.id}-col">${keys}${labels}</div>`
        + `<svg class="ip-ringsvg" width="${KEY + 40}" height="${KEY + 40}" style="left: -20px; top: -20px" aria-hidden="true">`
        + `<rect class="${p.id}-ring" x="12" y="12" width="${KEY + 16}" height="${KEY + 16}" rx="32" fill="none" stroke="#ffffff" stroke-width="8" stroke-dasharray="${r1(per)}"></rect></svg>`
        + `</div>`;
}

// ---------------------------------------------------------------- the shop talk, where the garage's first two bays were
// whip_core's shop screen talk (html/js/shop-talk.js, css/shops.css): two rows, the shopper's over the keeper's, each
// the HUD's capsule round a face, that one's line opening out beside it. On the HUD's dark surface rather than the shop
// panel's faint one, so it reads on the sheet as the objective card does.
//
// THE VISIT is a list of lines, timed as the server says them (server/shop_talk.lua: a basket change is said once the
// basket has been left alone for a second, the keeper answers 1.2 seconds later) and shown as the screen shows them
// (a line stays 2 seconds when that speaker has another waiting, 5 when it is their last, then the row folds back to
// the face). The words are Config.ShopTalk's. 'sale' lines are green, 'refused' ones red.
//
// A STORE A RUN, like the dialog under it: each row's is the store of the run above it (STORES, by the run's key), with
// its own name on the sheet, its own two faces and its own visit. Each ends with one kind of item in the basket, so
// what was paid for fits the row.
const TALK_X = 1310, TALK_Y = 940;   // the stack's top left; the longest line ends short of the garage (x 1870)
const TALK_H = 64;                   // a row (the in-world bubble's 67, a little smaller to fit the room)
const STORES = {   // T: the visit, from hello to both rows folded, and a breath before it starts again
    rc: {
        name: '24/7 STORE', T: 46.5,
        faces: { me: 'img/face-247-shopper.webp', keeper: 'img/face-247-keeper.webp' },   // a_m_y_hipster_01, mp_m_shopkeep_01
        lines: [   // [second, who, words, kind]
            [0.6, 'me', 'What do you got?'],                            // opens the shop
            [1.8, 'keeper', 'What can I get you?'],
            [7.3, 'me', 'I’ll take x2 Burger'],                         // + twice, at 6.0 and 6.3
            [8.5, 'keeper', 'Coming right up.'],
            [11.4, 'me', 'Give me x1 Water Bottle'],
            [12.6, 'keeper', 'Sure thing.'],
            [15.6, 'me', 'I want x2 Donut'],
            [16.8, 'keeper', 'Good choice.'],
            [23.0, 'me', 'Make that x3 Burger instead'],
            [24.2, 'keeper', 'No problem, changed.'],
            [27.0, 'me', 'Hold on, my card is acting up...', 'refused'],     // Buy, not enough money
            [28.2, 'keeper', 'Do I look like a charity to you?', 'refused'],
            [33.4, 'me', 'Actually, put the x2 Donut back'],               // both out of the basket, at 32.0 and 32.4
            [33.4, 'me', 'Scratch the x1 Water Bottle'],
            [34.6, 'keeper', 'Your call.'],
            [38.0, 'me', 'Paid $36 for x3 Burger', 'sale'],                // Buy
            [39.2, 'keeper', 'Sold! x3 Burger, all yours.', 'sale'],
        ],
    },
    ra: {   // whip_gunny's weapons, magazines and rounds, by their item names
        name: 'AMMU-NATION', T: 41.5,
        faces: { me: 'img/face-ammu-shopper.webp', keeper: 'img/face-ammu-keeper.webp' },   // g_m_y_ballasout_01, s_m_y_ammucity_01
        lines: [
            [0.6, 'me', 'Show me your goods.'],
            [1.8, 'keeper', 'What’ll it be?'],
            [7.0, 'me', 'I’ll take x1 Combat Pistol'],
            [8.2, 'keeper', 'Good choice.'],
            [11.4, 'me', 'Give me x50 9mm Round'],
            [12.6, 'keeper', 'Coming right up.'],
            [15.8, 'me', 'I want x2 Pistol Magazine'],
            [17.0, 'keeper', 'You got it.'],
            [22.0, 'me', 'Scratch the x1 Combat Pistol'],                   // both out of the basket: rounds only
            [22.0, 'me', 'Scratch the x2 Pistol Magazine'],
            [23.2, 'keeper', 'Fair enough.'],
            [28.4, 'me', 'Change that to x80 9mm Round'],
            [29.6, 'keeper', 'Sure, I can do that.'],
            [33.0, 'me', 'Paid $240 for x80 9mm Round', 'sale'],
            [34.2, 'keeper', 'Sold! x80 9mm Round, all yours.', 'sale'],
        ],
    },
    rb: {   // whip's own electronics (whip_phone's Phone, whip_voice's Radio), and a laptop
        name: 'DIGITAL DEN', T: 38,
        faces: { me: 'img/face-den-shopper.webp', keeper: 'img/face-den-keeper.webp' },     // a_f_y_business_01, ig_lifeinvad_01
        lines: [
            [0.6, 'me', 'Do you have...?'],
            [1.8, 'keeper', 'Welcome in.'],
            [7.0, 'me', 'I’ll take x1 Laptop'],
            [8.2, 'keeper', 'Good choice.'],
            [11.4, 'me', 'Give me x1 Phone'],
            [12.6, 'keeper', 'Sure thing.'],
            [15.8, 'me', 'I want x2 Radio'],
            [17.0, 'keeper', 'Coming right up.'],
            [20.6, 'me', 'Change that to x1 Radio'],
            [21.8, 'keeper', 'Easy enough.'],
            [25.2, 'me', 'I changed my mind on x1 Phone'],                  // both out of the basket: the laptop only
            [25.2, 'me', 'Scratch the x1 Radio'],
            [26.4, 'keeper', 'Your call.'],
            [29.6, 'me', 'Paid $1,200 for x1 Laptop', 'sale'],
            [30.8, 'keeper', 'Sold! x1 Laptop, all yours.', 'sale'],
        ],
    },
};
const NEXT = 2, LAST = 5, SWAP = 0.15;
const T_FACE = (TALK_H - 2) / 1.12, T_PAD = T_FACE * 0.06, T_RING = T_FACE * 0.065, T_GAP = TALK_H * 0.14, T_FONT = TALK_H * 0.448;
const T_OPEN = 0.4;   // the capsule opening, closing and changing width (--ui-ease)
const UI_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const lineWidth = (s) => Math.ceil(em(s) * T_FONT) + 2;

// One row's shows, swaps and folds, from its lines (shop-talk.js: say, next, schedule).
function talkEvents(store, who) {
    const lines = store.lines.map(([t, w, words, kind], i) => ({ t, who: w, words, kind: kind || null, i })).filter((l) => l.who === who);
    const ev = [], queue = [];
    let cur = null, shownAt = 0, now = 0, n = 0;
    const show = (t) => { const line = queue.shift(); ev.push({ t, type: cur ? 'swap' : 'open', line, from: cur }); cur = line; shownAt = t; };
    for (;;) {
        const due = cur ? Math.max(now, shownAt + (queue.length ? NEXT : LAST)) : Infinity;
        const arrive = n < lines.length ? lines[n].t : Infinity;
        if (arrive === Infinity && due === Infinity) break;
        if (arrive <= due) { now = arrive; queue.push(lines[n++]); if (!cur) show(now); }
        else if (queue.length) { now = due; show(now); }
        else { now = due; ev.push({ t: now, type: 'fold', from: cur }); cur = null; }
    }
    if (now + T_OPEN > store.T) throw new Error(`${store.name}: the ${who} row is still talking at ${now}s; its T is ${store.T}`);
    // a row folding and opening again at once looks like a stutter: the line should come sooner (a swap) or later
    ev.forEach((e, i) => {
        if (e.type === 'open' && i > 0 && e.t - ev[i - 1].t < 0.8) throw new Error(`${store.name}: the ${who} row folds at ${ev[i - 1].t}s and opens again at ${e.t}s`);
    });
    return { lines, ev };
}

// A track as keyframes: holds the first value, then each change [start, length, value, ease] in turn, on a T-second clock.
function track(name, T, first, changes) {
    const stops = [['0%', first]];
    let at = first;
    for (const [t, d, v, ease] of changes) {
        stops.push([pct(t, T), `${at}; animation-timing-function: ${ease}`], [pct(t + d, T), v]);
        at = v;
    }
    stops.push(['100%', at]);
    return kf(name, stops);
}

const talkCss = [];
// One store's row for `who`: its markup, its animations into talkCss (scoped by the run's key, as the cards are).
function talkRow(key, store, who) {
    const { lines, ev } = talkEvents(store, who);
    const T = store.T;
    const cap = (s) => key + 'St' + s + (who === 'me' ? 'Me' : 'Kp');
    const padOff = `padding-right: ${r1(T_PAD)}px`, padOn = `padding-right: ${r1(TALK_H * 0.4)}px`;
    const colours = {
        null: ['rgba(10, 12, 18, 0.75)', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.55)'],
        sale: ['rgba(20, 44, 35, 0.78)', 'rgba(74, 222, 128, 0.5)', '#4ade80'],        // --ui-success-light over the surface, --ui-success-medium, --ui-success
        refused: ['rgba(47, 28, 33, 0.78)', 'rgba(248, 113, 113, 0.5)', '#f87171'],     // --ui-error-light over the surface, the error edge, --ui-error
    };
    const rowCol = (k) => `background-color: ${colours[k][0]}; border-color: ${colours[k][1]}`;
    const ringCol = (k) => `border-color: ${colours[k][2]}`;
    const width = (w) => `width: ${w}px; margin-left: ${w ? r1(TALK_H * 0.25) : 0}px`;
    const pad = [], col = [], ringC = [], wid = [];
    const fade = lines.map(() => []);
    let kind = null;
    const recolour = (t, k) => {
        if (k === kind) return;
        col.push([t, 0.3, rowCol(k), 'ease']); ringC.push([t, 0.3, ringCol(k), 'ease']);
        kind = k;
    };
    const idx = (line) => lines.indexOf(line);
    for (const e of ev) {
        if (e.type === 'open') {
            pad.push([e.t, T_OPEN, padOn, UI_EASE]);
            recolour(e.t, e.line.kind);
            wid.push([e.t, T_OPEN, width(lineWidth(e.line.words)), UI_EASE]);
            fade[idx(e.line)].push([e.t + 0.2, 0.2, 'opacity: 1', 'ease']);
        } else if (e.type === 'swap') {
            fade[idx(e.from)].push([e.t, SWAP, 'opacity: 0', 'ease']);
            recolour(e.t + SWAP, e.line.kind);
            wid.push([e.t + SWAP, T_OPEN, width(lineWidth(e.line.words)), UI_EASE]);
            fade[idx(e.line)].push([e.t + SWAP + 0.2, 0.2, 'opacity: 1', 'ease']);
        } else {
            pad.push([e.t, T_OPEN, padOff, UI_EASE]);
            recolour(e.t, null);
            wid.push([e.t, T_OPEN, width(0), UI_EASE]);
            fade[idx(e.from)].push([e.t, SWAP, 'opacity: 0', 'ease']);
        }
    }
    const sel = (s) => `.${key} .st-${who}${s}`;
    talkCss.push(track(cap('Pad'), T, padOff, pad), track(cap('Col'), T, rowCol(null), col), track(cap('Ring'), T, ringCol(null), ringC), track(cap('Wid'), T, width(0), wid));
    talkCss.push(`${sel('')} { animation: ${cap('Pad')} ${T}s linear infinite, ${cap('Col')} ${T}s linear infinite; }`,
        `${sel(' .st-face::after')} { animation: ${cap('Ring')} ${T}s linear infinite; }`,
        `${sel(' .st-text')} { animation: ${cap('Wid')} ${T}s linear infinite; }`);
    lines.forEach((l, i) => {
        talkCss.push(track(cap('L' + i), T, 'opacity: 0', fade[i]), `${sel(' .st-l' + i)} { animation: ${cap('L' + i)} ${T}s linear infinite; }`);
    });
    const widest = Math.max(...lines.map((l) => lineWidth(l.words)));
    const reach = TALK_X + 2 + T_PAD + T_FACE + TALK_H * 0.25 + widest + TALK_H * 0.4;
    if (reach > BAY0 - 12) throw new Error(`${store.name}: a ${who} line reaches x ${Math.round(reach)}, into the garage (x ${BAY0})`);
    return `<div class="st-row st-${who}"><span class="st-face"><span class="st-pic"><img src="${store.faces[who]}" alt=""></span></span>`
        + `<span class="st-text">${lines.map((l, i) => `<span class="st-l${i}">${l.words}</span>`).join('')}</span></div>`;
}
// Each run's store goes in with its cards (run.html), so it shows and hides with them; its name goes on the sheet with
// its wires (the overlay, below).
for (const run of RUNS) {
    const store = STORES[run.key];
    run.html += `<div class="st" style="left: ${TALK_X}px; top: ${TALK_Y}px">${talkRow(run.key, store, 'me')}${talkRow(run.key, store, 'keeper')}</div>`;
    run.caption = (dy) => textSvg(TALK_X, 900 + dy, store.name, 22, 0.55);
}

// ---------------------------------------------------------------- the dialog capsule, under the shop talk
// whip_core's conversation with an NPC (html/interact3d/dialog.html): the speaker, their line, and up to four answers
// two to a row, the selected one a white pill; an answer that takes an amount shows what is typed, with a hint under
// the answers; while the server answers, the answers dim. Each row's is the conversation of the run above it
// (`dialog` in RUNS), so it changes with the run.
//
// Played as the game plays it: every state is its own cell, switched instantly (the game switches the texture's
// cells), the capsule fading in as the conversation opens and out as it ends. A page: [line, answers, steps], each
// step [what, seconds] — an answer's number (0 up) to select it, '$…' for what is typed into the selected one,
// 'wait' for the server's answer.
const DLG_X = 1310, DLG_CY = 1240;   // its left edge, the shop talk's, and its middle
const DLG_W = 760;                   // the page's width: the game's is 940, this one fits the room at a readable size
const DLG_SCALE = 0.71;              // on the sheet: 540 wide, short of the garage
const DLG_FADE = 0.25, DLG_OPEN = 0.3;
const TYPING_HINT = 'Type the amount · E to give it · Backspace to go back';
// an answer's room in its column (dialog.html: two columns, the pill's padding, border, number and gap), and the line's
const DLG_ANSWER_ROOM = (DLG_W - 60 - 10) / 2 - 44 - 4 - 34 - 16, DLG_LINE_ROOM = DLG_W - 60;
const dlgCss = [];
for (const run of RUNS) {
    const { key } = run, d = run.dialog;
    const cells = [];   // [start, end, html]
    let t = DLG_OPEN;
    for (const [line, answers, steps] of d.pages) {
        for (const a of answers) {
            if (em(a, 600) * 28 > DLG_ANSWER_ROOM) throw new Error(`the answer "${a}" is too long for its pill`);
        }
        if (em(line, 600) * 34 > DLG_LINE_ROOM * 2) throw new Error(`"${line}" is more than two lines`);
        let sel = 0;
        for (const [what, secs] of steps) {
            let typed = null, waiting = false;
            if (typeof what === 'number') sel = what;
            else if (what === 'wait') waiting = true;
            else typed = what;
            const opts = answers.map((a, i) => {
                const label = typed !== null && i === sel ? `${typed}<span class="dg-caret">|</span>` : a;
                return `<div class="dg-opt${!waiting && i === sel ? ' sel' : ''}"><div class="dg-n">${i + 1}</div><span class="dg-t">${label}</span></div>`;
            }).join('');
            const cls = 'dg-panel' + (waiting ? ' waiting' : '') + (typed !== null ? ' hinted' : '');
            cells.push([t, t + secs, `<div class="${cls}"><div class="dg-speaker">${d.speaker}</div><div class="dg-line">${line}</div>`
                + `<div class="dg-opts">${opts}</div>${typed !== null ? `<div class="dg-hint">${TYPING_HINT}</div>` : ''}</div>`]);
            t += secs;
        }
    }
    const end = t;
    if (end + DLG_FADE > d.T) throw new Error(`the ${key} conversation runs to ${end}s; its T is ${d.T}`);
    cells[cells.length - 1][1] = end + DLG_FADE;   // the last one stays while it fades
    cells.forEach(([a, b], i) => {
        const stops = a <= 0 ? [['0%', 'visibility: visible']] : [['0%', 'visibility: hidden'], [pct(a, d.T), 'visibility: visible']];
        stops.push([`${pct(b, d.T)}, 100%`, 'visibility: hidden']);
        dlgCss.push(kf(`${key}Dg${i}`, stops), `.${key}-dg${i} { animation: ${key}Dg${i} ${d.T}s step-end infinite; }`);
    });
    dlgCss.push(kf(`${key}DgFade`, [['0%', 'opacity: 0'], [pct(DLG_OPEN, d.T), 'opacity: 0'], [pct(DLG_OPEN + DLG_FADE, d.T), 'opacity: 1'],
        [pct(end, d.T), 'opacity: 1'], [pct(end + DLG_FADE, d.T), 'opacity: 0'], ['100%', 'opacity: 0']]),
        `.${key} .dg { animation: ${key}DgFade ${d.T}s linear infinite; }`);
    run.dialogHtml = `<div class="dg" style="left: ${DLG_X}px; top: ${DLG_CY}px">`
        + cells.map(([, , html], i) => `<div class="dg-cell ${key}-dg${i}">${html}</div>`).join('') + '</div>';
}

// ---------------------------------------------------------------- each run's street: its home, the garage's slot, their prompts
// A row's home is a Mirror Park plan with the property prompt that suits it (the manager's for its owner, the outside
// sign's for one for sale, a key holder's), and the garage's slot is a public garage, a fuel stop or a bank, with
// whip's own prompt for it (client/properties.lua, client/refuel.lua, client/atm.lua). A prompt: [options, steps].
const STREET = {
    rc: {   // your home, and fuel for the taxi
        home: ['mp_d08', '4 NIKOLA PL'],
        homePrompt: [[['house', '4 Nikola Pl (yours)'], ['furnish', 'Furnish'], ['theme', 'Theme'], ['lock', 'Keys']],
            [[0, 1.8], [1, 1.3], ['press', 1.4], [1, 0.6], [2, 1.2], [3, 1.2], [0, 1.4]]],
        slot: fuelSlot,
        slotPrompt: [[['fuel', 'Refuel $42'], ['fuel', 'Fill Jerry Can'], ['nozzle', 'Put Nozzle Away']],
            [[0, 1.6], ['press', 1.4], [0, 0.8], [1, 1.4], [2, 1.4], [0, 1.0]]],
    },
    ra: {   // a home for sale, and the public garage, its second bay outlined
        home: ['mp_h2', '9 MIRROR PL', 'FOR SALE'],
        homePrompt: [[['house', '9 Mirror Pl'], ['garage', '1 garage bay'], ['house_door', '4 rooms'], ['dollar', '$185,000', 'Purchase?']],
            [[0, 1.6], [1, 1.2], [2, 1.2], [3, 1.0], ['press', 1.4], [3, 1.6], [0, 1.4]]],
        slot: () => { garageSlot(); out.push(bayOutline()); },
        slotPrompt: [[['garage', 'Garage'], ['car', 'Take out a car'], ['store', 'Store this car']],
            [[0, 1.5], [1, 1.2], ['press', 1.4], [1, 0.6], [2, 1.5], [0, 1.3]]],
    },
    rb: {   // a friend's home you hold a key to, and the bank
        home: ['mp_d18', '21 BRIDGE ST'],
        homePrompt: [[['house', '21 Bridge St (you have a key)'], ['furnish', 'Furnish'], ['theme', 'Theme']],
            [[0, 2.0], [1, 1.3], [2, 1.3], [1, 0.8], ['press', 1.4], [1, 0.6], [0, 1.2]]],
        slot: bankSlot,
        slotPrompt: [[['bank', 'Check Balance'], ['bank', 'Personal $12,400'], ['deposit', 'Deposit'], ['withdraw', 'Withdraw']],
            [[0, 1.4], [1, 1.6], [2, 1.2], [3, 1.2], ['press', 1.4], [3, 0.6], [0, 1.2]]],
    },
};
for (const run of RUNS) {
    const s = STREET[run.key];
    run.street = drawInto(() => { homePlan(...s.home); s.slot(); });
    run.html += makePrompt(run.key + 'h', PROMPT_GAP.home, ...s.homePrompt, 0) + makePrompt(run.key + 's', PROMPT_GAP.garage, ...s.slotPrompt, 1.7);
}
// the house's door, the same on every row
const doorPrompt = makePrompt('p3', PROMPT_GAP.door, [['door', 'Enter'], ['lockpick', 'Pick the lock'], ['house', 'View listing']],
    [[0, 1.4], [1, 1.5], [2, 1.5], [0, 1.0], ['press', 1.4], [0, 1.2]], 3.1);

// ---------------------------------------------------------------- copies down the sheet
// Every period the moving layer covers, from the one YMIN falls in to the last.
const LOOP = 107;   // the default drift (--bp-loop in dev/sheet/sheet.css)
// For dev/sheet/stage.js: the stretch of the sheet the stage can show (data-seen: the corners' y, -604 to 4074, with 300 to
// spare) before the drift moves it. A copy outside it is taken out of the page.
const SEEN = [-604 - 300, 4074 + 300];
// What the page starts with: the first loop's runs (phase 0) in the copies on the screen before any drift. The rest
// start out of the page, so the first look at it styles a quarter of it; dev/sheet/stage.js brings each in when needed.
const atStart = (k, p) => (p === undefined || p === 0) && (k + 1) * PER > SEEN[0] && k * PER < SEEN[1];
let flat = '';
let overlay = '';
for (let k = Math.floor(YMIN / PER); k * PER < PH + PER; k++) {
    const dy = k * PER;
    const tr = (s) => s.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, a, b) => `${a} ${r1(+b + dy)}`);
    RUNS.forEach((run, v) => {
        const p = phaseOf(k, v);
        const out = atStart(k, p) ? '' : 'display: none; ';
        // the dialog's cells switch by visibility, which would show through a hidden run: its own wrapper hides it by opacity.
        // data-p: the run's third of the three loops, and data-k its copy, for dev/sheet/stage.js, which takes what is not in
        // play (a run's turn not come, a copy off the screen) out of the page.
        flat += `<div class="bp-run ${run.key} bp-v${p}" data-p="${p}" data-k="${k}" style="${out}top: ${dy}px">${run.html}<div class="bp-o${p}">${run.dialogHtml}</div></div>`;
        overlay += `<g class="${run.key} bp-v${p}" data-p="${p}" data-k="${k}"${out ? ' style="display: none"' : ''}>${run.caption(dy)}<g transform="translate(0 ${dy})">${run.street}</g>`;
        for (const [f, r, t] of run.wires) {
            const d = tr(wireD(pinOut(run.cards[f], r), pinIn(run.cards[t])));
            // (The Board's: the colour of the card it leaves; red dots from an outcome that went wrong.)
            const from = run.cards[f];
            overlay += BAD.has(from.outs[r])
                ? `<path d="${d}" fill="none" stroke="${RED}" stroke-width="${r1(2.5 * CS)}" stroke-linecap="round" stroke-dasharray="${r1(2 * CS)} ${r1(6 * CS)}"></path>`
                : `<path d="${d}" fill="none" stroke="rgb(${KIND[from.kind].join(', ')})" stroke-width="${r1(2.5 * CS)}" stroke-linecap="round"></path>`;
            const i = run.path.indexOf(f);
            if (i >= 0 && run.path[i + 1] === t) {
                overlay += `<path class="wr${i}" d="${d}" fill="none" stroke="#4ade80" stroke-width="5.2"></path>`;
                overlay += `<path class="wf${i}" d="${d}" fill="none" stroke="#bff5d0" stroke-width="6.4" stroke-linecap="round" stroke-dasharray="20 16"></path>`;
            }
        }
        overlay += '</g>';
    });
    flat += `<div data-k="${k}" style="${atStart(k) ? '' : 'display: none; '}position: absolute; left: 0; top: ${dy}px">${doorPrompt}</div>`;
}

// ---------------------------------------------------------------- the styles
const css = `/* GENERATED by dev/blueprint.js — change that and run it (node dev/blueprint.js), not this file.
   Speed and blur: --bp-loop and --bp-blur-* in dev/sheet/sheet.css. */

/* the sheet drifts one repeat per loop */
@keyframes aDrift { from { transform: translate3d(0, 0, 0) } to { transform: translate3d(0, -${PER * RES}px, 0) } }
.a-move { animation: aDrift var(--bp-loop, ${LOOP}s) linear infinite; will-change: transform; }
/* a slow sweep of light */
@keyframes aSweep { from { transform: translateX(-1400px) rotate(18deg) } to { transform: translateX(2200px) rotate(18deg) } }
.a-sweep { animation: aSweep 16s cubic-bezier(0.45, 0, 0.55, 1) infinite; mix-blend-mode: screen; }
/* the depth of field: three blurs, strongest at the top and bottom edges (BLURS: each only in its two bands) */
.a-tilt1 { backdrop-filter: blur(var(--bp-blur-1, 2.5px)); }
.a-tilt2 { backdrop-filter: blur(var(--bp-blur-2, 7px)); }
.a-tilt3 { backdrop-filter: blur(var(--bp-blur-3, 14px)); }
/* the Director runs, one showing on each copy of the tile (bp-v*) */
.bp-run { position: absolute; left: 0; width: 0; height: 0; }
${visCss.join('\n')}
/* Director cards: the editor's Board style (css/director.css .dr-board), at ${CS}x its size. The head is the kind's
   colour, the title in dark ink, the card's step in its run at the end. */
.dc-card { position: absolute; width: ${CARD_W}px; background: ${BOARD_CARD}; border-radius: ${cs(14)}; box-shadow: ${CARD_SHADOW}; font-family: ${UI_FONT}; color: rgba(255, 255, 255, 0.93); }
.dc-head { height: ${HEAD}px; box-sizing: border-box; display: flex; align-items: center; gap: ${cs(8)}; padding: 0 ${cs(12)}; border-radius: ${cs(14)} ${cs(14)} 0 0; background: var(--k); }
.dc-title { flex: 1; min-width: 0; font-family: ${UI_FONT_DISPLAY}; font-size: ${cs(15.5)}; font-weight: 800; letter-spacing: ${cs(-0.2)}; color: ${INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dc-step { flex: none; font-family: ${UI_FONT_DISPLAY}; font-size: ${cs(20)}; font-weight: 800; color: ${INK}; opacity: 0.38; }
.dc-pins { display: flex; justify-content: space-between; padding: ${PAD}px 0; }
.dc-col { display: flex; flex-direction: column; }
.dc-col.out { align-items: flex-end; }
.dc-pin { height: ${ROW}px; display: flex; align-items: center; gap: ${cs(6)}; font-size: ${cs(12.5)}; font-weight: 700; color: rgba(255, 255, 255, 0.93); white-space: nowrap; }
.dc-pin.bad span { color: ${RED}; }
.dc-pin i { width: ${cs(12)}; height: ${cs(12)}; box-sizing: border-box; border-radius: 50%; border: ${cs(2)} solid rgba(255, 255, 255, 0.93); background: rgb(16, 22, 34); }
.dc-pin.in i { margin-left: ${cs(-6)}; } .dc-pin.out i { margin-right: ${cs(-6)}; }
.dc-pin.in span { margin-right: ${cs(10)}; } .dc-pin.out span { margin-left: ${cs(10)}; }
.dc-pin.wired i { background: rgba(255, 255, 255, 0.93); }
.dc-pin.bad i { border-color: ${RED}; } .dc-pin.bad.wired i { background: ${RED}; }
.dc-body { padding: ${cs(8)} ${cs(12)} ${cs(10)}; border-top: ${cs(1)} solid rgba(255, 255, 255, 0.08); font-size: ${cs(13)}; color: rgba(255, 255, 255, 0.5); }
.dc-line { line-height: 1.3; margin-bottom: ${cs(6)}; } .dc-line:last-child { margin-bottom: 0; }
.dc-line span { display: block; font-size: ${cs(9.5)}; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255, 255, 255, 0.48); }
.dc-line em { display: block; font-style: normal; font-size: ${cs(13)}; font-weight: 600; color: rgba(255, 255, 255, 0.93); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dc-who { font-family: ${UI_FONT_DISPLAY}; font-size: ${cs(13)}; font-weight: 800; color: var(--k); margin-bottom: ${cs(2)}; }
.dc-quote { font-size: ${cs(13)}; line-height: 1.35; color: rgba(255, 255, 255, 0.93); }
${Object.entries(KIND).map(([k, [r, g, b]]) => `.k-${k} { --k: rgb(${r}, ${g}, ${b}); }`).join('\n')}
/* the Director's objective card, on the sheet: the anchor moves to the card the run is on; the card sits 24px over
   it, centred, at 1.9x its HUD size, near the cards' (the editor's at 2x) */
.ob-anchor { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.ob-lift { position: absolute; left: 0; bottom: 24px; transform: translateX(-50%) scale(1.9); transform-origin: 50% 100%; }
.bp-ob { display: flex; align-items: center; padding: 4px 26px 4px 8px; background: rgba(10, 12, 18, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 38px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.93); font-family: ${UI_FONT}; white-space: nowrap; }
.bp-ob-disc { position: relative; flex: 0 0 auto; width: 67px; height: 67px; }
.bp-ob-disc::after { content: ''; position: absolute; inset: 4px; border: 3.2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.85); }
.bp-ob-icon { position: absolute; left: 50%; top: 50%; width: 31px; height: 31px; transform: translate(-50%, -50%); color: #ffffff; }
.bp-ob-icon svg { display: block; width: 100%; height: 100%; }
.bp-ob-body { display: flex; flex-direction: column; align-items: flex-start; margin-left: 14px; }
.bp-ob-titles { display: grid; }
.bp-ob-titles span { grid-area: 1 / 1; font-family: ${UI_FONT_DISPLAY}; font-size: 20px; font-weight: 800; line-height: 1.15; letter-spacing: -0.01em; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8); opacity: 0; }
.bp-ob-row { margin-top: 6px; font-size: 13px; font-weight: 600; line-height: 15.6px; color: rgba(255, 255, 255, 0.5); }
${runCss.join('\n')}
/* the garage bay outline draws on from both ends, holds, fades */
@keyframes gbRing { 0% { stroke-dashoffset: 100%; opacity: 0 } 6% { opacity: 1 } 45% { stroke-dashoffset: 0; opacity: 1 } 80% { stroke-dashoffset: 0; opacity: 1 } 100% { stroke-dashoffset: 0; opacity: 0 } }
.gb-ring { animation: gbRing 2.8s cubic-bezier(0.3, 0.7, 0.2, 1) infinite; }
/* the 3D interaction prompts, lying on the sheet: whip's keycap and outlined label; .ip is the selected key's place */
.ip { position: absolute; width: ${KEY}px; height: ${KEY}px; }
.ip-col { position: absolute; left: 0; top: 0; width: ${KEY}px; }
.ip-key { position: absolute; left: 0; width: ${KEY}px; height: ${KEY}px; box-sizing: border-box; border-radius: 26%; background: #ffffff; color: rgb(10, 12, 18); display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: inset 0 -8px 0 rgba(10, 12, 18, 0.16), 0 0 0 4px rgba(0, 0, 0, 0.9), 0 6px 10px rgba(0, 0, 0, 0.55); }
.ip-key svg { display: block; }
.ip-ringsvg { position: absolute; overflow: visible; }
.ip-label { position: absolute; left: ${LABEL_X}px; top: 0; height: ${KEY}px; opacity: 0; display: flex; align-items: center; white-space: nowrap; font-family: ${UI_FONT}; font-weight: 700; font-size: ${LABEL_PX}px; letter-spacing: 0.5px; color: #ffffff; text-shadow: -3px -3px 0 #000, 0 -3px 0 #000, 3px -3px 0 #000, -3px 0 0 #000, 3px 0 0 #000, -3px 3px 0 #000, 0 3px 0 #000, 3px 3px 0 #000, 0 4px 14px rgba(0, 0, 0, 0.9); }
${promptCss.join('\n')}
/* the shop talk: whip_core's (css/shops.css, the .inv-talk-* rows) at a ${TALK_H}px row, every size its fraction */
.st { position: absolute; display: flex; flex-direction: column; align-items: flex-start; gap: ${r1(T_GAP)}px; font-family: ${UI_FONT}; }
.st-row { display: flex; align-items: center; padding: ${r1(T_PAD)}px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: ${TALK_H / 2}px; background-color: rgba(10, 12, 18, 0.75); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05); }
.st-face { position: relative; flex: 0 0 auto; width: ${r1(T_FACE)}px; height: ${r1(T_FACE)}px; }
.st-face::after { content: ''; position: absolute; inset: 0; border-radius: 50%; border: ${r1(T_RING)}px solid rgba(255, 255, 255, 0.55); box-shadow: 0 0 0 ${r1(T_RING * 0.75)}px rgba(0, 0, 0, 0.9), 0 0 ${r1(T_RING * 1.5)}px rgba(0, 0, 0, 0.85); }
.st-pic { position: absolute; inset: ${r1(T_RING - 1)}px; overflow: hidden; border-radius: 50%; background: rgba(12, 14, 20, 0.96); }
.st-pic img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
.st-text { position: relative; flex: 0 0 auto; width: 0; height: ${r1(T_FONT * 1.25)}px; overflow: hidden; font-size: ${r1(T_FONT)}px; font-weight: 500; line-height: 1.25; color: rgba(255, 255, 255, 0.93); }
.st-text span { position: absolute; left: 0; top: 0; white-space: nowrap; opacity: 0; }
${talkCss.join('\n')}
/* the dialog capsule: whip_core's (html/interact3d/dialog.html), each cell the page in one state, centred on its middle */
.dg { position: absolute; width: ${DLG_W}px; transform: scale(${DLG_SCALE}); transform-origin: 0 0; font-family: ${UI_FONT}; }
.dg-cell { position: absolute; left: 0; top: 0; width: ${DLG_W}px; transform: translateY(-50%); visibility: hidden; }
.dg-panel { box-sizing: border-box; width: ${DLG_W}px; padding: 24px 30px 28px; border-radius: 38px; background: rgba(10, 12, 18, 0.82); border: 2px solid rgba(255, 255, 255, 0.10); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45); }
.dg-speaker { font-size: 22px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-line { font-size: 34px; font-weight: 600; line-height: 1.25; color: rgba(255, 255, 255, 0.93); margin: 6px 0 18px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.hinted .dg-line { -webkit-line-clamp: 2; }
.dg-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dg-opt { box-sizing: border-box; height: 62px; border-radius: 31px; padding: 0 22px; display: flex; align-items: center; gap: 16px; font-size: 28px; font-weight: 600; color: rgba(255, 255, 255, 0.86); background: rgba(255, 255, 255, 0.05); border: 2px solid rgba(255, 255, 255, 0.08); white-space: nowrap; overflow: hidden; }
.dg-n { flex: none; width: 34px; height: 34px; border-radius: 17px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; background: rgba(255, 255, 255, 0.10); }
.dg-t { overflow: hidden; text-overflow: ellipsis; }
.dg-opt.sel { background: rgba(255, 255, 255, 0.93); color: #0a0c12; border-color: rgba(255, 255, 255, 0.93); }
.dg-opt.sel .dg-n { background: #0a0c12; color: #fff; }
.waiting .dg-opt { opacity: 0.45; }
.dg-hint { margin-top: 14px; font-size: 20px; font-weight: 600; color: rgba(255, 255, 255, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* the typing caret blinks as the game's does (a second, half on) */
@keyframes dgCaret { 50%, 100% { visibility: hidden } }
.dg-caret { animation: dgCaret 1s step-end infinite; }
${dlgCss.join('\n')}
`;

// ---------------------------------------------------------------- the depth of field
// Three blurs, light to strong, each faded in from the top and bottom edges and clear across the middle. A blur
// costs the browser its whole area every frame however much of it its fade hides, so each is only as tall as the
// part that shows: a band at the top, a band at the bottom, the fade redrawn across each. The same picture as one
// screen-sized layer each, for half the blurring. [class, % down to which it is solid at the top, where it is clear
// from and to, % from which it is solid again at the bottom]
const BLURS = [['a-tilt1', 20, 38, 64, 84], ['a-tilt2', 0, 28, 74, 100], ['a-tilt3', 0, 16, 88, 100]];
const blurBands = BLURS.map(([cls, solidTop, clearFrom, clearTo, solidBottom]) => {
    const band = (top, h, stops) => {
        const g = `linear-gradient(to bottom, ${stops})`;
        return `<div class="${cls}" style="position: absolute; left: 0; top: ${r1(top / 100 * 1080)}px; width: 1920px; height: ${r1(h / 100 * 1080)}px; -webkit-mask-image: ${g}; mask-image: ${g}"></div>`;
    };
    const pc = (v) => r1(v) + '%';
    return band(0, clearFrom, `#000 0%, #000 ${pc(solidTop / clearFrom * 100)}, transparent 100%`)
        + band(clearTo, 100 - clearTo, `transparent 0%, #000 ${pc((solidBottom - clearTo) / (100 - clearTo) * 100)}, #000 100%`);
}).join('\n');

// ---------------------------------------------------------------- the markup (the stage's contents)
// For dev/sheet/stage.js: a tile's height (data-per) and the stretch of the sheet the stage can show (data-seen, SEEN).
const markup = `<div data-per="${PER}" data-seen="${SEEN.join(' ')}" style="position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; background: radial-gradient(ellipse at 50% 45%, #123a66 0%, #0b2545 45%, #061426 100%)">
<svg width="0" height="0" style="position: absolute" aria-hidden="true"><defs>
<pattern id="w-minor" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#bfe0ff" stroke-opacity="0.1" stroke-width="1.2"></path></pattern>
<pattern id="w-sheet" width="${PW}" height="${PER}" patternUnits="userSpaceOnUse">
<rect width="${PW}" height="${PER}" fill="url(#w-minor)"></rect>
<path d="${Array.from({ length: PER / 200 }, (_, i) => `M0 ${i * 200}H${PW}`).join('') + Array.from({ length: Math.ceil(PW / 200) + 1 }, (_, i) => `M${i * 200} 0V${PER}`).join('')}" fill="none" stroke="#bfe0ff" stroke-opacity="0.2" stroke-width="1.6"></path>
${sheet.join('')}
</pattern></defs></svg>
<div style="position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; perspective: 1500px; perspective-origin: 50% 38%">
<div style="position: absolute; left: ${960 - (OX - XMIN) * RES}px; top: ${540 - (OY - YMIN) * RES}px; width: ${(XMAX - XMIN) * RES}px; height: ${(PH - YMIN) * RES}px; transform-origin: ${(OX - XMIN) * RES}px ${(OY - YMIN) * RES}px; transform: translateZ(-900px) rotateX(55deg) rotateZ(-30deg) scale3d(${1 / RES}, ${1 / RES}, ${1 / RES})">
<div style="position: absolute; left: 0; top: 0; width: ${(XMAX - XMIN) * RES}px; height: ${(PH - YMIN) * RES}px; overflow: hidden">
<div class="a-move" style="position: absolute; left: 0; top: 0; width: ${(XMAX - XMIN) * RES}px; height: ${MOVE_H * RES}px">
<svg width="${(XMAX - XMIN) * RES}" height="${MOVE_H * RES}" viewBox="${XMIN} ${YMIN} ${XMAX - XMIN} ${MOVE_H}" style="display: block; position: absolute; left: 0; top: 0" aria-hidden="true"><rect x="${XMIN}" y="${YMIN}" width="${XMAX - XMIN}" height="${MOVE_H}" fill="url(#w-sheet)"></rect>${overlay}</svg>
<div style="position: absolute; left: ${-XMIN * RES}px; top: ${-YMIN * RES}px; width: ${XMAX}px; height: ${PH + PER}px; transform: scale(${RES}); transform-origin: 0 0">
${flat}
</div>
</div>
</div>
</div>
</div>
<div style="position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden">
<div class="a-sweep" style="position: absolute; left: 0; top: -600px; width: 520px; height: 2400px; background: linear-gradient(90deg, rgba(150, 205, 255, 0) 0%, rgba(150, 205, 255, 0.09) 50%, rgba(150, 205, 255, 0) 100%)"></div>
</div>
${blurBands}
${LAYER('', 'background: linear-gradient(to bottom, rgba(5, 16, 32, 0.6) 0%, rgba(5, 16, 32, 0.3) 14%, rgba(5, 16, 32, 0) 36%)')}
${LAYER('', 'background: radial-gradient(ellipse 70% 65% at 50% 52%, rgba(0, 0, 0, 0) 55%, rgba(2, 8, 18, 0.8) 100%)')}
${LAYER('', 'background: radial-gradient(ellipse 36% 30% at 50% 50%, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.22) 55%, rgba(0, 0, 0, 0) 100%)')}
</div>`;

const js = `// GENERATED by dev/blueprint.js — change that and run it (node dev/blueprint.js), not this file.
// The blueprint's markup; dev/sheet/stage.js puts it on the stage.
window.WhipBlueprint = ${JSON.stringify(markup.replace(/\n/g, ''))};
`;

fs.writeFileSync(path.join(SHEET, 'blueprint.css'), css);
fs.writeFileSync(path.join(SHEET, 'blueprint.js'), js);
console.log(`wrote dev/sheet/blueprint.css (${(css.length / 1024).toFixed(1)} KB) and dev/sheet/blueprint.js (${(js.length / 1024).toFixed(1)} KB)`);

// The screen draws this blueprint with three.js from photographs of it: take them again now (dev/bp/export.js), or
// it keeps the old picture. SKIP_EXPORT=1 writes the two files above alone.
if (process.env.SKIP_EXPORT !== '1') require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'bp', 'export.js')], { stdio: 'inherit' });
