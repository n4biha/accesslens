"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

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
  const [selectedFriction, setSelectedFriction] = useState<FrictionMoment>(BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
  const [condition, setCondition] = useState<ConditionId>("working_memory");
  const [appliedRepairIds, setAppliedRepairIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revised, setRevised] = useState<RevisedAssignment | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<WorkflowStage>>(new Set(["analyze"]));
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("objective");

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
    const matched = selectedFriction.stepIds
      .map((stepId) => steps.find((step) => step.id === stepId))
      .filter((step): step is Step => Boolean(step));
    return matched.find((step) => step.repair !== null) ?? matched[0] ?? steps[0];
  }, [selectedFriction, steps]);

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
    setError(null);
    setAppliedRepairIds([]);
    setRevised(null);
    setCondition("working_memory");
    setLoadingPhase("objective");
    goToStage("loading");

    try {
      const [objectives] = await Promise.all([
        extractObjectives(text),
        new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS)),
      ]);
      setAnalyzedText(text);
      setObjective(objectives[0]?.text ?? "");
      goToStage("goal");
    } catch (err) {
      setError(describeError(err));
      goToStage("analyze");
    }
  }

  /** Locks the objective, then analyses the task against it. */
  async function lockAndAnalyze(lockedObjective: string) {
    setObjective(lockedObjective);
    setError(null);
    setLoadingPhase("analysis");
    goToStage("loading");

    try {
      const [result] = await Promise.all([
        analyzeAssignment(analyzedText, lockedObjective),
        new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS)),
      ]);
      setBaseAnalysis(result);
      setSteps(result.steps);
      setSelectedFriction(result.frictionMoments[0] ?? BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
      goToStage("journey");
    } catch (err) {
      setError(describeError(err));
      goToStage("goal");
    }
  }

  function exportSummary() {
    if (!revised) return;
    downloadSummary(
      summaryFilename(revised.title),
      buildSummary(revised, objective, analysis, report, confidence.score)
    );
  }

  const startOver = useCallback(() => {
    setAssignmentDraft(BIOLOGY_TEXT);
    setAnalyzedText(BIOLOGY_TEXT);
    setObjective(BIOLOGY_SAMPLE.objectives[0].text);
    setBaseAnalysis(BIOLOGY_SAMPLE.analysis);
    setSteps(BIOLOGY_SAMPLE.analysis.steps);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setSelectedFriction(BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
    setError(null);
    setRevised(null);
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
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => { setSelectedFriction(analysis.frictionMoments[0]); goToStage("barrier"); }}
                >
                  Review friction <ArrowRight size={17} aria-hidden="true" />
                </button>
              </section>
            </>
          )}
          {stage === "barrier" && (
            <BarrierTrace
              assignmentText={analyzedText}
              step={selectedStep}
              friction={selectedFriction}
              citation={shortCitation(selectedFriction.barrierType)}
            />
          )}
          {stage === "repair" && <RepairScreen steps={steps} onApply={addRepair} onKeep={keepCurrent} onCustomize={customizeRepair} />}
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
              onRevised={setRevised}
            />
          )}
          {stage === "complete" && (
            <CompleteScreen
              frictionCount={analysis.frictionMoments.length}
              repairsApplied={appliedRepairIds.length}
              goalPreserved={goalPreserved}
              scoreBefore={confidence.score}
              scoreAfter={repairedConfidence.score}
              canExport={revised !== null}
              onExport={exportSummary}
            />
          )}
        </div>
      </div>
    </WorkflowProvider>
  );
}
