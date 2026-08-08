"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import AccessibilityScore, { type AccessibilityScoreData } from "@/components/AccessibilityScore";
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
import { runEngine } from "@/lib/engine";
import { shortCitation } from "@/lib/standards";
import type { FrictionMoment, Step } from "@/lib/schema";
import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";

const BIOLOGY_CONFIDENCE: AccessibilityScoreData = {
  score: 72,
  breakdown: [
    { label: "Goal alignment", points: 24 },
    { label: "Information persistence", points: 12 },
    { label: "Interaction flexibility", points: 12 },
    { label: "Timing flexibility", points: 10 },
    { label: "Response options", points: 14 },
  ],
};

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
  const [objective, setObjective] = useState(BIOLOGY_SAMPLE.objectives[0].text);
  const [steps, setSteps] = useState<Step[]>(BIOLOGY_SAMPLE.analysis.steps);
  const [selectedFriction, setSelectedFriction] = useState<FrictionMoment>(BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
  const [condition, setCondition] = useState<ConditionId>("working_memory");
  const [appliedRepairIds, setAppliedRepairIds] = useState<string[]>([]);

  const analysis = useMemo(
    () => ({ ...BIOLOGY_SAMPLE.analysis, steps }),
    [steps],
  );
  const report = useMemo(() => runEngine(analysis, BIOLOGY_TEXT), [analysis]);

  const selectedStep = useMemo(() => {
    const matched = selectedFriction.stepIds
      .map((stepId) => steps.find((step) => step.id === stepId))
      .filter((step): step is Step => Boolean(step));
    return matched.find((step) => step.repair !== null) ?? matched[0] ?? steps[0];
  }, [selectedFriction, steps]);

  useEffect(() => {
    if (stage === "loading") {
      const timer = window.setTimeout(() => setStage("goal"), 3100);
      return () => window.clearTimeout(timer);
    }
  }, [stage]);

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

  function submitDemo() {
    setSteps(BIOLOGY_SAMPLE.analysis.steps);
    setObjective(BIOLOGY_SAMPLE.objectives[0].text);
    setSelectedFriction(BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setStage("loading");
  }

  function startOver() {
    setAssignmentDraft(BIOLOGY_TEXT);
    setObjective(BIOLOGY_SAMPLE.objectives[0].text);
    setSteps(BIOLOGY_SAMPLE.analysis.steps);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setSelectedFriction(BIOLOGY_SAMPLE.analysis.frictionMoments[0]);
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

        <div className="screen-enter" key={stage}>
          {stage === "analyze" && <AnalyzeScreen text={assignmentDraft} onChange={setAssignmentDraft} onSubmit={submitDemo} />}
          {stage === "loading" && <AnalysisLoadingScreen />}
          {stage === "goal" && <GoalLockScreen objective={objective} onEdit={setObjective} onLock={() => setStage("journey")} />}
          {stage === "journey" && (
            <>
              <JourneyScan analysis={analysis} report={report} />
              <section className="journey-bottom">
                <AccessibilityScore {...BIOLOGY_CONFIDENCE} />
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
              assignmentText={BIOLOGY_TEXT}
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
