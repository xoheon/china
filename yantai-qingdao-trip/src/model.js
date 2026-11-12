// 일정 데이터에서 "구간"을 뽑고, 이동수단별 시간·요금을 계산한다.
import { PLACES } from './data/places.js';
import { taxiFare, carsFor } from './lib/fare.js';

export const MODES = {
  walk: { ko: '도보', kind: 'foot' },
  taxi: { ko: '택시', kind: 'car' },
  charter: { ko: '전세차', kind: 'car' },
  bus: { ko: '버스', kind: 'car' },
  metro: { ko: '지하철', kind: 'arc' },
  train: { ko: '고속철', kind: 'arc' }
};

export const PRESETS = [
  ['rec', '추천 조합'],
  ['taxi', '택시 위주'],
  ['transit', '대중교통 위주'],
  ['charter', '전세차 위주']
];

/** 하루 일정의 이동 구간. i는 도착 장소의 stops 인덱스 */
export function legsOf(day) {
  const out = [];
  day.stops.forEach((s, i) => {
    if (i === 0 || !s.go) return;
    const prev = day.stops[i - 1];
    out.push({
      i, key: `${day.id}:${i}`, go: s.go,
      from: PLACES[prev.p], to: PLACES[s.p], fromId: prev.p, toId: s.p,
      hour: +s.t.slice(0, 2), city: PLACES[s.p].city
    });
  });
  return out;
}

/** 지도와 목록이 같은 번호를 쓰도록, 장소가 처음 나오는 순서대로 번호를 매긴다 */
export function orderOf(day) {
  const seen = {};
  let n = 0;
  day.stops.forEach((s) => { if (!(s.p in seen)) seen[s.p] = ++n; });
  return seen;
}

export function presetMode(leg, preset) {
  const go = leg.go;
  if (go.fixed) return go.fixed;
  const has = (m) => go.modes.includes(m);
  const first = (...ms) => ms.find(has) || go.rec;
  if (preset === 'taxi') return go.rec === 'walk' ? 'walk' : first('taxi');
  if (preset === 'transit') return first('metro', 'bus', 'walk', 'taxi');
  if (preset === 'charter') return go.rec === 'walk' ? 'walk' : first('charter');
  return go.rec;
}

export function pickMode(leg, choices, preset) {
  if (leg.go.fixed) return leg.go.fixed;
  const c = choices[leg.key];
  return c && leg.go.modes.includes(c) ? c : presetMode(leg, preset);
}

/**
 * 이동수단 하나의 시간·거리·요금.
 * r = { car, foot } 는 경로 API 결과(src 'api'), 미리 받아 둔 실제 거리('snap'), 또는 추정값('est').
 * API가 준 자동차 시간은 신호·정체가 빠져 있어 1.25배 하고 탑승 2분을 더한다. 도보는 여럿이 걷는 속도로 1.1배.
 */
export function metrics(leg, mode, people, r) {
  const go = leg.go;
  const real = (x) => x.src !== 'est';
  const carMin = () => Math.max(2, Math.round(real(r.car) ? r.car.min * 1.25 + 2 : r.car.min));
  if (mode === 'taxi') {
    const cars = carsFor(people, go.luggage), each = taxiFare(leg.city, r.car.km, leg.hour);
    return { min: carMin(), km: r.car.km, cars, each, total: each * cars, approx: !real(r.car) };
  }
  if (mode === 'charter') return { min: carMin(), km: r.car.km, total: null, approx: !real(r.car) };
  if (mode === 'walk') {
    const min = Math.max(1, Math.round(real(r.foot) ? r.foot.min * 1.1 : r.foot.min));
    return { min, km: r.foot.km, total: 0, approx: !real(r.foot) };
  }
  if (mode === 'bus') return { min: go.bus.min, each: go.bus.yuan, total: go.bus.yuan * people, approx: true, guess: !!go.bus.est };
  if (mode === 'metro') return { min: go.metro.min, each: go.metro.yuan, total: go.metro.yuan * people, approx: true, guess: !!go.metro.est };
  return { min: go.min, total: null, approx: true };
}

export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}` : `${m}분`);
export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 100) * 10}m` : `${km < 10 ? km.toFixed(1) : Math.round(km)}km`);
