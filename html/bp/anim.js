// The keyframes the browser held for each piece (dev/bp/export.js reads them with getKeyframes), played back the
// way CSS plays them: per property, between the keyframes that set it, each interval eased by its starting keyframe's
// timing function, an infinite iteration from the shared clock's zero (the live page sets every animation's start to
// the drift's), a negative delay starting it part way in.

// ---- values
export function parseColor(s) {
    if (!s || s === 'transparent') return [0, 0, 0, 0];
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; }
    m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return [...m[1]].map((h) => parseInt(h + h, 16) / 255).concat(1);
    m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1]; }
    throw new Error('colour: ' + s);
}
/** premultiplied, as the browser blends and interpolates */
export const pm = (c) => [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];
const unpm = (c) => (c[3] > 0 ? [c[0] / c[3], c[1] / c[3], c[2] / c[3], c[3]] : [0, 0, 0, 0]);
const lerp = (a, b, f) => a + (b - a) * f;

// a transform as these keyframes use it: translations, one scale, one rotation (in that order)
export function parseTransform(s) {
    const t = { tx: 0, ty: 0, s: 1, rot: 0 };
    if (!s || s === 'none') return t;
    const re = /(\w+)\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(s))) {
        const a = m[2].split(',').map((v) => parseFloat(v));
        switch (m[1]) {
            case 'translate': t.tx += a[0] || 0; t.ty += a[1] || 0; break;
            case 'translate3d': t.tx += a[0] || 0; t.ty += a[1] || 0; break;
            case 'translateX': t.tx += a[0] || 0; break;
            case 'translateY': t.ty += a[0] || 0; break;
            case 'scale': t.s *= a[0]; break;
            case 'rotate': t.rot += a[0]; break;
            default: throw new Error('transform: ' + m[1]);
        }
    }
    return t;
}
// a box-shadow list, as the browser writes it: "rgba(...) 0px 8px 40px 0px[ inset], ..."
export function parseShadows(s) {
    if (!s || s === 'none') return [];
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts.map((p) => {
        const color = /(rgba?\([^)]*\)|#[0-9a-f]+|transparent)/i.exec(p)[1];
        const nums = p.replace(color, '').replace('inset', '').trim().split(/\s+/).map(parseFloat);
        return { inset: /inset/.test(p), x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, c: pm(parseColor(color)) };
    });
}
function lerpShadows(a, b, f) {
    const n = Math.max(a.length, b.length);
    const pad = (s) => ({ inset: s.inset, x: 0, y: 0, blur: 0, spread: 0, c: [0, 0, 0, 0] });
    const out = [];
    for (let i = 0; i < n; i++) {
        const x = a[i] || pad(b[i]), y = b[i] || pad(a[i]);
        if (x.inset !== y.inset) return f < 0.5 ? a : b;   // not interpolable: the list switches whole
        out.push({ inset: x.inset, x: lerp(x.x, y.x, f), y: lerp(x.y, y.y, f), blur: lerp(x.blur, y.blur, f), spread: lerp(x.spread, y.spread, f),
            c: [0, 1, 2, 3].map((k) => lerp(x.c[k], y.c[k], f)) });
    }
    return out;
}

const KIND = (prop) => {
    if (prop === 'opacity') return 'num';
    if (prop === 'transform') return 'transform';
    if (prop === 'boxShadow') return 'shadow';
    if (/Color$/.test(prop)) return 'color';
    if (prop === 'visibility') return 'discrete';
    return 'length';   // width, marginLeft, paddingRight, strokeDashoffset
};
function parseValue(kind, v) {
    switch (kind) {
        case 'num': return parseFloat(v);
        case 'transform': return parseTransform(v);
        case 'shadow': return parseShadows(v);
        case 'color': return pm(parseColor(v));
        case 'length': return { v: parseFloat(v) || 0, pct: /%$/.test(String(v).trim()) };
        default: return v;
    }
}
function interp(kind, a, b, f) {
    switch (kind) {
        case 'num': return lerp(a, b, f);
        case 'transform': return { tx: lerp(a.tx, b.tx, f), ty: lerp(a.ty, b.ty, f), s: lerp(a.s, b.s, f), rot: lerp(a.rot, b.rot, f) };
        case 'shadow': return lerpShadows(a, b, f);
        case 'color': return [0, 1, 2, 3].map((k) => lerp(a[k], b[k], f));
        case 'length':
            if (a.pct !== b.pct && a.v !== 0 && b.v !== 0) return f < 0.5 ? a : b;
            return { v: lerp(a.v, b.v, f), pct: a.v === 0 ? b.pct : a.pct };
        default:
            // visibility: visible anywhere strictly between the two if either end is
            if (a === 'visible' || b === 'visible') return f <= 0 ? a : f >= 1 ? b : 'visible';
            return f < 0.5 ? a : b;
    }
}

// ---- timing functions
function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, DX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let t = x;
        for (let i = 0; i < 8; i++) {
            const e = X(t) - x;
            if (Math.abs(e) < 1e-6) return Y(t);
            const d = DX(t);
            if (Math.abs(d) < 1e-6) break;
            t -= e / d;
        }
        let lo = 0, hi = 1;
        t = x;
        for (let i = 0; i < 30; i++) { const v = X(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
        return Y(t);
    };
}
const EASES = { linear: (x) => x, ease: bezier(0.25, 0.1, 0.25, 1), 'ease-in': bezier(0.42, 0, 1, 1), 'ease-out': bezier(0, 0, 0.58, 1),
    'ease-in-out': bezier(0.42, 0, 0.58, 1), 'step-end': (x) => (x >= 1 ? 1 : 0), 'step-start': (x) => (x > 0 ? 1 : 0) };
const easeCache = new Map();
export function easing(s) {
    s = (s || 'linear').trim();
    if (EASES[s]) return EASES[s];
    if (easeCache.has(s)) return easeCache.get(s);
    let f;
    let m = /^cubic-bezier\(([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(',').map(Number); f = bezier(p[0], p[1], p[2], p[3]); }
    m = /^steps\((\d+)(?:,\s*([\w-]+))?\)$/.exec(s);
    if (m) {
        const n = +m[1], pos = m[2] || 'end';
        f = (pos === 'start' || pos === 'jump-start') ? (x) => Math.min(1, Math.ceil(x * n) / n) : (x) => (x >= 1 ? 1 : Math.floor(x * n) / n);
    }
    if (!f) throw new Error('easing: ' + s);
    easeCache.set(s, f);
    return f;
}

/**
 * One use of an animation on one piece, ready to sample: { a: index into anims, base: { prop: value } } becomes
 * sample(t) -> { prop: value } for every property it moves (t in seconds on the shared clock).
 */
export function compileUse(use, anims) {
    const A = anims[use.a];
    const props = {};
    for (const k of A.keyframes) for (const p of Object.keys(k)) if (p !== 'offset' && p !== 'easing') props[p] = true;
    const tracks = Object.keys(props).map((prop) => {
        const kind = KIND(prop);
        const kfs = A.keyframes.filter((k) => k[prop] !== undefined).map((k) => ({ o: k.offset, e: easing(k.easing), v: parseValue(kind, k[prop]) }));
        const base = use.base && use.base[prop] !== undefined ? parseValue(kind, use.base[prop]) : null;
        if (kfs[0].o > 0 && base !== null) kfs.unshift({ o: 0, e: easing('linear'), v: base });
        if (kfs[kfs.length - 1].o < 1 && base !== null) kfs.push({ o: 1, e: easing('linear'), v: base });
        return { prop, kind, kfs };
    });
    const dur = A.duration, delay = A.delay;
    return (t) => {
        const out = {};
        let local = t * 1000 - delay;
        if (local < 0) { for (const tr of tracks) out[tr.prop] = use.base ? parseValue(tr.kind, use.base[tr.prop]) : tr.kfs[0].v; return out; }
        const p = (local % dur) / dur;
        for (const tr of tracks) {
            const k = tr.kfs;
            let i = 0;
            while (i < k.length - 2 && p >= k[i + 1].o) i++;
            const a = k[i], b = k[i + 1] || a;
            const span = b.o - a.o;
            const f = span > 0 ? Math.min(1, Math.max(0, (p - a.o) / span)) : 1;
            out[tr.prop] = interp(tr.kind, a.v, b.v, a.e(f));
        }
        return out;
    };
}

/** Every use in a list sampled and merged: what a piece's animations say at t. */
export function compileUses(uses, anims) {
    const fs = (uses || []).map((u) => compileUse(u, anims));
    return (t) => { const o = {}; for (const f of fs) Object.assign(o, f(t)); return o; };
}

export { unpm };
