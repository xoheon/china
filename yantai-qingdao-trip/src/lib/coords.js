// 좌표 변환. 중국 지도(고덕 등)는 GCJ-02, OSM·OSRM은 WGS-84를 쓴다. 둘은 수백 m 어긋난다.
const A = 6378245.0;
const EE = 0.00669342162296594323;
const PI = Math.PI;

function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return r;
}
function tLon(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return r;
}
const inChina = (lon, lat) => lon > 72.004 && lon < 137.8347 && lat > 0.8293 && lat < 55.8271;

/** WGS-84 → GCJ-02. 인자와 반환값은 [lon, lat] */
export function wgs2gcj(lon, lat) {
  if (!inChina(lon, lat)) return [lon, lat];
  let dLat = tLat(lon - 105, lat - 35);
  let dLon = tLon(lon - 105, lat - 35);
  const rad = (lat / 180) * PI;
  let magic = Math.sin(rad);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * PI);
  dLon = (dLon * 180) / ((A / sq) * Math.cos(rad) * PI);
  return [lon + dLon, lat + dLat];
}

/** GCJ-02 → WGS-84 (반복 보정, 오차 1m 미만) */
export function gcj2wgs(lon, lat) {
  let wl = lon, wa = lat;
  for (let i = 0; i < 4; i++) {
    const [gl, ga] = wgs2gcj(wl, wa);
    wl += lon - gl;
    wa += lat - ga;
  }
  return [wl, wa];
}

/** 두 지점 사이 직선거리(km). 인자는 {lat, lon} */
export function haversine(a, b) {
  const R = 6371, rad = PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
