import type { ScorePoint } from '../data'

const W = 600
const H = 170
const PAD = 20

export function HistoryChart({ points }: { points: ScorePoint[] }) {
  const scores = points.map((p) => p.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const span = max - min || 1
  const step = points.length > 1 ? W / (points.length - 1) : 0

  const line = points
    .map((p, i) => `${(i * step).toFixed(1)},${(H - PAD - ((p.score - min) / span) * (H - PAD * 2)).toFixed(1)}`)
    .join(' ')

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <section id="history" className="card">
      <div className="card-head">
        <h2>Score history</h2>
        <span className="mono muted small">
          {first.month} to {last.month} · {first.score} to {last.score}
        </span>
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Score went from ${first.score} to ${last.score} over ${points.length} months`}
      >
        <path d={`M0 40 H${W} M0 85 H${W} M0 130 H${W}`} className="chart-grid" />
        <polyline points={line} className="chart-line" vectorEffect="non-scaling-stroke" />
      </svg>
    </section>
  )
}
