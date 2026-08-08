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

export interface TimingReport {
  timeLimitMinutes: number | null;
  totalWords: number;
  readingMinutesMean: number;
  readingMinutesConservative: number;
  actionMinutes: number;
  requiredMinutesMean: number;
  requiredMinutesConservative: number;
  verdict: TimingVerdict;
  verdictConservative: TimingVerdict;
  /** Fraction of the limit consumed at the mean reading rate; null when untimed. */
  utilizationMean: number | null;
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

function verdictFor(required: number, limit: number | null): TimingVerdict {
  if (limit === null) return "untimed";
  const ratio = required / limit;
  if (ratio > 1) return "infeasible";
  if (ratio > 0.7) return "tight";
  return "comfortable";
}

export function analyzeTiming(analysis: Analysis): TimingReport {
  const { steps, timeLimitMinutes } = analysis;

  const totalWords = steps.reduce(
    (sum, step) => sum + Math.max(0, step.demands.wordCount || 0),
    0
  );

  const actionSeconds = steps.reduce((sum, step) => {
    let seconds = BASE_SECONDS_PER_STEP;
    if (step.demands.fineMotor >= 2) seconds += PRECISION_STEP_EXTRA_SECONDS;
    if (step.demands.communication !== "none") seconds += RESPONSE_STEP_EXTRA_SECONDS;
    return sum + seconds;
  }, 0);

  const actionMinutes = actionSeconds / 60;
  const readingMinutesMean = totalWords / MEAN_READING_WPM;
  const readingMinutesConservative = totalWords / CONSERVATIVE_READING_WPM;
  const requiredMinutesMean = readingMinutesMean + actionMinutes;
  const requiredMinutesConservative = readingMinutesConservative + actionMinutes;

  return {
    timeLimitMinutes,
    totalWords,
    readingMinutesMean: round(readingMinutesMean),
    readingMinutesConservative: round(readingMinutesConservative),
    actionMinutes: round(actionMinutes),
    requiredMinutesMean: round(requiredMinutesMean),
    requiredMinutesConservative: round(requiredMinutesConservative),
    verdict: verdictFor(requiredMinutesMean, timeLimitMinutes),
    verdictConservative: verdictFor(requiredMinutesConservative, timeLimitMinutes),
    utilizationMean:
      timeLimitMinutes === null
        ? null
        : round(requiredMinutesMean / timeLimitMinutes, 2),
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

export function runEngine(analysis: Analysis, assignmentText: string): EngineReport {
  return {
    memory: analyzeMemory(analysis.steps),
    switching: analyzeSwitching(analysis.steps),
    timing: analyzeTiming(analysis),
    text: analyzeText(assignmentText),
  };
}
