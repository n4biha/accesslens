"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  FileText,
  Keyboard,
  Link2,
  LockKeyhole,
  Mic,
  MousePointer2,
  Pencil,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import DemandChips, { chipsForDemands } from "@/components/DemandChips";
import { useWorkflow, type ConditionId } from "@/components/WorkflowContext";
import { generatePreview } from "@/lib/analysisSource";
import type { EngineReport } from "@/lib/engine";
import type { Analysis, FrictionMoment, GoalRelevance, RevisedAssignment, Step } from "@/lib/schema";

function ScreenHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="screen-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 data-screen-heading tabIndex={-1}>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function ArrowButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="button button--primary" onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      <ArrowRight size={17} aria-hidden="true" />
    </button>
  );
}

export interface AnalyzeScreenProps {
  text: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** True once an analysis exists, so re-running is a replacement, not a first run. */
  hasAnalysis?: boolean;
}

export function AnalyzeScreen({ text, onChange, onSubmit, hasAnalysis = false }: AnalyzeScreenProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [fileNote, setFileNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setReading(true);
    setFileNote(null);
    try {
      const { extractPdfText } = await import("@/lib/pdfText");
      const extracted = await extractPdfText(file);
      onChange(extracted);
      const words = extracted.split(/\s+/).length;
      setFileNote({ tone: "ok", text: `Read ${words.toLocaleString()} words from ${file.name}. Check it below, then analyse.` });
    } catch (error) {
      setFileNote({
        tone: "error",
        text: error instanceof Error ? error.message : "That file could not be read.",
      });
    } finally {
      setReading(false);
    }
  }

  return (
    <main className="workflow-main">
      <ScreenHeading
        eyebrow={hasAnalysis ? "Assignment" : "New analysis"}
        title={hasAnalysis ? "Your assignment" : "Analyze a learning task"}
        subtitle={
          hasAnalysis
            ? "Edit the text and re-analyse, or use the steps above to return to your results."
            : "Paste an assignment, upload content, or provide an online learning experience."
        }
      />

      <div className="analysis-grid">
        <section className="document-panel" aria-labelledby="assignment-input-heading">
          <div className="input-tabs" role="tablist" aria-label="Assignment source">
            <button type="button" role="tab" aria-selected="true" id="assignment-input-heading">
              <FileText size={16} aria-hidden="true" /> Paste text
            </button>
            <button
              type="button"
              role="tab"
              aria-selected="false"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
            >
              <Upload size={15} aria-hidden="true" /> {reading ? "Reading PDF…" : "Upload PDF"}
            </button>
            <button type="button" role="tab" aria-selected="false" disabled>
              <Link2 size={15} aria-hidden="true" /> Enter URL <span>Roadmap</span>
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="Upload a PDF assignment"
            onChange={handleFile}
          />
          {fileNote && (
            <p
              className={`file-note ${fileNote.tone === "error" ? "file-note--error" : ""}`}
              role={fileNote.tone === "error" ? "alert" : "status"}
            >
              {fileNote.text}
            </p>
          )}
          <label htmlFor="assignment-text" className="sr-only">Assignment text</label>
          <textarea
            id="assignment-text"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            aria-describedby="prototype-note"
          />
          <div className="document-footer">
            <p id="prototype-note">
              {hasAnalysis
                ? "Re-analysing replaces your current results and repairs."
                : "Analysed live · the sample assignment answers instantly"}
            </p>
            <ArrowButton onClick={onSubmit} disabled={text.trim().length === 0 || reading}>
              {hasAnalysis ? "Re-analyse task" : "Analyze task"}
            </ArrowButton>
          </div>
        </section>

        <aside className="tips-panel" aria-labelledby="tips-title">
          <div className="tips-icon" aria-hidden="true"><Sparkles size={18} /></div>
          <h2 id="tips-title">For the best analysis</h2>
          <ul>
            <li><Check size={15} aria-hidden="true" /> Include full student instructions</li>
            <li><Check size={15} aria-hidden="true" /> Include the learning objective</li>
            <li><Check size={15} aria-hidden="true" /> Include links when relevant</li>
          </ul>
          <div className="tip-note">
            <p>What AccessLens looks for</p>
            <span>Actions, transitions, memory demands, interaction precision, timing, and response modes.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}

/**
 * Two passes run against the model, and they do different work. Showing the
 * same six messages for both made the first pass claim it had traced friction
 * and prepared recommendations when it had only read the assignment — and then
 * Goal Lock asked the educator to confirm a goal the app implied it had already
 * finished working from.
 */
const PHASE_COPY = {
  objective: {
    eyebrow: "Step 1 of 2 · reading the assignment",
    messages: [
      "Reading the assignment…",
      "Working out what it is meant to teach…",
    ],
    /** Objective extraction usually returns in a few seconds. */
    cadenceMs: 1800,
  },
  analysis: {
    eyebrow: "Step 2 of 2 · reading the task as a journey",
    messages: [
      "Breaking the task into student actions…",
      "Mapping functional demands…",
      "Tracing accessibility friction…",
      "Comparing demands with the learning goal…",
      "Preparing recommendations…",
    ],
    /** The full analysis runs far longer, so the messages are paced to match. */
    cadenceMs: 7000,
  },
} as const;

export type LoadingPhase = keyof typeof PHASE_COPY;

export function AnalysisLoadingScreen({ phase = "analysis" }: { phase?: LoadingPhase }) {
  const { eyebrow, messages, cadenceMs } = PHASE_COPY[phase];
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => Math.min(current + 1, messages.length - 1));
    }, cadenceMs);
    return () => window.clearInterval(timer);
  }, [messages.length, cadenceMs]);

  const onLastMessage = messageIndex === messages.length - 1;

  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <div className="neural-loader" aria-hidden="true">
        <span />
        <i /><i /><i /><i />
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h1 data-screen-heading tabIndex={-1}>{messages[messageIndex]}</h1>
      <p>
        {onLastMessage
          ? "Still working — larger assignments take longer."
          : `${messageIndex + 1} of ${messages.length}`}
      </p>
    </main>
  );
}

export interface GoalLockScreenProps {
  objective: string;
  onEdit: (objective: string) => void;
  onLock: () => void;
}

export function GoalLockScreen({ objective, onEdit, onLock }: GoalLockScreenProps) {
  const [editing, setEditing] = useState(false);
  const [locked, setLocked] = useState(false);

  return (
    <main className="workflow-main goal-screen">
      <ScreenHeading
        eyebrow="Goal lock"
        title="Lock the learning goal"
        subtitle="Confirm what students are actually expected to learn. We’ll protect this goal while suggesting accessibility improvements."
      />
      <section className={`goal-orbit ${locked ? "is-locked" : ""}`} aria-labelledby="goal-label">
        <span className="goal-ring goal-ring--one" aria-hidden="true" />
        <span className="goal-ring goal-ring--two" aria-hidden="true" />
        <span className="goal-lock-icon" aria-hidden="true"><LockKeyhole size={21} /></span>
        <div className="goal-content">
          <p className="eyebrow" id="goal-label">Learning goal</p>
          {editing ? (
            <textarea value={objective} onChange={(event) => onEdit(event.target.value)} aria-label="Learning goal" autoFocus />
          ) : (
            <blockquote>“{objective}”</blockquote>
          )}
        </div>
      </section>

      {!locked ? (
        <div className="goal-actions">
          <button type="button" className="button button--secondary" onClick={() => setEditing((value) => !value)}>
            <Pencil size={16} aria-hidden="true" /> {editing ? "Finish editing" : "Edit goal"}
          </button>
          <button type="button" className="button button--primary" onClick={() => { setEditing(false); setLocked(true); }} disabled={!objective.trim()}>
            <LockKeyhole size={16} aria-hidden="true" /> Confirm &amp; lock goal
          </button>
        </div>
      ) : (
        <div className="goal-confirmation" aria-live="polite">
          <p><CheckCircle2 size={18} aria-hidden="true" /> Goal Locked</p>
          <span>Recommendations may change how students access or demonstrate learning, but not what students are expected to learn.</span>
          <ArrowButton onClick={onLock}>Continue</ArrowButton>
        </div>
      )}
    </main>
  );
}

const RELEVANCE_LABEL: Record<GoalRelevance, string> = {
  essential: "Essential",
  related: "Related",
  incidental: "Incidental",
  unknown: "Needs review",
};

const SEVERITY_LABEL = { high: "High", medium: "Moderate", low: "Low" } as const;

export interface JourneyScanProps { analysis: Analysis; report: EngineReport }

/**
 * Steps are written in the third person for the educator ("Reads the
 * instructions"). Nodes need a short imperative instead, so the verb is
 * converted rather than stripped — dropping it leaves fragments like
 * "the assignment instructions in Canvas".
 */
function toImperative(verb: string): string {
  if (/ies$/i.test(verb)) return verb.slice(0, -3) + "y"; // tries -> try
  if (/(ch|sh|ss|x|z)es$/i.test(verb)) return verb.slice(0, -2); // watches -> watch
  if (/[^s]s$/i.test(verb)) return verb.slice(0, -1); // observes -> observe
  return verb;
}

function imperativeAction(action: string): string {
  const words = action.trim().split(/\s+/);
  if (words.length === 0) return action;

  words[0] = toImperative(words[0]);
  // "Opens and reads the article" -> "Open and read the article"
  const andIndex = words.findIndex((word, i) => i > 0 && word.toLowerCase() === "and");
  if (andIndex > 0 && words[andIndex + 1]) {
    words[andIndex + 1] = toImperative(words[andIndex + 1]);
  }

  const label = words.join(" ").replace(/[,;:]$/, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function nodeLabel(action: string): string {
  const words = imperativeAction(action).split(/\s+/);

  const clipped = words.length > 5;
  const kept = clipped ? words.slice(0, 5) : [...words];

  // Trailing prepositions and articles read badly before an ellipsis
  // ("Read the assignment instructions in…"), so drop them.
  const DANGLING = /^(in|into|on|at|to|from|with|and|the|a|an|of|for|by|as)$/i;
  while (clipped && kept.length > 2 && DANGLING.test(kept[kept.length - 1])) kept.pop();

  const label = kept.join(" ").replace(/[,;:]$/, "");
  return label + (clipped ? "…" : "");
}

export function JourneyScan({ analysis, report }: JourneyScanProps) {
  const { goTo, selectFriction } = useWorkflow();
  const journeyPathRef = useRef<HTMLOListElement>(null);
  const [selectedStepId, setSelectedStepId] = useState(() => (
    analysis.steps.find((step) => analysis.frictionMoments.some((friction) => friction.stepIds.includes(step.id)))?.id
    ?? analysis.steps[0]?.id
    ?? ""
  ));
  const frictionByStep = useMemo(() => {
    const map = new Map<string, FrictionMoment[]>();
    analysis.frictionMoments.forEach((friction) => {
      friction.stepIds.forEach((stepId) => map.set(stepId, [...(map.get(stepId) ?? []), friction]));
    });
    return map;
  }, [analysis]);
  const incidental = analysis.steps.filter((step) => step.goalRelevance === "incidental").length;
  const essentialRisks = analysis.steps.filter((step) => step.goalRelevance === "essential" && step.repair).length;
  const selectedStepIndex = Math.max(0, analysis.steps.findIndex((step) => step.id === selectedStepId));
  const selectedStep = analysis.steps[selectedStepIndex];
  const selectedFrictions = selectedStep ? frictionByStep.get(selectedStep.id) ?? [] : [];

  function selectStep(index: number) {
    const nextStep = analysis.steps[index];
    if (!nextStep) return;

    setSelectedStepId(nextStep.id);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const usesVerticalTimeline = window.matchMedia("(max-width: 580px)").matches;
    window.requestAnimationFrame(() => {
      const scrollTarget = usesVerticalTimeline
        ? document.getElementById("journey-step-detail")
        : journeyPathRef.current?.children[index];
      scrollTarget?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: usesVerticalTimeline ? "start" : "nearest",
        inline: "center",
      });
    });
  }

  function affectedStepNumbers(friction: FrictionMoment): string {
    return friction.stepIds
      .map((stepId) => analysis.steps.findIndex((step) => step.id === stepId) + 1)
      .filter((stepNumber) => stepNumber > 0)
      .join(", ");
  }

  return (
    <main className="workflow-main journey-screen">
      <ScreenHeading
        eyebrow="Journey scan"
        title="The task, seen as a student journey"
        subtitle="We break the task into real student actions to reveal where accessibility friction occurs."
      />
      <section className="journey-explorer" aria-labelledby="journey-overview-title">
        <header className="journey-toolbar">
          <div>
            <p className="eyebrow">Journey overview</p>
            <h2 id="journey-overview-title">Follow the task step by step</h2>
            <p>Select a step to inspect its environment, demands, and accessibility friction.</p>
          </div>
          <nav className="journey-controls" aria-label="Journey step controls">
            <span aria-live="polite">Step {selectedStepIndex + 1} of {analysis.steps.length}</span>
            <button
              type="button"
              onClick={() => selectStep(selectedStepIndex - 1)}
              disabled={selectedStepIndex === 0}
              aria-label="View previous step"
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => selectStep(selectedStepIndex + 1)}
              disabled={selectedStepIndex === analysis.steps.length - 1}
              aria-label="View next step"
            >
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </nav>
        </header>

        <dl className="journey-summary" aria-label="Journey summary">
          <div><dt>Friction moments</dt><dd>{analysis.frictionMoments.length}</dd></div>
          <div><dt>Incidental demands</dt><dd>{incidental}</dd></div>
          <div><dt>Essential demands with risk</dt><dd>{essentialRisks}</dd></div>
          <div><dt>Learning environments</dt><dd>{report.switching.uniqueEnvironments.length}</dd></div>
        </dl>

        <div className="journey-scroll" aria-label={`${analysis.steps.length} task steps`}>
          <ol className="journey-path" ref={journeyPathRef}>
          {analysis.steps.map((step, index) => {
            const frictions = frictionByStep.get(step.id) ?? [];
            const primaryFriction = frictions[0];
            const isSelected = step.id === selectedStep?.id;
            return (
              <li key={step.id} className={`journey-step${isSelected ? " is-selected" : ""}`}>
                <button
                  type="button"
                  className="journey-card"
                  onClick={() => selectStep(index)}
                  aria-current={isSelected ? "step" : undefined}
                  aria-controls="journey-step-detail"
                >
                  <span className="journey-card-topline">
                    <span className="node-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`relevance-pill relevance-${step.goalRelevance}`}>{RELEVANCE_LABEL[step.goalRelevance]}</span>
                  </span>
                  <strong className="node-label">{nodeLabel(step.action)}</strong>
                  <span className="journey-environment"><Link2 size={14} aria-hidden="true" /> {step.environment}</span>
                  {primaryFriction ? (
                    <span className={`journey-status severity-${primaryFriction.severity}`}>
                      <AlertTriangle size={14} aria-hidden="true" />
                      {SEVERITY_LABEL[primaryFriction.severity]}
                      {frictions.length > 1 && <small>{frictions.length} issues</small>}
                    </span>
                  ) : (
                    <span className="journey-status journey-status--clear"><Check size={14} aria-hidden="true" /> No friction flagged</span>
                  )}
                </button>
              </li>
            );
          })}
          </ol>
        </div>

        {selectedStep && (
          <article className="journey-step-detail" id="journey-step-detail" aria-labelledby="selected-step-title">
            <div className="journey-step-context">
              <p className="eyebrow">Selected step · {String(selectedStepIndex + 1).padStart(2, "0")}</p>
              <h2 id="selected-step-title">{imperativeAction(selectedStep.action)}</h2>
              <div className="journey-step-meta">
                <span><Link2 size={14} aria-hidden="true" /> {selectedStep.environment}</span>
                <span>{RELEVANCE_LABEL[selectedStep.goalRelevance]} to goal</span>
              </div>
              <div className="journey-demand-block">
                <h3>Functional demands</h3>
                <DemandChips demands={selectedStep.demands} />
              </div>
            </div>

            <div className="journey-friction-detail">
              {selectedFrictions.length > 0 ? (
                <>
                  <p className="eyebrow">Friction at this step</p>
                  <div className="journey-friction-list">
                    {selectedFrictions.map((friction) => (
                      <section key={friction.id} className="journey-friction-card" aria-labelledby={`friction-title-${friction.id}`}>
                        <div className="journey-friction-heading">
                          <span className={`severity-${friction.severity}`}><AlertTriangle size={14} aria-hidden="true" /> {SEVERITY_LABEL[friction.severity]}</span>
                          <span>Affects steps {affectedStepNumbers(friction)}</span>
                        </div>
                        <h3 id={`friction-title-${friction.id}`}>{friction.title}</h3>
                        <p>{friction.explanation}</p>
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          onClick={() => { selectFriction(friction); goTo("barrier"); }}
                        >
                          Review friction <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <div className="journey-no-friction">
                  <span><CheckCircle2 size={19} aria-hidden="true" /></span>
                  <div>
                    <h3>No friction flagged here</h3>
                    <p>This step does not contain a detected accessibility barrier.</p>
                  </div>
                </div>
              )}
            </div>
          </article>
        )}
      </section>
    </main>
  );
}

export interface BarrierTraceProps {
  assignmentText: string;
  step: Step;
  friction: FrictionMoment;
  citation: string;
}

function HighlightedEvidence({ assignmentText, evidence }: { assignmentText: string; evidence: string }) {
  const index = assignmentText.indexOf(evidence);
  if (index < 0) return <p className="assignment-copy">{assignmentText}</p>;
  return (
    <p className="assignment-copy">
      {assignmentText.slice(0, index)}
      <mark>{assignmentText.slice(index, index + evidence.length)}</mark>
      {assignmentText.slice(index + evidence.length)}
    </p>
  );
}

export function BarrierTrace({ assignmentText, step, friction, citation }: BarrierTraceProps) {
  const { goTo, applyRepair } = useWorkflow();
  const category = friction.barrierType.replaceAll("_", " ");
  return (
    <main className="workflow-main">
      <ScreenHeading eyebrow="Friction" title="Barrier Trace" subtitle="Identify what’s getting in the way—and why." />
      <div className="barrier-grid">
        <section className="excerpt-panel" aria-labelledby="excerpt-title">
          <div className="document-masthead">
            <div><span className="paper-dot" aria-hidden="true" /><span className="paper-dot" aria-hidden="true" /><span className="paper-dot" aria-hidden="true" /></div>
            <p id="excerpt-title">Assignment excerpt</p>
          </div>
          <HighlightedEvidence assignmentText={assignmentText} evidence={step.evidence} />
        </section>
        <article className="barrier-detail">
          <div className="barrier-meta">
            <span>{category}</span>
            <strong className={`severity-text severity-${friction.severity}`}>{SEVERITY_LABEL[friction.severity]} severity</strong>
          </div>
          <h2>{friction.title}</h2>
          <dl>
            <div><dt>Why it was flagged</dt><dd>{friction.explanation}</dd></div>
            <div><dt>Why it matters</dt><dd>{step.relevanceReason}</dd></div>
            <div><dt>Goal relevance</dt><dd className="goal-relevance-value">{RELEVANCE_LABEL[step.goalRelevance]}</dd></div>
            <div><dt>Suggested repair</dt><dd>{step.repair?.suggestion ?? "Review this step with the learner journey in view."}</dd></div>
          </dl>
          <p className="citation"><BookOpen size={15} aria-hidden="true" /> {citation}</p>
          <div className="barrier-actions">
            <button type="button" className="button button--secondary" onClick={() => goTo("journey")}><ArrowLeft size={16} aria-hidden="true" /> Back to journey</button>
            <button type="button" className="button button--primary" onClick={() => { applyRepair(step.id); goTo("repair"); }}><Check size={16} aria-hidden="true" /> Apply repair</button>
            <button type="button" className="button button--secondary" onClick={() => goTo("preview")}>View student preview <ChevronRight size={16} aria-hidden="true" /></button>
          </div>
        </article>
      </div>
    </main>
  );
}

export interface RepairScreenProps {
  steps: Step[];
  onApply: (stepId: string) => void;
  onKeep: (stepId: string) => void;
  onCustomize: (stepId: string, suggestion: string) => void;
}

export function RepairScreen({ steps, onApply, onKeep, onCustomize }: RepairScreenProps) {
  const { goTo } = useWorkflow();
  const repairSteps = steps.filter((step) => step.repair !== null);
  const [decisions, setDecisions] = useState<Record<string, "apply" | "keep" | "custom">>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function choose(stepId: string, choice: "apply" | "keep") {
    setDecisions((current) => ({ ...current, [stepId]: choice }));
    if (choice === "apply") onApply(stepId);
    else onKeep(stepId);
  }

  function beginCustomize(step: Step) {
    setEditingId(step.id);
    setDraft(step.repair?.suggestion ?? "");
  }

  function saveCustomize(stepId: string) {
    onCustomize(stepId, draft);
    setDecisions((current) => ({ ...current, [stepId]: "custom" }));
    setEditingId(null);
  }

  const reviewed = Object.keys(decisions).length;
  const ready = Object.values(decisions).filter((decision) => decision !== "keep").length;

  return (
    <main className="workflow-main repair-screen">
      <ScreenHeading eyebrow="Repair" title="Repair Plan" subtitle="Review targeted accessibility improvements while preserving the learning goal." />
      <div className="repair-list">
        {repairSteps.map((step, index) => {
          const decision = decisions[step.id];
          const demands = chipsForDemands(step.demands);
          const highDemand = Math.max(step.demands.workingMemory, step.demands.fineMotor, step.demands.timePressure) >= 3;
          return (
            <article key={step.id} className={`repair-row ${decision === "apply" || decision === "custom" ? "is-accepted" : ""}`}>
              <div className="repair-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="repair-body">
                <div className="repair-title-row">
                  <h2>{step.repair!.barrierReduced}</h2>
                  <span className={`severity-text severity-${highDemand ? "high" : "medium"}`}>{highDemand ? "High" : "Moderate"}</span>
                </div>
                <div className="repair-comparison">
                  <div><p>Current</p><span>{step.evidence}</span></div>
                  <ArrowRight size={18} aria-hidden="true" />
                  <div><p>Recommended</p><span>{step.repair!.suggestion}</span></div>
                </div>
                {editingId === step.id && (
                  <div className="customize-field">
                    <label htmlFor={`custom-${step.id}`}>Customize the recommendation</label>
                    <textarea id={`custom-${step.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
                    <button type="button" className="button button--small button--primary" onClick={() => saveCustomize(step.id)}>Save &amp; apply</button>
                  </div>
                )}
                <div className="rigor-note">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <p><strong>Rigor {step.repair!.rigorPreserved ? "preserved" : "needs review"}</strong><span>{step.repair!.rigorNote}</span></p>
                </div>
                <div className="repair-row-actions" aria-label={`Decision for ${step.repair!.barrierReduced}`}>
                  <button type="button" className={decision === "apply" ? "is-selected" : ""} onClick={() => choose(step.id, "apply")}><Check size={14} aria-hidden="true" /> Apply</button>
                  <button type="button" onClick={() => beginCustomize(step)}><Pencil size={14} aria-hidden="true" /> Customize</button>
                  <button type="button" className={decision === "keep" ? "is-selected" : ""} onClick={() => choose(step.id, "keep")}>Keep current</button>
                </div>
                {demands.length > 0 && <p className="repair-demand-note">Detected from {demands.map((demand) => demand.label).join(", ")}.</p>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="sticky-action-bar">
        <p><strong>{reviewed}</strong> of {repairSteps.length} barriers reviewed <span aria-hidden="true">·</span> <strong>{ready}</strong> repairs ready</p>
        <button type="button" className="button button--secondary" onClick={() => goTo("barrier")}><ArrowLeft size={16} aria-hidden="true" /> Back to friction</button>
        <ArrowButton onClick={() => goTo("constraint")} disabled={reviewed === 0}>Continue to testing</ArrowButton>
      </div>
    </main>
  );
}

interface ConditionDefinition {
  id: ConditionId;
  label: string;
  icon: typeof CircleGauge;
  fails: (step: Step) => boolean;
}

export const CONDITIONS: ConditionDefinition[] = [
  { id: "working_memory", label: "Reduced working-memory dependency", icon: CircleGauge, fails: (step) => step.demands.workingMemory >= 2 },
  { id: "keyboard_only", label: "Keyboard-only", icon: Keyboard, fails: (step) => step.demands.fineMotor >= 2 },
  { id: "fine_motor", label: "Limited motor precision", icon: MousePointer2, fails: (step) => step.demands.fineMotor >= 2 },
  { id: "no_spoken", label: "No spoken response", icon: Mic, fails: (step) => step.demands.communication === "spoken" },
  { id: "no_audio", label: "No audio", icon: Volume2, fails: (step) => step.demands.sensory.audioOnly },
  { id: "no_color", label: "No color information", icon: Sparkles, fails: (step) => step.demands.sensory.colorOnly },
  { id: "processing_time", label: "Additional processing time", icon: Clock3, fails: (step) => step.demands.timePressure >= 2 },
  { id: "reduced_motion", label: "Reduced motion", icon: RotateCcw, fails: () => false },
];

export interface ConstraintTestProps {
  analysis: Analysis;
  /** The same graph with accepted repairs applied, so results can be recomputed. */
  repairedAnalysis: Analysis;
  report: EngineReport;
  condition: string;
}

export function ConstraintTest({ analysis, repairedAnalysis, report, condition }: ConstraintTestProps) {
  const { goTo, selectCondition } = useWorkflow();
  const selected = CONDITIONS.find((item) => item.id === condition) ?? CONDITIONS[0];
  const unavailable = selected.id === "reduced_motion";
  const [visibleCount, setVisibleCount] = useState(0);
  const failedSteps = analysis.steps.filter(selected.fails);

  // Recomputed, not projected: the repaired graph is run through the same
  // predicate, so a step only reads "PASS after repair" when it genuinely does.
  const repairedById = useMemo(
    () => new Map(repairedAnalysis.steps.map((step) => [step.id, step])),
    [repairedAnalysis],
  );
  const stillFailing = failedSteps.filter((step) => {
    const repaired = repairedById.get(step.id);
    return !repaired || selected.fails(repaired);
  });
  const fixedCount = failedSteps.length - stillFailing.length;
  const focusedStep = stillFailing[0] ?? failedSteps[0] ?? analysis.steps[0];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count >= analysis.steps.length) {
          window.clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, 90);
    return () => window.clearInterval(timer);
  }, [condition, analysis.steps.length]);

  return (
    <main className="workflow-main constraint-screen">
      <ScreenHeading eyebrow="Test" title="Test access conditions" subtitle="See where the assignment breaks under different functional access conditions." />
      <div className="constraint-grid">
        <aside className="condition-list" aria-labelledby="conditions-title">
          <h2 id="conditions-title">Functional conditions</h2>
          {CONDITIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" onClick={() => selectCondition(item.id)} className={item.id === selected.id ? "is-selected" : ""} aria-pressed={item.id === selected.id}>
                <Icon size={16} aria-hidden="true" /><span>{item.label}</span>{item.id === "reduced_motion" && <small>Data unavailable</small>}
              </button>
            );
          })}
        </aside>

        <section className="journey-results" aria-labelledby="results-title">
          <div className="result-heading">
            <div><p className="eyebrow">Journey results</p><h2 id="results-title">{selected.label}</h2></div>
            {!unavailable && (
              <span>
                {fixedCount > 0
                  ? `${stillFailing.length} of ${analysis.steps.length} steps fail — ${fixedCount} fixed by your repairs`
                  : `${failedSteps.length} of ${analysis.steps.length} steps fail`}
              </span>
            )}
          </div>
          {unavailable ? (
            <div className="unavailable-state"><RotateCcw size={24} aria-hidden="true" /><h3>Not represented in task data</h3><p>The current demand schema does not describe motion dependencies, so AccessLens will not invent a result.</p></div>
          ) : (
            <ol className="test-steps">
              {analysis.steps.map((step, index) => {
                const fails = selected.fails(step);
                const repaired = repairedById.get(step.id);
                const fixed = fails && repaired !== undefined && !selected.fails(repaired);
                return (
                  <li key={step.id} className={index < visibleCount ? "is-visible" : ""}>
                    <span>{index + 1}</span>
                    <p>{step.action}</p>
                    {fixed ? (
                      <strong className="result-fixed">
                        <s>FAIL</s> PASS after repair
                      </strong>
                    ) : (
                      <strong className={fails ? "result-fail" : "result-pass"}>{fails ? "FAIL" : "PASS"}</strong>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {!unavailable && stillFailing.length > 0 && (
            <article className="failure-explanation">
              <p className="eyebrow">Why this fails</p>
              <h3>{focusedStep.action}</h3>
              <p>{focusedStep.relevanceReason}</p>
              {focusedStep.repair && (
                <span>
                  <CheckCircle2 size={15} aria-hidden="true" /> Applying the suggested repair clears this step
                </span>
              )}
            </article>
          )}
        </section>

        <aside className="condition-preview" aria-labelledby="preview-title">
          <p className="eyebrow">Student preview</p>
          <h2 id="preview-title">{focusedStep.action}</h2>
          {focusedStep.repair ? (
            <><div className="preview-results"><p>Your task support</p><strong>{focusedStep.repair.suggestion}</strong></div><p className="preview-assurance"><Check size={14} aria-hidden="true" /> Reference remains available while working.</p></>
          ) : (
            <p className="preview-empty">No change is suggested for this step under the selected condition.</p>
          )}
          <dl className="compact-metrics"><div><dt>Task environments</dt><dd>{report.switching.uniqueEnvironments.length}</dd></div><div><dt>Time limit</dt><dd>{report.timing.timeLimitMinutes ?? "None"}{report.timing.timeLimitMinutes ? " min" : ""}</dd></div></dl>
        </aside>
      </div>
      <div className="screen-footer-actions"><button type="button" className="button button--secondary" onClick={() => goTo("repair")}><ArrowLeft size={16} aria-hidden="true" /> Back to repairs</button><button type="button" className="button button--secondary" onClick={() => selectCondition(CONDITIONS[0].id)}>Run another test</button><ArrowButton onClick={() => goTo("preview")}>Continue</ArrowButton></div>
    </main>
  );
}

export interface StudentPreviewProps {
  objective: string;
  steps: Step[];
  appliedRepairIds: string[];
  assignmentText: string;
  onRevised: (revised: RevisedAssignment) => void;
}

const ACCESS_TOOLS = ["Chunk instructions", "Keep references visible", "Reduce visual clutter", "Read aloud", "Increase spacing", "Highlight current step"];

export function StudentPreview({ objective, steps, appliedRepairIds, assignmentText, onRevised }: StudentPreviewProps) {
  const { goTo } = useWorkflow();
  const [tools, setTools] = useState<Record<string, boolean>>({ "Keep references visible": true, "Highlight current step": true });
  const [revised, setRevised] = useState<RevisedAssignment | null>(null);
  const [message, setMessage] = useState("");

  const accepted = useMemo(
    () =>
      steps
        .filter((step) => appliedRepairIds.includes(step.id) && step.repair)
        .map((step) => ({
          action: step.action,
          suggestion: step.repair!.suggestion,
          rigorNote: step.repair!.rigorNote,
        })),
    [steps, appliedRepairIds],
  );

  useEffect(() => {
    if (accepted.length === 0) return;
    let cancelled = false;
    generatePreview(assignmentText, objective, accepted)
      .then((result) => {
        if (cancelled) return;
        setRevised(result);
        onRevised(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Could not rewrite the assignment.");
      });
    return () => { cancelled = true; };
  }, [assignmentText, objective, accepted, onRevised]);

  const loading = accepted.length > 0 && revised === null && message === "";

  return (
    <main className="workflow-main student-preview-screen">
      <ScreenHeading eyebrow="Preview" title="Student Preview" subtitle="A calmer path through the same academic work." />

      <section className="revision-compare" aria-label="Original and revised assignment">
        <article className="student-assignment">
          <header><p>Original</p><span>As students receive it today</span></header>
          <section className="student-goal"><p className="eyebrow">Your goal</p><h2>{objective}</h2></section>
          <pre className="assignment-body">{assignmentText}</pre>
        </article>

        <article className="student-assignment student-assignment--revised">
          <header>
            <p>Revised</p>
            <span>{revised ? revised.title : "With the repairs you accepted"}</span>
          </header>
          <section className="student-goal"><p className="eyebrow">Your goal</p><h2>{objective}</h2></section>

          {accepted.length === 0 && (
            <p className="revision-empty">
              No repairs accepted yet. Go back to the repair plan and apply one, and the
              rewritten assignment appears here.
            </p>
          )}

          {loading && (
            <p className="revision-empty" aria-live="polite">
              <Sparkles size={15} aria-hidden="true" /> Rewriting the assignment with your{" "}
              {accepted.length} accepted {accepted.length === 1 ? "repair" : "repairs"}…
            </p>
          )}

          {message !== "" && (
            <p className="revision-empty revision-empty--error" role="alert">{message}</p>
          )}

          {revised && (
            <pre className="assignment-body">{revised.revisedText}</pre>
          )}
        </article>
      </section>

      {revised && revised.changes.length > 0 && (
        <section className="revision-changes" aria-labelledby="changes-title">
          <h2 id="changes-title">What changed, and why</h2>
          <ol>
            {revised.changes.map((change) => (
              <li key={change.what}>
                <p><Check size={15} aria-hidden="true" /> {change.what}</p>
                <span>{change.why}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="student-layout">
        <aside className="access-tools" aria-labelledby="tools-title">
          <h2 id="tools-title">Access tools</h2>
          <p>Personalize how the assignment is presented.</p>
          <div>
            {ACCESS_TOOLS.map((tool) => (
              <label key={tool}><span>{tool}</span><input type="checkbox" checked={Boolean(tools[tool])} onChange={(event) => setTools((current) => ({ ...current, [tool]: event.target.checked }))} /><i aria-hidden="true" /></label>
            ))}
          </div>
        </aside>
      </div>
      <div className="screen-footer-actions"><button type="button" className="button button--secondary" onClick={() => goTo("repair")}><ArrowLeft size={16} aria-hidden="true" /> Back to repairs</button><ArrowButton onClick={() => goTo("complete")}>Finish analysis</ArrowButton></div>
    </main>
  );
}

export interface CompleteScreenProps {
  frictionCount: number;
  repairsApplied: number;
  goalPreserved: boolean;
  onExport: () => void;
  canExport: boolean;
  scoreBefore: number;
  scoreAfter: number;
}

export function CompleteScreen({ frictionCount, repairsApplied, goalPreserved, onExport, canExport, scoreBefore, scoreAfter }: CompleteScreenProps) {
  const { startOver } = useWorkflow();
  return (
    <main className="complete-screen">
      <div className="complete-mark" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow">Analysis complete</p>
      <h1 data-screen-heading tabIndex={-1}>Your task is ready.</h1>
      <p className="complete-intro">AccessLens addressed the detected accessibility friction while preserving the learning goal.</p>
      <div className="completion-facts">
        <p><CheckCircle2 size={18} aria-hidden="true" /><span>Learning goal {goalPreserved ? "preserved" : "needs review"}</span></p>
        <p><span>{frictionCount}</span><small>friction moments reviewed</small></p>
        <p><span>{repairsApplied}</span><small>repairs applied</small></p>
        {scoreAfter > scoreBefore && (
          <p className="complete-delta">
            <span>{scoreBefore}<em> → </em>{scoreAfter}</span>
            <small>task accessibility confidence, recomputed</small>
          </p>
        )}
      </div>
      <div className="complete-actions">
        <button type="button" className="button button--primary" onClick={onExport} disabled={!canExport}>
          Export revised assignment <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="button button--secondary" onClick={startOver}>Start another analysis</button>
      </div>
      {!canExport && (
        <p className="export-hint">Apply a repair and open the student preview to generate the revised assignment.</p>
      )}
      <p className="educator-note">AccessLens identifies potential task-level accessibility barriers. Educator judgment remains part of every decision.</p>
    </main>
  );
}
