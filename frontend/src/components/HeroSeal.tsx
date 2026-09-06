/**
 * The hero visual: a governance seal whose inner ring IS the rubric.
 *
 * Five arcs, one per dimension, each swept to its weight — 25/25/20/15/15 —
 * so the picture is the scoring model rather than an ornament that happens to
 * be circular. The three verdict colours appear nowhere in it: the seal is the
 * instrument, and colour is reserved for findings.
 */
const DIMENSIONS = [
  { key: "feasibility", weight: 25 },
  { key: "budget_risk", weight: 25 },
  { key: "centralization_risk", weight: 20 },
  { key: "clarity", weight: 15 },
  { key: "alignment", weight: 15 },
];

const R = 86;
const GAP = 3.2; // degrees of breathing room between arcs

function arc(startDeg: number, sweepDeg: number, radius: number) {
  const a0 = ((startDeg - 90) * Math.PI) / 180;
  const a1 = ((startDeg + sweepDeg - 90) * Math.PI) / 180;
  const x0 = 120 + radius * Math.cos(a0);
  const y0 = 120 + radius * Math.sin(a0);
  const x1 = 120 + radius * Math.cos(a1);
  const y1 = 120 + radius * Math.sin(a1);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Each arc starts where the weights before it end. Computed as a pure prefix
// sum rather than by carrying a cursor through a map, so the value does not
// depend on when the component happens to render.
const ARCS = DIMENSIONS.map((d, i) => {
  const startFraction = DIMENSIONS.slice(0, i).reduce((a, x) => a + x.weight, 0) / 100;
  const sweep = (d.weight / 100) * 360 - GAP;
  return { ...d, path: arc(startFraction * 360 + GAP / 2, sweep, R) };
});

export function HeroSeal({ className = "" }: { className?: string }) {
  const arcs = ARCS;

  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      role="img"
      aria-label="A governance seal whose five arcs are the rubric's five dimensions, each swept to its weight"
    >
      <defs>
        <radialGradient id="seal-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-royal-500)" stopOpacity="0.30" />
          <stop offset="70%" stopColor="var(--color-royal-500)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="var(--color-royal-500)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="seal-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-royal-300)" />
          <stop offset="100%" stopColor="var(--color-royal-600)" />
        </linearGradient>
      </defs>

      <circle cx="120" cy="120" r="118" fill="url(#seal-glow)" />

      {/* the outer rule, and the ticks a printed seal would carry */}
      <circle
        cx="120"
        cy="120"
        r="106"
        fill="none"
        stroke="var(--color-ink-600)"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      {Array.from({ length: 60 }, (_, i) => {
        const a = ((i * 6 - 90) * Math.PI) / 180;
        const major = i % 5 === 0;
        const r0 = major ? 98 : 102;
        return (
          <line
            key={i}
            x1={120 + r0 * Math.cos(a)}
            y1={120 + r0 * Math.sin(a)}
            x2={120 + 106 * Math.cos(a)}
            y2={120 + 106 * Math.sin(a)}
            stroke="var(--color-ink-500)"
            strokeOpacity={major ? 0.65 : 0.3}
            strokeWidth={major ? 1.3 : 0.8}
          />
        );
      })}

      {/* the rubric itself */}
      {arcs.map((a) => (
        <path
          key={a.key}
          d={a.path}
          fill="none"
          stroke="url(#seal-arc)"
          strokeWidth="9"
          strokeLinecap="round"
        />
      ))}

      <circle
        cx="120"
        cy="120"
        r="66"
        fill="var(--color-ink-900)"
        stroke="var(--color-ink-600)"
        strokeOpacity="0.55"
        strokeWidth="1"
      />

      {/* the shield and the check, at the centre of the instrument */}
      <path
        d="M120 78 156 92v27.5c0 21-14 36.5-36 44-22-7.5-36-23-36-44V92l36-14Z"
        fill="none"
        stroke="var(--color-royal-400)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M104 124 116 136 138 110"
        fill="none"
        stroke="var(--color-verdict-good)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
