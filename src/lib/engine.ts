import rs from "text-readability";
import type { Analysis, Step } from "./schema";

/**
 * Deterministic analysis. The model supplies the task graph; every number the
 * interface shows is computed here, from that graph, with no further model
 * involvement. Same graph in, same numbers out — that reproducibility is what
 * lets a barrier trace cite a measurement rather than an opinion.
 */

/** Cowan (2001): working memory holds ~4 chunks without rehearsal or external aids. */
export const WORKING_MEMORY_CAPACITY = 4;

/** Brysbaert (2019): mean adult silent reading rate for non-fiction. */
export const MEAN_READING_WPM = 238;

/**
 * A deliberately cautious rate standing in for the slower end of the
 * distribution. Not attributed to any specific group: the reading-rate
 * literature for dyslexic and second-language readers is too varied to put a
 * single defensible number on, so this is labelled "conservative" everywhere
 * it surfaces.
 */
export const CONSERVATIVE_READING_WPM = 130;

const BASE_SECONDS_PER_STEP = 30;
const PRECISION_STEP_EXTRA_SECONDS = 30;
const RESPONSE_STEP_EXTRA_SECONDS = 60;

const INSTRUCTION_VERBS = new Set([
  "open", "read", "watch", "listen", "complete", "answer", "submit", "record",
  "drag", "click", "select", "choose", "calculate", "compute", "explain",
  "describe", "write", "type", "remember", "note", "use", "return", "navigate",
  "download", "upload", "review", "compare", "identify", "measure", "observe",
  "adjust", "set", "run", "find", "go", "click", "enter", "upload", "save",
  "summarize", "discuss", "present", "create", "draw", "label", "check",
]);

export interface CarriedItem {
  id: string;
  producedAtStepId: string;
  consumedAtStepId: string;
  stepsCarried: number;
  switchesCrossed: number;
  decayRisk: boolean;
}

export interface StepMemoryLoad {
  stepId: string;
  liveItems: string[];
  load: number;
  overCapacity: boolean;
}

export interface MemoryReport {
  capacity: number;
  peakLoad: number;
  peakStepId: string | null;
  perStep: StepMemoryLoad[];
  carried: CarriedItem[];
  overCapacityStepIds: string[];
}

export interface SwitchingReport {
  transitions: number;
  bounces: number;
  uniqueEnvironments: string[];
  sequence: string[];
}

export type TimingVerdict = "untimed" | "comfortable" | "tight" | "infeasible";

export interface TimeConstraintMeasurement {
  id: string;
  limitMinutes: number;
  stepIds: string[];
  requiredMinutesMean: number;
  requiredMinutesConservative: number;
  verdict: Exclude<TimingVerdict, "untimed">;
  verdictConservative: Exclude<TimingVerdict, "untimed">;
  utilizationMean: number;
}

export interface TimingReport {
  totalWords: number;
  readingMinutesMean: number;
  readingMinutesConservative: number;
  actionMinutes: number;
  requiredMinutesMean: number;
  requiredMinutesConservative: number;
  constraints: TimeConstraintMeasurement[];
  verdict: TimingVerdict;
  verdictConservative: TimingVerdict;
}

export interface TextReport {
  wordCount: number;
  sentenceCount: number;
  fleschKincaidGrade: number;
  smogIndex: number;
  instructionDensity: number;
  densestParagraphIndex: number | null;
}

export interface EngineReport {
  memory: MemoryReport;
  switching: SwitchingReport;
  timing: TimingReport;
  text: TextReport;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Liveness analysis over the information-dependency graph, the same shape as a
 * compiler's live-variable pass. An item is live from the step that produces it
 * through the last step that consumes it; it only counts against working memory
 * when the producing step does not keep it visible.
 */
export function analyzeMemory(steps: Step[]): MemoryReport {
  const producedAt = new Map<string, number>();
  const staysVisible = new Map<string, boolean>();
  const lastConsumedAt = new Map<string, number>();

  steps.forEach((step, index) => {
    for (const item of step.produces) {
      if (!producedAt.has(item)) {
        producedAt.set(item, index);
        staysVisible.set(item, step.producedInfoStaysVisible);
      }
    }
  });

  steps.forEach((step, index) => {
    for (const item of step.consumes) {
      const origin = producedAt.get(item);
      if (origin === undefined || index <= origin) continue;
      lastConsumedAt.set(item, index);
    }
  });

  const carried: CarriedItem[] = [];
  for (const [item, end] of lastConsumedAt) {
    const start = producedAt.get(item)!;
    if (staysVisible.get(item)) continue;

    let switchesCrossed = 0;
    for (let i = start + 1; i <= end; i++) {
      if (steps[i].demands.contextSwitch) switchesCrossed++;
    }

    carried.push({
      id: item,
      producedAtStepId: steps[start].id,
      consumedAtStepId: steps[end].id,
      stepsCarried: end - start,
      switchesCrossed,
      decayRisk: switchesCrossed >= 1,
    });
  }

  const perStep: StepMemoryLoad[] = steps.map((step, index) => {
    const liveItems = carried
      .filter((item) => {
        const start = producedAt.get(item.id)!;
        const end = lastConsumedAt.get(item.id)!;
        return index >= start && index <= end;
      })
      .map((item) => item.id);

    return {
      stepId: step.id,
      liveItems,
      load: liveItems.length,
      overCapacity: liveItems.length > WORKING_MEMORY_CAPACITY,
    };
  });

  let peakLoad = 0;
  let peakStepId: string | null = null;
  for (const entry of perStep) {
    if (entry.load > peakLoad) {
      peakLoad = entry.load;
      peakStepId = entry.stepId;
    }
  }

  return {
    capacity: WORKING_MEMORY_CAPACITY,
    peakLoad,
    peakStepId,
    perStep,
    carried: carried.sort((a, b) => b.stepsCarried - a.stepsCarried),
    overCapacityStepIds: perStep.filter((s) => s.overCapacity).map((s) => s.stepId),
  };
}

export function analyzeSwitching(steps: Step[]): SwitchingReport {
  const sequence = steps.map((step) => step.environment.trim());

  let transitions = 0;
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] !== sequence[i - 1]) transitions++;
  }

  let bounces = 0;
  for (let i = 1; i < sequence.length - 1; i++) {
    if (sequence[i] !== sequence[i - 1] && sequence[i + 1] === sequence[i - 1]) {
      bounces++;
    }
  }

  return {
    transitions,
    bounces,
    uniqueEnvironments: [...new Set(sequence)],
    sequence,
  };
}

function verdictFor(
  required: number,
  limit: number
): Exclude<TimingVerdict, "untimed"> {
  const ratio = required / limit;
  if (ratio > 1) return "infeasible";
  if (ratio > 0.7) return "tight";
  return "comfortable";
}

function stepSeconds(step: Step): number {
  // A step the assignment gives a duration to costs that duration: a
  // twenty-minute video is twenty minutes of the student's time, not the
  // thirty seconds a generic step is worth.
  const stated = step.estimatedMinutes;
  if (stated !== null && stated > 0) return stated * 60;

  let seconds = BASE_SECONDS_PER_STEP;
  if (step.demands.fineMotor >= 2) seconds += PRECISION_STEP_EXTRA_SECONDS;
  if (step.demands.communication !== "none") seconds += RESPONSE_STEP_EXTRA_SECONDS;
  return seconds;
}

function cost(steps: Step[]): { words: number; minutes: number } {
  return {
    words: steps.reduce((sum, step) => sum + Math.max(0, step.demands.wordCount || 0), 0),
    minutes: steps.reduce((sum, step) => sum + stepSeconds(step), 0) / 60,
  };
}

export function analyzeTiming(analysis: Analysis): TimingReport {
  const { steps } = analysis;

  const whole = cost(steps);
  const totalWords = whole.words;
  const actionMinutes = whole.minutes;
  const readingMinutesMean = totalWords / MEAN_READING_WPM;
  const readingMinutesConservative = totalWords / CONSERVATIVE_READING_WPM;
  const requiredMinutesMean = readingMinutesMean + actionMinutes;
  const requiredMinutesConservative = readingMinutesConservative + actionMinutes;

  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const constraints: TimeConstraintMeasurement[] = analysis.timeConstraints.map(
    (constraint) => {
      const scopedSteps = constraint.stepIds.flatMap((stepId) => {
        const step = stepsById.get(stepId);
        return step ? [step] : [];
      });
      const scoped = cost(scopedSteps);
      const scopedMean = scoped.words / MEAN_READING_WPM + scoped.minutes;
      const scopedConservative = scoped.words / CONSERVATIVE_READING_WPM + scoped.minutes;
      return {
        id: constraint.id,
        limitMinutes: constraint.limitMinutes,
        stepIds: constraint.stepIds,
        requiredMinutesMean: round(scopedMean),
        requiredMinutesConservative: round(scopedConservative),
        verdict: verdictFor(scopedMean, constraint.limitMinutes),
        verdictConservative: verdictFor(scopedConservative, constraint.limitMinutes),
        utilizationMean: round(scopedMean / constraint.limitMinutes, 2),
      };
    }
  );

  const worst = (
    field: "verdict" | "verdictConservative"
  ): TimingVerdict => {
    if (constraints.length === 0) return "untimed";
    const rank: Record<Exclude<TimingVerdict, "untimed">, number> = {
      comfortable: 0,
      tight: 1,
      infeasible: 2,
    };
    return constraints.reduce(
      (current, constraint) =>
        rank[constraint[field]] > rank[current] ? constraint[field] : current,
      "comfortable" as Exclude<TimingVerdict, "untimed">
    );
  };

  return {
    totalWords,
    readingMinutesMean: round(readingMinutesMean),
    readingMinutesConservative: round(readingMinutesConservative),
    actionMinutes: round(actionMinutes),
    requiredMinutesMean: round(requiredMinutesMean),
    requiredMinutesConservative: round(requiredMinutesConservative),
    constraints,
    verdict: worst("verdict"),
    verdictConservative: worst("verdictConservative"),
  };
}

function countInstructionSentences(paragraph: string): number {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const first = sentence.trim().toLowerCase().match(/^[a-z]+/);
      return first !== null && INSTRUCTION_VERBS.has(first[0]);
    }).length;
}

export function analyzeText(assignmentText: string): TextReport {
  const trimmed = assignmentText.trim();
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  let instructionDensity = 0;
  let densestParagraphIndex: number | null = null;
  paragraphs.forEach((paragraph, index) => {
    const count = countInstructionSentences(paragraph);
    if (count > instructionDensity) {
      instructionDensity = count;
      densestParagraphIndex = index;
    }
  });

  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  let fleschKincaidGrade = 0;
  let smogIndex = 0;
  let sentenceCount = 0;
  if (trimmed.length > 0) {
    fleschKincaidGrade = round(rs.fleschKincaidGrade(trimmed));
    smogIndex = round(rs.smogIndex(trimmed));
    sentenceCount = rs.sentenceCount(trimmed);
  }

  return {
    wordCount,
    sentenceCount,
    fleschKincaidGrade,
    smogIndex,
    instructionDensity,
    densestParagraphIndex,
  };
}

export interface ScoreDeduction {
  label: string;
  points: number;
}

export interface AccessibilityScore {
  score: number;
  breakdown: ScoreDeduction[];
}

/**
 * A single figure for how much task-level friction the design carries. It is
 * derived entirely from measurements above and from the goal-relevance calls
 * the educator can see and overrule — there is no model-supplied number in it,
 * and the breakdown is surfaced in the interface so any figure can be traced
 * back to the thing that caused it.
 *
 * Deliberately not a compliance score: it says nothing about WCAG conformance.
 */
export function scoreAccessibility(
  report: EngineReport,
  analysis: Analysis,
  resolvedFrictionIds: ReadonlySet<string> = new Set()
): AccessibilityScore {
  const breakdown: ScoreDeduction[] = [];
  const deduct = (label: string, points: number) => {
    if (points > 0) breakdown.push({ label, points: -points });
  };

  const overCapacity = Math.max(0, report.memory.peakLoad - report.memory.capacity);
  deduct(
    `Working memory ${report.memory.peakLoad} items at peak, above the ~${report.memory.capacity}-item capacity`,
    overCapacity * 8
  );

  const decaying = report.memory.carried.filter((item) => item.decayRisk).length;
  deduct(
    `${decaying} value${decaying === 1 ? "" : "s"} carried across an environment change`,
    decaying * 5
  );

  const extraSwitches = Math.max(0, report.switching.transitions - 3);
  deduct(`${report.switching.transitions} environment switches`, extraSwitches * 3);

  if (report.timing.verdict === "infeasible") {
    deduct("Time limit is shorter than the task requires", 15);
  } else if (report.timing.verdict === "tight") {
    deduct("Time limit leaves little margin", 8);
  }
  if (
    report.timing.verdict !== "infeasible" &&
    report.timing.verdictConservative === "infeasible"
  ) {
    deduct("A slower reader would run out of time", 5);
  }

  const activeFriction = analysis.frictionMoments.filter(
    (friction) => !resolvedFrictionIds.has(friction.id)
  );
  const high = activeFriction.filter((f) => f.severity === "high").length;
  const medium = activeFriction.filter((f) => f.severity === "medium").length;
  deduct(`${high} high-severity friction moment${high === 1 ? "" : "s"}`, high * 4);
  deduct(`${medium} moderate friction moment${medium === 1 ? "" : "s"}`, medium * 2);

  const incidental = analysis.steps.filter(
    (step) => step.goalRelevance === "incidental" && step.repair !== null
  ).length;
  deduct(
    `${incidental} repairable demand${incidental === 1 ? "" : "s"} unrelated to the goal`,
    incidental * 2
  );

  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  return { score: Math.max(0, Math.min(100, 100 + total)), breakdown };
}

/**
 * Brings a model-supplied graph inside the ranges the schema describes.
 *
 * The demand levels are documented as 0-3 and every threshold in this file and
 * in the constraint tests assumes it. Rejecting an out-of-range value would
 * throw away an entire analysis over one integer, so the value is clamped and
 * the rest of the work survives — the same reasoning that blanks an unverified
 * quote rather than discarding the step it came from.
 */
export function clampAnalysis(analysis: Analysis): Analysis {
  const level = (value: number) =>
    Number.isFinite(value) ? Math.min(3, Math.max(0, Math.round(value))) : 0;
  const nonNegative = (value: number) =>
    Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

  return {
    ...analysis,
    timeConstraints: analysis.timeConstraints.flatMap((constraint) =>
      Number.isFinite(constraint.limitMinutes) && constraint.limitMinutes > 0
        ? [{ ...constraint, limitMinutes: constraint.limitMinutes }]
        : []
    ),
    steps: analysis.steps.map((step) => ({
      ...step,
      estimatedMinutes:
        step.estimatedMinutes !== null && step.estimatedMinutes > 0
          ? step.estimatedMinutes
          : null,
      demands: {
        ...step.demands,
        workingMemory: level(step.demands.workingMemory),
        fineMotor: level(step.demands.fineMotor),
        timePressure: level(step.demands.timePressure),
        readingLoad: level(step.demands.readingLoad),
        wordCount: nonNegative(step.demands.wordCount),
      },
    })),
  };
}

export function runEngine(analysis: Analysis, assignmentText: string): EngineReport {
  return {
    memory: analyzeMemory(analysis.steps),
    switching: analyzeSwitching(analysis.steps),
    timing: analyzeTiming(analysis),
    text: analyzeText(assignmentText),
  };
}
