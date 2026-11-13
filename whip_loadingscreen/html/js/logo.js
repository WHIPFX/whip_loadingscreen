/* ========================================
   whip_loadingscreen — the logo's loading indicator

   The I's four circles light one at a time, top to bottom, then round again from the top. Each
   step the next circle lights AT ONCE and the one before FADES out, leaving its dark silhouette
   (the fade and the instant light are both in loading.css: .dot / .dot.lit). This file moves the
   light along.

   EACH CIRCLE LIGHTS WITH ONE OF WHIP'S INTERACTION ICONS on it — lockpick, trunk open, pick up
   and the rest (js/icons.js) — a random one every time. Shuffled in rounds,
   so every icon comes up before any comes up twice, and never the same one twice running. The
   icon fades out with its circle's light.

   Nothing to do with the load events: it runs from the first frame until the game takes the
   loading screen away.
   ======================================== */

(function () {
    'use strict';

    /** How long each circle stays lit before the next one takes over. */
    var STEP_MS = 450;

    /** How wide an icon is against its disc: the same share as on the 3D interaction badge
     *  (0.46 of the cell against a disc of 0.78). The car slices fill the whole disc instead. */
    var ICON_SHARE = 0.46 / 0.78;

    var dots = document.querySelectorAll('#logo .dot');
    if (!dots.length) return;

    var icons = window.WhipIcons || { glyphs: {}, fullBleed: {} };
    var names = Object.keys(icons.glyphs);

    /* ---- A random icon: shuffled in rounds ---- */

    var bag = [];
    var last = null;

    function shuffle(list) {
        for (var i = list.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = list[i]; list[i] = list[j]; list[j] = t;
        }
        return list;
    }

    function nextIcon() {
        if (!names.length) return null;
        if (!bag.length) {
            bag = shuffle(names.slice());
            // The round starts from the end of the list: not with the one just shown.
            if (bag.length > 1 && bag[bag.length - 1] === last) {
                var t = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = t;
            }
        }
        last = bag.pop();
        return last;
    }

    /** Put an icon on a circle's disc (it shows while the circle is lit). */
    function paint(dot, name) {
        var slot = dot.querySelector('.icon');
        var disc = dot.querySelector('.disc');
        if (!slot || !disc) return;
        if (!name || !icons.glyphs[name]) { slot.innerHTML = ''; return; }
        var cx = +disc.getAttribute('cx'), cy = +disc.getAttribute('cy'), r = +disc.getAttribute('r');
        var size = icons.fullBleed[name] ? r * 2 : r * 2 * ICON_SHARE;
        slot.innerHTML = icons.glyphs[name];
        var svg = slot.firstElementChild;
        if (!svg) return;
        svg.setAttribute('x', cx - size / 2);
        svg.setAttribute('y', cy - size / 2);
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
    }

    /* ---- The W's and the P's circles: always lit, always the same icon (index.html's data-icon:
       pick up in the W, store in the P) ---- */

    var fixed = document.querySelectorAll('#logo [data-icon]');
    for (var f = 0; f < fixed.length; f++) paint(fixed[f], fixed[f].getAttribute('data-icon'));

    /* ---- The light ---- */

    function light(dot) {
        paint(dot, nextIcon());
        dot.classList.add('lit');                   // lights at once
    }

    var at = 0;
    light(dots[at]);

    setInterval(function () {
        dots[at].classList.remove('lit');           // fades (loading.css), its icon with it
        at = (at + 1) % dots.length;
        light(dots[at]);
    }, STEP_MS);
})();
