// Node 쪽 경로 조회. OSRM 공개 서버에 한 번에 하나씩 요청하고 결과를 .cache/routes.json 에 쌓는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPSTREAMS, routeKey, routeUrl, parseOsrm } from '../src/lib/routing-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_FILE = path.join(ROOT, '.cache', 'routes.json');
const BAKED_FILE = path.join(ROOT, 'src', 'data', 'routes.json');
const readJson = async (file) => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return {}; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = { ...(await readJson(BAKED_FILE)), ...(await readJson(CACHE_FILE)) };
let queue = Promise.resolve();

async function persist() {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
}

export const cacheSize = () => Object.keys(cache).length;
export const cached = () => cache;

/** mode: 'car' | 'foot', a·b: WGS-84 [lon, lat]. 결과 { km, min, line } 또는 null */
export function lookup(mode, a, b) {
  const key = routeKey(mode, a, b);
  if (cache[key]) return Promise.resolve(cache[key]);
  const job = queue.then(async () => {
    if (cache[key]) return cache[key];
    for (const base of UPSTREAMS[mode] || []) {
      try {
        const res = await fetch(routeUrl(base, a, b), {
          headers: { 'User-Agent': 'yantai-qingdao-trip/2.0 (personal trip planner)' },
          signal: AbortSignal.timeout(12000)
        });
        if (!res.ok) continue;
        const rec = parseOsrm(await res.json());
        if (!rec) continue;
        cache[key] = rec;
        await persist();
        await sleep(300); // 공개 서버에 부담을 주지 않도록 간격을 둔다
        return rec;
      } catch { /* 다음 서버로 */ }
    }
    return null;
  });
  queue = job.catch(() => null);
  return job;
}
