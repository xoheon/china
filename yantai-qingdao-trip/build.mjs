// 빌드: esbuild로 JS·CSS를 묶고, 글꼴까지 넣은 HTML 한 파일을 만든다.
//   dist/index.html     실제 지도 타일과 경로 API를 쓰는 완성본 (더블클릭으로 열어도 동작)
//   dist/artifact.html  외부 접속이 막힌 환경용(약도 모드). 문서 뼈대 없이 본문만 들어 있다. Vercel 빌드에서는 만들지 않는다.
//   dist/photos/        public/photos/ 의 사진
import esbuild from 'esbuild';
import subsetFont from 'subset-font';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TITLE = '옌타이·칭다오 3박 일정 지도';
// Vercel에서 빌드하면 같은 주소의 /api/route 를 쓰게 한다. 다른 주소를 쓰려면 TRIP_API 환경변수로 지정
const API = process.env.TRIP_API ?? (process.env.VERCEL ? '/api' : '');
const DISPLAY_TTF = 'node_modules/@expo-google-fonts/do-hyeon/400Regular/DoHyeon_400Regular.ttf';

// 제목용 글꼴은 실제로 쓰는 글자만 남겨 용량을 줄인다(1.9MB → 수십 KB)
async function buildDisplayFont(shell) {
  const { DAYS } = await import(pathToFileURL(path.join(ROOT, 'src/data/days.js')).href + `?t=${Date.now()}`);
  const heads = [...shell.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  const text = [...new Set([...heads, ...DAYS.map((d) => d.title), '0123456789일월화수목금토,.·~:()!? '].join(''))].join('');
  const out = await subsetFont(await fs.readFile(path.join(ROOT, DISPLAY_TTF)), text, { targetFormat: 'woff2' });
  await fs.mkdir(path.join(ROOT, 'src/fonts'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'src/fonts/display.woff2'), out);
  return out.length;
}

async function bundle(net) {
  const r = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: ['src/main.js'],
    bundle: true, minify: true, write: false, outdir: 'out',
    format: 'iife', target: ['es2020', 'safari14'], legalComments: 'none',
    define: { __NET__: String(net) },
    loader: { '.woff2': 'dataurl', '.png': 'dataurl' }
  });
  const pick = (ext) => r.outputFiles.find((f) => f.path.endsWith(ext)).text;
  return { js: pick('.js').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'), css: pick('.css') };
}

export async function build() {
  const t0 = Date.now();
  const shell = await fs.readFile(path.join(ROOT, 'src/index.html'), 'utf8');
  const fontBytes = await buildDisplayFont(shell);
  const [full, lite] = await Promise.all([bundle(true), bundle(false)]);
  await fs.mkdir(path.join(ROOT, 'dist'), { recursive: true });

  const page = [
    '<!doctype html>', '<html lang="ko">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${TITLE}</title>`, API ? `<script>window.__TRIP_API__=${JSON.stringify(API)}</script>` : '<!--trip-api-->',
    `<style>${full.css}</style>`, '</head>', '<body>',
    shell, `<script>${full.js}</script>`, '</body>', '</html>', ''
  ].join('\n');
  const fragment = [
    `<title>${TITLE}</title>`, '<meta name="claude:viewport-fit-sides" content="cover">',
    `<style>${lite.css}</style>`, shell, `<script>${lite.js}</script>`, ''
  ].join('\n');
  await fs.writeFile(path.join(ROOT, 'dist/index.html'), page);
  if (!process.env.VERCEL) await fs.writeFile(path.join(ROOT, 'dist/artifact.html'), fragment);
  // public/ (내려받은 사진 등)을 그대로 배포 폴더에 복사
  await fs.cp(path.join(ROOT, 'public'), path.join(ROOT, 'dist'), { recursive: true }).catch(() => {});
  const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)}KB`;
  console.log(`빌드 완료 ${Date.now() - t0}ms · dist/index.html ${kb(page)} · dist/artifact.html ${kb(fragment)} · 제목 글꼴 ${Math.round(fontBytes / 1024)}KB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error(e); process.exit(1); });
}
