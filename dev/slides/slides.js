// Space: the logo fades out and SLIDES' next words fade in where it was (settings.js); after the last, the logo again.
(function () {
    const logo = document.getElementById('logo');
    const box = document.getElementById('slide');
    const list = SLIDES.slides;
    const fadeMs = Math.max(0, Number(SLIDES.fadeSeconds) * 1000);
    document.documentElement.style.setProperty('--slide-fade', fadeMs + 'ms');
    document.fonts.load("600 1em 'Whip Slides'");   // ready before the first Space

    let at = 0;           // 0: the logo, 1 on: the slides
    let swap = null;      // the new words, waiting for the old to fade

    function fill(lines) {
        box.textContent = '';
        for (const line of lines) {
            const span = document.createElement('span');
            span.textContent = line;
            box.appendChild(span);
        }
    }

    function next() {
        at = (at + 1) % (list.length + 1);
        logo.classList.add('off');
        box.classList.remove('on');
        if (swap !== null) clearTimeout(swap);
        swap = setTimeout(() => {
            swap = null;
            if (at === 0) { logo.classList.remove('off'); return; }
            fill(list[at - 1]);
            box.classList.add('on');
        }, fadeMs);
    }

    window.addEventListener('keydown', (e) => {
        if (e.code !== 'Space') return;
        e.preventDefault();
        if (!e.repeat) next();
    });
})();
