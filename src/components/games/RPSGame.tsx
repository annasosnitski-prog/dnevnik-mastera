import { useState } from 'react';
import { DROP_CAP_FONT } from '../InkaLogo';
import { COLORS, fs } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 2 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

export const RPS_MOVES = ['rock', 'scissors', 'paper'] as const;
export type RPSMove = (typeof RPS_MOVES)[number];
const RPS_LABELS: Record<RPSMove, string> = { rock: 'Камень', scissors: 'Ножницы', paper: 'Бумага' };
const RPS_BEATS: Record<RPSMove, RPSMove> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

export function RPSHandIcon({ move, size = 56 }: { move: RPSMove; size?: number }) {
  const stroke = 'var(--gold)';
  const fill = 'rgba(var(--gold-rgb),0.16)';
  if (move === 'rock') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <rect x="40" y="76" width="24" height="16" rx="7" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="28" y="36" width="46" height="42" rx="18" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="18" y="48" width="18" height="24" rx="9" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <path d="M42 38V48M54 38V48M64 40V50" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (move === 'paper') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <rect x="38" y="78" width="26" height="14" rx="6" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="27" y="44" width="48" height="36" rx="14" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="30" y="14" width="10" height="38" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="43" y="8" width="10" height="44" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="56" y="8" width="10" height="44" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="69" y="14" width="10" height="38" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="14" y="48" width="20" height="12" rx="6" fill={fill} stroke={stroke} strokeWidth="3" transform="rotate(-30 24 54)" />
      </svg>
    );
  }
  // scissors — victory-sign fingers over a small folded fist
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect x="36" y="80" width="24" height="14" rx="6" fill={fill} stroke={stroke} strokeWidth="3.5" />
      <rect x="30" y="52" width="36" height="30" rx="14" fill={fill} stroke={stroke} strokeWidth="3.5" />
      <rect x="36" y="8" width="10" height="48" rx="5" fill={fill} stroke={stroke} strokeWidth="3" transform="rotate(-12 41 32)" />
      <rect x="54" y="8" width="10" height="48" rx="5" fill={fill} stroke={stroke} strokeWidth="3" transform="rotate(12 59 32)" />
    </svg>
  );
}

export function RPSTauntFace() {
  return (
    <svg width="128" height="128" viewBox="0 0 100 100" fill="none">
      <path d="M27 41Q34 33 41 41" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M59 41Q66 33 73 41" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="25" cy="57" r="6" fill="var(--gold)" opacity="0.32" />
      <circle cx="75" cy="57" r="6" fill="var(--gold)" opacity="0.32" />
      <path d="M38 60Q50 74 62 60Q50 66 38 60Z" fill="var(--gold)" opacity="0.85" />
      <ellipse cx="53" cy="69" rx="7" ry="11" fill="#C9556B" transform="rotate(18 53 69)" />
    </svg>
  );
}

// Rock-paper-scissors mini-game: reports only 'win'/'loss' up to the wrapper;
// ties are replayed for free entirely internally.
export function RPSGame({ onResult }: { onResult: (result: 'win' | 'loss') => void }) {
  const [phase, setPhase] = useState<'choose' | 'shake' | 'reveal'>('choose');
  const [outcome, setOutcome] = useState<'win' | 'loss' | 'tie' | null>(null);
  const [userMove, setUserMove] = useState<RPSMove | null>(null);
  const [computerMove, setComputerMove] = useState<RPSMove | null>(null);
  const [tieRound, setTieRound] = useState(0); // bumped on each tie so the pop-in animation replays

  const play = (move: RPSMove) => {
    if (phase !== 'choose') return;
    setUserMove(move);
    setPhase('shake');

    // Fists bounce together for a beat first — the classic "камень, ножницы...
    // бумага!" shake — then both shapes reveal at once.
    setTimeout(() => {
      const computer = RPS_MOVES[Math.floor(Math.random() * 3)];
      setComputerMove(computer);

      if (computer === move) {
        setOutcome('tie');
        setPhase('reveal');
        setTieRound((r) => r + 1);
        setTimeout(() => {
          setPhase('choose');
          setOutcome(null);
          setUserMove(null);
          setComputerMove(null);
        }, 1000);
        return;
      }

      const won = RPS_BEATS[move] === computer;
      setOutcome(won ? 'win' : 'loss');
      setPhase('reveal');
      setTimeout(() => onResult(won ? 'win' : 'loss'), 1000);
    }, 900);
  };

  const resultText =
    outcome === 'win' ? 'Победа!' : outcome === 'tie' ? 'Ничья — ещё раз' : 'Проигрыш — попробуй ещё раз';

  return (
    <>
      {phase === 'choose' && (
        <>
          <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 6 }}>
            Выиграй раунд, чтобы продолжить
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
            {RPS_MOVES.map((m) => (
              <div
                key={m}
                onClick={() => play(m)}
                role="button"
                aria-label={RPS_LABELS[m]}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    border: '1px solid rgba(var(--gold-rgb),0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RPSHandIcon move={m} size={40} />
                </div>
                <span style={{ fontSize: fs(10), color: COLORS.textFaint, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {RPS_LABELS[m]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {phase === 'shake' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <div className="inka-rps-shake">
            <RPSHandIcon move="rock" size={54} />
          </div>
          <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(15), color: COLORS.textGhost }}>vs</div>
          <div className="inka-rps-shake" style={{ animationDelay: '0.05s' }}>
            <RPSHandIcon move="rock" size={54} />
          </div>
        </div>
      )}

      {phase === 'reveal' && (
        <>
          <div key={`reveal-${tieRound}`} className="inka-rps-pop" style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            {userMove && <RPSHandIcon move={userMove} size={54} />}
            <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(15), color: COLORS.textGhost }}>vs</div>
            {computerMove && <RPSHandIcon move={computerMove} size={54} />}
          </div>
          <div
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: fs(22),
              color: outcome === 'win' ? COLORS.gold : COLORS.textPrimary,
              letterSpacing: '1px',
            }}
          >
            {resultText}
          </div>
        </>
      )}
    </>
  );
}
