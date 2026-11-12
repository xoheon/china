// Vercel 서버리스 함수: GET /api/route?mode=car|foot&from=lon,lat&to=lon,lat (WGS-84)
// OSRM 공개 서버를 대신 불러 주고, 같은 구간은 Vercel CDN이 30일 동안 캐시한다.
import { UPSTREAMS, routeUrl, parseOsrm } from '../src/lib/routing-core.js';

const point = (s) => {
  const [lon, lat] = String(s || '').split(',').map(Number);
  return lon > 100 && lon < 130 && lat > 25 && lat < 45 ? [lon, lat] : null; // 중국 동부만 허용
};

export default async function handler(req, res) {
  const { mode, from, to } = req.query || {};
  const a = point(from), b = point(to);
  if (!['car', 'foot'].includes(mode) || !a || !b) {
    return res.status(400).json({ error: 'mode=car|foot, from·to=lon,lat 형식이어야 합니다' });
  }
  for (const base of UPSTREAMS[mode]) {
    try {
      const up = await fetch(routeUrl(base, a, b), {
        headers: { 'User-Agent': 'yantai-qingdao-trip/2.1 (personal trip page)' },
        signal: AbortSignal.timeout(8000)
      });
      if (!up.ok) continue;
      const rec = parseOsrm(await up.json());
      if (!rec) continue;
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=2592000, stale-while-revalidate=604800');
      return res.status(200).json(rec);
    } catch { /* 다음 서버로 */ }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(502).json({ error: '경로 서버에서 답을 받지 못했습니다' });
}
