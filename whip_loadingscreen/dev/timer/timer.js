// The timer: counts down from TIMER.minutes (settings.js), Space starts and stops it. At 00:00 it stays there and the
// blueprint and the timer fade to black over TIMER.fadeSeconds, then the blueprint stops drawing.
(function () {
    const el = document.getElementById('timer');
    const total = Math.max(1, Math.round(Number(TIMER.minutes) * 60)) * 1000;
    const fadeMs = Math.max(0, Number(TIMER.fadeSeconds) * 1000);
    document.documentElement.style.setProperty('--end-fade', fadeMs + 'ms');

    let left = total;     // ms to go, as of the last stop
    let since = null;     // when it was last started (performance.now), null while stopped
    let next = null;      // the timeout for the next second
    let over = false;
    let shown = '';

    const pad = (n) => String(n).padStart(2, '0');
    const remaining = () => (since === null ? left : Math.max(0, left - (performance.now() - since)));

    // Whole seconds rounded up: 30:00 until a full second has gone, 00:00 only once it is over.
    function draw(ms) {
        const s = Math.ceil(ms / 1000);
        const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
        const parts = h > 0 ? [String(h), pad(m), pad(s % 60)] : [pad(Math.floor(s / 60)), pad(s % 60)];
        const text = parts.join(':');
        if (text === shown) return;
        shown = text;
        el.innerHTML = parts.join('<span class="colon">:</span>');
    }

    // Wakes as each second turns over (a timer, not every frame).
    function tick() {
        next = null;
        const ms = remaining();
        draw(ms);
        if (ms <= 0) return end();
        next = setTimeout(tick, ms - (Math.ceil(ms / 1000) - 1) * 1000 + 1);
    }

    function end() {
        over = true;
        left = 0;
        since = null;
        draw(0);
        document.documentElement.classList.add('timer-over');
        // Black now: the blueprint stops drawing (bp.js takes 'pause' from its own window when it is the page).
        setTimeout(() => window.postMessage({ bp: 'pause' }, '*'), fadeMs + 100);
    }

    window.addEventListener('keydown', (e) => {
        if (e.code !== 'Space') return;
        e.preventDefault();
        if (e.repeat || over) return;
        if (since === null) {
            since = performance.now();
            tick();
        } else {
            left = remaining();
            since = null;
            if (next !== null) { clearTimeout(next); next = null; }
            if (left <= 0) end(); else draw(left);
        }
    });

    draw(left);
})();
