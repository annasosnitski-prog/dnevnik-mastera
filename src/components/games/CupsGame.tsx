import { useState, useEffect } from 'react';
import { COLORS, fs, MARKER_COLORS } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 2 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

// A simple upturned cup and a little gold ball — same gold line-art recipe as
// the RPS hands. `lifted` raises the cup to reveal whatever's underneath.
export function CupIcon({ size = 56, lifted }: { size?: number; lifted?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ transition: 'transform 0.45s cubic-bezier(0.34,1.4,0.64,1)', transform: lifted ? 'translateY(-34px)' : 'translateY(0)' }}
    >
      <path
        d="M22 88 L34 32Q50 25 66 32L78 88Z"
        fill="rgba(var(--gold-rgb),0.16)"
        stroke="var(--gold)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <ellipse cx="50" cy="88" rx="28" ry="7" fill="rgba(var(--gold-rgb),0.22)" stroke="var(--gold)" strokeWidth="3" />
    </svg>
  );
}
export function BallIcon({ size = 22, color = 'var(--gold)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="16" fill={color} />
      <ellipse cx="14" cy="13" rx="5" ry="3" fill="#fff8de" opacity="0.65" />
    </svg>
  );
}

// Shell/cups mini-game: a ball sits under one of three cups, they "shuffle"
// (a chaotic dance — the ball's slot never actually changes since no one can
// legitimately track it anyway), then the player guesses. Reports 'win'/'loss'
// up to the wrapper once, same as RPSGame.
// Cups genuinely swap places (not just jitter in place) — cupSlot[cupId] is
// which visual slot (0-2) that cup currently occupies; a handful of random
// pairwise swaps animate via CSS transform so there's an actual (if fast)
// shuffle to try to track, same as the real game.
export function CupsGame({ onResult }: { onResult: (result: 'win' | 'loss') => void }) {
  const [ballCup] = useState(() => Math.floor(Math.random() * 3)); // which cup (identity) hides the ball — fixed all round
  const [cupSlot, setCupSlot] = useState<number[]>([0, 1, 2]); // cupSlot[cupId] = current visual slot
  // A fresh random colour from the same palette as client markers, each time
  // a new round mounts (the wrapper remounts this on every retry).
  const [ballColor] = useState(() => MARKER_COLORS[Math.floor(Math.random() * MARKER_COLORS.length)]);
  const [phase, setPhase] = useState<'intro' | 'shuffle' | 'choose' | 'result'>('intro');
  const [revealed, setRevealed] = useState(true);
  const [chosenSlot, setChosenSlot] = useState<number | null>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setRevealed(false), 700));
    timers.push(setTimeout(() => setPhase('shuffle'), 900));

    // More swaps, faster, at jittered intervals (not an even beat) — harder
    // to keep count of than a slow, metronomic shuffle.
    const SWAP_COUNT = 11;
    const SWAP_MS = 180;
    const SWAP_JITTER_MS = 60; // each interval is SWAP_MS ± this
    let elapsed = 900;
    for (let i = 0; i < SWAP_COUNT; i++) {
      elapsed += SWAP_MS + (Math.random() - 0.5) * 2 * SWAP_JITTER_MS;
      timers.push(
        setTimeout(() => {
          setCupSlot((prev) => {
            const a = Math.floor(Math.random() * 3);
            // b picked as an offset from a (1 or 2 steps, mod 3) — guaranteed
            // different from a with no retry loop needed.
            const b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
            const next = [...prev];
            const cupAtA = next.indexOf(a);
            const cupAtB = next.indexOf(b);
            next[cupAtA] = b;
            next[cupAtB] = a;
            return next;
          });
        }, elapsed),
      );
    }
    timers.push(setTimeout(() => setPhase('choose'), elapsed + 150));
    return () => timers.forEach(clearTimeout);
  }, []);

  const ballSlot = cupSlot[ballCup]; // where the ball actually ends up, post-shuffle

  const choose = (slot: number) => {
    if (phase !== 'choose') return;
    setChosenSlot(slot);
    setPhase('result');
    setTimeout(() => onResult(slot === ballSlot ? 'win' : 'loss'), 1300);
  };

  const caption =
    phase === 'intro'
      ? 'Запоминай, где шарик...'
      : phase === 'shuffle'
      ? 'Мешаю, мешаю...'
      : phase === 'choose'
      ? 'Где шарик?'
      : chosenSlot === ballSlot
      ? 'Угадал!'
      : 'Не там — попробуй ещё раз';

  const STEP = 74; // px — matches cup width (56) + gap (18)

  return (
    <>
      <div style={{ fontSize: fs(14), color: chosenSlot === ballSlot && phase === 'result' ? COLORS.gold : COLORS.textGhost, fontStyle: 'italic', marginTop: 6 }}>
        {caption}
      </div>
      <div style={{ position: 'relative', width: STEP * 3 - 18, height: 90, marginTop: 10 }}>
        {[0, 1, 2].map((cupId) => {
          const slot = cupSlot[cupId];
          const lifted = (phase === 'intro' && revealed && cupId === ballCup) || (phase === 'result' && cupId === ballCup);
          return (
            <div
              key={cupId}
              onClick={() => choose(slot)}
              role="button"
              aria-label={`Стаканчик ${slot + 1}`}
              style={{
                position: 'absolute',
                left: cupId * STEP,
                top: 0,
                transform: `translateX(${(slot - cupId) * STEP}px)`,
                transition: 'transform 0.17s ease-in-out',
                cursor: phase === 'choose' ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {lifted && (
                <div style={{ position: 'absolute', bottom: 8, zIndex: 1 }}>
                  <BallIcon size={20} color={ballColor} />
                </div>
              )}
              <div style={{ zIndex: 2 }}>
                <CupIcon size={56} lifted={lifted} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
