// 요금 계산. 옌타이 택시는 2022년 1월 시행 운임(옌타이일보 2024-12 보도), 칭다오는 통용되는 수준의 근삿값이다.
export const TARIFF = {
  yt: { flag: 9, flagKm: 3, perKm: 1.8, tiers: [[6, 1.5], [35, 1.75]], night: { flag: 10, perKm: 2.16 } },
  qd: { flag: 10, flagKm: 3, perKm: 2.0, tiers: [[6, 1.5]], night: { flag: 10, perKm: 2.4 } }
};

/** 택시 한 대 요금(위안). hour는 0~23, 22시~5시는 야간 요금 */
export function taxiFare(city, km, hour = 12) {
  const t = TARIFF[city] || TARIFF.qd;
  const night = hour >= 22 || hour < 5;
  const flag = night ? t.night.flag : t.flag;
  const per = night ? t.night.perKm : t.perKm;
  let fare = flag;
  // 구간별 할증: tiers = [[몇 km부터, 배수], ...] (빈 차로 돌아가는 거리 보상)
  const cuts = [t.flagKm, ...t.tiers.map((x) => x[0]), Infinity];
  const mult = [1, ...t.tiers.map((x) => x[1])];
  for (let i = 0; i < mult.length; i++) {
    const seg = Math.max(0, Math.min(km, cuts[i + 1]) - cuts[i]);
    fare += seg * per * mult[i];
  }
  return Math.round(fare);
}

/** 택시 대수. 한 대에 4명, 짐이 있으면 3명 */
export const carsFor = (people, luggage) => Math.ceil(people / (luggage ? 3 : 4));
