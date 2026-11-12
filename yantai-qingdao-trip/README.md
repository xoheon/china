# 옌타이·칭다오 3박 일정 지도

실제 지도 타일 위에 날짜별 동선을 그리고, 구간마다 택시·지하철·버스·도보·전세차를 비교해 주는 웹앱입니다.

## 바로 보기

`dist/index.html` 을 브라우저에서 열면 됩니다. 서버 없이도 지도 타일과 경로 API를 직접 불러옵니다.

## Node.js로 실행

Node 18 이상이 필요합니다.

```bash
npm install
npm start        # 빌드 후 http://localhost:5173
npm run dev      # src/ 를 고치면 자동으로 다시 빌드
npm test         # 좌표 변환, 요금 계산, 일정 데이터 검사
npm run routes   # 모든 구간의 실제 경로를 미리 받아 HTML에 넣기
npm run photos   # 장소 사진을 public/photos/ 에 내려받기
```

`npm start` 로 띄우면 브라우저 대신 Node 서버가 경로 API를 부르고 결과를 `.cache/routes.json` 에 저장합니다. 같은 구간은 다시 요청하지 않습니다.

`npm run routes` 는 여행 전에 한 번 돌려 두면 좋습니다. 경로선이 HTML 안에 들어가서, 현지에서 경로 서버에 접속이 안 돼도 도로를 따라 그려집니다.

## Vercel에 올리기

설정은 `vercel.json` 에 들어 있어서 따로 고를 것이 없습니다.

**명령줄로 (가장 빠름)**

```bash
npm i -g vercel
vercel           # 처음 한 번 로그인과 프로젝트 이름을 묻고, 미리보기 주소가 나옵니다
vercel --prod    # 정식 주소로 배포
```

**GitHub으로**

저장소에 올린 뒤 vercel.com 에서 Add New → Project → 저장소 선택 → Deploy.

배포 빌드(`npm run vercel-build`)는 세 가지를 합니다.

1. 모든 구간의 실제 도로 경로를 받아 HTML에 넣습니다.
2. 장소 사진을 내려받아 `/photos/` 로 함께 올립니다. 그래서 위키미디어가 막힌 곳에서도 사진이 보입니다.
3. 페이지를 빌드합니다. 미리 받지 못한 구간은 `/api/route` 서버리스 함수(`api/route.js`)가 대신 받아 오고 Vercel CDN이 캐시합니다.

`*.vercel.app` 주소는 중국 본토 통신망에서 열리지 않을 수 있습니다. 로밍이나 한국 eSIM이면 괜찮고, 현지 와이파이로도 봐야 한다면 Vercel에 개인 도메인을 연결하세요.

## 사진

`src/data/photos.js` 에 적힌 위키백과 문서의 대표 사진을 씁니다. 페이지 아래 "사진 출처"에 저작자와 라이선스가 표시됩니다.

- 엉뚱한 사진이 나오면 `src/data/photos.js` 에서 그 줄을 지우거나 다른 문서 제목으로 바꾸세요.
- 직접 찍은 사진을 쓰려면 `public/photos/<장소 id>.jpg` 로 넣고 `npm run photos` 를 실행하세요. 장소 id는 `src/data/places.js` 에 있고, 식당처럼 위키백과 사진이 없는 곳도 이렇게 넣을 수 있습니다.

## 쓰는 외부 서비스 (모두 키 없이 동작)

| 용도 | 서비스 | 비고 |
| --- | --- | --- |
| 기본 지도 | 고덕(Amap) 래스터 타일 | 중국 좌표계(GCJ-02). 중국 안에서도 열림 |
| 대체 지도 | CARTO Voyager / Dark | OSM 기반, WGS-84 |
| 도로 경로 | OSRM (`routing.openstreetmap.de`, `router.project-osrm.org`) | 자동차·도보 경로와 거리 |
| 실시간 길찾기 링크 | 고덕지도 URI | 버스·지하철 노선은 여기서 확인 |
| 장소 사진 | 위키백과 API, 위키미디어 공용 | 자유 이용 허락된 대표 사진만 |

고덕 타일을 못 불러오면 CARTO로, 그것도 안 되면 내장 약도로 자동 전환합니다.

## 구조

```
src/data/places.js     장소와 좌표(GCJ-02)
src/data/days.js       날짜별 일정, 구간별 이동수단과 추천 이유, 실제 도로 거리
src/data/photos.js     장소별 사진 출처(위키백과 문서)
src/lib/coords.js      GCJ-02 ↔ WGS-84 변환
src/lib/fare.js        택시 요금표와 계산
src/lib/routing*.js    경로 API 호출과 캐시
src/model.js           구간 추출, 이동수단별 시간·요금 계산
src/map.js             Leaflet 지도, 타일 전환, 경로선과 마커
src/player.js          동선 재생 애니메이션
src/main.js            화면 그리기와 상태
server.mjs             정적 서버 + /api/route (경로 API 중계·캐시)
api/route.js           Vercel 서버리스 함수 (같은 경로 API)
vercel.json            Vercel 빌드 설정
build.mjs              esbuild 번들, 제목 글꼴 서브셋, HTML 한 파일로 합치기
```

일정을 바꾸려면 `src/data/days.js` 만 고치면 됩니다. 택시 요금 기준은 `src/lib/fare.js` 에 있습니다.
