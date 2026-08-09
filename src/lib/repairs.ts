import type { Analysis, BarrierType, Demands, RepairEffects, Step } from "./schema";

/**
 * Applies accepted repairs to the task graph so the measurements move.
 *
 * Recording that a repair was accepted is not enough: the score, the constraint
 * tests and the journey all derive from step demands, so unless the demands
 * change the interface claims an improvement it never demonstrates. Each repair
 * moves only the demands it actually addresses — accepting a fix for values
 * that vanish must not quietly cancel an unrelated time limit on the same step,
 * because "PASS after repair" would then be describing something the educator
 * never agreed to. Nothing here touches goal relevance or academic content.
 */

const NO_EFFECTS: RepairEffects = {
  keepsInfoVisible: false,
  reducesWorkingMemory: false,
  reducesFineMotor: false,
  removesTimePressure: false,
  reducesReadingLoad: false,
  addsNonColorCue: false,
  addsCaptionOrTranscript: false,
  addsResponseAlternative: false,
};

/**
 * What each barrier category implies a repair changes, used when the model did
 * not state the effects itself. Derived from the friction moment that flagged
 * the step, so the inference is still grounded in a specific finding rather
 * than in the shape of the step.
 */
const EFFECTS_BY_BARRIER: Record<BarrierType, Partial<RepairEffects>> = {
  working_memory: { keepsInfoVisible: true, reducesWorkingMemory: true },
  context_switching: { keepsInfoVisible: true, reducesWorkingMemory: true },
  fine_motor: { reducesFineMotor: true },
  time_pressure: { removesTimePressure: true },
  reading_load: { reducesReadingLoad: true },
  single_modality_communication: { addsResponseAlternative: true },
  sensory_color_only: { addsNonColorCue: true },
  sensory_audio_only: { addsCaptionOrTranscript: true },
  // Nothing in the demand schema measures how findable the next action is, so
  // there is no demand to move. The repair is still recorded; it just cannot
  // claim a measured improvement.
  navigation_ambiguity: {},
};

/** Last resort when a repaired step is not covered by any friction moment. */
const EFFECTS_BY_KEYWORD: Array<[RegExp, Partial<RepairEffects>]> = [
  [/memor|recall|hold in mind|remember/i, { keepsInfoVisible: true, reducesWorkingMemory: true }],
  [/visib|on screen|record.*value|write.*down/i, { keepsInfoVisible: true }],
  [/motor|drag|precision|pointer|dexterit/i, { reducesFineMotor: true }],
  [/tim(e|ing)|clock|deadline|pressure|rush/i, { removesTimePressure: true }],
  [/read|text|dens|wording|jargon/i, { reducesReadingLoad: true }],
  [/colou?r/i, { addsNonColorCue: true }],
  [/audio|caption|transcript|hearing|sound/i, { addsCaptionOrTranscript: true }],
  [/spoken|speech|verbal|modalit|oral|present/i, { addsResponseAlternative: true }],
];

function effectsFor(step: Step, barrierTypes: readonly BarrierType[]): RepairEffects {
  if (step.repair === null) return NO_EFFECTS;
  if (step.repair.effects) return step.repair.effects;

  const inferred: RepairEffects = { ...NO_EFFECTS };
  let matched = false;

  for (const barrier of barrierTypes) {
    Object.assign(inferred, EFFECTS_BY_BARRIER[barrier]);
    matched = true;
  }

  if (!matched) {
    const text = `${step.repair.barrierReduced} ${step.repair.suggestion}`;
    for (const [pattern, effects] of EFFECTS_BY_KEYWORD) {
      if (pattern.test(text)) Object.assign(inferred, effects);
    }
  }

  return inferred;
}

function applyEffects(demands: Demands, effects: RepairEffects): Demands {
  const next: Demands = { ...demands, sensory: { ...demands.sensory } };

  // Values kept visible no longer have to be held in mind.
  if (effects.reducesWorkingMemory && next.workingMemory >= 2) next.workingMemory = 1;

  // An alternative to dragging still needs a pointer, just not a precise one.
  if (effects.reducesFineMotor && next.fineMotor >= 2) next.fineMotor = 1;

  // Flexible timing removes the clock, not the work.
  if (effects.removesTimePressure && next.timePressure >= 2) next.timePressure = 0;

  // Chunked instructions leave the same content to read, but less at once.
  if (effects.reducesReadingLoad && next.readingLoad >= 2) next.readingLoad = 1;

  // A label or pattern alongside the colour, captions alongside the audio.
  if (effects.addsNonColorCue) next.sensory.colorOnly = false;
  if (effects.addsCaptionOrTranscript) next.sensory.audioOnly = false;

  // Offering written, recorded and live routes means speech is no longer the
  // only way through. "typed" stands for the least restrictive accepted route,
  // so a student who cannot speak is no longer blocked at this step.
  if (
    effects.addsResponseAlternative &&
    (next.communication === "spoken" ||
      next.communication === "handwritten" ||
      next.communication === "video")
  ) {
    next.communication = "typed";
  }

  return next;
}

/**
 * Whether a barrier category is still observable at a step. A friction moment
 * only clears once none of the steps it spans still shows its barrier, so
 * resolution is recomputed from the repaired demands rather than assumed from
 * the fact that a repair was accepted.
 */
const STILL_PRESENT: Record<BarrierType, (step: Step) => boolean> = {
  // Mirrors how the engine measures memory: what matters is information that
  // has to survive unaided, not the step's own rating in isolation. A step that
  // merely rates a 2 while holding and needing nothing is not where the barrier
  // lives, and treating it as such would leave a resolved moment open forever.
  working_memory: (step) =>
    step.demands.workingMemory >= 3 ||
    (step.demands.workingMemory >= 2 && step.consumes.length > 0) ||
    (step.produces.length > 0 && !step.producedInfoStaysVisible),
  context_switching: (step) =>
    step.demands.contextSwitch &&
    step.produces.length > 0 &&
    !step.producedInfoStaysVisible,
  fine_motor: (step) => step.demands.fineMotor >= 2,
  time_pressure: (step) => step.demands.timePressure >= 2,
  reading_load: (step) => step.demands.readingLoad >= 2,
  single_modality_communication: (step) =>
    step.demands.communication !== "none" && step.demands.communication !== "typed",
  sensory_color_only: (step) => step.demands.sensory.colorOnly,
  sensory_audio_only: (step) => step.demands.sensory.audioOnly,
  // No demand describes navigation clarity, so this can never be shown resolved.
  navigation_ambiguity: () => true,
};

export function applyRepairs(analysis: Analysis, appliedStepIds: readonly string[]): Analysis {
  if (appliedStepIds.length === 0) return analysis;
  const applied = new Set(appliedStepIds);

  // Which barriers were flagged at each step, so a repair without stated
  // effects can be resolved against the finding that prompted it.
  const barriersByStep = new Map<string, BarrierType[]>();
  for (const moment of analysis.frictionMoments) {
    for (const stepId of moment.stepIds) {
      const list = barriersByStep.get(stepId) ?? [];
      list.push(moment.barrierType);
      barriersByStep.set(stepId, list);
    }
  }

  const effectsByStep = new Map<string, RepairEffects>();

  const steps: Step[] = analysis.steps.map((step) => {
    if (!applied.has(step.id) || step.repair === null) return step;

    const effects = effectsFor(step, barriersByStep.get(step.id) ?? []);
    effectsByStep.set(step.id, effects);

    return {
      ...step,
      producedInfoStaysVisible: effects.keepsInfoVisible ? true : step.producedInfoStaysVisible,
      demands: applyEffects(step.demands, effects),
      // Cleared in this measurement view only. The score penalises a step that
      // carries an *outstanding* repair, so leaving it set would keep charging
      // for a barrier the educator has already fixed and make a fully repaired
      // task unable to score clean. The original steps keep their repair text
      // for the repair plan and student preview.
      repair: null,
    };
  });

  const repairedById = new Map(steps.map((step) => [step.id, step]));

  // A friction moment survives while any step it spans still shows its barrier
  // in the repaired graph. Dropping the resolved ones matters because the score
  // deducts per moment: without this, repairing every barrier would still be
  // charged for all of them.
  const frictionMoments = analysis.frictionMoments.filter((moment) =>
    moment.stepIds.some((stepId) => {
      const step = repairedById.get(stepId);
      return step === undefined || STILL_PRESENT[moment.barrierType](step);
    })
  );

  // The stated limit only disappears once every step it pressed has been
  // repaired *by a repair that actually addresses timing*; repairing one timed
  // step out of three does not make the assignment untimed.
  const stillTimed = analysis.steps.some(
    (step) =>
      step.demands.timePressure >= 2 &&
      !(applied.has(step.id) && step.repair !== null && effectsByStep.get(step.id)?.removesTimePressure)
  );

  return {
    ...analysis,
    timeLimitMinutes: stillTimed ? analysis.timeLimitMinutes : null,
    frictionMoments,
    steps,
  };
}

/** Steps that carry a repair the educator has not yet decided on. */
export function outstandingRepairs(analysis: Analysis, appliedStepIds: readonly string[]): number {
  const applied = new Set(appliedStepIds);
  return analysis.steps.filter((step) => step.repair !== null && !applied.has(step.id)).length;
}
