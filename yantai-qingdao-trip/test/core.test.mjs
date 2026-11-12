import test from 'node:test';
import assert from 'node:assert/strict';
import { wgs2gcj, gcj2wgs, haversine } from '../src/lib/coords.js';
import { decodePolyline, parseOsrm, routeKey, routeUrl } from '../src/lib/routing-core.js';
import { taxiFare, carsFor } from '../src/lib/fare.js';
import { DAYS } from '../src/data/days.js';
import { PLACES } from '../src/data/places.js';
import { MODES, legsOf, presetMode, pickMode, metrics, fmtMin, fmtKm } from '../src/model.js';

test('좌표 변환: GCJ-02 ↔ WGS-84 왕복 오차 1m 미만, 어긋남은 수백 m', () => {
  const [gl, ga] = wgs2gcj(120.38, 36.06);
  const shift = haversine({ lat: 36.06, lon: 120.38 }, { lat: ga, lon: gl });
  assert.ok(shift > 0.3 && shift < 0.8, `shift ${shift}`);
  const [wl, wa] = gcj2wgs(gl, ga);
  assert.ok(haversine({ lat: 36.06, lon: 120.38 }, { lat: wa, lon: wl }) < 0.001);
  assert.deepEqual(wgs2gcj(127, 60), [127, 60]); // 중국 밖은 그대로
});

test('polyline 디코딩 (구글 문서 예제)', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('OSRM 응답 해석과 URL', () => {
  assert.equal(parseOsrm({ code: 'NoRoute' }), null);
  assert.deepEqual(parseOsrm({ code: 'Ok', routes: [{ distance: 17234, duration: 1290, geometry: 'abc' }] }), { km: 17.23, min: 21.5, line: 'abc' });
  assert.equal(routeKey('car', [121.19, 37.58], [121.38, 37.55]), 'car:121.19000,37.58000;121.38000,37.55000');
  assert.match(routeUrl('https://x/', [121.19, 37.58], [121.38, 37.55]), /^https:\/\/x\/121\.190000,37\.580000;121\.380000,37\.550000\?overview=full&geometries=polyline/);
});

test('택시 요금: 옌타이 9위안/3km, 1.8위안/km, 6km부터 1.5배, 35km부터 1.75배', () => {
  assert.equal(taxiFare('yt', 2), 9);
  assert.equal(taxiFare('yt', 6), Math.round(9 + 3 * 1.8));
  assert.equal(taxiFare('yt', 17), Math.round(9 + 3 * 1.8 + 11 * 2.7));
  assert.equal(taxiFare('yt', 60), Math.round(9 + 3 * 1.8 + 29 * 2.7 + 25 * 3.15));
  assert.equal(taxiFare('yt', 2, 23), 10); // 야간
  assert.equal(taxiFare('qd', 62), Math.round(10 + 3 * 2 + 56 * 3));
  assert.equal(carsFor(11, false), 3);
  assert.equal(carsFor(11, true), 4);
});

test('일정 데이터: 모든 장소와 이동수단이 유효하다', () => {
  for (const d of DAYS) {
    for (const s of d.stops) assert.ok(PLACES[s.p], `${d.id} ${s.p}`);
    for (const leg of legsOf(d)) {
      const go = leg.go;
      if (go.fixed) { assert.ok(MODES[go.fixed]); continue; }
      assert.ok(go.modes.includes(go.rec), `${leg.key} rec`);
      for (const m of go.modes) {
        assert.ok(MODES[m], `${leg.key} ${m}`);
        if (m === 'bus' || m === 'metro') assert.ok(go[m] && go[m].min > 0 && go[m].yuan > 0, `${leg.key} ${m} 값`);
      }
      assert.notEqual(leg.fromId, leg.toId, `${leg.key} 같은 장소`);
      for (const m of go.modes) {
        const kind = MODES[m].kind;
        if (kind !== 'arc') assert.ok(go.road && go.road[kind] && go.road[kind][0] > 0, `${leg.key} ${kind} 실제 거리`);
      }
    }
  }
});

test('한꺼번에 고르기와 개별 선택', () => {
  const legs = legsOf(DAYS[2]);
  const toHotel = legs.find((l) => l.toId === 'qhotel' && l.go.modes.includes('metro'));
  assert.equal(presetMode(toHotel, 'rec'), 'metro');
  assert.equal(presetMode(toHotel, 'taxi'), 'taxi');
  assert.equal(presetMode(toHotel, 'transit'), 'metro');
  assert.equal(pickMode(toHotel, { [toHotel.key]: 'taxi' }, 'rec'), 'taxi');
  assert.equal(pickMode(toHotel, { [toHotel.key]: 'bus' }, 'rec'), 'metro'); // 없는 수단은 무시
  const train = legs.find((l) => l.go.fixed);
  assert.equal(pickMode(train, {}, 'taxi'), 'train');
});

test('구간 계산: 택시는 대수 × 요금, API 시간에는 여유를 더한다', () => {
  const leg = legsOf(DAYS[0])[1]; // 호텔 → 시장
  const r = { car: { km: 17, min: 20, src: 'api' }, foot: { km: 15, min: 190, src: 'est' } };
  const m = metrics(leg, 'taxi', 11, r);
  assert.equal(m.cars, 3);
  assert.equal(m.each, taxiFare('yt', 17));
  assert.equal(m.total, m.each * 3);
  assert.equal(m.min, 27);
  assert.equal(metrics(leg, 'bus', 11, r).total, 22);
  assert.equal(fmtMin(95), '1시간 35분');
  assert.equal(fmtKm(0.86), '860m');
  assert.equal(fmtKm(17.23), '17km');
});

import { pageImagesUrl, imageInfoUrl, parsePageImages, parseImageInfo, resolvePhotos } from '../src/lib/photos-core.js';

test('사진: 위키백과 응답에서 대표 사진과 출처를 뽑는다', async () => {
  assert.match(pageImagesUrl('en', ['Penglai Pavilion', 'May Fourth Square']), /^https:\/\/en\.wikipedia\.org\/w\/api\.php\?.*origin=\*.*pilicense=free.*titles=Penglai%20Pavilion%7CMay%20Fourth%20Square$/);
  assert.match(imageInfoUrl('zh', ['A_b.jpg']), /titles=File%3AA_b\.jpg$/);
  const pi = {
    query: {
      normalized: [{ from: 'zhanqiao_Pier', to: 'Zhanqiao Pier' }], redirects: [{ from: 'Zhanqiao Pier', to: 'Zhan Bridge' }],
      pages: [
        { pageid: 1, title: 'Zhan Bridge', thumbnail: { source: 'https://upload.wikimedia.org/a/800px-Pier.jpg', width: 800, height: 533 }, pageimage: 'Zhan_Qiao_Pier.jpg' },
        { pageid: 2, title: 'Yantai', thumbnail: { source: 'https://upload.wikimedia.org/b.png', width: 800, height: 500 }, pageimage: 'Yantai_location_map.svg' },
        { title: 'Nowhere', missing: true }
      ]
    }
  };
  const got = parsePageImages(pi, ['zhanqiao_Pier', 'Yantai', 'Nowhere']);
  assert.deepEqual(Object.keys(got), ['zhanqiao_Pier']); // 지도 그림과 없는 문서는 빠진다
  assert.equal(got.zhanqiao_Pier.name, 'Zhan_Qiao_Pier.jpg');
  const ii = { query: { pages: [{ title: 'File:Zhan Qiao Pier.jpg', imageinfo: [{ descriptionurl: 'https://commons.wikimedia.org/wiki/File:Zhan_Qiao_Pier.jpg', extmetadata: { Artist: { value: '<a href="//x">Kim &amp; Lee</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] }] } };
  assert.deepEqual(parseImageInfo(ii)['Zhan_Qiao_Pier.jpg'], { credit: 'Kim & Lee', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Zhan_Qiao_Pier.jpg' });
  const out = await resolvePhotos({ zhanqiao: 'en:zhanqiao_Pier', x: 'en:Nowhere' }, async (url) => (url.includes('pageimages') ? pi : ii));
  assert.deepEqual(Object.keys(out), ['zhanqiao']);
  assert.equal(out.zhanqiao.credit, 'Kim & Lee');
  assert.equal(out.zhanqiao.url, 'https://upload.wikimedia.org/a/800px-Pier.jpg');
});
