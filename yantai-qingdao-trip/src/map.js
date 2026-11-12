// Leaflet 지도. 실제 지도 타일(고덕, CARTO)을 불러오고, 실패하면 다음 지도로, 끝내 안 되면 내장 약도로 바꾼다.
import L from 'leaflet';
import { COASTS, AREAS } from './data/sketch.js';
import { PLACES } from './data/places.js';
import { wgs2gcj, gcj2wgs } from './lib/coords.js';
import { ICON } from './icons.js';

const NET = typeof __NET__ === 'undefined' ? true : __NET__;
const AMAP = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
const AMAP_SAT = 'https://webst0{s}.is.autonavi.com/appmaptile?style={style}&x={x}&y={y}&z={z}';
const CARTO = 'https://{s}.basemaps.cartocdn.com/{style}/{z}/{x}/{y}{r}.png';

// crs: 타일이 쓰는 좌표계. 고덕은 GCJ-02, OSM 계열은 WGS-84라서 지도를 바꿀 때 마커와 선도 함께 변환한다.
export const BASEMAPS = {
  amap: { ko: '고덕', name: '고덕 지도', crs: 'gcj', invert: true, attr: '지도 © 高德地图',
    layers: [{ url: AMAP, sub: '1234', maxNative: 18 }] },
  carto: { ko: '밝은 지도', name: '밝은 지도', crs: 'wgs', attr: '© OpenStreetMap 기여자 © CARTO',
    layers: [{ url: CARTO.replace('{style}', 'rastertiles/voyager'), dark: CARTO.replace('{style}', 'dark_all'), sub: 'abcd', maxNative: 20 }] },
  sat: { ko: '위성', name: '위성 지도', crs: 'gcj', attr: '영상 © 高德地图',
    layers: [{ url: AMAP_SAT.replace('{style}', '6'), sub: '1234', maxNative: 18 }, { url: AMAP_SAT.replace('{style}', '8'), sub: '1234', maxNative: 18 }] },
  sketch: { ko: '약도', name: '약도', crs: 'gcj', attr: '약도 (해안선은 단순화한 그림)' }
};
export const BASE_ORDER = NET ? ['amap', 'carto', 'sat', 'sketch'] : ['sketch'];
const FALLBACK = { amap: 'carto', carto: 'sketch', sat: 'amap' };

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createMap(el, { onPick, onBaseChange, isDark }) {
  const map = L.map(el, {
    zoomControl: false, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5,
    minZoom: 6, maxZoom: 18, center: [37.56, 121.3], zoom: 10
  });
  const attr = L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 110 }).addTo(map);
  L.control.zoom({ position: 'bottomright', zoomInTitle: '확대', zoomOutTitle: '축소' }).addTo(map);
  for (const [name, z] of [['sketch', 150], ['legs', 420], ['veh', 650]]) map.createPane(name).style.zIndex = z;
  map.getPane('sketch').style.pointerEvents = 'none';
  map.getPane('veh').style.pointerEvents = 'none';

  const st = { base: null, tiles: [], sketch: null, day: null, markers: new Map(), order: [], legs: new Map(), sel: null, veh: null, watch: 0, flow: null, focus: null };
  const crs = () => BASEMAPS[st.base].crs;
  /** 주어진 좌표계의 점을 현재 지도 좌표계로 옮긴다 */
  const D = (lat, lon, from) => {
    if (from === crs()) return [lat, lon];
    const [x, y] = from === 'wgs' ? wgs2gcj(lon, lat) : gcj2wgs(lon, lat);
    return [y, x];
  };
  const P = (id) => D(PLACES[id].lat, PLACES[id].lon, 'gcj');

  function buildSketch() {
    const g = L.layerGroup();
    for (const k in COASTS) {
      L.polygon(COASTS[k].map(([lon, lat]) => [lat, lon]), { pane: 'sketch', className: 'land', interactive: false, smoothFactor: 0.4 }).addTo(g);
    }
    for (const [name, lon, lat] of AREAS) {
      L.marker([lat, lon], { pane: 'sketch', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'area', html: name, iconSize: [120, 20], iconAnchor: [60, 10] }) }).addTo(g);
    }
    return g;
  }

  function setBase(id, auto = false) {
    if (!BASEMAPS[id] || id === st.base) return;
    const prev = st.base && BASEMAPS[st.base], c = map.getCenter(), z = map.getZoom();
    st.tiles.forEach((t) => t.remove());
    st.tiles = [];
    if (st.sketch) { st.sketch.remove(); st.sketch = null; }
    clearTimeout(st.watch);
    if (prev) attr.removeAttribution(prev.attr);
    st.base = id;
    const b = BASEMAPS[id];
    attr.addAttribution(b.attr);
    el.classList.toggle('is-invert', !!b.invert);
    el.classList.toggle('is-sketch', id === 'sketch');
    el.dataset.base = id;
    if (id === 'sketch') {
      st.sketch = buildSketch().addTo(map);
    } else {
      // 첫 타일이 끝내 안 오면(오프라인, 차단) 다음 지도로 넘어간다
      let ok = 0, bad = 0, done = false;
      const fail = () => {
        if (done || ok > 0 || st.base !== id) return;
        done = true;
        const next = FALLBACK[id] || 'sketch';
        setBase(next, true);
        onBaseChange?.(next, id);
      };
      b.layers.forEach((l, k) => {
        const t = L.tileLayer(isDark() && l.dark ? l.dark : l.url, { subdomains: l.sub, maxNativeZoom: l.maxNative, maxZoom: 18 });
        if (k === 0) {
          t.on('tileload', () => { ok++; });
          t.on('tileerror', () => { if (++bad >= 4) fail(); });
        }
        t.addTo(map);
        st.tiles.push(t);
      });
      st.watch = setTimeout(fail, 9000);
    }
    if (prev && prev.crs !== b.crs) {
      const [x, y] = prev.crs === 'wgs' ? wgs2gcj(c.lng, c.lat) : gcj2wgs(c.lng, c.lat);
      map.setView([y, x], z, { animate: false });
    }
    redraw();
    if (!auto) onBaseChange?.(id, null);
  }

  function refreshTheme() {
    const id = st.base;
    if (!id || !BASEMAPS[id].layers?.some((l) => l.dark)) return;
    st.base = null;
    attr.removeAttribution(BASEMAPS[id].attr);
    setBase(id, true);
  }

  function redraw() {
    if (!st.day) return;
    st.legs.forEach((leg, i) => drawLeg(i, leg.mode, leg.geom, false));
    nudge();
  }

  // 가까이 붙은 마커는 화면에서 서로 밀어내 번호가 겹치지 않게 한다
  function nudge() {
    if (!st.order.length) return;
    const GAP = 31, pos = st.order.map((id) => map.latLngToLayerPoint(P(id)));
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i], b = pos[j];
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d >= GAP) continue;
          if (d < 1) { dx = 1; dy = 0; d = 1; }
          const m = (GAP - d) / 2;
          a.x -= (dx / d) * m; a.y -= (dy / d) * m;
          b.x += (dx / d) * m; b.y += (dy / d) * m;
        }
      }
    }
    st.order.forEach((id, k) => st.markers.get(id).setLatLng(map.layerPointToLatLng(pos[k])));
  }
  map.on('zoomend', nudge);

  function clearDay() {
    hideVehicle();
    focusLeg(null);
    st.markers.forEach((m) => m.remove());
    st.markers.clear();
    st.legs.forEach((l) => l.group.remove());
    st.legs.clear();
    st.sel = null;
  }

  function showDay(day, animate = true) {
    clearDay();
    st.day = day;
    st.order = [];
    const first = {};
    day.stops.forEach((s, i) => { if (!(s.p in first)) { first[s.p] = i; st.order.push(s.p); } });
    st.order.forEach((id, k) => {
      const p = PLACES[id];
      const m = L.marker(P(id), {
        title: p.ko, alt: p.ko, riseOnHover: true, zIndexOffset: 200 - k,
        icon: L.divIcon({ className: 'stn', html: `<b class="dot k-${p.kind}">${k + 1}</b>`, iconSize: [30, 30], iconAnchor: [15, 15] })
      });
      m.on('click', () => onPick(first[id]));
      m.addTo(map);
      if (animate && !calm()) {
        const dot = m.getElement().firstElementChild;
        dot.style.animationDelay = `${k * 50}ms`;
        dot.classList.add('pop');
      }
      st.markers.set(id, m);
    });
    fit(animate);
    nudge();
  }

  // 지도 위에 얹힌 단추와 재생 막대, 밀려난 마커가 가려지지 않도록 여백을 둔다
  function pad() {
    const w = el.clientWidth, h = el.clientHeight, x = Math.max(36, Math.min(64, w * 0.1));
    return { paddingTopLeft: [x, Math.max(54, Math.min(72, h * 0.16))], paddingBottomRight: [x, Math.max(40, Math.min(96, h * 0.2))] };
  }

  function fit(animate = true) {
    if (!st.day) return;
    const b = L.latLngBounds(st.day.stops.slice(st.day.fitFrom || 0).map((s) => P(s.p)));
    if (!b.isValid()) return;
    const o = { ...pad(), maxZoom: 15.5 };
    if (animate && !calm()) map.flyToBounds(b, { ...o, duration: 0.9 });
    else map.fitBounds(b, { ...o, animate: false });
  }

  /** 구간 선을 그린다. geom = { pts: [[lat, lon]...], crs, src } */
  function drawLeg(i, mode, geom, animate = false, delay = 0) {
    const old = st.legs.get(i);
    if (old) old.group.remove();
    const ll = geom.pts.map(([la, lo]) => D(la, lo, geom.crs));
    const casing = L.polyline(ll, { pane: 'legs', className: 'route-case', interactive: false, smoothFactor: 1 });
    const line = L.polyline(ll, { pane: 'legs', className: `route m-${mode}${geom.src === 'est' || geom.src === 'snap' ? ' is-est' : ''}`, smoothFactor: 1, bubblingMouseEvents: false });
    line.on('click', () => onPick(i));
    const glow = L.polyline(ll, { pane: 'legs', className: `route-glow m-${mode}`, interactive: false, smoothFactor: 1 });
    const group = L.layerGroup([glow, casing, line]).addTo(map);
    st.legs.set(i, { group, line, mode, geom, ll });
    if (animate && !calm()) for (const layer of [casing, line]) drawIn(layer, delay);
    if (st.focus === i) focusLeg(i);
  }

  // 선이 출발지에서 도착지로 그려지는 효과
  function drawIn(layer, delay) {
    const e = layer.getElement();
    if (!e || !e.getTotalLength) return;
    const len = e.getTotalLength();
    if (!(len > 0)) return;
    e.style.transition = 'none';
    e.style.strokeDasharray = `${len} ${len}`;
    e.style.strokeDashoffset = len;
    const clear = () => { e.style.transition = ''; e.style.strokeDasharray = ''; e.style.strokeDashoffset = ''; };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      e.style.transition = `stroke-dashoffset ${Math.round(Math.min(1000, 360 + len * 0.8))}ms cubic-bezier(.4,0,.2,1) ${delay}ms`;
      e.style.strokeDashoffset = '0';
    }));
    setTimeout(clear, delay + 1500);
    map.once('zoomstart', clear);
  }

  // 고른 장소로 들어오는 구간만 또렷하게 하고 나머지는 흐리게 한다. 선 위로 작은 점이 진행 방향으로 흐른다
  function focusLeg(i) {
    if (st.flow) { st.flow.remove(); st.flow = null; }
    const leg = i == null ? null : st.legs.get(i);
    st.focus = leg ? i : null;
    st.legs.forEach((l, k) => { const e = l.line.getElement(); if (e) e.classList.toggle('is-focus', k === st.focus); });
    el.classList.toggle('has-focus', !!leg);
    if (leg && !calm()) st.flow = L.polyline(leg.ll, { pane: 'legs', className: 'route-flow', interactive: false, smoothFactor: 1 }).addTo(map);
  }

  function select(i, focus = true) {
    if (st.sel) {
      const prev = st.markers.get(st.sel);
      if (prev) { prev.getElement()?.classList.remove('is-sel'); prev.unbindTooltip(); prev.setZIndexOffset(0); }
      st.sel = null;
    }
    focusLeg(null);
    if (i == null || i < 0 || !st.day) return;
    const id = st.day.stops[i].p, m = st.markers.get(id);
    if (!m) return;
    st.sel = id;
    focusLeg(i);
    m.getElement().classList.add('is-sel');
    m.setZIndexOffset(1000);
    m.bindTooltip(PLACES[id].ko, { permanent: true, direction: 'top', offset: [0, -17], className: 'stn-tip' }).openTooltip();
    if (!focus) return;
    const pt = map.latLngToContainerPoint(m.getLatLng()), w = el.clientWidth, h = el.clientHeight;
    if (pt.x < 48 || pt.x > w - 48 || pt.y < 64 || pt.y > h - 72) map.panTo(m.getLatLng(), { animate: !calm(), duration: 0.6 });
  }

  /** 구간 전체가 보이도록 화면을 옮긴다. 이미 잘 보이면 그대로 둔다 */
  function frameLeg(i) {
    const leg = st.legs.get(i);
    if (!leg) return Promise.resolve();
    const b = L.latLngBounds(leg.ll), o = { ...pad(), maxZoom: 16 };
    if (calm()) { map.fitBounds(b, { ...o, animate: false }); return Promise.resolve(); }
    const span = map.latLngToContainerPoint(b.getNorthEast()).distanceTo(map.latLngToContainerPoint(b.getSouthWest()));
    if (map.getBounds().pad(-0.1).contains(b) && span > Math.min(el.clientWidth, el.clientHeight) * 0.22) return Promise.resolve();
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; map.off('moveend', fin); res(); };
      map.once('moveend', fin);
      setTimeout(fin, 1600);
      map.flyToBounds(b, { ...o, duration: 0.8 });
    });
  }

  function vehicle(mode, latlng) {
    if (!st.veh) {
      st.veh = L.marker(latlng, { pane: 'veh', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'veh', html: '<i></i>', iconSize: [40, 40], iconAnchor: [20, 20] }) }).addTo(map);
    }
    const e = st.veh.getElement();
    if (e.dataset.mode !== mode) {
      e.dataset.mode = mode;
      e.firstElementChild.className = `m-${mode}`;
      e.firstElementChild.innerHTML = ICON[mode] || ICON.taxi;
    }
    st.veh.setLatLng(latlng);
  }
  function hideVehicle() { if (st.veh) { st.veh.remove(); st.veh = null; } }

  return {
    map, setBase, refreshTheme, showDay, drawLeg, select, focusLeg, fit, frameLeg, vehicle, hideVehicle,
    base: () => st.base,
    leg: (i) => st.legs.get(i)
  };
}
