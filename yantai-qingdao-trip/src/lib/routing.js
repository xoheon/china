// 브라우저 쪽 경로 조회. 순서: 메모리 → 미리 받아 둔 routes.json → localStorage → 네트워크.
// 네트워크는 Node 서버(/api/route)가 있으면 그쪽으로, 없으면 OSRM 공개 서버로 직접 요청한다.
import BAKED from '../data/routes.json';
import { UPSTREAMS, routeKey, routeUrl, parseOsrm, decodePolyline } from './routing-core.js';
import { gcj2wgs, haversine } from './coords.js';

const NET = typeof __NET__ === 'undefined' ? true : __NET__;
const LS_KEY = 'trip.routes.v1';
const mem = new Map();
let ls = {};
try { ls = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { ls = {}; }
const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(ls)); } catch { /* 저장 공간이 없어도 동작에는 지장 없음 */ } };

let chain = Promise.resolve();
let failures = 0;
export const net = { live: 0, failed: 0 };
export const retryNetwork = () => { failures = 0; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hydrate = (rec) => ({ km: rec.km, min: rec.min, pts: decodePolyline(rec.line), crs: 'wgs', src: 'api' });

async function fetchJson(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRoute(kind, a, b) {
  const api = typeof window !== 'undefined' && window.__TRIP_API__;
  if (api) {
    const j = await fetchJson(`${api}/route?mode=${kind}&from=${a.join(',')}&to=${b.join(',')}`, 25000);
    return j && typeof j.line === 'string' ? j : null;
  }
  for (const base of UPSTREAMS[kind]) {
    try {
      const rec = parseOsrm(await fetchJson(routeUrl(base, a, b), 9000));
      if (rec) return rec;
    } catch { /* 다음 서버로 */ }
  }
  return null;
}

/** 실제 도로 경로. kind는 'car' 또는 'foot', from/to는 장소 객체(GCJ-02). 실패하면 null */
export function getRoute(kind, from, to) {
  const a = gcj2wgs(from.lon, from.lat), b = gcj2wgs(to.lon, to.lat);
  const key = routeKey(kind, a, b);
  if (mem.has(key)) return mem.get(key);
  const cached = BAKED[key] || ls[key];
  let p;
  if (cached) p = Promise.resolve(hydrate(cached));
  else if (!NET) p = Promise.resolve(null);
  else {
    const job = chain.then(async () => {
      if (failures >= 3) return null;
      try {
        const rec = await fetchRoute(kind, a, b);
        if (!rec) throw new Error('no route');
        failures = 0; net.live++;
        ls[key] = rec; save();
        await sleep(200);
        return hydrate(rec);
      } catch {
        failures++; net.failed++;
        return null;
      }
    });
    chain = job.catch(() => null);
    p = job.then((r) => { if (!r) mem.delete(key); return r; });
  }
  mem.set(key, p);
  return p;
}

function curve(a, b, bend, n = 28) {
  const kx = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const ax = a.lon * kx, ay = a.lat, bx = b.lon * kx, by = b.lat;
  const cx = (ax + bx) / 2 - (by - ay) * bend, cy = (ay + by) / 2 + (bx - ax) * bend;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * ay + 2 * u * t * cy + t * t * by, (u * u * ax + 2 * u * t * cx + t * t * bx) / kx]);
  }
  return pts;
}

/**
 * 경로 API에 연결되기 전까지 쓰는 값.
 * snap = [km, 분] 이 있으면 미리 받아 둔 실제 도로 거리를 쓰고(src 'snap'), 없으면 직선거리에 우회 계수를 곱해 추정한다(src 'est').
 * 어느 쪽이든 선은 두 지점을 잇는 완만한 곡선이다.
 */
export function estimate(kind, from, to, snap) {
  const pts = curve(from, to, kind === 'foot' ? 0.05 : 0.1);
  if (snap) return { km: snap[0], min: snap[1], pts, crs: 'gcj', src: 'snap' };
  const d = haversine(from, to);
  let km, min;
  if (kind === 'foot') {
    km = d * 1.35;
    min = (km / 4.5) * 60;
  } else {
    km = d * (d > 10 ? 1.3 : 1.6);
    min = 3 + (km / (km < 8 ? 30 : km < 30 ? 46 : 64)) * 60;
  }
  return { km: +km.toFixed(2), min: +min.toFixed(1), pts, crs: 'gcj', src: 'est' };
}

/** 지하철·고속철처럼 도로를 따라가지 않는 구간은 곡선으로 잇는다 */
export const arc = (from, to) => ({ km: +haversine(from, to).toFixed(2), pts: curve(from, to, 0.16, 40), crs: 'gcj', src: 'arc' });
