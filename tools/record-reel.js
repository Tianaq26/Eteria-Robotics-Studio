import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const htmlFile = join(root, 'social', 'eteria-reel.html');
const launchHtmlFile = join(root, 'social', 'eteria-tech-launch-2d.html');
const socialDir = join(root, 'social');
const outputFile = join(root, 'social', 'eteria-robotics-studio-reel.webm');
const launchOutputFile = join(root, 'social', 'eteria-tech-launch-reel.webm');
const port = Number(process.env.PORT || 8099);

await mkdir(join(root, 'social'), { recursive: true });

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/eteria-reel.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(htmlFile).pipe(res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/eteria-tech-launch-2d.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(launchHtmlFile).pipe(res);
    return;
  }

  if (req.method === 'GET') {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const requested = normalize(join(root, decodeURIComponent(url.pathname)));
    if (requested.startsWith(root) && requested !== root) {
      const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.png': 'image/png',
        '.glb': 'model/gltf-binary',
        '.webm': 'video/webm',
        '.md': 'text/markdown; charset=utf-8'
      };
      res.writeHead(200, { 'Content-Type': contentTypes[extname(requested)] || 'application/octet-stream' });
      createReadStream(requested)
        .on('error', () => {
          if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
        })
        .pipe(res);
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/save') {
    const file = createWriteStream(outputFile);
    req.pipe(file);
    file.on('finish', async () => {
      const info = await stat(outputFile);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        file: outputFile,
        bytes: info.size
      }));
    });
    file.on('error', (error) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/save-launch') {
    const file = createWriteStream(launchOutputFile);
    req.pipe(file);
    file.on('finish', async () => {
      const info = await stat(launchOutputFile);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        file: launchOutputFile,
        bytes: info.size
      }));
    });
    file.on('error', (error) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Reel recorder listening at http://127.0.0.1:${port}/`);
  console.log(`Output: ${outputFile}`);
});
