"use client";

import { useState } from "react";
import type { ObjectiveCandidate } from "@/lib/schema";

interface Props {
  candidates: ObjectiveCandidate[];
  onLock: (objective: string) => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}

export default function GoalLockCard({
  candidates,
  onLock,
  onBack,
  busy,
  error,
}: Props) {
  const [objective, setObjective] = useState(candidates[0]?.text ?? "");

  return (
    <section aria-labelledby="goal-heading" className="space-y-4">
      <div>
        <h2 id="goal-heading" className="text-lg font-semibold">
          Confirm the learning objective
        </h2>
        <p className="mt-1 text-sm text-muted">
          Everything AccessLens judges is judged against this. Edit it until it says
          exactly what the assignment is meant to assess, then lock it.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
        <label htmlFor="objective" className="block text-sm font-medium">
          Learning objective
        </label>
        <textarea
          id="objective"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-md border border-line bg-background p-3 text-sm leading-relaxed"
        />

        {candidates.length > 1 && (
          <fieldset className="mt-4">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted">
              Other candidates
            </legend>
            <ul className="mt-2 space-y-1.5">
              {candidates.slice(1).map((candidate) => (
                <li key={candidate.text}>
                  <button
                    type="button"
                    onClick={() => setObjective(candidate.text)}
                    className="text-left text-sm text-accent underline underline-offset-2 hover:no-underline"
                  >
                    {candidate.text}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onLock(objective)}
          disabled={busy || objective.trim().length === 0}
          className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-fg disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Analysing the task…" : "Lock objective and analyse"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line-strong px-5 py-2.5 font-medium hover:bg-surface-sunken"
        >
          Back
        </button>
      </div>
    </section>
  );
}
