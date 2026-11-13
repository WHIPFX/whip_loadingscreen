// The loading screen's blueprint, drawn with three.js. It is designed as a web page (dev/blueprint.js writes the sheet
// into dev/sheet: never sent to players), but that page is ~8,000 elements and 241 CSS animations under a 3D perspective,
// and a browser gives every moving piece its own full-sharpness layer: hundreds of MB. Here every piece is a picture
// the browser drew (dev/bp/export.js photographs them flat into a texture page), laid on ONE tilted plane in the
// browser's own paint order, and moved by the very keyframes the browser held. What a picture cannot be (the grid,
// the wires and their running dashes, card glows, the shop rows widening, the hold and bay rings drawing) is drawn
// by one shader from the same numbers. The depth of field (three backdrop blurs) and the shades are passes over it.
// three.js (r170, MIT) is this folder's own copy, vendor/: the loading screen can't load whip_core's files.
//
//   start(canvas, { base })   draws into `canvas` until the page goes; resolves false if WebGL2 is missing.
import * as THREE from './vendor/three.module.min.js';
import { compileUses, parseShadows, parseColor, pm, parseTransform } from './anim.js';

const K = { SPRITE: 0, SHADOW: 1, CAPSULE: 2, RING: 3, ANNULUS: 4, WIRE: 5, GRID: 6 };
const FLOATS = 21;                // per vertex: pos 2, local 2, uv 2, uv2 2, kind 1, A 4, B 4, C 4
const MAX_QUADS = 12000;

// ---------------------------------------------------------------- matrices (column-major, as GLSL wants them)
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
    const r = new Array(16);
    for (let c = 0; c < 4; c++) for (let rI = 0; rI < 4; rI++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + rI] * b[c * 4 + k];
        r[c * 4 + rI] = s;
    }
    return r;
}
const T = (x, y, z) => { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; };
const S = (x, y, z) => { const m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; };
// CSS's own rotations: y points down the screen, z at the viewer
const RX = (deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const RZ = (deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
const PERSP = (d) => { const m = ident(); m[11] = -1 / d; return m; };
/** A CSS transform list ("translateZ(-900px) rotateX(55deg) ...") as one matrix. */
function cssMatrix(s) {
    let m = ident();
    const re = /(\w+)\(([^)]*)\)/g;
    let f;
    while ((f = re.exec(s))) {
        const a = f[2].split(',').map((v) => parseFloat(v));
        if (f[1] === 'translateZ') m = mul(m, T(0, 0, a[0]));
        else if (f[1] === 'rotateX') m = mul(m, RX(a[0]));
        else if (f[1] === 'rotateZ') m = mul(m, RZ(a[0]));
        else if (f[1] === 'scale3d') m = mul(m, S(a[0], a[1], a[2]));
        else throw new Error('plane transform: ' + f[1]);
    }
    return m;
}

// ---------------------------------------------------------------- shaders
const PLANE_VS = `
in vec2 aPos; in vec2 aLocal; in vec2 aUv; in vec2 aUv2; in float aKind; in vec4 aA; in vec4 aB; in vec4 aC;
uniform mat4 uMvp; uniform float uDrift;
out vec2 vPlane; out vec2 vLocal; out vec2 vUv; out vec2 vUv2;
flat out float vKind; flat out vec4 vA; flat out vec4 vB; flat out vec4 vC;
void main() {
    vPlane = vec2(aPos.x, aPos.y - uDrift);
    vLocal = aLocal; vUv = aUv; vUv2 = aUv2; vKind = aKind; vA = aA; vB = aB; vC = aC;
    gl_Position = uMvp * vec4(aPos, 0.0, 1.0);
}`;
const PLANE_FS = `
precision highp float;
uniform sampler2D uP0; uniform sampler2D uP1; uniform sampler2D uP2; uniform sampler2D uP3;
uniform vec4 uClip;                 // the plane's box, before the drift: x0 y0 x1 y1
uniform float uDebug;               // tests: 1 paints every quad by its kind
uniform float uSharp;               // texture gradients' scale: under 1 picks sharper mip levels
uniform vec4 uGridA;                // tile w, tile h, minor size, minor width
uniform vec4 uGridB;                // major step, major width, minor opacity, major opacity
uniform vec3 uGridColor; uniform vec3 uLineColor;
uniform vec4 uLine0;                // the tile's edge: y, width, opacity, -
uniform vec4 uLine1;                // the road: y1, y2, width, opacity
uniform vec4 uLine2;                // the road's middle: y, width, opacity, dash
uniform float uLine2Gap;
in vec2 vPlane; in vec2 vLocal; in vec2 vUv; in vec2 vUv2;
flat in float vKind; flat in vec4 vA; flat in vec4 vB; flat in vec4 vC;
out vec4 outColor;

vec2 uvdx, uvdy;
vec4 page(float p, vec2 uv) {
    if (p < 0.5) return textureGrad(uP0, uv, uvdx, uvdy);
    if (p < 1.5) return textureGrad(uP1, uv, uvdx, uvdy);
    if (p < 2.5) return textureGrad(uP2, uv, uvdx, uvdy);
    return textureGrad(uP3, uv, uvdx, uvdy);
}
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
// SOFT: the texel size (sheet units) of the layer the live page draws this kind on. Chrome rasters it at that size
// and stretches it bilinearly, so its edges spread by about half a texel each way: the same spread here, on top of
// the pixel's own footprint (box widths add as variances: a texel raster and a bilinear stretch are 3 SOFT^2 / 12).
float SOFT = 0.0;
float cover(float d) { float w = fwidth(d); float r = sqrt(w * w + 3.0 * SOFT * SOFT); return clamp(0.5 - d / max(r, 1e-4), 0.0, 1.0); }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

// a Gaussian-blurred rounded box (Evan Wallace's integral): a box-shadow's blur, sigma = blur radius / 2
float gauss(float x, float s) { return exp(-(x * x) / (2.0 * s * s)) / (2.5066283 * s); }
vec2 erf2(vec2 x) { vec2 s = sign(x), a = abs(x); x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a; x *= x; return s - s / (x * x); }
float boxShadowX(float x, float y, float s, float corner, vec2 hs) {
    float delta = min(hs.y - corner - abs(y), 0.0);
    float curved = hs.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
    vec2 integral = 0.5 + 0.5 * erf2((x + vec2(-curved, curved)) * (sqrt(0.5) / s));
    return integral.y - integral.x;
}
float boxShadow(vec2 hs, vec2 p, float s, float corner) {
    float low = p.y - hs.y, high = p.y + hs.y;
    float start = clamp(-3.0 * s, low, high), end = clamp(3.0 * s, low, high);
    float step = (end - start) / 6.0, y = start + step * 0.5, v = 0.0;
    for (int i = 0; i < 6; i++) { v += boxShadowX(p.x, p.y - y, s, corner, hs) * gauss(y, s) * step; y += step; }
    return v;
}
// how much of the pixel's footprint [x-h, x+h] lies on bands [kP+a, kP+b]: an exact box filter
float F(float x, float P, float a, float b) { float k = floor(x / P); return k * (b - a) + clamp(x - k * P - a, 0.0, b - a); }
float foot(float fw) { return max(sqrt(fw * fw + 3.0 * SOFT * SOFT), 1e-3) * 0.5; }
float bands(float x, float fw, float P, float a, float b) { float h = foot(fw); return (F(x + h, P, a, b) - F(x - h, P, a, b)) / (2.0 * h); }
float band1(float x, float fw, float a, float b) { float h = foot(fw); return (clamp(x + h, a, b) - clamp(x - h, a, b)) / (2.0 * h); }

// where a point lies along a rounded rect's outline, clockwise from its top edge's left end (SVG's rect path)
float perimeter(vec2 p, vec2 hb, float r) {
    float w = 2.0 * (hb.x - r), h = 2.0 * (hb.y - r), q = 1.5707963 * r;
    vec2 c = clamp(p, -hb + r, hb - r);
    if (abs(p.x) > hb.x - r && abs(p.y) > hb.y - r) {
        vec2 d = p - c;
        float ang = atan(d.y, d.x);
        if (p.x > 0.0 && p.y < 0.0) return w + (ang + 1.5707963) * r;
        if (p.x > 0.0) return w + q + h + ang * r;
        if (p.y > 0.0) return w + q + h + q + w + (ang - 1.5707963) * r;
        return w + q + h + q + w + q + h + ((ang < 0.0 ? ang + 6.2831853 : ang) - 3.1415927) * r;
    }
    float dt = abs(p.y + hb.y), db = abs(p.y - hb.y), dl = abs(p.x + hb.x), dr = abs(p.x - hb.x);
    float m = min(min(dt, db), min(dl, dr));
    if (m == dt) return p.x + hb.x - r;
    if (m == dr) return w + q + (p.y + hb.y - r);
    if (m == db) return w + q + h + q + (hb.x - r - p.x);
    return w + q + h + q + w + q + (hb.y - r - p.y);
}

void main() {
    if (vPlane.x < uClip.x || vPlane.x > uClip.z || vPlane.y < uClip.y || vPlane.y > uClip.w) discard;
    // uSharp 1: plain trilinear, measured closest to the sheet (dev/bp/compare.js); under 1 would pick sharper mips
    uvdx = dFdx(vUv) * uSharp; uvdy = dFdy(vUv) * uSharp;
    int kind = int(vKind + 0.5);
    if (kind != ${K.SPRITE}) SOFT = vUv.y;   // every drawn kind carries its layer's texel size in uv.y
    vec4 col = vec4(0.0);
    if (kind == ${K.SPRITE}) {
        vec4 c = page(vA.z, vUv);
        if (vA.y > 0.0) c = mix(c, page(vA.w, vUv2), vA.y);
        if (vB.z > vB.x && (vLocal.x < vB.x || vLocal.x > vB.z || vLocal.y < vB.y || vLocal.y > vB.w)) discard;
        col = c * vA.x;
    } else if (kind == ${K.SHADOW}) {
        // vLocal: from the border box's centre. vA: its half size, radius, sigma. vB: offset, spread
        vec2 p = vLocal - vB.xy;
        float sp = vB.z, r = vA.z;
        vec2 hs = max(vA.xy + sp, vec2(0.0));
        float rs = sp > 0.0 ? (r / sp < 1.0 ? r + sp * (1.0 + pow(r / sp - 1.0, 3.0)) : r + sp) : max(r + sp, 0.0);
        rs = min(rs, min(hs.x, hs.y));
        float a = vA.w < 0.25 ? cover(sdRR(p, hs, rs)) : boxShadow(hs, p, vA.w, rs);
        a *= 1.0 - cover(sdRR(vLocal, vA.xy, r));   // a shadow is never drawn under its box
        col = vC * a;
    } else if (kind == ${K.CAPSULE}) {
        // a shop row: the background over the border box, the inset highlight, the border over both
        float r = min(vA.z, min(vA.x, vA.y));
        float outer = cover(sdRR(vLocal, vA.xy, r));
        float inner = cover(sdRR(vLocal, vA.xy - vA.w, max(r - vA.w, 0.0)));
        float shifted = cover(sdRR(vLocal - vec2(0.0, vUv2.y), vA.xy - vA.w, max(r - vA.w, 0.0)));
        col = vC * outer;
        col = over(vec4(vUv2.x) * inner * (1.0 - shifted), col);
        col = over(vB * max(outer - inner, 0.0), col);
        col *= vUv.x;
    } else if (kind == ${K.RING}) {
        // a rounded rect's stroke, dashed as SVG dashes it: vA half size, radius, width; vB offset, dash, round cap, path units per unit
        vec2 hb = vA.xy; float r = vA.z, sw = vA.w, k = vB.w;
        float across = abs(sdRR(vLocal, hb, r));
        float s = perimeter(vLocal, hb, r) * k;
        float D = vB.y, u = mod(s + vB.x, 2.0 * D);
        float a;
        if (vB.z > 0.5) {
            float da = u < D ? 0.0 : min(u - D, 2.0 * D - u) / k;
            a = cover(length(vec2(da, across)) - sw * 0.5);
        } else {
            float inside = (u < D ? min(u, D - u) : -min(u - D, 2.0 * D - u)) / k;
            a = cover(across - sw * 0.5) * clamp(inside / (2.0 * foot(fwidth(s / k))) + 0.5, 0.0, 1.0);
        }
        col = vC * a;
    } else if (kind == ${K.ANNULUS}) {
        float rr = length(vLocal);
        col = vC * cover(max(rr - vA.x, (vA.x - vA.y) - rr));
    } else if (kind == ${K.WIRE}) {
        // vLocal: along, across. vA: half width, dash on, dash period, dash offset. vB.x: round caps
        float t = abs(vLocal.y), a;
        if (vA.z <= 0.0) a = cover(t - vA.x);
        else {
            float u = mod(vLocal.x + vA.w, vA.z);
            float da = u < vA.y ? 0.0 : min(u - vA.y, vA.z - u);
            if (vB.x > 0.5) a = cover(length(vec2(da, t)) - vA.x);
            else a = cover(t - vA.x) * (da > 0.0 ? 0.0 : 1.0);
        }
        col = vC * a;
    } else if (kind == ${K.GRID}) {
        // the sheet's pattern: the 40 grid, the 200 grid, the tile's edge and the road, as the SVG pattern draws them
        vec2 fw = fwidth(vLocal);
        float tx = mod(vLocal.x, uGridA.x), ty = mod(vLocal.y, uGridA.y);
        float mx = bands(tx, fw.x, uGridA.z, 0.0, uGridA.w), my = bands(ty, fw.y, uGridA.z, 0.0, uGridA.w);
        float minor = 1.0 - (1.0 - mx) * (1.0 - my);
        float hw = uGridB.y * 0.5;
        float Mx = bands(tx + hw, fw.x, uGridB.x, 0.0, uGridB.y);
        float My = bands(ty + hw, fw.y, uGridB.x, 0.0, uGridB.y) * step(ty, uGridA.y - hw);
        float major = 1.0 - (1.0 - Mx) * (1.0 - My);
        col = vec4(uGridColor, 1.0) * (minor * uGridB.z);
        col = over(vec4(uGridColor, 1.0) * (major * uGridB.w), col);
        float edge = band1(ty, fw.y, uLine0.x - uLine0.y * 0.5, uLine0.x + uLine0.y * 0.5);
        col = over(vec4(uLineColor, 1.0) * (edge * uLine0.z), col);
        float road = max(band1(ty, fw.y, uLine1.x - uLine1.z * 0.5, uLine1.x + uLine1.z * 0.5), band1(ty, fw.y, uLine1.y - uLine1.z * 0.5, uLine1.y + uLine1.z * 0.5));
        col = over(vec4(uLineColor, 1.0) * (road * uLine1.w), col);
        float mid = band1(ty, fw.y, uLine2.x - uLine2.y * 0.5, uLine2.x + uLine2.y * 0.5) * bands(tx, fw.x, uLine2.w + uLine2Gap, 0.0, uLine2.w);
        col = over(vec4(uLineColor, 1.0) * (mid * uLine2.z), col);
    }
    if (uDebug > 0.5) col = over(col, vec4(float(kind == 0), float(kind == 1 || kind == 6), float(kind >= 2 && kind < 6), 1.0) * 0.25);
    outColor = col;
}`;

// full-screen passes: the stage's ground, the sweep, the depth of field's bands, the shades
const FS_VS = `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const STAGE_FN = `
uniform vec4 uStage;   // canvas w, h (px), stage px -> canvas px, -
vec2 stageAt(vec2 frag) { return vec2((frag.x - uStage.x * 0.5) / uStage.z + 960.0, 540.0 - (frag.y - uStage.y * 0.5) / uStage.z); }
// CSS gradients mix in premultiplied colour
vec4 stops3(float t, vec4 c0, float p0, vec4 c1, float p1, vec4 c2, float p2) {
    if (t <= p0) return c0;
    if (t <= p1) return mix(c0, c1, (t - p0) / (p1 - p0));
    if (t <= p2) return mix(c1, c2, (t - p1) / (p2 - p1));
    return c2;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }`;
const GROUND_FS = `
precision highp float;
${STAGE_FN}
in vec2 vUv; out vec4 outColor;
void main() {
    // radial-gradient(at 50% 45%, #123a66 0%, #0b2545 45%, #061426 100%): an ellipse to the farthest corner
    vec2 s = stageAt(gl_FragCoord.xy);
    vec2 d = (s - vec2(960.0, 486.0)) / vec2(960.0 * 1.4142136, 594.0 * 1.4142136);
    float t = length(d);
    outColor = stops3(t, vec4(18.0, 58.0, 102.0, 255.0) / 255.0, 0.0, vec4(11.0, 37.0, 69.0, 255.0) / 255.0, 0.45, vec4(6.0, 20.0, 38.0, 255.0) / 255.0, 1.0);
}`;
const SWEEP_VS = `
in vec3 position;
uniform vec4 uStage; uniform vec3 uSweep;   // its translate x, rotation (rad), -
uniform vec4 uRect;                          // left, top, w, h
out float vU;
void main() {
    vec2 local = position.xy * 0.5 + 0.5;    // 0..1 across and down the strip
    vU = local.x;
    vec2 c = uRect.xy + uRect.zw * 0.5;
    vec2 p = uRect.xy + local * uRect.zw - c;
    float cs = cos(uSweep.y), sn = sin(uSweep.y);
    vec2 st = c + vec2(uSweep.x, 0.0) + vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
    vec2 px = (st - vec2(960.0, 540.0)) * uStage.z;
    gl_Position = vec4(px.x / (uStage.x * 0.5), -px.y / (uStage.y * 0.5), 0.0, 1.0);
}`;
const SWEEP_FS = `
precision highp float;
in float vU; out vec4 outColor;
uniform vec4 uSweepColor;
void main() { float a = uSweepColor.a * (1.0 - abs(vU * 2.0 - 1.0)); outColor = vec4(uSweepColor.rgb * a, a); }`;
const BLUR_FS = `
precision highp float;
uniform sampler2D uSrc; uniform vec2 uDir; uniform float uSigma;   // sigma in output pixels; uDir one output pixel in uv
in vec2 vUv; out vec4 outColor;
void main() {
    float s = max(uSigma, 0.01);
    int n = int(min(ceil(s * 3.0), 48.0));
    vec4 acc = texture(uSrc, vUv); float wsum = 1.0;
    for (int i = 1; i <= 48; i++) {
        if (i > n) break;
        float w = exp(-float(i * i) / (2.0 * s * s));
        acc += (texture(uSrc, vUv + uDir * float(i)) + texture(uSrc, vUv - uDir * float(i))) * w;
        wsum += 2.0 * w;
    }
    outColor = acc / wsum;
}`;
const COMP_FS = `
precision highp float;
${STAGE_FN}
uniform sampler2D uSrc; uniform sampler2D uBlur;
uniform vec4 uMaskA; uniform vec4 uMaskB;   // the top band: y0 y1 y2 and alphas packed; see bandMask()
uniform vec4 uMaskC; uniform vec4 uMaskD;
uniform float uShades;
in vec2 vUv; out vec4 outColor;
float piece(float y, float y0, float a0, float y1, float a1) { return mix(a0, a1, clamp((y - y0) / max(y1 - y0, 1e-3), 0.0, 1.0)); }
float bandMask(float y, vec4 ys, vec4 as) {
    // a band from ys.x to ys.w: alpha as.x at ys.x, as.y at ys.y, as.z at ys.z (= ys.w)
    if (y < ys.x || y > ys.w) return 0.0;
    return y < ys.y ? piece(y, ys.x, as.x, ys.y, as.y) : piece(y, ys.y, as.y, ys.z, as.z);
}
void main() {
    vec2 s = stageAt(gl_FragCoord.xy);
    float m = bandMask(s.y, uMaskA, uMaskB) + bandMask(s.y, uMaskC, uMaskD);
    vec4 c = mix(texture(uSrc, vUv), texture(uBlur, vUv), clamp(m, 0.0, 1.0));
    if (uShades > 0.5) {
        // linear-gradient(rgba(5,16,32,.6) 0%, rgba(5,16,32,.3) 14%, rgba(5,16,32,0) 36%)
        vec4 a = vec4(5.0, 16.0, 32.0, 255.0) / 255.0;
        c = over(stops3(s.y / 1080.0, a * 0.6, 0.0, a * 0.3, 0.14, vec4(0.0), 0.36), c);
        // radial-gradient(70% 65% at 50% 52%, rgba(0,0,0,0) 55%, rgba(2,8,18,.8) 100%)
        float t2 = length((s - vec2(960.0, 561.6)) / vec2(1344.0, 702.0));
        c = over(stops3(t2, vec4(0.0), 0.55, vec4(0.0), 0.55, vec4(2.0, 8.0, 18.0, 255.0) / 255.0 * 0.8, 1.0), c);
        // radial-gradient(36% 30%, rgba(0,0,0,.55) 0%, rgba(0,0,0,.22) 55%, rgba(0,0,0,0) 100%)
        float t3 = length((s - vec2(960.0, 540.0)) / vec2(691.2, 324.0));
        c = over(stops3(t3, vec4(0.0, 0.0, 0.0, 0.55), 0.0, vec4(0.0, 0.0, 0.0, 0.22), 0.55, vec4(0.0), 1.0), c);
    }
    outColor = vec4(c.rgb, 1.0);
}`;

// ---------------------------------------------------------------- the scene's pieces, compiled
const num = (v) => parseFloat(v) || 0;
function parseWire(d) {
    const n = d.replace(/[MC]/g, ' ').trim().split(/[ ,]+/).map(Number);
    if (!/^M[^C]+C/.test(d) || n.length !== 8) throw new Error('wire: ' + d);
    return n;   // x0 y0, c1, c2, x1 y1
}
// a cubic Bézier as a strip: points, unit normals (mitred) and the distance along it at each
function ribbon(b) {
    const P = (t) => {
        const u = 1 - t;
        return [u * u * u * b[0] + 3 * u * u * t * b[2] + 3 * u * t * t * b[4] + t * t * t * b[6],
            u * u * u * b[1] + 3 * u * u * t * b[3] + 3 * u * t * t * b[5] + t * t * t * b[7]];
    };
    const approx = Math.hypot(b[6] - b[0], b[7] - b[1]) + Math.hypot(b[2] - b[0], b[3] - b[1]) + Math.hypot(b[6] - b[4], b[7] - b[5]);
    const N = Math.max(16, Math.min(160, Math.ceil(approx / 10)));
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(P(i / N));
    const s = [0];
    for (let i = 1; i <= N; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const nrm = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], c = pts[Math.min(N, i + 1)];
        const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
        return [-dy / l, dx / l];
    });
    return { pts, nrm, s };
}

function compile(scene) {
    const A = scene.anims;
    const sp = scene.sprites;
    const u = (list) => compileUses(list, A);
    const wireKind = (w) => {
        const cls = w.class || '';
        return { cls, width: num(w['stroke-width']), color: pm(parseColor(w.stroke)), round: w['stroke-linecap'] === 'round',
            dash: w['stroke-dasharray'] ? w['stroke-dasharray'].split(/[ ,]+/).map(Number) : null, anim: u(w.anims), rib: ribbon(parseWire(w.d)) };
    };
    const prompt = (p) => ({
        col: u(p.col),
        keys: p.keys.map((k) => ({ sp: sp[k.cap], cx: k.cx, cy: k.cy, anim: u(k.anims) })),
        labels: p.labels.map((l) => ({ sp: sp[l.cap], anim: u(l.anims) })),
        ring: Object.assign({}, p.ring, { color: pm(parseColor(p.ring.stroke)), anim: u(p.ring.anims) }),
    });
    const runs = {};
    for (const [key, r] of Object.entries(scene.runs)) {
        const ov = r.overlay;
        runs[key] = {
            v: r.v,
            art: ov.art.map((id) => sp[id]),
            gb: ov.gb && Object.assign({}, ov.gb, { color: pm(parseColor(ov.gb.stroke)), anim: u(ov.gb.anims) }),
            wires: ov.wires.map(wireKind),
            cards: r.cards.map((c) => ({ sp: sp[c.cap], rect: c.rect, radius: c.radius, still: parseShadows(c.shadow), anim: c.anims.length ? u(c.anims) : null })),
            ob: {
                scale: r.objective.scale, anchor: u(r.objective.anchor), ob: u(r.objective.ob), ring: u(r.objective.ring),
                white: sp[r.objective.white], blue: sp[r.objective.blue],
                titles: r.objective.titles.map((t) => ({ sp: sp[t.cap], anim: u(t.anims) })),
            },
            talk: r.talk.map((row) => {
                const sh = parseShadows(row.shadow);
                return {
                    rect: row.rect, radius: row.radius, border: row.border, padRight: row.padRight, row: u(row.anims),
                    outer: sh.filter((x) => !x.inset), inset: sh.find((x) => x.inset) || null,
                    bg: pm(parseColor(row.bg)), borderColor: pm(parseColor(row.borderColor)),
                    face: { sp: sp[row.face.cap], cx: row.face.cx, cy: row.face.cy, r: row.face.r, ring: row.face.ring,
                        ringColor: pm(parseColor(row.face.ringColor)), anim: u(row.face.anims) },
                    text: { x: row.text.x, y: row.text.y, h: row.text.h, anim: u(row.text.anims) },
                    lines: row.lines.map((l) => ({ sp: sp[l.cap], anim: u(l.anims) })),
                };
            }),
            prompts: r.prompts.map(prompt),
            dialog: { fade: u(r.dialog.fade), cells: r.dialog.cells.map((c) => ({ sp: sp[c.cap], anim: u(c.anims),
                caret: c.caret ? { sp: sp[c.caret.cap], anim: u(c.caret.anims) } : null })) },
        };
    }
    // the gb-ring's percentage offset is of the SVG viewport's normalised diagonal (the sheet's viewBox)
    const vb = scene.meta.viewBox;
    const diag = Math.sqrt((vb[2] * vb[2] + vb[3] * vb[3]) / 2);
    return {
        runs, door: prompt(scene.door), sheetArt: scene.sheet.art.map((id) => sp[id]), grid: scene.sheet.grid, diag,
        drift: u(scene.drift), sweep: Object.assign({}, scene.stage.sweep, { anim: u(scene.stage.sweep.anims) }),
        // the run each copy of the tile shows: run key with its third (data-p) on copy 0
        order: Object.keys(runs),
    };
}

// ---------------------------------------------------------------- the draw list
class Batch {
    constructor() { this.f = new Float32Array(MAX_QUADS * 4 * FLOATS); this.n = 0; this.softSvg = 0; this.softHtml = 0; }
    reset() { this.n = 0; }
    /** uv for a drawn kind: its layer's texel size in v (the shader's SOFT) */
    soft(v) { return [0, v, 0, v, 0, v, 0, v]; }
    // a quad: four corners (pos), their local coordinates and uvs, the kind and its three parameter sets
    quad(pos, local, uv, uv2, kind, a, b, c) {
        if (this.n >= MAX_QUADS) return;
        const f = this.f;
        let o = this.n * 4 * FLOATS;
        for (let i = 0; i < 4; i++) {
            f[o] = pos[i * 2]; f[o + 1] = pos[i * 2 + 1];
            f[o + 2] = local[i * 2]; f[o + 3] = local[i * 2 + 1];
            f[o + 4] = uv ? uv[i * 2] : 0; f[o + 5] = uv ? uv[i * 2 + 1] : 0;
            f[o + 6] = uv2 ? uv2[i * 2] : 0; f[o + 7] = uv2 ? uv2[i * 2 + 1] : 0;
            f[o + 8] = kind;
            f[o + 9] = a[0]; f[o + 10] = a[1]; f[o + 11] = a[2]; f[o + 12] = a[3];
            f[o + 13] = b[0]; f[o + 14] = b[1]; f[o + 15] = b[2]; f[o + 16] = b[3];
            f[o + 17] = c[0]; f[o + 18] = c[1]; f[o + 19] = c[2]; f[o + 20] = c[3];
            o += FLOATS;
        }
        this.n++;
    }
    // an axis-aligned rect in sheet units; its local coordinates either the sheet's or its own centre's
    rect(x, y, w, h, kind, a, b, c, centred, uv, uv2) {
        const pos = [x, y, x + w, y, x + w, y + h, x, y + h];
        const local = centred ? [-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2] : pos;
        this.quad(pos, local, uv, uv2, kind, a, b, c);
    }
    sprite(s, dx, dy, opacity, opts) {
        if (!s || opacity <= 0.002) return;
        const o = opts || {};
        const sc = o.scale || 1;
        let x = s.x + dx, y = s.y + dy, w = s.w, h = s.h;
        if (sc !== 1) { x = o.cx + dx + (s.x - o.cx) * sc; y = o.cy + dy + (s.y - o.cy) * sc; w *= sc; h *= sc; }
        const uv = [s.u0, s.v0, s.u1, s.v0, s.u1, s.v1, s.u0, s.v1];
        const s2 = o.alt;
        const uv2 = s2 ? [s2.u0, s2.v0, s2.u1, s2.v0, s2.u1, s2.v1, s2.u0, s2.v1] : null;
        const clip = o.clip || [0, 0, 0, 0];
        this.rect(x, y, w, h, K.SPRITE, [opacity, s2 ? o.mix : 0, s.p, s2 ? s2.p : 0], clip, [0, 0, 0, 0], false, uv, uv2);
    }
    // outer box-shadows of a border box, drawn last-first (the first in the list paints on top)
    shadows(list, x, y, w, h, radius, opacity) {
        for (let i = list.length - 1; i >= 0; i--) {
            const s = list[i];
            if (s.inset || s.c[3] * opacity < 0.002) continue;
            const sigma = s.blur / 2;
            const ext = Math.max(0, s.spread) + sigma * 3 + 2;
            const qx = x + Math.min(0, s.x) - ext, qy = y + Math.min(0, s.y) - ext;
            const qw = w + Math.abs(s.x) + ext * 2, qh = h + Math.abs(s.y) + ext * 2;
            const cx = x + w / 2, cy = y + h / 2;
            const pos = [qx, qy, qx + qw, qy, qx + qw, qy + qh, qx, qy + qh];
            const local = [qx - cx, qy - cy, qx + qw - cx, qy - cy, qx + qw - cx, qy + qh - cy, qx - cx, qy + qh - cy];
            this.quad(pos, local, this.soft(this.softHtml), null, K.SHADOW, [w / 2, h / 2, radius, sigma], [s.x, s.y, s.spread, 0], s.c.map((v) => v * opacity));
        }
    }
    wire(w, dy, opacity, dashOffset) {
        if (opacity <= 0.002) return;
        const hw = w.width / 2, m = hw + 2.5 + this.softSvg * 2;
        const { pts, nrm, s } = w.rib;
        const col = w.color.map((v) => v * opacity);
        const a = [hw, w.dash ? w.dash[0] : 0, w.dash ? w.dash[0] + (w.dash[1] !== undefined ? w.dash[1] : w.dash[0]) : 0, dashOffset || 0];
        const b = [w.round ? 1 : 0, 0, 0, 0];
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i], p1 = pts[i + 1], n0 = nrm[i], n1 = nrm[i + 1];
            this.quad([p0[0] + n0[0] * m, p0[1] + n0[1] * m + dy, p1[0] + n1[0] * m, p1[1] + n1[1] * m + dy,
                p1[0] - n1[0] * m, p1[1] - n1[1] * m + dy, p0[0] - n0[0] * m, p0[1] - n0[1] * m + dy],
            [s[i], m, s[i + 1], m, s[i + 1], -m, s[i], -m], this.soft(this.softSvg), null, K.WIRE, a, b, col);
        }
    }
    ring(g, dy, opacity, offset, dash, k, soft) {
        if (opacity <= 0.002) return;
        const m = g.sw + 3 + soft * 2;
        this.rect(g.x - m, g.y - m + dy, g.w + m * 2, g.h + m * 2, K.RING, [g.w / 2, g.h / 2, g.rx, g.sw], [offset, dash, g.cap === 'round' ? 1 : 0, k],
            g.color.map((v) => v * opacity), true, this.soft(soft));
    }
}
const perimeterLen = (w, h, r) => 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;

/** One frame of the plane: everything at time t (seconds), in the browser's paint order. */
function build(B, C, t, drift, per, seen) {
    B.reset();
    // the sheet's pattern: one quad over the plane's box (at this drift)
    const XMIN = -100, XMAX = 5200, YMIN = -800, PH = 4200;
    B.rect(XMIN, YMIN + drift, XMAX - XMIN, PH - YMIN, K.GRID, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], false, B.soft(B.softSvg));
    const LOOP = C.loop;
    const n = Math.floor(t / LOOP);
    const copies = [];
    for (let k = -1; k * per < PH + per; k++) {
        if ((k + 1) * per - drift > seen[0] && k * per - drift < seen[1]) copies.push(k);
    }
    // the run a copy shows this loop: the one whose third (data-p on copy k) is this loop's
    const runOf = (k) => C.order.find((key) => ((((C.runs[key].v - k) % 3) + 3) % 3) === ((n % 3) + 3) % 3);
    for (const k of copies) for (const s of C.sheetArt) B.sprite(s, 0, k * per, 1);

    // each run's state once, shared by every copy showing it
    const state = {};
    for (const key of new Set(copies.map(runOf))) state[key] = runState(C.runs[key], t, C);

    // the SVG over the sheet: captions, streets, the bay ring, wires
    for (const k of copies) {
        const key = runOf(k), R = C.runs[key], st = state[key], dy = k * per;
        for (const s of R.art) B.sprite(s, 0, dy, 1);
        if (R.gb) {
            const g = st.gb;
            B.ring(R.gb, dy, g.opacity, g.offset, R.gb.dash, R.gb.pathLength ? R.gb.pathLength / perimeterLen(R.gb.w, R.gb.h, R.gb.rx) : 1, B.softSvg);
        }
        R.wires.forEach((w, i) => B.wire(w, dy, st.wires[i].opacity, st.wires[i].offset));
    }
    // the HTML over that: each copy's run, then the house's door prompt
    for (const k of copies) {
        const key = runOf(k), R = C.runs[key], st = state[key], dy = k * per;
        R.cards.forEach((c, i) => {
            const r = c.rect;
            B.shadows(st.cards[i], r.x, r.y + dy, r.w, r.h, c.radius, 1);
            B.sprite(c.sp, 0, dy, 1);
        });
        const ob = st.ob;
        B.sprite(R.ob.white, ob.x, ob.y + dy, ob.opacity, { alt: R.ob.blue, mix: ob.blue });
        R.ob.titles.forEach((tt, i) => B.sprite(tt.sp, ob.x, ob.y + ob.titles[i].y + dy, ob.opacity * ob.titles[i].opacity));
        R.talk.forEach((row, i) => drawRow(B, row, st.talk[i], dy));
        R.prompts.forEach((p, i) => drawPrompt(B, p, st.prompts[i], dy));
        if (st.dialog.opacity > 0.002) R.dialog.cells.forEach((c, i) => {
            if (!st.dialog.cells[i]) return;
            B.sprite(c.sp, 0, dy, st.dialog.opacity);
            if (c.caret && st.dialog.carets[i]) B.sprite(c.caret.sp, 0, dy, st.dialog.opacity);
        });
        drawPrompt(B, C.door, promptState(C.door, t), dy);
    }
}

const op = (v, d) => (v.opacity !== undefined ? v.opacity : d);
const visible = (v) => v.visibility === undefined || v.visibility === 'visible';
function promptState(p, t) {
    const col = p.col(t).transform;
    return {
        ty: col ? col.ty : 0,
        keys: p.keys.map((k) => { const v = k.anim(t); return { opacity: op(v, 1), scale: v.transform ? v.transform.s : 1 }; }),
        labels: p.labels.map((l) => op(l.anim(t), 0)),
        ring: (() => { const v = p.ring.anim(t); return { opacity: op(v, 1), offset: v.strokeDashoffset ? v.strokeDashoffset.v : 0 }; })(),
    };
}
function drawPrompt(B, p, st, dy) {
    p.keys.forEach((k, i) => B.sprite(k.sp, 0, st.ty + dy, st.keys[i].opacity, { scale: st.keys[i].scale, cx: k.cx, cy: k.cy }));
    p.labels.forEach((l, i) => B.sprite(l.sp, 0, st.ty + dy, st.labels[i]));
    B.ring(p.ring, dy, st.ring.opacity, st.ring.offset, p.ring.dash, 1, B.softHtml);
}
function drawRow(B, row, st, dy) {
    const r = row.rect;
    const w = r.w + (st.padRight - row.padRight) + st.margin + st.width;
    const x = r.x, y = r.y + dy, h = r.h;
    B.shadows(row.outer, x, y, w, h, row.radius, 1);
    const ins = row.inset;
    B.rect(x - 2, y - 2, w + 4, h + 4, K.CAPSULE, [w / 2, h / 2, row.radius, row.border], st.border, st.bg, true,
        [1, B.softHtml, 1, B.softHtml, 1, B.softHtml, 1, B.softHtml], ins ?[ins.c[3], ins.y, ins.c[3], ins.y, ins.c[3], ins.y, ins.c[3], ins.y] : null);
    const f = row.face;
    B.sprite(f.sp, 0, dy, 1);
    const m = f.r + 2;
    B.rect(f.cx - m, f.cy - m + dy, m * 2, m * 2, K.ANNULUS, [f.r, f.ring, 0, 0], [0, 0, 0, 0], st.ring, true, B.soft(B.softHtml));
    const tx = row.text.x + st.margin;
    const clip = [tx, row.text.y + dy, tx + st.width, row.text.y + row.text.h + dy];
    row.lines.forEach((l, i) => B.sprite(l.sp, st.margin, dy, st.lines[i], { clip }));
}
function runState(R, t, C) {
    const st = {};
    if (R.gb) {
        const v = R.gb.anim(t);
        const o = v.strokeDashoffset || { v: 0, pct: false };
        st.gb = { opacity: op(v, 1), offset: o.pct ? o.v / 100 * C.diag : o.v };
    }
    st.wires = R.wires.map((w) => {
        const v = w.anim(t);
        return { opacity: op(v, 1), offset: v.strokeDashoffset ? v.strokeDashoffset.v : 0 };
    });
    st.cards = R.cards.map((c) => (c.anim ? c.anim(t).boxShadow || c.still : c.still));
    const a = R.ob.anchor(t).transform || { tx: 0, ty: 0 };
    const ov = R.ob.ob(t);
    const ring = R.ob.ring(t).borderTopColor;
    st.ob = {
        x: a.tx + (ov.transform ? ov.transform.tx : 0) * R.ob.scale, y: a.ty, opacity: op(ov, 1),
        blue: ring ? Math.min(1, Math.max(0, (1 - ring[0] / Math.max(ring[3], 1e-3)) / (1 - 96 / 255))) : 0,
        titles: R.ob.titles.map((tt) => { const v = tt.anim(t); return { opacity: op(v, 0), y: (v.transform ? v.transform.ty : 0) * R.ob.scale }; }),
    };
    st.talk = R.talk.map((row) => {
        const v = row.row(t), tv = row.text.anim(t), fv = row.face.anim(t);
        return {
            padRight: v.paddingRight ? v.paddingRight.v : row.padRight,
            bg: v.backgroundColor || row.bg, border: v.borderTopColor || row.borderColor,
            width: tv.width ? tv.width.v : 0, margin: tv.marginLeft ? tv.marginLeft.v : 0,
            ring: fv.borderTopColor || row.face.ringColor,
            lines: row.lines.map((l) => op(l.anim(t), 0)),
        };
    });
    st.prompts = R.prompts.map((p) => promptState(p, t));
    const fade = op(R.dialog.fade(t), 1);
    st.dialog = { opacity: fade,
        cells: R.dialog.cells.map((c) => visible(c.anim(t))),
        carets: R.dialog.cells.map((c) => (c.caret ? visible(c.caret.anim(t)) : false)) };
    return st;
}

// ---------------------------------------------------------------- start
export async function start(canvas, options) {
    const opts = Object.assign({ base: new URL('./', import.meta.url).href, maxPixels: 2560 * 1440, maxRatio: 2 }, options || {});
    // (No WebGL 2 probe here: start.js asked, and let its context go. A second one stayed alive all load: audit 20, CLI-7.)
    const scene = await (await fetch(opts.base + 'scene.json')).json();
    // the texture pages as plain images: WebGL premultiplies them on the way up (an ImageBitmap's own options are not
    // honoured everywhere, Safari's especially)
    const images = await Promise.all(scene.pages.map((p) => {
        const im = new Image();
        im.decoding = 'async';
        im.src = opts.base + p.file;
        return im.decode().then(() => im);
    }));
    const C = compile(scene);
    C.loop = scene.anims[scene.drift[0].a].duration / 1000;
    const per = scene.meta.per, seen = scene.meta.seen;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'default' });
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const pages = images.map((im) => {
        const tex = new THREE.Texture(im);
        tex.flipY = false; tex.premultiplyAlpha = true; tex.colorSpace = THREE.NoColorSpace;
        tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = aniso; tex.needsUpdate = true;
        return tex;
    });
    while (pages.length < 4) pages.push(pages[0]);

    // ---- the plane: one mesh, one draw, rewritten each frame
    const B = new Batch();
    B.softSvg = 1 / scene.meta.sigmaSvg; B.softHtml = 1 / scene.meta.sigmaHtml;
    const ib = new THREE.InterleavedBuffer(B.f, FLOATS).setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    const at = (name, size, off) => geo.setAttribute(name, new THREE.InterleavedBufferAttribute(ib, size, off));
    at('aPos', 2, 0); at('aLocal', 2, 2); at('aUv', 2, 4); at('aUv2', 2, 6); at('aKind', 1, 8); at('aA', 4, 9); at('aB', 4, 13); at('aC', 4, 17);
    const idx = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) { const v = q * 4, o = q * 6; idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const g = scene.sheet.grid;
    const lineOf = (l) => ({ ys: [...l.d.matchAll(/M0 ([\d.]+)H/g)].map((m) => +m[1]), w: num(l['stroke-width']), o: num(l['stroke-opacity']),
        dash: l['stroke-dasharray'] ? l['stroke-dasharray'].split(/[ ,]+/).map(Number) : null });
    const L = g.lines.map(lineOf);
    const planeMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: PLANE_VS, fragmentShader: PLANE_FS,
        transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
            uMvp: { value: new THREE.Matrix4() }, uDrift: { value: 0 },
            uP0: { value: pages[0] }, uP1: { value: pages[1] }, uP2: { value: pages[2] }, uP3: { value: pages[3] },
            uClip: { value: new THREE.Vector4(-100, -800, 5200, 4200) },
            uGridA: { value: new THREE.Vector4(g.tile.w, g.tile.h, g.minor.size, g.minor.sw / 2) },
            uGridB: { value: new THREE.Vector4(200, g.major.sw, g.minor.o, g.major.o) },
            uGridColor: { value: new THREE.Vector3(...parseColor(g.minor.color).slice(0, 3)) },
            uLineColor: { value: new THREE.Vector3(...parseColor(g.lines[0].stroke).slice(0, 3)) },
            uLine0: { value: new THREE.Vector4(L[0].ys[0], L[0].w, L[0].o, 0) },
            uLine1: { value: new THREE.Vector4(L[1].ys[0], L[1].ys[1], L[1].w, L[1].o) },
            uLine2: { value: new THREE.Vector4(L[2].ys[0], L[2].w, L[2].o, L[2].dash ? L[2].dash[0] : 1e6) },
            uLine2Gap: { value: L[2].dash ? L[2].dash[1] : 0 },
            uDebug: { value: 0 },
            uSharp: { value: 1 },
        },
    });
    const planeMesh = new THREE.Mesh(geo, planeMat);
    planeMesh.frustumCulled = false;
    const planeScene = new THREE.Scene();
    planeScene.add(planeMesh);
    const cam = new THREE.Camera();

    // ---- full-screen passes
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const stageU = { value: new THREE.Vector4() };
    const pass = (fs, uniforms, extra) => new THREE.RawShaderMaterial(Object.assign({ glslVersion: THREE.GLSL3, vertexShader: FS_VS, fragmentShader: fs,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide, uniforms: Object.assign({ uStage: stageU }, uniforms) }, extra || {}));
    const groundMat = pass(GROUND_FS, {});
    const blurMat = pass(BLUR_FS, { uSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uSigma: { value: 1 } });
    const compMat = pass(COMP_FS, { uSrc: { value: null }, uBlur: { value: null }, uMaskA: { value: new THREE.Vector4() }, uMaskB: { value: new THREE.Vector4() },
        uMaskC: { value: new THREE.Vector4() }, uMaskD: { value: new THREE.Vector4() }, uShades: { value: 0 } });
    const sw = C.sweep;
    const sweepColor = (() => { const m = /rgba\(([^)]+)\) 50%/.exec(sw.background); const p = m[1].split(',').map(Number); return new THREE.Vector4(p[0] / 255, p[1] / 255, p[2] / 255, p[3]); })();
    const sweepMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SWEEP_VS, fragmentShader: SWEEP_FS, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
        transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
        uniforms: { uStage: stageU, uSweep: { value: new THREE.Vector3() }, uRect: { value: new THREE.Vector4(sw.left, sw.top, sw.w, sw.h) }, uSweepColor: { value: sweepColor } } });
    const sweepGeo = new THREE.BufferGeometry();
    sweepGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    const fsMesh = new THREE.Mesh(tri, groundMat); fsMesh.frustumCulled = false;
    const fsScene = new THREE.Scene(); fsScene.add(fsMesh);
    const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat); sweepMesh.frustumCulled = false;
    const sweepScene = new THREE.Scene(); sweepScene.add(sweepMesh);
    const drawFs = (mat, target) => { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, cam); };

    // the depth of field: per class of band, its blur and its two masks (top, bottom) as stage y and alpha
    const bandsBy = {};
    for (const b of scene.stage.bands) (bandsBy[b.cls] = bandsBy[b.cls] || []).push(b);
    const maskOf = (b) => {
        const stops = [...b.mask.matchAll(/(rgba?\([^)]*\)|transparent)\s+([\d.]+)%/g)].map((m) => ({ a: parseColor(m[1])[3], p: +m[2] / 100 }));
        if (stops.length !== 3) throw new Error('band mask: ' + b.mask);
        return [new THREE.Vector4(b.top + stops[0].p * b.h, b.top + stops[1].p * b.h, b.top + stops[2].p * b.h, b.top + b.h),
            new THREE.Vector4(stops[0].a, stops[1].a, stops[2].a, 0)];
    };
    const dof = Object.keys(bandsBy).map((cls) => {
        const list = bandsBy[cls];
        return { sigma: num(/blur\(([\d.]+)px\)/.exec(list[0].blur)[1]), masks: list.map(maskOf) };
    });

    let rtA, rtB, h1, h2, W = 0, H = 0, k = 1;
    function resize() {
        const vw = canvas.clientWidth || window.innerWidth, vh = canvas.clientHeight || window.innerHeight;
        let pr = Math.min(window.devicePixelRatio || 1, opts.maxRatio);
        if (vw * vh * pr * pr > opts.maxPixels) pr = Math.sqrt(opts.maxPixels / (vw * vh));
        renderer.setPixelRatio(pr);
        renderer.setSize(vw, vh, false);
        const w = Math.max(1, Math.round(vw * pr)), h = Math.max(1, Math.round(vh * pr));
        if (w === W && h === H) return;
        W = w; H = h;
        const rt = (ww, hh) => new THREE.WebGLRenderTarget(ww, hh, { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
        for (const r of [rtA, rtB, h1, h2]) if (r) r.dispose();
        rtA = rt(W, H); rtB = rt(W, H);
        h1 = rt(Math.ceil(W / 2), Math.ceil(H / 2)); h2 = rt(Math.ceil(W / 2), Math.ceil(H / 2));
        k = Math.max(vw / 1920, vh / 1080) * pr;   // stage px -> canvas px: the 1920 x 1080 stage covers the screen
        stageU.value.set(W, H, k, 0);
    }

    // sheet units -> clip space: the plane's own transform about its origin, the perspective about its origin, the stage cover
    const st = scene.stage;
    const pl = st.plane;
    const orig = pl.origin.split(' ').map(num);
    const pivot = [pl.left + orig[0], pl.top + orig[1]];
    const scale3 = /scale3d\(([\d.]+)/.exec(pl.transform);
    const res = scale3 ? 1 / num(scale3[1]) : 1;   // the plane div is built at RES and scaled back: one sheet unit = 1 in 3D
    const planeM = mul(T(pivot[0], pivot[1], 0), cssMatrix(pl.transform.replace(/scale3d\([^)]*\)/, '')));
    const d = num(st.perspective);
    const po = st.perspectiveOrigin.split(' ').map((v, i) => (/%$/.test(v) ? num(v) / 100 * (i ? 1080 : 1920) : num(v)));
    const perspM = mul(mul(T(po[0], po[1], 0), PERSP(d)), T(-po[0], -po[1], 0));
    // A sheet point (sx, sy) sits in the plane div at ((sx - XMIN) RES, (sy - YMIN - drift) RES); about the div's
    // transform-origin and scaled back by scale3d(1 / RES), that is (sx - XMIN - ox / RES, sy - YMIN - oy / RES - drift).
    const XMIN = scene.meta.xmin, YMIN = scene.meta.ymin;
    function mvp(drift) {
        const pr = renderer.getPixelRatio(), vw = W / pr, vh = H / pr;
        const s = Math.max(vw / 1920, vh / 1080);
        const kx = s / (vw / 2), ky = s / (vh / 2);
        const ndc = [kx, 0, 0, 0, 0, -ky, 0, 0, 0, 0, 0, 0, -960 * kx, 540 * ky, 0, 1];
        return mul(mul(ndc, mul(perspM, planeM)), T(-(XMIN + orig[0] / res), -(YMIN + orig[1] / res) - drift, 0));
    }

    resize();
    window.addEventListener('resize', resize);
    let t0 = null, held = null, first = true;
    let cpu = 0, frames = 0;   // ms of main-thread work a frame (averaged) and frames drawn: stats()
    function frame(now) {
        const started = performance.now();
        if (t0 === null) t0 = now;
        const t = held !== null ? held : (now - t0) / 1000;
        resize();
        const dv = C.drift(t).transform;
        const drift = -(dv ? dv.ty : 0) / res;   // the moving layer's own px are RES sheet units
        build(B, C, t, drift, per, seen);
        ib.clearUpdateRanges();
        ib.addUpdateRange(0, B.n * 4 * FLOATS);
        ib.needsUpdate = true;
        geo.setDrawRange(0, B.n * 6);
        const M = mvp(drift);
        planeMat.uniforms.uMvp.value.fromArray(M);
        planeMat.uniforms.uDrift.value = drift;

        // the stage: ground, plane, sweep into A
        drawFs(groundMat, rtA);
        renderer.setRenderTarget(rtA);
        renderer.render(planeScene, cam);
        const sv = sw.anim(t).transform || parseTransform('none');
        sweepMat.uniforms.uSweep.value.set(sv.tx, sv.rot * Math.PI / 180, 0);
        renderer.render(sweepScene, cam);
        // the bands, one class at a time, each blurring what the last left; the shades on the way out
        let src = rtA, dst = rtB;
        dof.forEach((band, i) => {
            const sigma = band.sigma * k / 2;   // in half-size pixels
            blurMat.uniforms.uSrc.value = src.texture; blurMat.uniforms.uDir.value.set(1 / h2.width, 0); blurMat.uniforms.uSigma.value = sigma;
            drawFs(blurMat, h2);
            blurMat.uniforms.uSrc.value = h2.texture; blurMat.uniforms.uDir.value.set(0, 1 / h1.height);
            drawFs(blurMat, h1);
            const last = i === dof.length - 1;
            compMat.uniforms.uSrc.value = src.texture; compMat.uniforms.uBlur.value = h1.texture;
            const mk = band.masks;
            compMat.uniforms.uMaskA.value.copy(mk[0][0]); compMat.uniforms.uMaskB.value.copy(mk[0][1]);
            compMat.uniforms.uMaskC.value.copy(mk[1] ? mk[1][0] : new THREE.Vector4(-1, -1, -1, -1)); compMat.uniforms.uMaskD.value.copy(mk[1] ? mk[1][1] : new THREE.Vector4());
            compMat.uniforms.uShades.value = last ? 1 : 0;
            drawFs(compMat, last ? null : dst);
            [src, dst] = [dst, src];
        });
        cpu = cpu * 0.95 + (performance.now() - started) * 0.05;
        frames++;
        if (first) {
            first = false;
            // the pages are on the GPU now: let the decoded images here go (nothing uploads them again)
            for (const tex of new Set(pages)) tex.source.data = null;
            images.length = 0;
            canvas.dispatchEvent(new Event('bp-ready'));
        }
        if (held === null && !paused) requestAnimationFrame(frame);
    }
    // the page around it says when it is out of sight (site.js: the hero scrolled away): no frames until it is back
    let paused = false;
    window.addEventListener('message', (e) => {
        if (!e.data || e.source !== window.parent || (e.data.bp !== 'pause' && e.data.bp !== 'run')) return;
        const was = paused;
        paused = e.data.bp === 'pause';
        if (was && !paused && held === null) requestAnimationFrame(frame);
    });
    if (window.parent !== window) window.parent.postMessage({ bp: 'hello' }, '*');
    requestAnimationFrame(frame);
    // for tests: hold a moment (seconds on the shared clock), or let it run again
    window.__bp = {
        hold(t) { held = t; requestAnimationFrame(frame); },
        run() { held = null; t0 = null; requestAnimationFrame(frame); },
        stats: () => ({ quads: B.n, W, H, pages: scene.pages, cpuMs: +cpu.toFixed(2), frames }),
        debug(on) { planeMat.uniforms.uDebug.value = on ? 1 : 0; if (held !== null) requestAnimationFrame(frame); },
        sharp(v) { planeMat.uniforms.uSharp.value = v; if (held !== null) requestAnimationFrame(frame); },
    };
    return true;
}
