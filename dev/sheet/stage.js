/* ========================================
   whip_loadingscreen — the blueprint sheet played as a web page. NOT THE SCREEN (that is html/bp, three.js):
   dev/bp/compare.js plays the sheet with this beside the screen, to check the one against the other.

   Puts the blueprint (blueprint.js, built by dev/blueprint.js) on the stage: a 1920 x 1080 picture,
   scaled to COVER the window whatever its shape, as the screen covers the game's. A wider or taller window
   crops the edges rather than showing bars.
   ======================================== */

(function () {
    'use strict';

    var stage = document.getElementById('stage');
    if (!stage || !window.WhipBlueprint) return;
    stage.innerHTML = window.WhipBlueprint;

    function fit() {
        var scale = Math.max(window.innerWidth / 1920, window.innerHeight / 1080);
        stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    }

    fit();
    window.addEventListener('resize', fit);

    // ONLY WHAT IS IN PLAY IS IN THE PAGE. Each copy of the tile (data-k) holds three Director runs with their street
    // (data-p), and CSS shows one a loop (bp-v*: a third of every three loops each, switched on the frame the sheet jumps
    // back); and as the sheet drifts, a copy spends part of each loop off the window. Hidden or away, they would go on
    // animating, most of the page's work for nothing, so they are taken out (display: none): no style, no paint, no
    // layers. One goes back in LEAD seconds before it is needed (its run's turn, its copy reaching the window across the
    // jump), still hidden by its own visibility or off the edge, with every animation in it set back on the sheet's
    // clock, so it is exactly where it would have been; it comes out LAG seconds after. Times come from the sheet's
    // drift, the page's one clock.
    //
    // NEVER LEFT EMPTY. The page starts with only the first moment's parts in (dev/blueprint.js), so whatever stops this
    // working must show them all instead: slower, never blank. And the clock is looked for on every tick, not once:
    // until the sheet's style has applied there is no drift to read; once it has, everything goes on from there.
    var parts = stage.querySelectorAll('[data-k]');
    if (!parts.length) return;
    var drift = stage.querySelector('.a-move');
    function showAll() {
        for (var i = 0; i < parts.length; i++) parts[i].style.display = '';
    }
    if (!drift || !drift.getAnimations || !stage.getAnimations) { showAll(); return; }
    var clock = null;    // the drift's animation, once it has one
    var synced = false;  // every animation on the sheet set to the clock's start (ONE CLOCK, below)
    var since = Date.now();
    var LEAD = 1.5, LAG = 1.5;   // seconds
    var GIVE_UP = 5000;          // ms without a clock before everything is shown
    // where a copy is on the screen: a tile's height, and the stretch of the sheet the stage shows before any drift
    var sheet = stage.firstElementChild;
    var per = Number(sheet.getAttribute('data-per')) || 0;
    var seen = (sheet.getAttribute('data-seen') || '').split(' ').map(Number);

    /** Is copy k on the screen with the sheet drifted d up? */
    function copyOn(k, d) {
        return !per || ((k + 1) * per - d > seen[0] && k * per - d < seen[1]);
    }

    function resync(el) {
        var anims = el.getAnimations({ subtree: true });
        for (var i = 0; i < anims.length; i++) {
            if (clock.startTime !== null) {
                anims[i].startTime = clock.startTime;
            } else {
                // the clock stopped (a preview holding a moment): the same moment
                anims[i].pause();
                anims[i].currentTime = clock.currentTime;
            }
        }
    }

    // ONE CLOCK. Newer Chrome starts an animation the GPU runs (the drift) a few frames after the rest, up to a tenth of
    // a second apart, so the runs would change that long before or after the sheet jumps. Once the drift has started,
    // every animation on the sheet is set to its start: the switch lands on the jump, and a part put back in matches
    // one that never left. Again whenever the drift's animation is a new one (its style replaced).
    function findClock() {
        var a = drift.getAnimations()[0] || null;
        if (a !== clock) { clock = a; synced = false; }
        if (clock && !synced && clock.startTime !== null) {
            var anims = stage.getAnimations({ subtree: true });
            for (var i = 0; i < anims.length; i++) if (anims[i] !== clock) anims[i].startTime = clock.startTime;
            synced = true;
        }
        return clock;
    }

    function apply() {
        if (!findClock()) {
            if (Date.now() - since > GIVE_UP) showAll();
            return;
        }
        var loop = clock.effect.getComputedTiming().duration / 1000;
        var t = clock.currentTime / 1000;
        if (!(loop > 0) || !(t >= 0)) return;
        var n = Math.floor(t / loop), into = t - n * loop;
        // this loop's run where the copy shows now; near the jump, the next loop's where the copy will show just after
        // it, and the last loop's where it showed just before
        var now = String(n % 3), next = String((n + 1) % 3), last = String((n + 2) % 3);
        var lead = into > loop - LEAD, lag = into < LAG;
        var d = per * into / loop, dNext = per * (into + LEAD - loop) / loop, dLast = per * (into - LAG + loop) / loop;
        for (var i = 0; i < parts.length; i++) {
            var el = parts[i];
            var k = Number(el.getAttribute('data-k'));
            var p = el.getAttribute('data-p');   // none: in every loop
            var want = ((p === null || p === now) && copyOn(k, d))
                || (lead && (p === null || p === next) && copyOn(k, dNext))
                || (lag && (p === null || p === last) && copyOn(k, dLast));
            if (want === (el.style.display !== 'none')) continue;
            el.style.display = want ? '' : 'none';
            if (want) resync(el);
        }
    }

    apply();
    setInterval(apply, 250);
    // the first frames too, so the sheet is on one clock as soon as the drift starts, not a tick later
    (function early(tries) {
        findClock();
        if (!synced && tries < 120) requestAnimationFrame(function () { early(tries + 1); });
    })(0);
})();
