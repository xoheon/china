// 브라우저와 Node 서버가 함께 쓰는 경로 API 공통 코드. DOM을 쓰지 않는다.
// OSRM(Open Source Routing Machine) 공개 서버에서 실제 도로를 따라가는 경로를 받는다. 좌표는 WGS-84.
export const UPSTREAMS = {
  car: [
    'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
    'https://router.project-osrm.org/route/v1/driving/'
  ],
  foot: ['https://routing.openstreetmap.de/routed-foot/route/v1/driving/']
};

const f5 = (n) => n.toFixed(5);

/** 캐시 키. a, b는 WGS-84 [lon, lat] */
export const routeKey = (mode, a, b) => `${mode}:${f5(a[0])},${f5(a[1])};${f5(b[0])},${f5(b[1])}`;

export const routeUrl = (base, a, b) =>
  `${base}${a[0].toFixed(6)},${a[1].toFixed(6)};${b[0].toFixed(6)},${b[1].toFixed(6)}` +
  '?overview=full&geometries=polyline&alternatives=false&steps=false';

/** OSRM 응답에서 거리(km), 시간(분), 경로선(polyline 문자열)만 꺼낸다 */
export function parseOsrm(json) {
  if (!json || json.code !== 'Ok' || !Array.isArray(json.routes) || !json.routes.length) return null;
  const r = json.routes[0];
  if (typeof r.geometry !== 'string' || !(r.distance >= 0)) return null;
  return { km: +(r.distance / 1000).toFixed(2), min: +(r.duration / 60).toFixed(1), line: r.geometry };
}

/** Google polyline 형식 → [[lat, lon], ...] */
export function decodePolyline(str, precision = 5) {
  const f = 10 ** precision, out = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length + 1);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    out.push([lat / f, lon / f]);
  }
  return out;
}
