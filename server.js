const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer((clientReq, clientRes) => {
    // 1. Handle CORS for the Browser (Preflight & Normal)
    clientRes.setHeader('Access-Control-Allow-Origin', '*');
    clientRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    clientRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, *');

    if (clientReq.method === 'OPTIONS') {
        clientRes.writeHead(200);
        clientRes.end();
        return;
    }

    const parsedUrl = url.parse(clientReq.url, true);

    // 2. PROXY ROUTE: /proxy?url=...
    if (parsedUrl.pathname === '/proxy') {
        handleProxy(clientReq, clientRes, parsedUrl.query);
        return;
    }

    // 3. STATIC FILES (Fallback)
    // Map "/" to index.html
    let filePath = '.' + parsedUrl.pathname;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = path.extname(filePath);
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // 404 Not Found
                clientRes.writeHead(404);
                clientRes.end('404 Not Found');
            } else {
                // 500 Server Error
                clientRes.writeHead(500);
                clientRes.end('Server Error: ' + error.code);
            }
        } else {
            // Success
            clientRes.writeHead(200, { 'Content-Type': contentType });
            clientRes.end(content, 'utf-8');
        }
    });
});

function handleProxy(clientReq, clientRes, queryObj) {
    const targetUrlStr = queryObj.url;

    if (!targetUrlStr) {
        clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
        clientRes.end('Error: Missing "url" query parameter. Example: /proxy?url=https://api.example.com');
        return;
    }

    console.log(`[Proxy] ${clientReq.method} -> ${targetUrlStr}`);

    try {
        const targetUrl = new url.URL(targetUrlStr);
        const lib = targetUrl.protocol === 'https:' ? https : http;

        const options = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: clientReq.method,
            headers: {
                ...clientReq.headers,
                host: targetUrl.hostname
            }
        };

        // Remove problematic headers
        delete options.headers.host;
        delete options.headers['access-control-request-headers'];
        delete options.headers['access-control-request-method'];
        delete options.headers['origin'];
        delete options.headers['referer'];

        const proxyReq = lib.request(options, (proxyRes) => {
            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(clientRes, { end: true });
        });

        proxyReq.on('error', (err) => {
            console.error('[Proxy Error]', err.message);
            clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            clientRes.end('Proxy Error: ' + err.message);
        });

        clientReq.pipe(proxyReq, { end: true });

    } catch (err) {
        clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
        clientRes.end('Invalid URL: ' + err.message);
    }
}

server.listen(PORT, () => {
    console.log(`\n🚀 RestMate Server running at http://localhost:${PORT}`);
    console.log(`   - Static App: http://localhost:${PORT}`);
    console.log(`   - Proxy URL:  http://localhost:${PORT}/proxy?url=...`);
});
