// 작은 Node 서버. 완성된 페이지를 내보내고, 경로 API(OSRM)를 대신 불러 디스크에 캐시한다.
//   npm start        빌드 후 http://localhost:5173
//   npm run dev      src/ 가 바뀌면 다시 빌드
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup, cacheSize } from './lib/route-service.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const DEV = process.argv.includes('--dev');

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const point = (s) => {
  const [lon, lat] = String(s || '').split(',').map(Number);
  return lon > 100 && lon < 130 && lat > 25 && lat < 45 ? [lon, lat] : null; // 중국 동부만 허용
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, cached: cacheSize() });
    if (url.pathname === '/api/route') {
      const mode = url.searchParams.get('mode'), a = point(url.searchParams.get('from')), b = point(url.searchParams.get('to'));
      if (!['car', 'foot'].includes(mode) || !a || !b) return json(res, 400, { error: 'mode=car|foot, from·to=lon,lat 형식이어야 합니다' });
      const rec = await lookup(mode, a, b);
      return rec ? json(res, 200, rec) : json(res, 502, { error: '경로 서버에서 답을 받지 못했습니다' });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = await fsp.readFile(path.join(ROOT, 'dist/index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html.replace('<!--trip-api-->', '<script>window.__TRIP_API__="/api"</script>'));
    }
    if (url.pathname.startsWith('/photos/')) {
      const name = path.basename(decodeURIComponent(url.pathname));
      const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[name.split('.').pop().toLowerCase()];
      if (type) {
        const buf = await fsp.readFile(path.join(ROOT, 'dist/photos', name)).catch(() => null);
        if (buf) { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=86400' }); return res.end(buf); }
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

if (DEV) {
  const { build } = await import('./build.mjs');
  await build();
  let timer;
  fs.watch(path.join(ROOT, 'src'), { recursive: true }, (_, file) => {
    if (file && file.startsWith('fonts')) return; // 빌드가 만드는 파일
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 120);
  });
}

server.listen(PORT, () => console.log(`http://localhost:${PORT} 에서 열립니다 (경로 캐시 ${cacheSize()}건)`));
