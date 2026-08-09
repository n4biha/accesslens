"use client";

import { Check } from "lucide-react";
import type { WorkflowStage } from "@/components/WorkflowContext";

const PROGRESS = [
  // Named for the stage, not the action: every other entry is a place you can
  // stand ("Goal Lock", "Journey Scan"), so calling this one "New Analysis"
  // made stepping back to it read as though it would discard your work.
  { number: 1, label: "Assignment", target: "analyze", stages: ["analyze", "loading"] },
  { number: 2, label: "Goal Lock", target: "goal", stages: ["goal"] },
  { number: 3, label: "Journey Scan", target: "journey", stages: ["journey"] },
  { number: 4, label: "Friction", target: "barrier", stages: ["barrier"] },
  { number: 5, label: "Repair", target: "repair", stages: ["repair"] },
  { number: 6, label: "Test", target: "constraint", stages: ["constraint"] },
  { number: 7, label: "Preview", target: "preview", stages: ["preview"] },
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

interface AppNavProps {
  stage: WorkflowStage;
  visited: ReadonlySet<WorkflowStage>;
  onNavigate: (stage: WorkflowStage) => void;
}

export default function AppNav({ stage, visited, onNavigate }: AppNavProps) {
  // Completion is the state after the seven-step workflow, not another name
  // for Preview. Advancing the index past the final item marks every step as
  // complete without incorrectly exposing any of them as aria-current.
  const activeIndex = stage === "complete"
    ? PROGRESS.length
    : PROGRESS.findIndex((item) =>
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
            // Only offer a jump to somewhere the educator has actually been.
            // A stepper that looks clickable but is not is worse than a plain one.
            const reachable = !active && visited.has(item.target);

            const inner = (
              <>
                <span className="progress-number" aria-hidden="true">
                  {complete ? <Check size={11} strokeWidth={2.4} /> : item.number}
                </span>
                <span>{item.label}</span>
              </>
            );

            return (
              <li
                key={item.number}
                className={active ? "is-active" : complete ? "is-complete" : ""}
                aria-current={active ? "step" : undefined}
              >
                {reachable ? (
                  <button
                    type="button"
                    className="progress-link"
                    onClick={() => onNavigate(item.target)}
                  >
                    {inner}
                    <span className="sr-only">, go back to this step</span>
                  </button>
                ) : (
                  <span className="progress-link progress-link--static">
                    {inner}
                    {active && <span className="sr-only">, current step</span>}
                  </span>
                )}
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
