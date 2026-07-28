const http = require('http');
const fs = require('fs');
const path = require('path');

const host = process.env.FRONTEND_HOST || '127.0.0.1';
const port = Number(process.env.FRONTEND_PORT || 5500);
const root = path.resolve(__dirname, '..', 'frontend');

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    let requestedPath;
    try {
        requestedPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    } catch (_) {
        res.writeHead(400).end('Bad request');
        return;
    }

    const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);

    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403).end('Forbidden');
        return;
    }

    fs.stat(filePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(port, host, () => {
    console.log(`NCA GRC frontend available at http://${host}:${port}`);
});
