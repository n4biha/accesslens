"use client";

import DemandChips from "./DemandChips";
import type { EngineReport } from "@/lib/engine";
import type { Analysis, FrictionMoment, GoalRelevance } from "@/lib/schema";

interface Props {
  analysis: Analysis;
  report: EngineReport;
  onSelectFriction?: (friction: FrictionMoment) => void;
}

const RELEVANCE_LABEL: Record<GoalRelevance, string> = {
  essential: "Essential to the objective",
  related: "Related",
  incidental: "Incidental",
  unknown: "Needs your judgement",
};

const RELEVANCE_CLASS: Record<GoalRelevance, string> = {
  essential: "bg-ok-soft text-ok border-ok/30",
  related: "bg-surface-sunken text-muted border-line",
  incidental: "bg-warn-soft text-warn border-warn/30",
  unknown: "bg-surface-sunken text-muted border-line-strong border-dashed",
};

const SEVERITY_CLASS: Record<FrictionMoment["severity"], string> = {
  high: "bg-danger-soft text-danger border-danger/30",
  medium: "bg-warn-soft text-warn border-warn/30",
  low: "bg-surface-sunken text-muted border-line",
};

export default function JourneyTimeline({ analysis, report, onSelectFriction }: Props) {
  const frictionByStep = new Map<string, FrictionMoment[]>();
  for (const friction of analysis.frictionMoments) {
    for (const stepId of friction.stepIds) {
      frictionByStep.set(stepId, [...(frictionByStep.get(stepId) ?? []), friction]);
    }
  }

  const loadByStep = new Map(report.memory.perStep.map((s) => [s.stepId, s]));

  return (
    <section aria-labelledby="journey-heading" className="space-y-3">
      <div>
        <h2 id="journey-heading" className="text-lg font-semibold">
          The student&rsquo;s journey
        </h2>
        <p className="mt-1 text-sm text-muted">
          {analysis.steps.length} steps, reconstructed from the assignment text.
        </p>
      </div>

      <ol className="space-y-2">
        {analysis.steps.map((step, index) => {
          const previous = index > 0 ? analysis.steps[index - 1] : null;
          const changedEnvironment =
            previous !== null && previous.environment !== step.environment;
          const frictions = frictionByStep.get(step.id) ?? [];
          const load = loadByStep.get(step.id);

          return (
            <li key={step.id}>
              {changedEnvironment && (
                <p className="flex items-center gap-2 py-1.5 pl-3 text-xs text-muted">
                  <span aria-hidden="true">↓</span>
                  moves from {previous.environment} to {step.environment}
                </p>
              )}

              <article className="rounded-lg border border-line bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-medium">
                    <span className="mr-2 font-mono text-xs text-muted">
                      {index + 1}
                    </span>
                    {step.action}
                  </h3>
                  <p className="text-xs text-muted">{step.environment}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${RELEVANCE_CLASS[step.goalRelevance]}`}
                  >
                    {RELEVANCE_LABEL[step.goalRelevance]}
                  </span>
                </div>

                <div className="mt-2">
                  <DemandChips demands={step.demands} />
                </div>

                {load && load.load > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Holding {load.load} value{load.load === 1 ? "" : "s"} in mind here
                    {load.overCapacity && (
                      <span className="font-medium text-danger">
                        {" "}
                        — above the ~{report.memory.capacity}-item capacity
                      </span>
                    )}
                    .
                  </p>
                )}

                {frictions.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {frictions.map((friction) => (
                      <li key={friction.id}>
                        <button
                          type="button"
                          onClick={() => onSelectFriction?.(friction)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium hover:brightness-95 ${SEVERITY_CLASS[friction.severity]}`}
                        >
                          <span aria-hidden="true">▲</span>
                          {friction.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
