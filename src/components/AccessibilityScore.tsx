import { ChevronDown } from "lucide-react";

export interface AccessibilityScoreData {
  score: number;
  breakdown: { label: string; points: number }[];
}

export default function AccessibilityScore({
  score,
  breakdown,
}: AccessibilityScoreData) {
  return (
    <section className="confidence-score" aria-labelledby="confidence-title">
      <div>
        <p className="eyebrow">Task Accessibility Confidence</p>
        <div className="score-value" aria-label={`${score} out of 100`}>
          <span>{score}</span>
          <span>/ 100</span>
        </div>
      </div>
      <div className="score-disclosure">
        <p id="confidence-title">
          This reflects task-level accessibility friction, not legal compliance.
        </p>
        <details>
          <summary>
            How this is calculated <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <ul>
            <li>
              <span>Starting score</span>
              <strong>100</strong>
            </li>
            {breakdown.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.points < 0 ? `−${Math.abs(item.points)}` : `+${item.points}`}</strong>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
