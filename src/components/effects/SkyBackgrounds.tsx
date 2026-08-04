import { useState, useEffect, useRef, memo } from 'react';
import { DROP_CAP_FONT } from '../InkaLogo';
import { StarIcon } from '../icons/StarIcons';
import { MARKER_COLORS } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 7 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль. Экспортируются: CelebrationBurst,
// FunWinSalute, StarfieldBackground, CloudsBackground, AviationBackground —
// корень TattoDiary() рендерит все три фона вместе + оверлеи celebration/win.

// Hand-drawn engraving clouds (light theme's sky, drifting behind the content) —
// each sprite is a pre-cut alpha mask, tinted per depth layer (see CLOUD_LAYERS).
const CLOUD_SOURCES = [
  '/assets/light/clouds/cloud_1.png',
  '/assets/light/clouds/cloud_2.png',
  '/assets/light/clouds/cloud_3.png',
  '/assets/light/clouds/cloud_4.png',
  '/assets/light/clouds/cloud_5.png',
  '/assets/light/clouds/cloud_6.png',
  '/assets/light/clouds/cloud_7.png',
];

// Retro-aviation sketches (light theme) — airships (dirigibles) and a hot-air
// balloon, each an alpha mask tinted and given motion by type (see
// AviationBackground): airships cruise slowly, the balloon barely drifts but
// bobs high on the air.
type CraftType = 'airship' | 'balloon';
// ar = sprite height / width, so the mask box keeps each sketch's proportions.
const AVIATION_SOURCES: { src: string; type: CraftType; ar: number }[] = [
  { src: '/assets/light/aviation/airship_1.png', type: 'airship', ar: 0.52 },
  { src: '/assets/light/aviation/airship_2.png', type: 'airship', ar: 0.79 },
  { src: '/assets/light/aviation/balloon.png', type: 'balloon', ar: 1.68 },
];
// Client counts that get the bigger, bouncing milestone show instead of the
// quick everyday shower — a little escalating "achievement" ladder. Continues
// the Fibonacci-ish spacing (1, 2, 5, 8, 13) past the 15th (gold finale) so
// milestones stay rare as the client count grows, instead of ending at 15.
const MILESTONE_COUNTS = [1, 2, 5, 8, 13, 15, 21, 34, 55, 89, 144];

// Reward micro-interaction: fired when a new client card is created.
// Everyday creations get a quick CSS-driven star shower; milestone counts
// get a bigger, slower, bouncing show, plus the big grown-in client-count
// number — see runMilestoneShow below.
export function CelebrationBurst({ trigger, clientCount }: { trigger: number; clientCount: number }) {
  const [stars, setStars] = useState<{ id: number; dx: number; dy: number; rot: number; delay: number; size: number }[]>([]);
  // The big client-count number that grows in over the fireworks and fades
  // out with them; numberMs is however long *this* celebration lasts (differs
  // between the everyday shower and the longer milestone show) so the two
  // stay in sync.
  const [numberMs, setNumberMs] = useState<number | null>(null);
  // Tracks the last trigger value we've already celebrated for. Initialized
  // from the incoming prop (not a plain boolean) so it stays correct even
  // under StrictMode's dev-only double-invoke of this effect on mount.
  const lastHandled = useRef(trigger);
  const milestoneContainerRef = useRef<HTMLDivElement>(null);
  const milestoneCleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (lastHandled.current === trigger) return; // nothing new to celebrate
    lastHandled.current = trigger;

    if (MILESTONE_COUNTS.includes(clientCount)) {
      milestoneCleanupRef.current();
      const palette = clientCount === 13 ? 'blackred' : clientCount === 15 ? 'gold' : 'colorful';
      milestoneCleanupRef.current = runMilestoneShow(milestoneContainerRef.current, palette);
      // The big grown-in count number only plays alongside milestone shows —
      // everyday creations get just the quick star shower below, no number.
      const milestoneMs = 7200; // max stagger (~500ms) + max star life (~6700ms)
      setNumberMs(milestoneMs);
      const nt = setTimeout(() => setNumberMs(null), milestoneMs);
      return () => clearTimeout(nt);
    }

    // Distances are in vw/vh (not px) so the shower scales to the actual
    // screen and reads as filling it, on any device.
    const n = 40;
    const generated = Array.from({ length: n }, (_, i) => {
      const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.7;
      const dist = 35 + Math.random() * 55;
      return {
        id: i,
        dx: Math.cos(angle) * dist, // vw
        dy: Math.sin(angle) * dist * 0.9 + 40, // vh, biased downward like falling
        rot: (Math.random() - 0.5) * 420,
        delay: 300 + Math.random() * 650,
        size: 12 + Math.random() * 22,
      };
    });
    setStars(generated);
    const t = setTimeout(() => setStars([]), 4200);
    return () => clearTimeout(t);
  }, [trigger, clientCount]);

  // Stop any in-flight rAF loop if the component itself unmounts.
  useEffect(() => () => milestoneCleanupRef.current(), []);

  return (
    <>
      {stars.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 90, overflow: 'hidden' }}>
          <div key={`pop-${trigger}`} className="inka-celebrate-pop" style={{ position: 'absolute', top: '22%', left: '50%' }}>
            <StarIcon size={30} />
          </div>
          {stars.map((s) => (
            <div
              key={`${trigger}-${s.id}`}
              className="inka-celebrate-star"
              style={
                {
                  position: 'absolute',
                  top: '22%',
                  left: '50%',
                  animationDelay: `${s.delay}ms`,
                  '--dx': `${s.dx}vw`,
                  '--dy': `${s.dy}vh`,
                  '--rot': `${s.rot}deg`,
                } as React.CSSProperties
              }
            >
              <StarIcon size={s.size} />
            </div>
          ))}
        </div>
      )}
      <div ref={milestoneContainerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 91, overflow: 'hidden' }} />
      {numberMs !== null && (
        <>
          <div
            key={`count-${trigger}`}
            className="inka-celebrate-number"
            style={
              {
                position: 'absolute',
                top: '50%',
                left: '50%',
                zIndex: 92,
                pointerEvents: 'none',
                fontFamily: DROP_CAP_FONT,
                fontWeight: 600,
                color: 'var(--gold)',
                fontSize: '33vh',
                lineHeight: 1,
                textShadow: '0 4px 24px rgba(0,0,0,0.6)',
                animationDuration: `${numberMs}ms`,
              } as React.CSSProperties
            }
          >
            {clientCount}
          </div>
          {clientCount === 15 && (
            // A second copy of the same digit, same growth timing, showing
            // only a diagonal light streak (thick band + trailing thin band)
            // sweeping across the solid-gold number underneath.
            <div
              key={`shine-${trigger}`}
              aria-hidden
              className="inka-celebrate-number inka-celebrate-number-diagonal-shine"
              style={
                {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  zIndex: 93,
                  pointerEvents: 'none',
                  fontFamily: DROP_CAP_FONT,
                  fontWeight: 600,
                  fontSize: '33vh',
                  lineHeight: 1,
                  animationDuration: `${numberMs}ms, 1200ms`,
                } as React.CSSProperties
              }
            >
              {clientCount}
            </div>
          )}
        </>
      )}
    </>
  );
}

// Milestone celebration (1st/2nd/5th/8th/13th client): stars of very varied
// size and speed launch from the same point as the everyday shower, bounce
// off the screen edges losing a bit of energy each time, and fade out over
// several seconds — slow enough to actually watch. Runs as a plain
// requestAnimationFrame loop mutating DOM nodes directly (not React state),
// since driving 20+ elements at 60fps through re-renders would be wasteful.
// Returns a cleanup function that cancels the loop and removes the nodes.
function runMilestoneShow(container: HTMLDivElement | null, palette: 'colorful' | 'blackred' | 'gold'): () => void {
  if (!container) return () => {};
  const rect = container.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const originX = w / 2;
  const originY = h * 0.22;

  const colors =
    palette === 'blackred'
      ? ['#0B0B0B', '#1A1414', '#8A1620', '#C0242F']
      : palette === 'gold'
      ? ['var(--gold)'] // 15th milestone: exclusively gold, no other hues mixed in
      : ['var(--gold)', ...MARKER_COLORS];
  const isDark = (c: string) => c === '#0B0B0B' || c === '#1A1414';

  type Star = {
    el: HTMLDivElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rot: number;
    vrot: number;
    born: number;
    life: number;
  };

  const n = 22;
  const setupNow = performance.now();
  const stars: Star[] = [];

  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 220; // px/s — "разные скорости"
    let size = 10 + Math.random() * 20;
    if (Math.random() < 0.28) size += 30 + Math.random() * 22; // some significantly bigger
    const color = colors[Math.floor(Math.random() * colors.length)];
    const outline = isDark(color) ? '#C0242F' : undefined;

    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.willChange = 'transform, opacity';
    el.innerHTML = starSvgMarkup(size, color, outline);
    container.appendChild(el);

    stars.push({
      el,
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 90,
      born: setupNow + Math.random() * 500,
      life: 4500 + Math.random() * 2200, // ~4.5–6.7s — slow enough to watch
    });
  }

  const damping = 0.82; // energy lost on each bounce, so they gradually settle
  let raf = 0;
  let lastT = setupNow;

  const step = (t: number) => {
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    let anyAlive = false;

    for (const s of stars) {
      if (t < s.born) {
        anyAlive = true;
        continue;
      }
      const age = t - s.born;
      if (age > s.life) continue;
      anyAlive = true;

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vrot * dt;

      const r = s.size / 2;
      if (s.x - r < 0) {
        s.x = r;
        s.vx = Math.abs(s.vx) * damping;
      } else if (s.x + r > w) {
        s.x = w - r;
        s.vx = -Math.abs(s.vx) * damping;
      }
      if (s.y - r < 0) {
        s.y = r;
        s.vy = Math.abs(s.vy) * damping;
      } else if (s.y + r > h) {
        s.y = h - r;
        s.vy = -Math.abs(s.vy) * damping;
      }

      const fadeStart = s.life * 0.6;
      const opacity = age < fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / (s.life - fadeStart));

      s.el.style.transform = `translate(${s.x - r}px, ${s.y - r}px) rotate(${s.rot}deg)`;
      s.el.style.opacity = String(opacity);
    }

    raf = anyAlive ? requestAnimationFrame(step) : 0;
    if (!anyAlive) cleanup();
  };

  raf = requestAnimationFrame(step);

  function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    stars.forEach((s) => s.el.remove());
  }

  return cleanup;
}

function starSvgMarkup(size: number, color: string, outline?: string): string {
  const strokeAttrs = outline ? ` stroke="${outline}" stroke-width="0.6" stroke-linejoin="round"` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 14 14" fill="none" style="display:block"><path d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z" fill="${color}"${strokeAttrs} /></svg>`;
}

// Ambient background: a field of small gold dots + occasional sparkle stars
// that twinkle in place (pure CSS opacity/transform animation — no JS loop,
// so it's cheap even sitting behind every screen). Positions/timings are
// randomised once per mount via useState's lazy initializer.
//
// Rendered once, fixed behind all screens (not inside any scroll container),
// so the canvas only needs to cover one viewport — anything taller than that
// would sit permanently clipped by .app-shell's overflow:hidden, animating
// off-screen for no visual benefit. Count is sized for this exact height.
const STARFIELD_COUNT = 47;
const STARFIELD_HEIGHT_VH = 100;
const METEOR_COUNT = 4;
// Fixed epoch every background animation delay is measured from, so a cloud /
// star / craft is at the same phase in every screen regardless of when that
// screen mounted — screen transitions no longer show the sky jump.
const SKY_EPOCH = Date.now();
// Warm gold star tone, varied per star (hue fixed at 45, lightness varies).
const goldStar = () => `hsl(45, ${68 + Math.random() * 14}%, ${56 + Math.random() * 30}%)`;

function buildStars() {
  return Array.from({ length: STARFIELD_COUNT }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1.2 + Math.random() * 2.2,
    color: goldStar(),
    duration: 1.8 + Math.random() * 3.4,
    baseDelay: Math.random() * 4,
    sparkle: Math.random() < 0.16,
  }));
}
// Shooting stars — gold, rare, brief. All meteors share one long cycle
// (METEOR_CYCLE) split into equal slots, one per meteor, with jitter kept
// well inside each slot's margin — since every meteor shares the exact same
// period, that phase relationship holds forever, so two meteors' visible
// windows can never land at the same time (unlike independent random delays,
// which drift in and out of overlap over a long enough session). Tuned to
// ~65/hour (was ~195/hour — too frequent to read as a rare event; the
// 30/hour throttle was for the now-removed comets, not this plain gold
// shower): METEOR_COUNT per METEOR_CYCLE seconds, i.e. COUNT * 3600 / CYCLE.
const METEOR_CYCLE = 220;
function buildMeteors() {
  const slot = METEOR_CYCLE / METEOR_COUNT;
  return Array.from({ length: METEOR_COUNT }, (_, i) => {
    const goesLeft = Math.random() < 0.5;
    // Steeply diagonal (60–80° from horizontal, mirrored for the other
    // direction) rather than the old fixed 45°/135° — a plain 45° has equal
    // horizontal and vertical motion, which combined with the old, much
    // slower travel (see the keyframe fix in index.css) read as sliding
    // sideways rather than falling. Never near 0°/180° (horizontal).
    const rotDeg = goesLeft ? 100 + Math.random() * 20 : 60 + Math.random() * 20;
    const dist = 320 + Math.random() * 260;
    const rad = (rotDeg * Math.PI) / 180;
    return {
      left: goesLeft ? 45 + Math.random() * 40 : 15 + Math.random() * 40,
      top: Math.random() * 60,
      length: 70 + Math.random() * 85,
      rot: rotDeg,
      mx: Math.cos(rad) * dist,
      my: Math.sin(rad) * dist,
      duration: METEOR_CYCLE,
      baseDelay: i * slot + (Math.random() - 0.5) * slot * 0.3,
    };
  });
}
// Shared once, so the starfield is identical on every screen.
let sharedStars: ReturnType<typeof buildStars> | null = null;
let sharedMeteors: ReturnType<typeof buildMeteors> | null = null;
function getStars() {
  if (!sharedStars) sharedStars = buildStars();
  return sharedStars;
}
function getMeteors() {
  if (!sharedMeteors) sharedMeteors = buildMeteors();
  return sharedMeteors;
}

// Dark theme's sky: twinkling gold stars and an occasional «звездопад» (gold
// meteors, ~30/hour). The light theme's counterpart is CloudsBackground — so
// this renders only in the dark theme. Shares one layout across screens with
// delays anchored to SKY_EPOCH, so the field holds still through screen
// transitions.
// Memoized because it takes no props: without this, every state change
// anywhere in the (huge, single) app component would re-render and
// reconcile this whole star/meteor subtree for nothing on every keystroke,
// client edit, etc. React.memo skips that — it only re-renders on its own
// internal state changes (theme flip, visibility change).
export const StarfieldBackground = memo(function StarfieldBackground() {
  const isLight = useIsLightTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (isLight) return null;

  const stars = getStars();
  const meteors = getMeteors();
  const elapsed = (Date.now() - SKY_EPOCH) / 1000;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${STARFIELD_HEIGHT_VH}vh`,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: 0.7,
        zIndex: 0,
      }}
    >
      {/* Twinkling stars */}
      {stars.map((s, i) => (
        <div
          key={i}
          className="inka-star-twinkle"
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.sparkle ? s.size * 2.4 : s.size,
            height: s.sparkle ? s.size * 2.4 : s.size,
            borderRadius: s.sparkle ? 0 : '50%',
            background: s.sparkle ? 'transparent' : s.color,
            boxShadow: s.sparkle ? 'none' : `0 0 ${s.size * 2}px ${s.color}`,
            animationDuration: `${s.duration}s`,
            animationDelay: `${-(elapsed + s.baseDelay)}s`,
          }}
        >
          {s.sparkle && (
            <svg width="100%" height="100%" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z" fill={s.color} />
            </svg>
          )}
        </div>
      ))}

      {/* «Звездопад» — meteors */}
      {meteors.map((m, i) => (
        <div
          key={`met-${i}`}
          className="inka-meteor"
          style={{
            position: 'absolute',
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: m.length,
            height: 2,
            borderRadius: 2,
            // Gold streak — bright head (right end) leads, trail fades behind.
            background: 'linear-gradient(to right, transparent, rgba(228,190,110,0.4) 55%, rgba(240,208,140,0.98))',
            boxShadow: '0 0 6px rgba(230,196,120,0.75)',
            ['--mx' as string]: `${m.mx}px`,
            ['--my' as string]: `${m.my}px`,
            ['--rot' as string]: `${m.rot}deg`,
            animationDuration: `${m.duration}s`,
            animationDelay: `${-(elapsed + m.baseDelay)}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
});

// Reads data-theme off the root element and stays in sync with it — lets a
// component gate its rendering on the theme without threading a prop through
// every screen that mounts it.
function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light');
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsLight(root.getAttribute('data-theme') === 'light'));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}

// Five depth layers of clouds, far → near. Nearer layers are DARKER, larger,
// and drift faster (parallax); farther layers are paler, smaller, slower. They
// render in this order, so nearer (darker) layers overlap the distant paler
// ones — the closest-to-the-viewer clouds read darkest.
// Counts sized for one viewport-tall canvas (see STARFIELD_HEIGHT_VH above —
// this layer shares the same fixed, non-scrolling canvas as the starfield).
const CLOUD_LAYERS = [
  { color: '#D0C29B', scale: 0.56, durationMul: 1.85, opacity: 0.38, count: 12 }, // far / lightest
  { color: '#B6A06E', scale: 0.73, durationMul: 1.45, opacity: 0.45, count: 12 },
  { color: '#957842', scale: 0.92, durationMul: 1.15, opacity: 0.5, count: 10 },
  { color: '#6D5220', scale: 1.13, durationMul: 0.92, opacity: 0.55, count: 10 },
  { color: '#493611', scale: 1.38, durationMul: 0.72, opacity: 0.6, count: 10 }, // near / darkest
];

// Width is capped well under what the drift keyframes' off-screen margin
// (see .inka-cloud-drift in index.css) can hide, so a cloud never pops into
// view mid-screen — it always slides in from past the edge.
function buildCloudLayers() {
  return CLOUD_LAYERS.map((layer) => {
    const band = 100 / layer.count;
    const offset = Math.floor(Math.random() * CLOUD_SOURCES.length);
    const clouds = Array.from({ length: layer.count }, (_, i) => ({
      src: CLOUD_SOURCES[(i + offset) % CLOUD_SOURCES.length],
      // Loose bands (jitter wider than the band) keep clouds spread evenly
      // down the canvas while still letting neighbours drift into each other.
      top: i * band + (Math.random() - 0.3) * band * 2,
      // Sized down a third and drifting well under half the old speed — the
      // original pace read as jittery/seasick when several layers crossed
      // at once, especially during screen-transition overlap.
      width: (160 + Math.random() * 100) * layer.scale * (2 / 3),
      flip: Math.random() < 0.5,
      driftDuration: (40 + Math.random() * 40) * layer.durationMul * 2.5,
      // Base offsets (positive); the actual animation-delay is derived from the
      // global clock at render (see CloudsBackground) so it's identical on
      // every screen.
      baseDriftDelay: Math.random() * 90,
      bobDuration: 6 + Math.random() * 6,
      baseBobDelay: Math.random() * 8,
    }));
    return { color: layer.color, opacity: layer.opacity, clouds };
  });
}

// A single cloud layout shared by every CloudsBackground instance (each screen
// mounts its own), so the sky is IDENTICAL on all screens. Generated once, lazily.
let sharedCloudLayers: ReturnType<typeof buildCloudLayers> | null = null;
function getCloudLayers() {
  if (!sharedCloudLayers) sharedCloudLayers = buildCloudLayers();
  return sharedCloudLayers;
}

// Light theme's sky — hand-drawn engraving clouds in five depth layers,
// drifting past at their own speed with a gentle bob. The dark theme's
// counterpart is StarfieldBackground above. Shares the same viewport-tall
// canvas as the starfield.
//
// Every screen renders this, and they all use the SAME shared layout with
// animation delays anchored to a global epoch (SKY_EPOCH). Because the phase of
// each cloud then depends only on wall-clock time — not on when a given screen
// mounted — the sky looks the same across every screen, so sliding from one
// screen to another shows the clouds holding still instead of jumping/popping.
// Memoized like StarfieldBackground — no props, so this opts the whole
// cloud subtree out of every unrelated re-render in the app.
export const CloudsBackground = memo(function CloudsBackground() {
  const isLight = useIsLightTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    // A backgrounded PWA can freeze the CSS drift. Re-render on regained
    // visibility to re-anchor delays to the clock (harmless when not frozen:
    // the shared layout + global clock reproduce the exact same positions).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!isLight) return null;

  const layers = getCloudLayers();
  const elapsed = (Date.now() - SKY_EPOCH) / 1000;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${STARFIELD_HEIGHT_VH}vh`, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {layers.map((layer, li) =>
        layer.clouds.map((c, i) => (
          <div
            key={`${li}-${i}`}
            className="inka-cloud-drift"
            style={{
              top: `${c.top}%`,
              animationDuration: `${c.driftDuration}s`,
              animationDelay: `${-(elapsed + c.baseDriftDelay)}s`,
            }}
          >
            <div
              className="inka-cloud-bob"
              style={{
                width: c.width,
                height: c.width * 0.5,
                backgroundColor: layer.color,
                WebkitMaskImage: `url(${c.src})`,
                maskImage: `url(${c.src})`,
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                opacity: layer.opacity,
                transform: c.flip ? 'scaleX(-1)' : undefined,
                animationDuration: `${c.bobDuration}s`,
                animationDelay: `${-(elapsed + c.baseBobDelay)}s`,
              }}
            />
          </div>
        )),
      )}
    </div>
  );
});

// Muted per-type tints, all desaturated to sit quietly inside the warm light
// palette (never bright): airships a soft burnt-amber, the balloon a pale,
// washed-out brick red.
const CRAFT_COLOR: Record<CraftType, string> = {
  airship: '#9C6A34',
  balloon: '#BE8E86',
};
// The balloon reads paler still — a lower opacity on top of its lighter tone.
const CRAFT_OPACITY: Record<CraftType, number> = {
  airship: 0.62,
  balloon: 0.42,
};

// Per-type flight character. duration = seconds to cross the screen (airships
// cruise, balloon barely moves); bobY = vertical float amplitude (balloon
// floats highest); width in px; bob = seconds per float cycle. Durations
// stretched 1.5x — each craft loops on its own duration, so a third longer
// means a third fewer passes per hour.
const CRAFT_MOTION: Record<CraftType, { width: [number, number]; duration: [number, number]; bobY: [number, number]; bob: [number, number] }> = {
  airship: { width: [165, 215], duration: [117, 180], bobY: [8, 15], bob: [9, 13] },
  balloon: { width: [78, 116], duration: [225, 345], bobY: [24, 40], bob: [7, 12] },
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function buildCraft() {
  const band = 100 / AVIATION_SOURCES.length;
  return AVIATION_SOURCES.map((craft, i) => {
    const m = CRAFT_MOTION[craft.type];
    // Right-moving craft use the forward drift and are flipped to face right;
    // left-movers use the reversed drift and keep the sprites' native (left)
    // facing. Balloons are symmetric, so the flip only sets travel direction.
    const goesRight = Math.random() < 0.5;
    return {
      src: craft.src,
      type: craft.type,
      ar: craft.ar,
      top: i * band + rand(-band * 0.3, band * 0.5),
      width: rand(m.width[0], m.width[1]),
      goesRight,
      // Face travel direction: right-movers flip (sprites face left natively).
      flip: craft.type === 'balloon' ? false : goesRight,
      driftDuration: rand(m.duration[0], m.duration[1]),
      baseDriftDelay: rand(0, m.duration[1]),
      bobY: rand(m.bobY[0], m.bobY[1]),
      bobDuration: rand(m.bob[0], m.bob[1]),
      baseBobDelay: rand(0, 8),
    };
  });
}

// One craft layout shared by every AviationBackground instance, generated once.
let sharedCraft: ReturnType<typeof buildCraft> | null = null;
function getCraft() {
  if (!sharedCraft) sharedCraft = buildCraft();
  return sharedCraft;
}

// Light theme's retro-aviation layer — airships and a balloon drifting across
// the sky in front of the clouds, each with motion suited to its kind. Shares
// one layout across all screens, with delays anchored to SKY_EPOCH, so it holds
// still through screen transitions (same reasoning as CloudsBackground).
//
// Memoized like the other two sky layers — no props, so it opts out of
// every unrelated re-render in the app.
export const AviationBackground = memo(function AviationBackground() {
  const isLight = useIsLightTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!isLight) return null;

  const craft = getCraft();
  const elapsed = (Date.now() - SKY_EPOCH) / 1000;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${STARFIELD_HEIGHT_VH}vh`, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {craft.map((c, i) => (
        <div
          key={`${i}`}
          className={c.goesRight ? 'inka-cloud-drift' : 'inka-drift-rev'}
          style={{ top: `${c.top}%`, animationDuration: `${c.driftDuration}s`, animationDelay: `${-(elapsed + c.baseDriftDelay)}s` }}
        >
          <div
            className="inka-cloud-bob"
            style={{ ['--bob-y' as string]: `${c.bobY}px`, animationDuration: `${c.bobDuration}s`, animationDelay: `${-(elapsed + c.baseBobDelay)}s` } as React.CSSProperties}
          >
            <div
              style={{
                width: c.width,
                height: c.width * c.ar,
                backgroundColor: CRAFT_COLOR[c.type],
                WebkitMaskImage: `url(${c.src})`,
                maskImage: `url(${c.src})`,
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                opacity: CRAFT_OPACITY[c.type],
                transform: `scaleX(${c.flip ? -1 : 1})`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
});

// Small reward for winning the "opened the app" trial game — a gold star
// shower filling the whole screen (reuses the milestone show's physics, just
// full-screen instead of anchored to a client card).
export function FunWinSalute({ trigger }: { trigger: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const lastHandled = useRef(trigger);

  useEffect(() => {
    if (lastHandled.current === trigger) return;
    lastHandled.current = trigger;
    cleanupRef.current();
    cleanupRef.current = runMilestoneShow(containerRef.current, 'gold');
  }, [trigger]);

  useEffect(() => () => cleanupRef.current(), []);

  return <div ref={containerRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 210, overflow: 'hidden' }} />;
}
