// 장소 사진을 public/photos/ 에 내려받고 src/data/photos.json 에 출처를 적는다.
// 배포본이 위키미디어에 기대지 않게 하려는 것이다(중국 현지에서는 위키미디어가 열리지 않는다).
//   직접 찍은 사진:  public/photos/<장소 id>.jpg|png|webp  → 항상 이 파일이 먼저 쓰인다
//   내려받은 사진:   public/photos/<장소 id>.wiki.jpg
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTOS } from '../src/data/photos.js';
import { PLACES } from '../src/data/places.js';
import { resolvePhotos } from '../src/lib/photos-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'photos');
const OUT = path.join(ROOT, 'src', 'data', 'photos.json');
const UA = 'yantai-qingdao-trip/2.1 (personal trip page; Node.js fetch)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url, ms) => fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms) });

await fs.mkdir(DIR, { recursive: true });
const files = await fs.readdir(DIR);
const manifest = {};

// 1) 직접 넣은 사진
for (const f of files) {
  const m = f.match(/^([\w-]+)\.(jpe?g|png|webp)$/i);
  if (m && (PLACES[m[1]] || PHOTOS[m[1]])) manifest[m[1]] = { file: `photos/${f}`, own: true };
}

// 2) 위키백과 대표 사진
let found = {};
try {
  found = await resolvePhotos(PHOTOS, async (url) => {
    const res = await get(url, 15000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
} catch (e) {
  console.error('위키백과에 연결하지 못했습니다:', e.message);
}

for (const id of Object.keys(PHOTOS)) {
  if (manifest[id]) { console.log(`${id.padEnd(11)} 직접 넣은 사진 사용`); continue; }
  const p = found[id];
  if (!p) { console.log(`${id.padEnd(11)} 사진 없음 (${PHOTOS[id]})`); continue; }
  const ext = ((p.url.match(/\.(jpe?g|png|webp)(?:$|\?)/i) || [])[1] || 'jpg').toLowerCase();
  const file = `${id}.wiki.${ext}`;
  try {
    const res = await get(p.url, 20000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await fs.writeFile(path.join(DIR, file), Buffer.from(await res.arrayBuffer()));
    manifest[id] = { file: `photos/${file}`, ...p };
  } catch {
    manifest[id] = { ...p }; // 파일은 못 받았어도 원본 주소로 보여 준다
  }
  console.log(`${id.padEnd(11)} ${decodeURIComponent(p.url.split('/').pop())}  ·  ${p.credit || '저작자 미상'}  ·  ${p.license || '라이선스 확인 필요'}`);
  await sleep(150);
}

const n = Object.keys(manifest).length;
if (n) {
  await fs.writeFile(OUT, JSON.stringify(manifest, null, 1));
  console.log(`\n사진 ${n}장을 src/data/photos.json 에 기록했습니다. 엉뚱한 사진이 있으면 src/data/photos.js 에서 그 줄을 지우거나 public/photos/ 에 직접 넣으세요.`);
} else {
  console.error('\n받은 사진이 없습니다. 기존 photos.json 은 그대로 둡니다.');
}
