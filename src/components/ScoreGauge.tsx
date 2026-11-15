import { SCORE_MAX, SCORE_MIN, scoreRating } from '../data'

const ARC = 'M 20 110 A 90 90 0 0 1 200 110'
const ARC_LENGTH = Math.PI * 90

interface Props {
  score: number
  change: number
}

export function ScoreGauge({ score, change }: Props) {
  const fraction = Math.min(1, Math.max(0, (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)))
  const direction = change >= 0 ? 'Up' : 'Down'
  const points = Math.abs(change) === 1 ? 'point' : 'points'

  return (
    <section id="score" className="card score-card">
      <h2>Credit score</h2>
      <svg
        className="gauge"
        viewBox="0 0 220 124"
        role="img"
        aria-label={`Score ${score} on a scale of ${SCORE_MIN} to ${SCORE_MAX}`}
      >
        <path d={ARC} className="gauge-track" />
        <path d={ARC} className="gauge-value" strokeDasharray={`${fraction * ARC_LENGTH} ${ARC_LENGTH}`} />
        <text x="110" y="98" textAnchor="middle" className="gauge-number">
          {score}
        </text>
      </svg>
      <div className="gauge-scale mono">
        <span>{SCORE_MIN}</span>
        <span>{SCORE_MAX}</span>
      </div>
      <div className="rating">{scoreRating(score)}</div>
      <div className="muted">
        {direction} {Math.abs(change)} {points} since last month
      </div>
    </section>
  )
}
