// 동선 재생: 하루 일정을 순서대로 따라가며 이동수단 아이콘이 실제 경로 위를 움직인다.
import L from 'leaflet';

export function createPlayer(h) {
  let run = 0, playing = false, at = 0, speed = 1;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
  const clamp = (k) => Math.max(0, Math.min(h.count() - 1, k));
  const emit = () => h.onState({ playing, at, speed, total: h.count() });

  function stop() {
    run++;
    if (!playing) return;
    playing = false;
    h.api.hideVehicle();
    emit();
  }

  function goto(k) {
    stop();
    at = clamp(k);
    h.onStop(at);
    emit();
  }

  // 경로를 따라 등속에 가깝게(처음과 끝만 부드럽게) 이동
  function travel(leg, my) {
    const map = h.api.map, ll = leg.ll.map((p) => L.latLng(p)), cum = [0];
    for (let i = 1; i < ll.length; i++) cum.push(cum[i - 1] + map.distance(ll[i - 1], ll[i]));
    const total = cum[cum.length - 1] || 1;
    if (calm()) { h.api.vehicle(leg.mode, ll[ll.length - 1]); return wait(500); }
    const dur = Math.min(4200, Math.max(1300, 900 + 520 * Math.sqrt(total / 1000))) / speed;
    return new Promise((res) => {
      const t0 = performance.now();
      let k = 1;
      const step = (now) => {
        if (my !== run) return res();
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const d = e * total;
        while (k < cum.length - 1 && cum[k] < d) k++;
        const f = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
        h.api.vehicle(leg.mode, [ll[k - 1].lat + (ll[k].lat - ll[k - 1].lat) * f, ll[k - 1].lng + (ll[k].lng - ll[k - 1].lng) * f]);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  async function play() {
    const my = ++run, n = h.count();
    if (at >= n - 1) at = 0;
    playing = true;
    h.onStop(at);
    emit();
    while (at < n - 1) {
      await wait(700);
      if (my !== run) return;
      const leg = h.api.leg(at + 1);
      if (leg && leg.ll.length > 1) {
        h.api.focusLeg(at + 1);
        await h.api.frameLeg(at + 1);
        if (my !== run) return;
        await travel(leg, my);
        if (my !== run) return;
      }
      at++;
      h.onStop(at);
      emit();
    }
    await wait(600);
    if (my !== run) return;
    playing = false;
    h.api.hideVehicle();
    emit();
  }

  return {
    play, stop, goto,
    toggle: () => (playing ? stop() : play()),
    next: () => goto(at + 1),
    prev: () => goto(at - 1),
    reset: () => { stop(); at = 0; emit(); },
    sync: (k) => { if (!playing) { at = clamp(k); emit(); } },
    cycleSpeed: () => { speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1; emit(); },
    state: () => ({ playing, at, speed })
  };
}
