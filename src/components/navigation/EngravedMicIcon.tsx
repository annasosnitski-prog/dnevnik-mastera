// Значок голосового ввода на хабе: винтажный «джазовый» микрофон-капсула
// на подвесе, линиями как гравировка по металлу — каждая линия дважды:
// тёмная бороздка со сдвигом вниз и светлая золотая кромка поверх.
// Появляется на 2 секунды раз в ~12 (CSS nav-fab__mic-hint), напоминая,
// что хаб можно удержать и сказать команду. Без событий — не мешает нажатиям.
const MIC_LINES = [
  // капсула
  'M8 3.2c0-1.6 1.8-2.4 4-2.4s4 .8 4 2.4v7.2c0 1.6-1.8 2.4-4 2.4s-4-.8-4-2.4z',
  // рёбра решётки
  'M8.3 4.6h7.4 M8 6.4h8 M8 8.2h8 M8.3 10h7.4',
  // центральная вертикаль решётки
  'M12 1.2v11.2',
  // подвес-скоба
  'M6 7.4v1.4c0 3.4 2.7 5.6 6 5.6s6-2.2 6-5.6V7.4',
  // стойка и основание
  'M12 14.4v4.6 M8.6 21.6c0-1.5 1.5-2.6 3.4-2.6s3.4 1.1 3.4 2.6z',
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
