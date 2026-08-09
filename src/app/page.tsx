"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import AccessibilityScore from "@/components/AccessibilityScore";
import AppNav from "@/components/AppNav";
import IntroScreen from "@/components/IntroScreen";
import {
  AnalyzeScreen,
  AnalysisLoadingScreen,
  BarrierTrace,
  CompleteScreen,
  ConstraintTest,
  GoalLockScreen,
  JourneyScan,
  RepairScreen,
  StudentPreview,
  type LoadingPhase,
} from "@/components/WorkflowScreens";
import {
  WorkflowProvider,
  type ConditionId,
  type WorkflowStage,
} from "@/components/WorkflowContext";
import { runEngine, scoreAccessibility } from "@/lib/engine";
import { shortCitation } from "@/lib/standards";
import {
  AnalysisUnavailableError,
  analyzeAssignment,
  extractObjectives,
} from "@/lib/analysisSource";
import { buildSummary, downloadSummary, summaryFilename } from "@/lib/exportSummary";
import { applyRepairs } from "@/lib/repairs";
import type { Analysis, FrictionMoment, RevisedAssignment, Step } from "@/lib/schema";
import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";

/** Keeps the loading sequence readable when a cached sample resolves instantly. */
const MIN_LOADING_MS = 2400;

function describeError(error: unknown): string {
  if (error instanceof AnalysisUnavailableError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong analysing that assignment. Try again.";
}

const STATUS_LABEL: Record<WorkflowStage, string> = {
  intro: "AccessLens introduction",
  analyze: "New analysis",
  loading: "Analyzing the task",
  goal: "Learning goal review",
  journey: "Journey scan complete",
  barrier: "Reviewing a friction moment",
  repair: "Reviewing repairs",
  constraint: "Testing access conditions",
  preview: "Student preview",
  complete: "Analysis complete",
};

export default function Home() {
  const [stage, setStage] = useState<WorkflowStage>("intro");
  const [assignmentDraft, setAssignmentDraft] = useState(BIOLOGY_TEXT);
  const [analyzedText, setAnalyzedText] = useState(BIOLOGY_TEXT);
  const [objective, setObjective] = useState(BIOLOGY_SAMPLE.objectives[0].text);
  const [baseAnalysis, setBaseAnalysis] = useState<Analysis>(BIOLOGY_SAMPLE.analysis);
  const [steps, setSteps] = useState<Step[]>(BIOLOGY_SAMPLE.analysis.steps);
  // Null whenever the analysis found nothing to review. An assignment with no
  // friction is a success, not an edge case, so it must not be papered over
  // with a fixture that belongs to a different assignment.
  const [selectedFriction, setSelectedFriction] = useState<FrictionMoment | null>(
    BIOLOGY_SAMPLE.analysis.frictionMoments[0] ?? null,
  );
  const [condition, setCondition] = useState<ConditionId>("working_memory");
  const [appliedRepairIds, setAppliedRepairIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revised, setRevised] = useState<{ key: string; value: RevisedAssignment } | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<WorkflowStage>>(new Set(["analyze"]));
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("objective");

  // Identifies the request currently in flight. A response that arrives after
  // the educator has started another analysis is discarded rather than allowed
  // to redirect them into results for text they have moved on from.
  const requestId = useRef(0);

  const analysis = useMemo(
    () => ({ ...baseAnalysis, steps }),
    [baseAnalysis, steps],
  );
  const report = useMemo(() => runEngine(analysis, analyzedText), [analysis, analyzedText]);
  const confidence = useMemo(() => scoreAccessibility(report, analysis), [report, analysis]);

  // The same graph with accepted repairs applied. Everything downstream — the
  // score, the constraint tests — recomputes from this, so an applied repair
  // visibly removes the barrier instead of only being recorded.
  const repairedAnalysis = useMemo(
    () => applyRepairs(analysis, appliedRepairIds),
    [analysis, appliedRepairIds],
  );
  const repairedReport = useMemo(
    () => runEngine(repairedAnalysis, analyzedText),
    [repairedAnalysis, analyzedText],
  );
  const repairedConfidence = useMemo(
    () => scoreAccessibility(repairedReport, repairedAnalysis),
    [repairedReport, repairedAnalysis],
  );

  const selectedStep = useMemo(() => {
    if (!selectedFriction) return null;
    const matched = selectedFriction.stepIds
      .map((stepId) => steps.find((step) => step.id === stepId))
      .filter((step): step is Step => Boolean(step));
    return matched.find((step) => step.repair !== null) ?? matched[0] ?? steps[0] ?? null;
  }, [selectedFriction, steps]);

  // The revision is only valid for the inputs it was generated from. Keying it
  // this way means changing a repair decision retires the old rewrite instead
  // of leaving it to be exported beside a repair count it no longer matches.
  const revisionKey = useMemo(
    () => JSON.stringify([analyzedText, objective, [...appliedRepairIds].sort()]),
    [analyzedText, objective, appliedRepairIds],
  );
  const currentRevision = revised?.key === revisionKey ? revised.value : null;

  useEffect(() => {
    if (stage === "intro") return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [stage]);

  function addRepair(stepId: string) {
    setAppliedRepairIds((current) => current.includes(stepId) ? current : [...current, stepId]);
  }

  function keepCurrent(stepId: string) {
    setAppliedRepairIds((current) => current.filter((id) => id !== stepId));
  }

  function customizeRepair(stepId: string, suggestion: string) {
    setSteps((current) => current.map((step) =>
      step.id === stepId && step.repair
        ? { ...step, repair: { ...step.repair, suggestion } }
        : step,
    ));
    addRepair(stepId);
  }

  const recordRevision = useCallback((key: string, value: RevisedAssignment) => {
    setRevised({ key, value });
  }, []);

  /** Single entry point for navigation so every arrival is recorded as visited. */
  const goToStage = useCallback((next: WorkflowStage) => {
    setStage(next);
    if (next !== "loading") {
      setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
    }
  }, []);

  /** Reads the assignment and proposes a learning objective for the educator to lock. */
  async function submitAssignment() {
    const text = assignmentDraft;
    const token = ++requestId.current;
    setError(null);
    setAppliedRepairIds([]);
    setRevised(null);
    setCondition("working_memory");
    // A new assignment invalidates every result downstream, so the stages that
    // showed them stop being reachable until this analysis produces its own.
    setVisited(new Set(["analyze"]));
    setLoadingPhase("objective");
    goToStage("loading");

    try {
      const [objectives] = await Promise.all([
        extractObjectives(text),
        new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS)),
      ]);
      if (token !== requestId.current) return;
      setAnalyzedText(text);
      setObjective(objectives[0]?.text ?? "");
      goToStage("goal");
    } catch (err) {
      if (token !== requestId.current) return;
      setError(describeError(err));
      goToStage("analyze");
    }
  }

  /** Locks the objective, then analyses the task against it. */
  async function lockAndAnalyze(lockedObjective: string) {
    const token = ++requestId.current;
    setObjective(lockedObjective);
    setError(null);
    setLoadingPhase("analysis");
    goToStage("loading");

    try {
      const [result] = await Promise.all([
        analyzeAssignment(analyzedText, lockedObjective),
        new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS)),
      ]);
      if (token !== requestId.current) return;
      setBaseAnalysis(result);
      setSteps(result.steps);
      setSelectedFriction(result.frictionMoments[0] ?? null);
      goToStage("journey");
    } catch (err) {
      if (token !== requestId.current) return;
      setError(describeError(err));
      goToStage("goal");
    }
  }

  function exportSummary() {
    if (!currentRevision) return;
    downloadSummary(
      summaryFilename(currentRevision.title),
      // Measured against the repaired graph, matching the revised assignment
      // the file carries and the after-score shown on the completion screen.
      buildSummary(currentRevision, objective, {
        analysis,
        report,
        scoreBefore: confidence.score,
        repairedAnalysis,
        repairedReport,
        scoreAfter: repairedConfidence.score,
      })
    );
  }

  const startOver = useCallback(() => {
    requestId.current++;
    setAssignmentDraft(BIOLOGY_TEXT);
    setAnalyzedText(BIOLOGY_TEXT);
    setObjective(BIOLOGY_SAMPLE.objectives[0].text);
    setBaseAnalysis(BIOLOGY_SAMPLE.analysis);
    setSteps(BIOLOGY_SAMPLE.analysis.steps);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setSelectedFriction(BIOLOGY_SAMPLE.analysis.frictionMoments[0] ?? null);
    setError(null);
    setRevised(null);
    setVisited(new Set(["analyze"]));
    goToStage("analyze");
  }, [goToStage]);

  const workflowActions = useMemo(() => ({
    goTo: goToStage,
    selectFriction: setSelectedFriction,
    selectCondition: setCondition,
    applyRepair: addRepair,
    startOver,
  }), [goToStage, startOver]);

  const goalPreserved = appliedRepairIds.every((stepId) => {
    const repair = steps.find((step) => step.id === stepId)?.repair;
    return repair?.rigorPreserved !== false;
  });

  if (stage === "intro") {
    return <IntroScreen onEnter={() => goToStage("analyze")} />;
  }

  return (
    <WorkflowProvider value={workflowActions}>
      <div className="app-shell">
        <AppNav stage={stage} visited={visited} onNavigate={goToStage} />
        <p className="sr-only" aria-live="polite">{STATUS_LABEL[stage]}</p>

        {error && (
          <p role="alert" className="workflow-error">
            {error}
          </p>
        )}

        <div className="screen-enter" key={stage}>
          {stage === "analyze" && (
            <AnalyzeScreen
              text={assignmentDraft}
              onChange={setAssignmentDraft}
              onSubmit={submitAssignment}
              hasAnalysis={visited.has("journey")}
            />
          )}
          {stage === "loading" && <AnalysisLoadingScreen phase={loadingPhase} />}
          {stage === "goal" && <GoalLockScreen objective={objective} onEdit={setObjective} onLock={() => lockAndAnalyze(objective)} />}
          {stage === "journey" && (
            <>
              <JourneyScan analysis={analysis} report={report} />
              <section className="journey-bottom">
                <AccessibilityScore {...confidence} />
                {analysis.frictionMoments.length > 0 ? (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => { setSelectedFriction(analysis.frictionMoments[0]); goToStage("barrier"); }}
                  >
                    Review friction <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ) : (
                  // Nothing to trace and nothing to repair. Skipping straight to
                  // the constraint tests keeps the two screens that would
                  // otherwise have to invent something to show out of the way.
                  <div className="journey-clear">
                    <p>
                      <CheckCircle2 size={17} aria-hidden="true" />
                      No friction moments found. Every step&rsquo;s demands trace back to the locked objective.
                    </p>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => goToStage("constraint")}
                    >
                      Test access conditions <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {stage === "barrier" && selectedFriction && selectedStep && (
            <BarrierTrace
              assignmentText={analyzedText}
              step={selectedStep}
              friction={selectedFriction}
              citation={shortCitation(selectedFriction.barrierType)}
            />
          )}
          {stage === "repair" && <RepairScreen steps={steps} appliedRepairIds={appliedRepairIds} onApply={addRepair} onKeep={keepCurrent} onCustomize={customizeRepair} />}
          {stage === "constraint" && <ConstraintTest
              key={condition}
              analysis={analysis}
              repairedAnalysis={repairedAnalysis}
              report={report}
              condition={condition}
            />}
          {stage === "preview" && (
            <StudentPreview
              objective={objective}
              steps={steps}
              appliedRepairIds={appliedRepairIds}
              assignmentText={analyzedText}
              revisionKey={revisionKey}
              onRevised={recordRevision}
            />
          )}
          {stage === "complete" && (
            <CompleteScreen
              frictionCount={analysis.frictionMoments.length}
              frictionResolved={
                analysis.frictionMoments.length - repairedAnalysis.frictionMoments.length
              }
              repairsApplied={appliedRepairIds.length}
              goalPreserved={goalPreserved}
              scoreBefore={confidence.score}
              scoreAfter={repairedConfidence.score}
              canExport={currentRevision !== null}
              onExport={exportSummary}
            />
          )}
        </div>
      </div>
    </WorkflowProvider>
  );
}
