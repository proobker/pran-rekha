import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const types = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };
// '/' is the deck; '/media/<file>' serves the videos it references.
function resolve(pathname) {
  if (pathname === '/') return ['presentation.html', 'text/html; charset=utf-8'];
  const m = pathname.match(/^\/media\/([\w.-]+)$/);
  const ext = m?.[1].slice(m[1].lastIndexOf('.'));
  return m && types[ext] ? ['media/' + m[1], types[ext]] : null;
}
http.createServer((req, res) => {
  const entry = resolve(new URL(req.url, 'http://localhost').pathname);
  if (!entry) { res.writeHead(404); res.end(); return; }
  try {
    const path = fileURLToPath(new URL(entry[0], root));
    const size = statSync(path).size;
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return;
    }
    res.writeHead(range ? 206 : 200, {
      'Content-Type': entry[1], 'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(path, { start, end }).pipe(res);
  } catch { res.writeHead(404); res.end('Presentation asset unavailable'); }
}).listen(5188, '127.0.0.1', () => console.log('Presentation: http://localhost:5188'));
