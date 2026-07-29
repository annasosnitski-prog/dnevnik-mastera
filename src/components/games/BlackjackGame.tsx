import { useState, useEffect, useRef } from 'react';
import { DROP_CAP_FONT } from '../InkaLogo';
import { COLORS, fs } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 2 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

// A simple playing card — rounded rect, rank + suit, red for hearts/diamonds.
// `faceDown` shows the dealer's hidden hole card as a plain patterned back.
export function PlayingCard({ rank, suit, faceDown, size = 46 }: { rank: string; suit: '♠' | '♥' | '♦' | '♣'; faceDown?: boolean; size?: number }) {
  const isRed = suit === '♥' || suit === '♦';
  if (faceDown) {
    return (
      <div
        style={{
          width: size,
          height: size * 1.4,
          borderRadius: 5,
          border: '1px solid rgba(var(--gold-rgb),0.4)',
          background:
            'repeating-linear-gradient(45deg, rgba(var(--gold-rgb),0.1), rgba(var(--gold-rgb),0.1) 4px, transparent 4px, transparent 8px)',
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size * 1.4,
        borderRadius: 5,
        border: '1px solid rgba(var(--gold-rgb),0.4)',
        background: 'rgba(var(--gold-rgb),0.05)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: isRed ? '#C9556B' : 'var(--gold)',
      }}
    >
      <div style={{ fontSize: size * 0.32, fontWeight: 600, lineHeight: 1 }}>{rank}</div>
      <div style={{ fontSize: size * 0.36, lineHeight: 1 }}>{suit}</div>
    </div>
  );
}

type PlayingCardData = { rank: string; suit: '♠' | '♥' | '♦' | '♣'; value: number };
const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const CARD_SUITS: PlayingCardData['suit'][] = ['♠', '♥', '♦', '♣'];
const rankValue = (r: string) => (r === 'A' ? 11 : ['J', 'Q', 'K'].includes(r) ? 10 : parseInt(r, 10));
const drawCard = (): PlayingCardData => {
  const rank = CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)];
  const suit = CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)];
  return { rank, suit, value: rankValue(rank) };
};
// Standard soft-hand scoring: aces count 11 unless that busts the hand, then
// downgrade one at a time to 1.
function handValue(cards: PlayingCardData[]): number {
  let total = cards.reduce((s, c) => s + c.value, 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

// Blackjack ("21"): one hand decides it — hit or stand, dealer plays a fixed
// house rule (draws to 17+). A push (tie) redeals for free, same spirit as
// RPS's tie — everything else reports 'win'/'loss' up to the wrapper.
export function BlackjackGame({ onResult }: { onResult: (result: 'win' | 'loss') => void }) {
  const [playerCards, setPlayerCards] = useState<PlayingCardData[]>(() => [drawCard(), drawCard()]);
  const [dealerCards, setDealerCards] = useState<PlayingCardData[]>(() => [drawCard(), drawCard()]);
  const [phase, setPhase] = useState<'player' | 'dealer' | 'result'>('player');
  const [resultText, setResultText] = useState('');
  const cancelledRef = useRef(false);
  useEffect(() => () => {
    cancelledRef.current = true;
  }, []);

  const playerTotal = handValue(playerCards);
  const dealerTotal = handValue(dealerCards);

  const finish = (outcome: 'win' | 'loss', text: string) => {
    setResultText(text);
    setPhase('result');
    setTimeout(() => {
      if (!cancelledRef.current) onResult(outcome);
    }, 1400);
  };

  const runDealer = (cards: PlayingCardData[]) => {
    const total = handValue(cards);
    if (total < 17) {
      setTimeout(() => {
        if (cancelledRef.current) return;
        const next = [...cards, drawCard()];
        setDealerCards(next);
        runDealer(next);
      }, 750);
      return;
    }
    setTimeout(() => {
      if (cancelledRef.current) return;
      const pTotal = handValue(playerCards);
      if (total > 21) return finish('win', 'Дилер перебрал — победа!');
      if (pTotal > total) return finish('win', 'Победа!');
      if (pTotal < total) return finish('loss', 'Проигрыш');
      // Push — free redeal, doesn't count as a loss.
      setResultText('Ничья — переигровка');
      setPhase('result');
      setTimeout(() => {
        if (cancelledRef.current) return;
        setPlayerCards([drawCard(), drawCard()]);
        setDealerCards([drawCard(), drawCard()]);
        setPhase('player');
        setResultText('');
      }, 1400);
    }, 750);
  };

  const hit = () => {
    if (phase !== 'player') return;
    const next = [...playerCards, drawCard()];
    setPlayerCards(next);
    if (handValue(next) > 21) finish('loss', 'Перебор — проигрыш');
  };

  const stand = () => {
    if (phase !== 'player') return;
    setPhase('dealer');
    runDealer(dealerCards);
  };

  const buttonStyle: React.CSSProperties = {
    flex: 1,
    textAlign: 'center',
    padding: '10px 0',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: fs(12),
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    border: '1px solid rgba(var(--gold-rgb),0.3)',
    color: COLORS.gold,
  };

  return (
    <>
      <div style={{ fontSize: fs(12), color: COLORS.textGhost, letterSpacing: '0.5px' }}>
        Дилер: {phase === 'player' ? '?' : dealerTotal}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {dealerCards.map((c, i) => (
          <PlayingCard key={i} rank={c.rank} suit={c.suit} faceDown={phase === 'player' && i === 1} />
        ))}
      </div>

      <div style={{ fontSize: fs(12), color: COLORS.textGhost, letterSpacing: '0.5px', marginTop: 8 }}>
        Ты: {playerTotal}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {playerCards.map((c, i) => (
          <PlayingCard key={i} rank={c.rank} suit={c.suit} />
        ))}
      </div>

      {phase === 'player' ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 10, width: '100%' }}>
          <div onClick={hit} role="button" style={buttonStyle}>
            Взять карту
          </div>
          <div onClick={stand} role="button" style={buttonStyle}>
            Хватит
          </div>
        </div>
      ) : (
        <div
          style={{
            fontFamily: DROP_CAP_FONT,
            fontSize: fs(18),
            color: resultText.startsWith('Победа') || resultText.includes('перебрал') ? COLORS.gold : COLORS.textPrimary,
            marginTop: 8,
          }}
        >
          {resultText}
        </div>
      )}
    </>
  );
}
