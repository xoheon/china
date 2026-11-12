// 24×24 선 아이콘. 색은 currentColor를 따른다.
const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICON = {
  walk: svg('<circle cx="13.2" cy="4.3" r="1.9"/><path d="M7.5 21l2.6-6.4M10.1 14.6 8.8 12V8.7l3.7-1.7 2.2 3.3 3 1.4M12.4 12.3l2.9 3 .9 5.7"/>'),
  taxi: svg('<path d="M9.5 6.5V4h5v2.5"/><path d="M4.5 18.5v-5.2L6.3 8a2 2 0 0 1 1.9-1.4h7.6A2 2 0 0 1 17.7 8l1.8 5.3v5.2"/><path d="M4.5 13.3h15M4.5 18.5h15"/><path d="M6.5 18.5V20M17.5 18.5V20"/><circle cx="8" cy="16" r=".7" fill="currentColor"/><circle cx="16" cy="16" r=".7" fill="currentColor"/>'),
  charter: svg('<path d="M2.5 16.5V8a1.5 1.5 0 0 1 1.5-1.5h10.5l4.8 4.3 2.2 1v4.7h-1.6"/><path d="M14.5 6.5v4.8h5"/><path d="M2.5 16.5h2M9.6 16.5h5"/><circle cx="7" cy="17" r="2.1"/><circle cx="17.2" cy="17" r="2.1"/>'),
  bus: svg('<rect x="5" y="3.5" width="14" height="14.5" rx="2.6"/><path d="M5 11.5h14M8.2 18v2.5M15.8 18v2.5"/><circle cx="8.6" cy="14.8" r=".7" fill="currentColor"/><circle cx="15.4" cy="14.8" r=".7" fill="currentColor"/>'),
  metro: svg('<circle cx="12" cy="12" r="9.2"/><path d="M7.6 16.2V8l4.4 5.2L16.4 8v8.2"/>'),
  train: svg('<path d="M2.5 7h11.8c1.5 0 2.9.6 3.9 1.7l2.4 2.6c1.3 1.4.3 3.7-1.6 3.7H2.5"/><path d="M2.5 11h14.8M7 7v4M11.5 7v4M2.5 19h19"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5 7 7M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5"/>'),
  cloud: svg('<path d="M7.2 18.5a4.2 4.2 0 0 1-.6-8.35 5.6 5.6 0 0 1 10.6-.9A4.6 4.6 0 0 1 17.4 18.5z"/>'),
  rain: svg('<path d="M7.2 14.5a4.2 4.2 0 0 1-.6-8.35 5.6 5.6 0 0 1 10.6-.9A4.6 4.6 0 0 1 17.4 14.5z"/><path d="M8.5 17.8l-.9 2.7M12.5 17.8l-.9 2.7M16.5 17.8l-.9 2.7"/>'),
  play: svg('<path d="M8 5.2v13.6l11-6.8z" fill="currentColor" stroke="none"/>'),
  pause: svg('<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>'),
  prev: svg('<path d="M17 6l-7 6 7 6M7 6v12"/>'),
  next: svg('<path d="M7 6l7 6-7 6M17 6v12"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  out: svg('<path d="M9 5h10v10M19 5 6 18"/>')
};
