import { useId } from "react";
import "./NavFabMicHint.css";

// Подсказка «удержи — говори»: винтажный студийный микрофон (джаз/подкаст),
// выгравированный на пластине хаба. Только картинка — pointer-events:none,
// так что нажатие и удержание хаба (голос) работают как раньше. Появление
// и исчезание целиком на CSS (NavFabMicHint.css): ~2 с видно, ~10 с пауза.
// Гравировка = тёмный штрих #5C4014 + светлый блик сдвигом вверх-влево,
// тот же приём, что у гравированной пластины в PendantIcon.
export function NavFabMicHint({ size }: { size: number }) {
  const clipId = `nav-fab-mic-clip-${useId().replace(/:/g, "")}`;
  // Капсула 10..22 × 3..19, скругление как у «Элвиса»: овал с плоскими боками.
  const capsule = "M16 3 C20.2 3 22 5.6 22 9 V13 C22 16.4 20.2 19 16 19 C11.8 19 10 16.4 10 13 V9 C10 5.6 11.8 3 16 3 Z";
  const ribs = [5.4, 7.2, 9, 10.8, 12.6, 14.4, 16.2];
  return (
    <span className="nav-fab__mic-hint" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <clipPath id={clipId}>
            <path d={capsule} />
          </clipPath>
        </defs>
        <g
          className="nav-fab__mic-engraving"
          stroke="#5C4014"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* решётка: горизонтальные рёбра-штрихи, как резец по металлу */}
          <g clipPath={`url(#${clipId})`} strokeWidth=".55">
            {ribs.map((y) => (
              <path key={y} d={`M9 ${y} H23`} />
            ))}
          </g>
          {/* тень-штриховка по правому боку капсулы — объём гравировкой */}
          <g clipPath={`url(#${clipId})`} strokeWidth=".35" opacity=".8">
            <path d="M19.6 4.2 L21.8 6.4 M19.6 6.3 L22 8.7 M19.6 8.4 L22 10.8 M19.6 10.5 L22 12.9 M19.6 12.6 L21.9 14.9 M19.6 14.7 L21.2 16.3" />
          </g>
          <path d={capsule} strokeWidth=".95" />
          {/* центральная штанга-хребет */}
          <path d="M16 3.4 V18.6" strokeWidth=".7" />
          {/* лира-подвес */}
          <path d="M8.2 10.6 V12.4 C8.2 17.6 11.6 21.4 16 21.4 C20.4 21.4 23.8 17.6 23.8 12.4 V10.6" strokeWidth=".9" />
          <circle cx="8.2" cy="10.6" r=".95" strokeWidth=".7" />
          <circle cx="23.8" cy="10.6" r=".95" strokeWidth=".7" />
          {/* ножка и подставка */}
          <path d="M16 21.4 V26.2" strokeWidth=".95" />
          <path d="M14.6 23.4 H17.4" strokeWidth=".55" />
          <path d="M10.6 28.2 C10.6 26.9 12.8 26.2 16 26.2 C19.2 26.2 21.4 26.9 21.4 28.2 Z" strokeWidth=".85" />
          <path d="M12.4 27.5 H19.6" strokeWidth=".35" opacity=".8" />
        </g>
      </svg>
    </span>
  );
}
