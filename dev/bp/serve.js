// The loading screen in a browser, served: html/ at http://127.0.0.1:<port>/ (and dev/sheet at /__sheet/).
//
//   node dev/bp/serve.js [port]     then open the address it prints (preview.html: the screen and its logo variants)
//
// The screen is a module that fetches its scene, which a browser will not do for a page opened from disk: opened by
// double-clicking, it shows only the logo on black. compare.js uses this too. Nothing in dev/ is sent to players.
const fs = require('fs');
const http = require('http');
const path = require('path');

const HTML = path.join(__dirname, '..', '..', 'html');
const SHEET = path.join(__dirname, '..', 'sheet');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain' };

/** Starts the server; `pages` maps extra paths to HTML made on the fly. Resolves { server, base }. */
function serve(port = 0, pages = {}) {
    const roots = [['/__sheet/', SHEET], ['/', HTML]];
    const notFound = (res) => { res.writeHead(404); res.end(); };
    const server = http.createServer((req, res) => {
        let u;
        try { u = decodeURIComponent(req.url.split('?')[0]); } catch (_) { notFound(res); return; }   // a stray '%'
        if (pages[u]) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(pages[u]); return; }
        const hit = roots.find(([p]) => u.startsWith(p));   // none for an absolute-form target (http://host/path)
        if (!hit) { notFound(res); return; }
        const file = path.join(hit[1], u.slice(hit[0].length));
        if (!file.startsWith(hit[1]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { notFound(res); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((r, j) => {
        server.once('error', j);   // the port taken, say
        server.listen(port, '127.0.0.1', () => r({ server, base: `http://127.0.0.1:${server.address().port}` }));
    });
}

module.exports = { serve, HTML, SHEET };

if (require.main === module) {
    const port = +process.argv[2] || 5180;
    serve(port).then(({ base }) => {
        console.log(`the loading screen: ${base}/index.html   with the preview bar: ${base}/preview.html   (Ctrl+C stops it)`);
    }, (e) => {
        console.error(e.code === 'EADDRINUSE' ? `port ${port} is taken: give another, node dev/bp/serve.js <port>` : e.message);
        process.exit(1);
    });
}
