// A headless Chrome with one page, driven over the DevTools protocol: what the blueprint tools share.
//
// CHROME=<path to chrome.exe> runs another Chrome: Chromium 103 is FiveM's browser (its CEF), which has only the
// old headless mode, and is run as FiveM runs it (--enable-experimental-web-platform-features), with SwiftShader
// for WebGL on a machine without a GPU.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OLD = !!process.env.CHROME;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Starts Chrome and opens its page. Returns { send, eval, close, onEvent, errors }. */
async function open(extraArgs = []) {
    const port = 9100 + Math.floor(Math.random() * 400);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-bp-'));
    const mode = OLD
        ? ['--headless', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-experimental-web-platform-features']
        : ['--headless=new'];
    const chrome = spawn(CHROME, [...mode, '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files',
        '--remote-debugging-port=' + port, '--user-data-dir=' + profile, ...extraArgs, 'about:blank'], { stdio: 'ignore' });
    let wsUrl;
    for (let i = 0; i < 80 && !wsUrl; i++) {
        await sleep(250);
        try {
            const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const page = list.find((t) => t.type === 'page');
            if (page) wsUrl = page.webSocketDebuggerUrl;
        } catch (_) { /* not up yet */ }
    }
    if (!wsUrl) { chrome.kill(); throw new Error('chrome did not start'); }
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0;
    const pending = new Map();
    const listeners = [];
    const errors = [];
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type !== 'warning') {
            console.log('[page]', m.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ').slice(0, 300));
        }
        for (const f of listeners) f(m);
    };
    const send = (method, params = {}) => new Promise((r, j) => {
        const i = ++id;
        pending.set(i, (m) => (m.error ? j(new Error(method + ': ' + m.error.message)) : r(m.result)));
        ws.send(JSON.stringify({ id: i, method, params }));
    });
    /** Runs an expression in the page; resolves with its value (awaiting a promise), or throws the page's error. */
    const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
        return r.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    return {
        send, eval: evaluate, errors, sleep,
        onEvent: (f) => listeners.push(f),
        close: () => { try { ws.close(); } catch (_) {} chrome.kill(); },
    };
}

module.exports = { open, sleep };
