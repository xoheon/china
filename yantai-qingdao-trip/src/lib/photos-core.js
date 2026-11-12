// 위키백과 API로 문서의 대표 사진과 저작자·라이선스를 찾는다. 브라우저와 Node가 함께 쓴다.
export const THUMB = 800;
// 지도, 로고, 깃발 같은 그림은 장소 사진이 아니므로 건너뛴다
const SKIP = /\.svg$|logo|locator|location[_ ]map|[_ ]map[_.]|flag|coat[_ ]of[_ ]arms|emblem|icon/i;
const API = (lang) => `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*`;
const join = (list) => list.map(encodeURIComponent).join('%7C');

export const pageImagesUrl = (lang, titles) =>
  `${API(lang)}&redirects=1&prop=pageimages&piprop=thumbnail%7Cname&pilicense=free&pithumbsize=${THUMB}&titles=${join(titles)}`;
export const imageInfoUrl = (lang, names) =>
  `${API(lang)}&prop=imageinfo&iiprop=url%7Cextmetadata&iiextmetadatafilter=Artist%7CLicenseShortName&titles=${join(names.map((n) => 'File:' + n))}`;

const pagesOf = (json) => {
  const p = json && json.query && json.query.pages;
  return Array.isArray(p) ? p : Object.values(p || {});
};

/** 요청한 제목 → { url, w, h, name }. 제목 정규화와 넘겨주기를 따라간다 */
export function parsePageImages(json, titles) {
  const q = (json && json.query) || {}, pages = pagesOf(json), out = {};
  const hop = (t) => {
    for (const k of ['normalized', 'converted', 'redirects']) {
      const m = (q[k] || []).find((x) => x.from === t);
      if (m) t = m.to;
    }
    return t;
  };
  for (const t of titles) {
    const p = pages.find((x) => x.title === hop(t));
    if (!p || !p.thumbnail || !p.thumbnail.source || !p.pageimage || SKIP.test(p.pageimage)) continue;
    out[t] = { url: p.thumbnail.source, w: p.thumbnail.width, h: p.thumbnail.height, name: p.pageimage };
  }
  return out;
}

const plain = (html) => String(html || '')
  .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** 파일 이름(밑줄 표기) → { credit, license, page } */
export function parseImageInfo(json) {
  const out = {};
  for (const p of pagesOf(json)) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii || !p.title) continue;
    const meta = ii.extmetadata || {};
    out[p.title.slice(p.title.indexOf(':') + 1).replace(/ /g, '_')] = {
      credit: plain(meta.Artist && meta.Artist.value).slice(0, 70),
      license: plain(meta.LicenseShortName && meta.LicenseShortName.value),
      page: ii.descriptionurl || ''
    };
  }
  return out;
}

/** specs = { id: 'en:Title' }. 결과 { id: { url, w, h, credit, license, page } } (사진이 없는 id는 빠진다) */
export async function resolvePhotos(specs, fetchJson) {
  const byLang = {};
  for (const [id, spec] of Object.entries(specs)) {
    const i = spec.indexOf(':'), lang = spec.slice(0, i);
    (byLang[lang] = byLang[lang] || []).push({ id, title: spec.slice(i + 1) });
  }
  const out = {};
  for (const [lang, items] of Object.entries(byLang)) {
    const titles = [...new Set(items.map((x) => x.title))];
    const imgs = parsePageImages(await fetchJson(pageImagesUrl(lang, titles)), titles);
    const names = [...new Set(Object.values(imgs).map((x) => x.name))];
    let info = {};
    if (names.length) {
      try { info = parseImageInfo(await fetchJson(imageInfoUrl(lang, names))); } catch { /* 출처 정보 없이 진행 */ }
    }
    for (const { id, title } of items) {
      const im = imgs[title];
      if (!im) continue;
      const meta = info[im.name.replace(/ /g, '_')] || {};
      out[id] = {
        url: im.url, w: im.w, h: im.h,
        credit: meta.credit || '', license: meta.license || '',
        page: meta.page || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(im.name)}`
      };
    }
  }
  return out;
}
