import { analyzeMemory, analyzeTiming } from "./engine";
import { timeConstraintChangesOf } from "./schema";
import type {
  Analysis,
  BarrierType,
  Demands,
  FrictionMoment,
  RepairEffects,
  Step,
} from "./schema";

export type FrictionStatus = "resolved" | "unresolved" | "unverified";

export interface FrictionResolution {
  frictionId: string;
  status: FrictionStatus;
  reason: string;
}

export interface RepairApplication {
  analysis: Analysis;
  frictionResolutions: FrictionResolution[];
  appliedRepairIds: string[];
}

function applyEffects(demands: Demands, effects: RepairEffects): Demands {
  const next: Demands = { ...demands, sensory: { ...demands.sensory } };
  if (effects.reducesWorkingMemory && next.workingMemory >= 2) next.workingMemory = 1;
  if (effects.reducesFineMotor && next.fineMotor >= 2) next.fineMotor = 1;
  if (effects.reducesReadingLoad && next.readingLoad >= 2) next.readingLoad = 1;
  if (effects.addsNonColorCue) next.sensory.colorOnly = false;
  if (effects.addsCaptionOrTranscript) next.sensory.audioOnly = false;
  if (effects.addsResponseAlternative && next.communication !== "none") {
    next.communication = "multiple";
  }
  return next;
}

function localBarrierPresent(barrier: BarrierType, steps: readonly Step[]): boolean {
  switch (barrier) {
    case "fine_motor":
      return steps.some((step) => step.demands.fineMotor >= 2);
    case "reading_load":
      return steps.some((step) => step.demands.readingLoad >= 2);
    case "single_modality_communication":
      return steps.some(
        (step) =>
          step.demands.communication !== "none" &&
          step.demands.communication !== "multiple"
      );
    case "sensory_color_only":
      return steps.some((step) => step.demands.sensory.colorOnly);
    case "sensory_audio_only":
      return steps.some((step) => step.demands.sensory.audioOnly);
    default:
      return false;
  }
}

/**
 * Whether a memory barrier is still observable at the steps a finding names.
 *
 * A finding is about information carried between the steps it names, so both
 * ends of the carry have to fall inside it. Counting any item that merely
 * touched one of those steps meant an unrelated value passing through kept the
 * finding open after the repair had demonstrably worked: peak load fell from
 * four to one, every value the finding described was visible, and it still
 * reported that the barrier remained.
 */
function memoryPresent(analysis: Analysis, moment: FrictionMoment): boolean {
  const ids = new Set(moment.stepIds);
  const report = analyzeMemory(analysis.steps);
  return (
    report.carried.some(
      (item) => ids.has(item.producedAtStepId) && ids.has(item.consumedAtStepId)
    ) || report.overCapacityStepIds.some((stepId) => ids.has(stepId))
  );
}

function contextTransitions(analysis: Analysis, moment: FrictionMoment): number {
  const ids = new Set(moment.stepIds);
  return analysis.steps.filter(
    (step, index) => index > 0 && ids.has(step.id) && step.demands.contextSwitch
  ).length;
}

/**
 * Whether a clock the assignment actually states is still pressing on these
 * steps.
 *
 * Deliberately not the per-step timePressure rating. That rating is the model's
 * impression of a step, and a step can carry it with no stated timer anywhere
 * near it, in which case no timer repair can ever move it and the finding stays
 * open forever. A finding whose steps have no stated timer at all comes back
 * absent here, which resolutionFor already reports as unverified rather than as
 * a barrier that was fixed.
 */
function timingPresent(analysis: Analysis, moment: FrictionMoment): boolean {
  const ids = new Set(moment.stepIds);
  return analyzeTiming(analysis).constraints.some((constraint) => {
    const covered = constraint.stepIds.filter((stepId) => ids.has(stepId));
    if (covered.length === 0) return false;
    if (constraint.verdict !== "comfortable") return true;
    // A clock the student is still working under counts even where the
    // arithmetic leaves room, but only for steps the clock actually covers.
    return analysis.steps.some(
      (step) => covered.includes(step.id) && step.demands.timePressure >= 2
    );
  });
}

function barrierPresent(analysis: Analysis, moment: FrictionMoment): boolean | null {
  const ids = new Set(moment.stepIds);
  const steps = analysis.steps.filter((step) => ids.has(step.id));
  switch (moment.barrierType) {
    case "working_memory":
      return memoryPresent(analysis, moment);
    case "context_switching":
      return contextTransitions(analysis, moment) > 0;
    case "time_pressure":
      return timingPresent(analysis, moment);
    case "navigation_ambiguity":
      return null;
    default:
      return localBarrierPresent(moment.barrierType, steps);
  }
}

function relevantEffect(
  source: Analysis,
  repaired: Analysis,
  moment: FrictionMoment,
  effectsByStep: ReadonlyMap<string, RepairEffects>
): boolean {
  const ids = new Set(moment.stepIds);
  const referenced = [...effectsByStep].filter(([stepId]) => ids.has(stepId));
  switch (moment.barrierType) {
    case "working_memory":
      return referenced.some(
        ([, effects]) => effects.keepsInfoVisible || effects.reducesWorkingMemory
      );
    case "context_switching":
      return (
        [...effectsByStep.values()].some(
          (effects) => effects.replacementEnvironment !== null
        ) && contextTransitions(repaired, moment) < contextTransitions(source, moment)
      );
    case "fine_motor":
      return referenced.some(([, effects]) => effects.reducesFineMotor);
    case "reading_load":
      return referenced.some(([, effects]) => effects.reducesReadingLoad);
    case "single_modality_communication":
      return referenced.some(([, effects]) => effects.addsResponseAlternative);
    case "sensory_color_only":
      return referenced.some(([, effects]) => effects.addsNonColorCue);
    case "sensory_audio_only":
      return referenced.some(([, effects]) => effects.addsCaptionOrTranscript);
    case "navigation_ambiguity":
      return referenced.length > 0;
    case "time_pressure": {
      const relevantConstraintIds = new Set(
        source.timeConstraints
          .filter((constraint) => constraint.stepIds.some((stepId) => ids.has(stepId)))
          .map((constraint) => constraint.id)
      );
      return [...effectsByStep.values()].some((effects) =>
        timeConstraintChangesOf(effects).some((change) =>
          relevantConstraintIds.has(change.constraintId)
        )
      );
    }
  }
}

function resolutionFor(
  source: Analysis,
  repaired: Analysis,
  moment: FrictionMoment,
  effectsByStep: ReadonlyMap<string, RepairEffects>
): FrictionResolution {
  const changed = relevantEffect(source, repaired, moment, effectsByStep);
  if (!changed) {
    return {
      frictionId: moment.id,
      status: "unresolved",
      reason: "No accepted repair changed the measurement behind this finding.",
    };
  }

  const before = barrierPresent(source, moment);
  const after = barrierPresent(repaired, moment);
  if (before === null || after === null) {
    return {
      frictionId: moment.id,
      status: "unverified",
      reason: "The repair was applied, but this barrier is not represented by a measurable demand.",
    };
  }
  if (!before) {
    return {
      frictionId: moment.id,
      status: "unverified",
      reason: "The original task graph did not contain the measured condition claimed by this finding.",
    };
  }
  if (after) {
    return {
      frictionId: moment.id,
      status: "unresolved",
      reason: "The measured condition is still present after the accepted repair.",
    };
  }
  return {
    frictionId: moment.id,
    status: "resolved",
    reason: "The measured condition was present before and is absent after the repair.",
  };
}

/** Applies only the effects stated by accepted repairs and verifies outcomes. */
export function applyRepairs(
  source: Analysis,
  appliedStepIds: readonly string[]
): RepairApplication {
  const requested = new Set(appliedStepIds);
  const effectsByStep = new Map<string, RepairEffects>();
  const appliedRepairIds: string[] = [];

  let steps = source.steps.map((step) => {
    if (!requested.has(step.id) || step.repair === null) return step;
    const effects = step.repair.effects;
    effectsByStep.set(step.id, effects);
    appliedRepairIds.push(step.id);
    return {
      ...step,
      environment: effects.replacementEnvironment ?? step.environment,
      producedInfoStaysVisible: effects.keepsInfoVisible
        ? true
        : step.producedInfoStaysVisible,
      demands: applyEffects(step.demands, effects),
      repair: null,
    };
  });

  const changes = [...effectsByStep.values()].flatMap(
    (effects) => timeConstraintChangesOf(effects)
  );
  const removedConstraintIds = new Set(
    changes.filter((change) => change.action === "remove").map((change) => change.constraintId)
  );
  // Only a limit that is genuinely longer counts. Restating the existing one is
  // not a repair, and treating it as one would relax the time pressure on every
  // step the timer covers while the clock the student sees is unchanged.
  const currentLimits = new Map(
    source.timeConstraints.map((constraint) => [constraint.id, constraint.limitMinutes])
  );
  const replacementLimits = new Map(
    changes.flatMap((change) =>
      change.action === "set_limit" &&
      change.limitMinutes !== null &&
      change.limitMinutes > (currentLimits.get(change.constraintId) ?? 0)
        ? [[change.constraintId, change.limitMinutes] as const]
        : []
    )
  );
  const timeConstraints = source.timeConstraints.flatMap((constraint) => {
    if (removedConstraintIds.has(constraint.id)) return [];
    const limitMinutes = replacementLimits.get(constraint.id);
    return [{ ...constraint, limitMinutes: limitMinutes ?? constraint.limitMinutes }];
  });

  const removedStepIds = new Set(
    source.timeConstraints
      .filter((constraint) => removedConstraintIds.has(constraint.id))
      .flatMap((constraint) => constraint.stepIds)
  );
  const stillConstrainedStepIds = new Set(
    timeConstraints.flatMap((constraint) => constraint.stepIds)
  );
  const relaxedConstraintIds = new Set(
    analyzeTiming({ ...source, steps, timeConstraints }).constraints
      .filter(
        (constraint) =>
          replacementLimits.has(constraint.id) &&
          constraint.verdictConservative === "comfortable"
      )
      .map((constraint) => constraint.id)
  );
  const relaxedStepIds = new Set(
    timeConstraints
      .filter((constraint) => relaxedConstraintIds.has(constraint.id))
      .flatMap((constraint) => constraint.stepIds)
  );
  const pressuredByAnotherConstraint = new Set(
    timeConstraints
      .filter((constraint) => !relaxedConstraintIds.has(constraint.id))
      .flatMap((constraint) => constraint.stepIds)
  );
  steps = steps.map((step, index) => ({
    ...step,
    demands: {
      ...step.demands,
      timePressure:
        (removedStepIds.has(step.id) && !stillConstrainedStepIds.has(step.id))
          ? 0
          : relaxedStepIds.has(step.id) &&
              !pressuredByAnotherConstraint.has(step.id) &&
              step.demands.timePressure >= 2
            ? 1
            : step.demands.timePressure,
      contextSwitch:
        index > 0 && step.environment.trim() !== steps[index - 1].environment.trim(),
    },
  }));

  const analysis: Analysis = { ...source, steps, timeConstraints };
  const frictionResolutions = source.frictionMoments.map((moment) =>
    resolutionFor(source, analysis, moment, effectsByStep)
  );

  return { analysis, frictionResolutions, appliedRepairIds };
}

/** Steps that carry a repair the educator has not yet decided on. */
export function outstandingRepairs(analysis: Analysis, appliedStepIds: readonly string[]): number {
  const applied = new Set(appliedStepIds);
  return analysis.steps.filter((step) => step.repair !== null && !applied.has(step.id)).length;
}
