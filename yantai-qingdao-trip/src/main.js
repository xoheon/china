import 'leaflet/dist/leaflet.css';
import './styles.css';
import { DAYS, TODO, TIPS } from './data/days.js';
import { PLACES, CITY } from './data/places.js';
import { MODES, PRESETS, legsOf, orderOf, pickMode, metrics, fmtMin, fmtKm } from './model.js';
import { getRoute, estimate, arc, retryNetwork } from './lib/routing.js';
import { carsFor } from './lib/fare.js';
import { createMap, BASEMAPS, BASE_ORDER } from './map.js';
import { createPlayer } from './player.js';
import { ICON } from './icons.js';
import { loadPhotos } from './lib/photos.js';
import { DAY_HERO, PHOTO_LABEL } from './data/photos.js';

const NET = typeof __NET__ === 'undefined' ? true : __NET__;
const $ = (id) => document.getElementById(id);
const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ── 상태 ──────────────────────────────────────────────────────────────
const LS = 'trip.state.v2';
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const S = {
  day: Math.min(DAYS.length - 1, Math.max(0, saved.day | 0)),
  sel: -1,
  people: Math.min(30, Math.max(1, saved.people || 11)),
  preset: PRESETS.some(([k]) => k === saved.preset) ? saved.preset : 'rec',
  choices: saved.choices || {},
  base: saved.base,
  todo: saved.todo || {}
};
// 여행 중에는 오늘 날짜의 일정을 먼저 보여 준다
const now = new Date();
if (now.getFullYear() === 2026 && now.getMonth() === 10) {
  const k = DAYS.findIndex((d) => +d.date === now.getDate());
  if (k >= 0) S.day = k;
}
const persist = () => {
  try {
    localStorage.setItem(LS, JSON.stringify({ day: S.day, people: S.people, preset: S.preset, choices: S.choices, base: S.base, todo: S.todo }));
  } catch { /* 저장이 막혀 있어도 그대로 동작 */ }
};

const day = () => DAYS[S.day];
let PH = {}; // 장소 id → 사진
const KIND = { sight: '관광·쇼핑', food: '식당', hub: '교통·숙소' };

/** 사진 <img>. 다 불러온 뒤에만 보이고, 실패하면 원본 주소로 한 번 더 시도한 뒤 사라진다 */
function photoImg(id, cls, alt, onShow) {
  const p = PH[id];
  if (!p) return null;
  const img = new Image();
  img.className = cls;
  img.alt = alt || '';
  img.decoding = 'async';
  img.hidden = true;
  img.onload = () => { img.hidden = false; if (onShow) onShow(p); };
  img.onerror = () => {
    if (p.alt && !img.dataset.alt) { img.dataset.alt = '1'; img.src = p.alt; } else img.remove();
  };
  img.src = p.src;
  return img;
}
const R = new Map(); // 구간별 경로: { car, foot, arc }
function routesFor(leg) {
  let r = R.get(leg.key);
  if (!r) {
    const road = leg.go.road || {};
    r = { car: estimate('car', leg.from, leg.to, road.car), foot: estimate('foot', leg.from, leg.to, road.foot), arc: arc(leg.from, leg.to) };
    R.set(leg.key, r);
  }
  return r;
}
const geomFor = (leg, mode) => { const r = routesFor(leg), k = MODES[mode].kind; return k === 'arc' ? r.arc : r[k]; };
const modeOf = (leg) => pickMode(leg, S.choices, S.preset);
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

// ── 지도와 재생기 ──────────────────────────────────────────────────────
const api = createMap($('map'), {
  isDark,
  onPick: (i) => { player.stop(); select(i, true); },
  onBaseChange: (id, failed) => {
    if (failed) toast(`${BASEMAPS[failed].name}에 연결할 수 없어 ${BASEMAPS[id].name}로 바꿨어요.`);
    else { S.base = id; persist(); }
    renderBase();
  }
});
const player = createPlayer({
  api,
  count: () => day().stops.length,
  onStop: (i) => select(i, false, true),
  onState: renderPlayer
});

// ── 머리: 인원, 한꺼번에 고르기 ────────────────────────────────────────
function renderPresets() {
  const box = $('presets');
  box.textContent = '';
  const custom = Object.keys(S.choices).length > 0;
  PRESETS.forEach(([k, label]) => {
    const b = h('button', '', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!custom && S.preset === k));
    b.addEventListener('click', () => {
      player.stop();
      S.preset = k; S.choices = {}; persist();
      renderPresets(); renderLine(); drawLegs(true); renderSum();
    });
    box.appendChild(b);
  });
}
function setPeople(n) {
  S.people = Math.min(30, Math.max(1, n));
  $('pnum').textContent = `${S.people}명`;
  persist();
  legsOf(day()).forEach((leg) => paintLeg(leg));
  renderSum();
}
$('pminus').addEventListener('click', () => setPeople(S.people - 1));
$('pplus').addEventListener('click', () => setPeople(S.people + 1));

// ── 날짜 탭 ───────────────────────────────────────────────────────────
function renderTabs() {
  const box = $('days');
  box.textContent = '';
  DAYS.forEach((d, i) => {
    const icon = d.wx.wet ? ICON.rain : d.wx.label === '맑음' ? ICON.sun : ICON.cloud;
    const b = h('button', 'tab', `<span class="tab-d"><b>${d.date}</b>${d.dow}</span><span class="tab-w">${icon}${esc(d.wx.label)}</span><span class="tab-t">${esc(d.wx.temp)}</span>`);
    b.type = 'button';
    b.id = `tab-${d.id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === S.day));
    b.setAttribute('aria-label', `${d.date}일 ${d.dow}요일, ${CITY[d.city].ko}, ${d.wx.label} ${d.wx.temp}`);
    b.addEventListener('click', () => { if (i !== S.day) setDay(i); });
    box.appendChild(b);
  });
}

function setDay(i) {
  player.reset();
  S.day = i; S.sel = -1; persist();
  retryNetwork();
  renderTabs(); renderHead(); renderLine(true);
  api.showDay(day(), true);
  drawLegs(true);
  renderSum();
  loadRoutes();
  renderPlayer(player.state());
}

function renderHead() {
  const d = day(), hero = $('hero'), credit = $('herocredit'), pid = DAY_HERO[d.id];
  $('deye').textContent = `11.${d.date} ${d.dow}요일 · ${CITY[d.city].ko}`;
  $('dtitle').textContent = `${d.date}일, ${d.title}`;
  $('dsub').textContent = d.sub;
  hero.classList.remove('has-img');
  hero.querySelectorAll('.hero-img').forEach((e) => e.remove());
  credit.hidden = true;
  const img = photoImg(pid, 'hero-img', '', (p) => {
    hero.classList.add('has-img');
    if (!p.page) return;
    credit.href = p.page;
    credit.textContent = `사진: ${p.own ? '직접 넣은 사진' : p.credit || '위키미디어 공용'}`;
    credit.hidden = false;
  });
  if (img) hero.prepend(img);
}

// ── 일정 줄(노선도) ────────────────────────────────────────────────────
function amapNav(leg, mode) {
  const pt = (p) => `${p.lon},${p.lat},${encodeURIComponent(p.zh.split(' ')[0])}`;
  const m = mode === 'walk' ? 'walk' : mode === 'bus' || mode === 'metro' ? 'bus' : 'car';
  return `https://uri.amap.com/navigation?from=${pt(leg.from)}&to=${pt(leg.to)}&mode=${m}&src=trip&coordinate=gaode&callnative=1`;
}
const amapFind = (p) => `https://uri.amap.com/search?keyword=${encodeURIComponent(p.zh)}&city=${encodeURIComponent(CITY[p.city].zh)}`;

function renderLine(animate = false) {
  const d = day(), seen = orderOf(d), legs = legsOf(d), ol = $('line');
  const legInto = new Map(legs.map((l) => [l.i, l]));
  ol.textContent = '';
  ol.classList.toggle('rise', animate);
  let row = 0;
  d.stops.forEach((s, i) => {
    const p = PLACES[s.p], leg = legInto.get(i);
    if (leg) {
      const li = h('li', 'leg');
      li.id = `leg-${i}`;
      li.style.setProperty('--k', row++);
      li.innerHTML = '<span class="leg-min"></span><span class="trk"><i class="seg"></i></span><div class="leg-body"><div class="chips" role="group" aria-label="이동수단"></div><p class="leg-info"></p><p class="leg-why"></p><a class="leg-nav" target="_blank" rel="noopener"></a></div>';
      ol.appendChild(li);
    }
    const li = h('li', 'stop');
    li.id = `stop-${i}`;
    li.style.setProperty('--k', row++);
    const firstHere = d.stops.findIndex((x) => x.p === s.p) === i;
    const notes = [s.n, firstHere ? p.note : null, s.n2].filter(Boolean).map((t) => `<p class="note">${esc(t)}</p>`).join('');
    li.innerHTML =
      `<time>${s.t}</time>` +
      `<span class="trk"><i class="seg seg-in"></i><i class="seg seg-out"></i><b class="dot k-${p.kind}">${seen[s.p]}</b></span>` +
      `<div class="stop-body"><button type="button" class="stop-main" id="s${i}"><span class="stop-txt"><strong>${esc(s.h || p.ko)}</strong>` +
      (s.h ? `<span class="place">${esc(p.ko)}</span>` : '') +
      `<span class="zh" lang="zh">${esc(p.zh)}</span></span></button>${notes}` +
      `<div class="acts"><a href="${amapFind(p)}" target="_blank" rel="noopener">고덕지도에서 찾기${ICON.out}</a><button type="button" class="act-show">기사님께 보여주기</button></div></div>`;
    li.querySelector('.stop-main').addEventListener('click', () => { player.stop(); select(i, false); });
    li.querySelector('.act-show').addEventListener('click', () => openShow(s.p, leg));
    if (firstHere) { li.dataset.pid = s.p; addThumb(li); }
    ol.appendChild(li);
  });
  legs.forEach((leg) => paintLeg(leg));
  paintTrack();
  markSel();
}

function addThumb(li) {
  if (li.querySelector('.thumb')) return;
  const img = photoImg(li.dataset.pid, 'thumb', '');
  if (img) li.querySelector('.stop-main').appendChild(img);
}

/** 구간 하나의 칩, 요약, 설명을 현재 선택과 경로 값으로 다시 그린다 */
function paintLeg(leg) {
  const li = $(`leg-${leg.i}`);
  if (!li) return;
  const go = leg.go, mode = modeOf(leg), r = routesFor(leg), m = metrics(leg, mode, S.people, r);
  li.className = `leg m-${mode}`;
  li.querySelector('.leg-min').textContent = fmtMin(m.min);
  li.querySelector('.seg').className = `seg m-${mode}`;

  const chips = li.querySelector('.chips');
  chips.textContent = '';
  const modes = go.fixed ? [go.fixed] : go.modes;
  modes.forEach((k) => {
    const mm = metrics(leg, k, S.people, r);
    const b = h('button', `chip m-${k}`, `${ICON[k]}<span>${k === 'bus' && go.bus.name ? esc(go.bus.name) : MODES[k].ko}</span><em>${fmtMin(mm.min)}</em>${!go.fixed && k === go.rec ? '<small>추천</small>' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(k === mode));
    if (go.fixed || modes.length === 1) b.disabled = true;
    else b.addEventListener('click', () => choose(leg, k));
    chips.appendChild(b);
  });

  const bits = [];
  if (mode === 'taxi') {
    bits.push(fmtKm(m.km), `${m.cars}대 × ${m.each}위안 = <b>${m.total}위안</b>`);
  } else if (mode === 'charter') {
    bits.push(fmtKm(m.km), '대절 요금은 견적');
  } else if (mode === 'walk') {
    bits.push(fmtKm(m.km), '무료');
  } else if (mode === 'bus') {
    bits.push(`1인 ${m.each}위안`, `${S.people}명 <b>${m.total}위안</b>`);
  } else if (mode === 'metro') {
    bits.push(`${esc(go.metro.line)} <span lang="zh">${esc(go.metro.from)} → ${esc(go.metro.to)}</span>`, `1인 ${m.each}위안`, `${S.people}명 <b>${m.total}위안</b>`);
  } else {
    bits.push('고속철', '승차권은 예매분');
  }
  const tag = m.guess ? '<span class="tag">요금 추정</span>' : (mode === 'taxi' || mode === 'charter' || mode === 'walk') && m.approx ? '<span class="tag">거리 추정</span>' : '';
  li.querySelector('.leg-info').innerHTML = bits.join(' · ') + tag;

  const why = go.fixed ? go.why : mode === go.rec ? go.why : (go[mode] && go[mode].note) || (mode === 'taxi' && go.luggage ? '짐이 있어 한 대에 3명으로 계산했어요.' : '');
  const extra = mode === go.rec && go[mode] && go[mode].note ? ` ${go[mode].note}` : '';
  const whyEl = li.querySelector('.leg-why');
  whyEl.textContent = (why || '') + extra;
  whyEl.hidden = !whyEl.textContent;

  const nav = li.querySelector('.leg-nav');
  if (go.fixed) nav.hidden = true;
  else {
    nav.hidden = false;
    nav.href = amapNav(leg, mode);
    nav.innerHTML = `고덕지도에서 ${mode === 'bus' || mode === 'metro' ? '실시간 노선' : '길찾기'} 보기${ICON.out}`;
  }
}

/** 장소 점 위아래의 선을 앞뒤 구간의 이동수단 색으로 칠한다 */
function paintTrack() {
  const d = day(), legs = new Map(legsOf(d).map((l) => [l.i, l]));
  d.stops.forEach((s, i) => {
    const li = $(`stop-${i}`);
    if (!li) return;
    const into = legs.get(i), out = legs.get(i + 1);
    li.querySelector('.seg-in').className = `seg seg-in ${i === 0 ? 'm-none' : into ? 'm-' + modeOf(into) : 'm-stay'}`;
    li.querySelector('.seg-out').className = `seg seg-out ${i === d.stops.length - 1 ? 'm-none' : out ? 'm-' + modeOf(out) : 'm-stay'}`;
  });
}

function choose(leg, mode) {
  player.stop();
  S.choices[leg.key] = mode;
  persist();
  renderPresets();
  paintLeg(leg);
  paintTrack();
  api.drawLeg(leg.i, mode, geomFor(leg, mode), true);
  api.frameLeg(leg.i);
  renderSum();
  loadRoutes();
}

function drawLegs(animate) {
  legsOf(day()).forEach((leg, k) => {
    const mode = modeOf(leg);
    api.drawLeg(leg.i, mode, geomFor(leg, mode), animate, animate ? 250 + k * 110 : 0);
  });
}

// ── 하루 합계 ─────────────────────────────────────────────────────────
function renderSum() {
  const legs = legsOf(day());
  let min = 0, yuan = 0, charter = false, live = 0, roadLegs = 0;
  const count = {};
  legs.forEach((leg) => {
    const mode = modeOf(leg), m = metrics(leg, mode, S.people, routesFor(leg)), kind = MODES[mode].kind;
    if (leg.go.fixed) return;
    min += m.min;
    if (m.total) yuan += m.total;
    if (mode === 'charter') charter = true;
    count[mode] = (count[mode] || 0) + 1;
    if (kind !== 'arc') { roadLegs++; if (routesFor(leg)[kind].src === 'api') live++; }
  });
  const mix = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="mix m-${k}">${ICON[k]}${MODES[k].ko} ${n}</span>`).join('');
  $('sum').innerHTML =
    `<div><dt>이동 시간</dt><dd>${fmtMin(min)}</dd></div>` +
    `<div><dt>교통비 (${S.people}명)</dt><dd>${yuan || !charter ? yuan.toLocaleString('ko-KR') + '위안' : '대절비 견적'}${charter && yuan ? '<small> + 대절비</small>' : ''}</dd></div>` +
    `<div><dt>한 사람</dt><dd>${yuan || !charter ? Math.round(yuan / S.people) + '위안' : '견적 ÷ ' + S.people}${charter && yuan ? '<small> + 대절비</small>' : ''}</dd></div>` +
    `<div class="mixes"><dt>이동수단</dt><dd>${mix}</dd></div>`;
  $('rstat').textContent = !NET
    ? '거리와 시간은 11월 11일에 경로 API(OSRM)에서 받아 둔 실제 도로 기준이에요. 이 화면은 약도라 선은 단순하게 그렸습니다. 함께 받은 HTML 파일을 브라우저에서 열면 실제 지도 위에 도로를 따라 그립니다.'
    : !roadLegs ? ''
      : live === roadLegs
        ? `도로를 따라가는 ${roadLegs}개 구간을 모두 경로 API에서 방금 받은 실제 경로로 그렸어요.`
        : `도로 구간 ${roadLegs}개 가운데 ${live}개를 실제 경로로 그렸어요. 나머지는 미리 받아 둔 도로 거리로 계산하고 선만 단순하게 그립니다.`;
  renderCard();
}

// ── 실제 경로 불러오기 ─────────────────────────────────────────────────
function loadRoutes() {
  if (!NET) return;
  const d = day(), legs = legsOf(d), want = [];
  const add = (leg, kind) => {
    if (kind === 'arc' || routesFor(leg)[kind].src === 'api' || want.some(([l, k]) => l === leg && k === kind)) return;
    want.push([leg, kind]);
  };
  legs.forEach((leg) => add(leg, MODES[modeOf(leg)].kind)); // 고른 이동수단 먼저
  legs.forEach((leg) => (leg.go.modes || []).forEach((m) => add(leg, MODES[m].kind)));
  want.forEach(([leg, kind]) => {
    getRoute(kind, leg.from, leg.to).then((route) => {
      if (!route) { if (day() === d) renderSum(); return; }
      const r = routesFor(leg);
      if (r[kind].src === 'api') return;
      r[kind] = route;
      if (day() !== d) return;
      const mode = modeOf(leg);
      paintLeg(leg);
      if (MODES[mode].kind === kind) api.drawLeg(leg.i, mode, route, !player.state().playing);
      renderSum();
    });
  });
}

// ── 선택 ──────────────────────────────────────────────────────────────
function markSel() {
  document.querySelectorAll('.stop').forEach((li) => li.classList.toggle('is-sel', li.id === `stop-${S.sel}`));
}
function select(i, scroll, fromPlayer = false) {
  S.sel = i;
  markSel();
  renderCard();
  api.select(i, !fromPlayer);
  if (!fromPlayer) player.sync(i);
  if ((scroll || fromPlayer) && i >= 0) {
    const e = $(`stop-${i}`);
    if (e) e.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

// ── 지도 위 카드: 고른 장소의 사진과 정보, 고르지 않았을 때는 그날의 제목과 범례 ──────
let cardKey = '';
function renderCard() {
  const d = day(), box = $('mapcard'), key = `${d.id}:${S.sel}:${Object.keys(PH).length}`;
  if (key !== cardKey) {
    cardKey = key;
    if (S.sel < 0) {
      const icon = d.wx.wet ? ICON.rain : d.wx.label === '맑음' ? ICON.sun : ICON.cloud;
      box.className = 'mapcard is-day';
      box.innerHTML = `<div class="mc-body"><p class="mc-eye">11.${d.date} ${d.dow} · ${CITY[d.city].ko}</p><p class="mc-title">${esc(d.title)}</p>` +
        `<p class="mc-meta">${icon}${esc(d.wx.label)} ${esc(d.wx.temp)} · ${Object.keys(orderOf(d)).length}곳</p><p class="mc-legend"></p></div>`;
    } else {
      const s = d.stops[S.sel], p = PLACES[s.p];
      box.className = 'mapcard is-stop';
      box.innerHTML = `<button type="button" class="mc-x" aria-label="선택 해제">×</button>${PH[s.p] ? '<div class="mc-photo"></div>' : ''}` +
        `<div class="mc-body"><p class="mc-eye"><b>${s.t}</b>${KIND[p.kind]}</p><p class="mc-title">${esc(s.h || p.ko)}</p>` +
        `<p class="mc-sub">${s.h ? esc(p.ko) + ' · ' : ''}<span lang="zh">${esc(p.zh.split(' ')[0])}</span></p><p class="mc-leg" hidden></p></div>`;
      const img = photoImg(s.p, 'mc-img', `${p.ko} 사진`);
      if (img) box.querySelector('.mc-photo').appendChild(img);
      box.querySelector('.mc-x').addEventListener('click', () => { player.stop(); select(-1, false); });
    }
  }
  // 이동수단이나 경로 값이 바뀌면 이 부분만 고친다
  const legs = legsOf(d);
  if (S.sel < 0) {
    const modes = [...new Set(legs.map(modeOf))];
    box.querySelector('.mc-legend').innerHTML = modes.map((k) => `<span class="sw m-${k}"><i></i>${MODES[k].ko}</span>`).join('');
  } else {
    const leg = legs.find((l) => l.i === S.sel), chip = box.querySelector('.mc-leg');
    chip.hidden = !leg;
    if (leg) {
      const mode = modeOf(leg), m = metrics(leg, mode, S.people, routesFor(leg));
      chip.className = `mc-leg m-${mode}`;
      chip.innerHTML = `${ICON[mode]}${MODES[mode].ko} ${fmtMin(m.min)}${m.km ? ' · ' + fmtKm(m.km) : ''}`;
    }
  }
}

// ── 사진 ──────────────────────────────────────────────────────────────
function renderCredits() {
  const ids = Object.keys(PH);
  $('creditsec').hidden = !ids.length;
  $('credits').innerHTML = ids.map((id) => {
    const p = PH[id], name = PLACES[id] ? PLACES[id].ko : PHOTO_LABEL[id] || id;
    const by = p.own ? '직접 넣은 사진' : [p.credit || '저작자는 원본 페이지 참고', p.license].filter(Boolean).join(' · ');
    return `<li>${p.page ? `<a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)}<span>${esc(by)}</span></li>`;
  }).join('');
}
function applyPhotos(photos) {
  PH = photos;
  if (!Object.keys(PH).length) return;
  document.querySelectorAll('.stop[data-pid]').forEach(addThumb);
  renderHead();
  renderCard();
  renderCredits();
}

// ── 재생 막대 ─────────────────────────────────────────────────────────
function renderPlayer({ playing, at, speed }) {
  const d = day(), s = d.stops[at], n = d.stops.length;
  const pb = $('pplay');
  pb.innerHTML = playing ? ICON.pause : ICON.play;
  pb.setAttribute('aria-label', playing ? '재생 멈춤' : '동선 재생');
  pb.classList.toggle('is-on', playing);
  const idle = !playing && S.sel < 0;
  $('plabel').innerHTML = idle ? `<b>동선 재생</b> ${d.date}일 ${n}곳` : `<b>${s.t}</b> ${esc(s.h || PLACES[s.p].ko)}`;
  $('pfill').style.width = `${idle ? 0 : (at / (n - 1)) * 100}%`;
  $('pspeed').textContent = `${speed}×`;
  $('pprev').disabled = at <= 0;
  $('pnext').disabled = at >= n - 1;
}
$('pprev').innerHTML = ICON.prev;
$('pnext').innerHTML = ICON.next;
$('fit').innerHTML = ICON.fit;
$('pplay').addEventListener('click', () => player.toggle());
$('pprev').addEventListener('click', () => player.prev());
$('pnext').addEventListener('click', () => player.next());
$('pspeed').addEventListener('click', () => player.cycleSpeed());
$('fit').addEventListener('click', () => { player.stop(); api.fit(true); });

// ── 지도 종류 ─────────────────────────────────────────────────────────
function renderBase() {
  const box = $('base');
  box.textContent = '';
  box.hidden = BASE_ORDER.length < 2;
  BASE_ORDER.forEach((id) => {
    const b = h('button', '', BASEMAPS[id].ko);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(api.base() === id));
    b.addEventListener('click', () => api.setBase(id));
    box.appendChild(b);
  });
}

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5200);
}

// ── 기사님께 보여주기 ──────────────────────────────────────────────────
let lastFocus = null;
function openShow(pid, leg) {
  const p = PLACES[pid];
  lastFocus = document.activeElement;
  const [name, ...addr] = p.zh.split(' ');
  $('showzh').innerHTML = esc(name) + (addr.length ? `<small>${esc(addr.join(' '))}</small>` : '');
  const cars = carsFor(S.people, leg && leg.go.luggage);
  $('showcars').textContent = `我们一共${S.people}个人，需要${cars}辆车`;
  $('showko').textContent = `${p.ko} · 우리는 모두 ${S.people}명이고 차가 ${cars}대 필요해요`;
  $('show').hidden = false;
  $('showx').focus();
}
function closeShow() {
  if ($('show').hidden) return;
  $('show').hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$('showx').addEventListener('click', closeShow);
$('show').addEventListener('click', (e) => { if (e.target === $('show')) closeShow(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeShow(); });

// ── 메모, 할 일 ───────────────────────────────────────────────────────
function renderStatic() {
  $('tips').innerHTML = TIPS.map((t) => `<li class="m-${t.k}"><span class="tip-i">${ICON[t.k]}</span><div><strong>${esc(t.title)}</strong><p>${esc(t.body)}</p></div></li>`).join('');
  const ul = $('todo');
  ul.textContent = '';
  TODO.forEach((text, i) => {
    const li = h('li'), lb = h('label'), cb = h('input'), sp = h('span', '', esc(text));
    cb.type = 'checkbox';
    cb.id = `todo-${i}`;
    cb.checked = !!S.todo[i];
    cb.addEventListener('change', () => { S.todo[i] = cb.checked; persist(); });
    lb.append(cb, sp);
    li.appendChild(lb);
    ul.appendChild(li);
  });
}

// ── 시작 ──────────────────────────────────────────────────────────────
$('pnum').textContent = `${S.people}명`;
renderStatic();
renderPresets();
renderTabs();
renderHead();
renderLine(true);
api.setBase(NET ? (BASE_ORDER.includes(S.base) ? S.base : 'amap') : 'sketch', true);
renderBase();
api.showDay(day(), false);
drawLegs(true);
renderSum();
renderPlayer(player.state());
renderCard();
loadRoutes();
loadPhotos().then(applyPhotos);

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => api.refreshTheme());
new MutationObserver(() => api.refreshTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
let rz = 0;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => api.map.invalidateSize(), 150); });
