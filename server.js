'use strict';

// Load env vars from functions/.env (no external dependencies needed)
const fs   = require('fs');
const path = require('path');

const envFile = path.join(__dirname, 'functions', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const http   = require('http');
const PORT   = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// Load Express app from functions
const { app: apiApp } = require('./functions/src/index');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Route /api/* to Express
  if (req.url.startsWith('/api/')) {
    return apiApp(req, res);
  }

  // Serve static files from public/
  let filePath = path.join(PUBLIC, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC, 'index.html');
  }

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅  Great Comfort Agreement running at:\n\n    http://localhost:${PORT}\n`);
  console.log('    Press Ctrl+C to stop.\n');
});
