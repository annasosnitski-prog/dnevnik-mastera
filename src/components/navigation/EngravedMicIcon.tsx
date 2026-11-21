// Значок голосового ввода на хабе: классический студийный микрофон —
// вертикальная капсула-пилюля с горизонтальной решёткой (линии короче
// сверху и снизу, по форме капсулы), U-образная дужка-держатель, короткая
// ножка и куполообразное основание. Линиями как гравировка по металлу —
// каждая линия дважды: тёмная бороздка со сдвигом вниз и светлая золотая
// кромка поверх. Появляется на 2 секунды раз в ~12 (CSS nav-fab__mic-hint),
// напоминая, что хаб можно удержать и сказать команду. Без событий — не
// мешает нажатиям.
const MIC_LINES = [
  // капсула-пилюля
  'M8.4 4.6a3.6 3.6 0 0 1 7.2 0v5.8a3.6 3.6 0 0 1-7.2 0z',
  // решётка: короткие линии у макушки и донышка, длинные в середине
  'M11 2.9h2 M10.1 4.5h3.8 M9.9 6.1h4.2 M9.9 7.7h4.2 M9.9 9.3h4.2 M10.1 10.9h3.8 M11 12.5h2',
  // U-образная дужка-держатель
  'M6.2 9.2v1.2c0 3.4 2.6 5.8 5.8 5.8s5.8-2.4 5.8-5.8V9.2',
  // короткая ножка
  'M12 16.2v3',
  // основание
  'M8.6 21.8c0-1.5 1.5-2.6 3.4-2.6s3.4 1.1 3.4 2.6z',
];

export function EngravedMicIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="engraved-mic-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6E3A8" />
          <stop offset="0.55" stopColor="#C9A24E" />
          <stop offset="1" stopColor="#8A6A2A" />
        </linearGradient>
      </defs>
      <g strokeLinecap="round" strokeLinejoin="round">
        {MIC_LINES.map((d) => (
          <path key={`groove-${d}`} d={d} stroke="rgba(30, 18, 4, 0.75)" strokeWidth={1.3} transform="translate(0 0.6)" />
        ))}
        {MIC_LINES.map((d) => (
          <path key={`edge-${d}`} d={d} stroke="url(#engraved-mic-gold)" strokeWidth={0.9} />
        ))}
      </g>
    </svg>
  );
}
