"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { Analysis, FrictionMoment, Step } from "@/lib/schema";
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

  const analysis = useMemo(
    () => ({ ...baseAnalysis, steps }),
    [baseAnalysis, steps],
  );
  const report = useMemo(() => runEngine(analysis, analyzedText), [analysis, analyzedText]);
  const confidence = useMemo(() => scoreAccessibility(report, analysis), [report, analysis]);

  const selectedStep = useMemo(() => {
    const matched = selectedFriction.stepIds
      .map((stepId) => steps.find((step) => step.id === stepId))
      .filter((step): step is Step => Boolean(step));
    return matched.find((step) => step.repair !== null) ?? matched[0] ?? steps[0];
  }, [selectedFriction, steps]);

  useEffect(() => {
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

  /** Reads the assignment and proposes a learning objective for the educator to lock. */
  async function submitAssignment() {
    const text = assignmentDraft;
    setError(null);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setStage("loading");

    try {
      const [objectives] = await Promise.all([
        extractObjectives(text),
        new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS)),
      ]);
      setAnalyzedText(text);
      setObjective(objectives[0]?.text ?? "");
      setStage("goal");
    } catch (err) {
      setError(describeError(err));
      setStage("analyze");
    }
  }

  /** Locks the objective, then analyses the task against it. */
  async function lockAndAnalyze(lockedObjective: string) {
    setObjective(lockedObjective);
    setError(null);
    setStage("loading");

    try {
      const [result] = await Promise.all([
        analyzeAssignment(analyzedText, lockedObjective),
        new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS)),
      ]);
      setBaseAnalysis(result);
      setSteps(result.steps);
      setSelectedFriction(result.frictionMoments[0] ?? BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
      setStage("journey");
    } catch (err) {
      setError(describeError(err));
      setStage("goal");
    }
  }

  function startOver() {
    setAssignmentDraft(BIOLOGY_TEXT);
    setAnalyzedText(BIOLOGY_TEXT);
    setObjective(BIOLOGY_SAMPLE.objectives[0].text);
    setBaseAnalysis(BIOLOGY_SAMPLE.analysis);
    setSteps(BIOLOGY_SAMPLE.analysis.steps);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setSelectedFriction(BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
    setError(null);
    setStage("analyze");
  }

  const workflowActions = useMemo(() => ({
    goTo: setStage,
    selectFriction: setSelectedFriction,
    selectCondition: setCondition,
    applyRepair: addRepair,
    startOver,
  }), []);

  const goalPreserved = appliedRepairIds.every((stepId) => {
    const repair = steps.find((step) => step.id === stepId)?.repair;
    return repair?.rigorPreserved !== false;
  });

  if (stage === "intro") {
    return <IntroScreen onEnter={() => setStage("analyze")} />;
  }

  return (
    <WorkflowProvider value={workflowActions}>
      <div className="app-shell">
        <AppNav stage={stage} />
        <p className="sr-only" aria-live="polite">{STATUS_LABEL[stage]}</p>

        {error && (
          <p role="alert" className="workflow-error">
            {error}
          </p>
        )}

        <div className="screen-enter" key={stage}>
          {stage === "analyze" && <AnalyzeScreen text={assignmentDraft} onChange={setAssignmentDraft} onSubmit={submitAssignment} />}
          {stage === "loading" && <AnalysisLoadingScreen />}
          {stage === "goal" && <GoalLockScreen objective={objective} onEdit={setObjective} onLock={() => lockAndAnalyze(objective)} />}
          {stage === "journey" && (
            <>
              <JourneyScan analysis={analysis} report={report} />
              <section className="journey-bottom">
                <AccessibilityScore {...confidence} />
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => { setSelectedFriction(analysis.frictionMoments[0]); setStage("barrier"); }}
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
          {stage === "constraint" && <ConstraintTest key={condition} analysis={analysis} report={report} condition={condition} />}
          {stage === "preview" && <StudentPreview objective={objective} steps={steps} appliedRepairIds={appliedRepairIds} />}
          {stage === "complete" && (
            <CompleteScreen
              frictionCount={analysis.frictionMoments.length}
              repairsApplied={appliedRepairIds.length}
              goalPreserved={goalPreserved}
            />
          )}
        </div>
      </div>
    </WorkflowProvider>
  );
}
