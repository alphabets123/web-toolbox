const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.wasm': 'application/wasm',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0]; // Remove query strings
    let filePath = path.join(__dirname, urlPath);
    
    // 1. If it's a directory, look for index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    
    // 2. If the file doesn't exist, try appending .html (e.g. /bg-remove -> /bg-remove.html)
    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
        if (fs.existsSync(filePath + '.html')) {
            filePath += '.html';
        }
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found: ' + urlPath);
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            const headers = {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            };

            // Apply COOP/COEP headers globally for testing purposes
            // This ensures SharedArrayBuffer is always available for FFmpeg.wasm
            headers['Cross-Origin-Opener-Policy'] = 'same-origin';
            headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
            headers['Cross-Origin-Resource-Policy'] = 'cross-origin';

            res.writeHead(200, headers);
            if (req.method === 'HEAD') {
                res.end();
            } else {
                res.end(content);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Web Toolbox Server running at http://localhost:${PORT}/`);
    console.log(`Video Editor accessible at http://localhost:${PORT}/video-editor/`);
    console.log('Press Ctrl+C to stop.');
});
