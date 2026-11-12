// 브라우저 쪽 사진 불러오기. 순서: 빌드 때 받아 둔 photos.json → localStorage → 위키백과 API.
import BAKED from '../data/photos.json';
import { PHOTOS } from '../data/photos.js';
import { resolvePhotos } from './photos-core.js';

const NET = typeof __NET__ === 'undefined' ? true : __NET__;
const LS = 'trip.photos.v1', TTL = 7 * 864e5;

async function fetchJson(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const entry = (p) => ({ src: p.file || p.url, alt: p.file && p.url ? p.url : '', credit: p.credit || '', license: p.license || '', page: p.page || '', own: !!p.own });

/** { 장소 id: { src, alt, credit, license, page, own } }. 외부 접속이 막힌 환경에서는 빈 객체 */
export async function loadPhotos() {
  const out = {};
  if (!NET) return out;
  for (const [id, p] of Object.entries(BAKED)) out[id] = entry(p);
  let need = Object.keys(PHOTOS).filter((id) => !out[id]);
  if (!need.length) return out;

  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { cache = null; }
  if (!cache || !cache.d || Date.now() - cache.t > TTL) cache = { t: Date.now(), d: {} };
  for (const id of need) if (cache.d[id]) out[id] = entry(cache.d[id]);
  need = need.filter((id) => !(id in cache.d));
  if (!need.length) return out;

  try {
    const got = await resolvePhotos(Object.fromEntries(need.map((id) => [id, PHOTOS[id]])), fetchJson);
    for (const id of need) {
      cache.d[id] = got[id] || null; // 사진이 없는 문서도 기억해 다시 묻지 않는다
      if (got[id]) out[id] = entry(got[id]);
    }
    try { localStorage.setItem(LS, JSON.stringify(cache)); } catch { /* 저장 없이 진행 */ }
  } catch { /* 위키백과에 연결되지 않으면 사진 없이 보여 준다 */ }
  return out;
}
