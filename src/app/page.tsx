"use client";

import { useMemo, useState } from "react";

import AssignmentInput from "@/components/AssignmentInput";
import GoalLockCard from "@/components/GoalLockCard";
import JourneyTimeline from "@/components/JourneyTimeline";
import MeasurementStrip from "@/components/MeasurementStrip";
import { runEngine } from "@/lib/engine";
import {
  AnalysisUnavailableError,
  analyzeAssignment,
  extractObjectives,
} from "@/lib/analysisSource";
import type { Analysis, ObjectiveCandidate } from "@/lib/schema";

type Stage = "input" | "objective" | "analysis";

export default function Home() {
  const [stage, setStage] = useState<Stage>("input");
  const [assignmentText, setAssignmentText] = useState("");
  const [candidates, setCandidates] = useState<ObjectiveCandidate[]>([]);
  const [lockedObjective, setLockedObjective] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const report = useMemo(
    () => (analysis ? runEngine(analysis, assignmentText) : null),
    [analysis, assignmentText]
  );

  function describe(err: unknown) {
    return err instanceof AnalysisUnavailableError
      ? err.message
      : "Something went wrong reading that assignment. Try again.";
  }

  async function handleExtract() {
    setBusy(true);
    setError(null);
    try {
      const objectives = await extractObjectives(assignmentText);
      setCandidates(objectives);
      setStage("objective");
      setStatus("Learning objective found. Review and lock it.");
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLock(objective: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await analyzeAssignment(assignmentText, objective);
      setLockedObjective(objective);
      setAnalysis(result);
      setStage("analysis");
      setStatus(
        `Analysis complete. ${result.steps.length} steps and ${result.frictionMoments.length} friction moments found.`
      );
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("input");
    setAnalysis(null);
    setCandidates([]);
    setLockedObjective("");
    setError(null);
    setStatus("");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-10">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          AccessLens
        </p>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          Most accessibility tools test the page. This one tests the task.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Paste an assignment and AccessLens reconstructs what a student actually has
          to do to finish it, then separates the demands your objective intends from
          the ones the design added by accident.
        </p>
      </header>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      <main className="flex-1 space-y-8">
        {stage === "input" && (
          <AssignmentInput
            value={assignmentText}
            onChange={setAssignmentText}
            onSubmit={handleExtract}
            busy={busy}
            error={error}
          />
        )}

        {stage === "objective" && (
          <GoalLockCard
            candidates={candidates}
            onLock={handleLock}
            onBack={() => setStage("input")}
            busy={busy}
            error={error}
          />
        )}

        {stage === "analysis" && analysis && report && (
          <div className="space-y-8">
            <section
              aria-labelledby="locked-heading"
              className="rounded-lg border border-accent/30 bg-accent-soft p-4"
            >
              <h2
                id="locked-heading"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Locked objective
              </h2>
              <p className="mt-1.5 font-medium">{lockedObjective}</p>
              <p className="mt-2 text-sm text-muted">
                Every judgement below is made against this. Nothing that serves it is
                treated as a barrier.
              </p>
            </section>

            <MeasurementStrip report={report} />
            <JourneyTimeline analysis={analysis} report={report} />

            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-line-strong px-5 py-2.5 font-medium hover:bg-surface-sunken"
            >
              Analyse another assignment
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
