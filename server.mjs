import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuote } from './engine.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 1_000_000;
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('Request body exceeds 1 MB.'), { status: 413 });
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('Request body must be a JSON object.'), { status: 400 });
  return data;
}

async function serveStatic(pathname, res) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return send(res, 400, { error: 'Malformed URL path.' }); }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = resolve(publicRoot, relative);
  if (file !== publicRoot && !file.startsWith(publicRoot + sep)) return send(res, 403, { error: 'Forbidden.' });
  try {
    const info = await stat(file);
    if (!info.isFile()) return send(res, 404, { error: 'Not found.' });
    send(res, 200, await readFile(file), mime[extname(file)] || 'application/octet-stream');
  } catch { send(res, 404, { error: 'Not found.' }); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'QuoteProof', mode: 'deterministic' });
  if (req.method === 'POST' && url.pathname === '/api/quote') {
    try {
      const body = await readJson(req);
      if (typeof body.rfq !== 'string' || !body.rfq.trim()) return send(res, 400, { error: 'rfq must be a non-empty string.' });
      if (body.rfq.length > 50_000) return send(res, 413, { error: 'RFQ exceeds the 50,000 character limit.' });
      if (body.catalog !== undefined && !Array.isArray(body.catalog)) return send(res, 400, { error: 'catalog must be an array when supplied.' });
      if (body.answers !== undefined && (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers))) return send(res, 400, { error: 'answers must be an object when supplied.' });
      const quote = buildQuote({ rfq: body.rfq, catalog: body.catalog, answers: body.answers });
      return send(res, 200, quote);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message || 'Could not process quote request.' });
    }
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
  send(res, 404, { error: 'Not found.' });
});

server.listen(port, '0.0.0.0', () => console.log(`QuoteProof listening on http://localhost:${port}`));
