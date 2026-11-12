// 모든 구간의 실제 도로 경로를 미리 받아 src/data/routes.json 에 넣는다.
// 이렇게 해 두면 빌드한 HTML이 경로 서버 없이도(중국 현지, 오프라인) 실제 경로와 거리를 보여 준다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAYS } from '../src/data/days.js';
import { MODES, legsOf } from '../src/model.js';
import { gcj2wgs } from '../src/lib/coords.js';
import { routeKey } from '../src/lib/routing-core.js';
import { lookup } from '../lib/route-service.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'routes.json');
const jobs = new Map();
for (const day of DAYS) {
  for (const leg of legsOf(day)) {
    for (const mode of leg.go.modes || []) {
      const kind = MODES[mode].kind;
      if (kind === 'arc') continue;
      const a = gcj2wgs(leg.from.lon, leg.from.lat), b = gcj2wgs(leg.to.lon, leg.to.lat);
      jobs.set(routeKey(kind, a, b), { kind, a, b, label: `${leg.from.ko} → ${leg.to.ko} (${kind === 'car' ? '차' : '도보'})` });
    }
  }
}

const baked = {};
let ok = 0, n = 0, misses = 0;
for (const [key, j] of jobs) {
  if (misses >= 3 && !ok) { console.error('경로 서버가 응답하지 않아 나머지는 건너뜁니다.'); break; } // 배포 빌드가 오래 멈춰 있지 않게
  const rec = await lookup(j.kind, j.a, j.b);
  n++;
  if (rec) { baked[key] = rec; ok++; misses = 0; } else misses++;
  console.log(`${String(n).padStart(2)}/${jobs.size} ${rec ? `${rec.km}km ${Math.round(rec.min)}분` : '실패'}  ${j.label}`);
}
if (ok) {
  await fs.writeFile(OUT, JSON.stringify(baked));
  console.log(`\n${ok}/${jobs.size}개 구간을 src/data/routes.json 에 저장했습니다.`);
} else {
  console.error('\n경로 서버에 연결하지 못했습니다. 기존 routes.json 은 그대로 둡니다.');
  process.exitCode = 1;
}
