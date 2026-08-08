import { Check } from "lucide-react";
import type { WorkflowStage } from "@/components/WorkflowContext";

const PROGRESS = [
  { number: 1, label: "New Analysis", stages: ["analyze", "loading"] },
  { number: 2, label: "Goal Lock", stages: ["goal"] },
  { number: 3, label: "Journey Scan", stages: ["journey"] },
  { number: 4, label: "Friction", stages: ["barrier"] },
  { number: 5, label: "Repair", stages: ["repair"] },
  { number: 6, label: "Test", stages: ["constraint"] },
  { number: 7, label: "Preview", stages: ["preview", "complete"] },
] as const;

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo-mark ${small ? "logo-mark--small" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export { LogoMark };

export default function AppNav({ stage }: { stage: WorkflowStage }) {
  const activeIndex = PROGRESS.findIndex((item) =>
    (item.stages as readonly WorkflowStage[]).includes(stage),
  );

  return (
    <header className="app-nav">
      <div className="brand-lockup" aria-label="AccessLens">
        <LogoMark small />
        <span>AccessLens</span>
      </div>

      <nav aria-label="Analysis progress" className="progress-nav">
        <ol>
          {PROGRESS.map((item, index) => {
            const active = index === activeIndex;
            const complete = index < activeIndex;
            return (
              <li key={item.number} className={active ? "is-active" : complete ? "is-complete" : ""}>
                <span className="progress-number" aria-hidden="true">
                  {complete ? <Check size={11} strokeWidth={2.4} /> : item.number}
                </span>
                <span>{item.label}</span>
                {active && <span className="sr-only">, current step</span>}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="profile-avatar" aria-label="Profile for Maya Chen">
        MC
      </div>
    </header>
  );
}
