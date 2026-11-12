// 장소 사진. 위키백과 문서의 대표 사진(자유 이용 허락된 것만)을 쓴다. 형식은 '언어:문서 제목'.
// 직접 찍은 사진으로 바꾸려면 public/photos/<장소 id>.jpg 를 넣고 npm run photos 를 실행하면 된다.
export const PHOTOS = {
  penglaige: 'en:Penglai Pavilion',
  suochengli: 'zh:奇山所城',
  station: 'en:Yantai railway station',
  qstation: 'en:Qingdao railway station',
  zhongshan: "en:St. Michael's Cathedral, Qingdao",
  zhanqiao: 'en:Zhanqiao Pier',
  beer: 'zh:青岛啤酒博物馆',
  may4: 'en:May Fourth Square',
  'hero-yt': 'en:Yantai'
};

// 날짜 머리에 크게 쓰는 사진
export const DAY_HERO = { d14: 'hero-yt', d15: 'penglaige', d16: 'zhanqiao', d17: 'may4' };

export const PHOTO_LABEL = { 'hero-yt': '옌타이' };
