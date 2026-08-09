import type { Analysis, Demands, Step } from "./schema";

/**
 * Applies accepted repairs to the task graph so the measurements move.
 *
 * Recording that a repair was accepted is not enough: the score, the constraint
 * tests and the journey all derive from step demands, so unless the demands
 * change the interface claims an improvement it never demonstrates. Each repair
 * relaxes only the demand it addresses — a repair is a targeted change, not a
 * blanket reset — and nothing here touches goal relevance or the academic
 * content of a step.
 */

function relax(demands: Demands): Demands {
  const next: Demands = {
    ...demands,
    sensory: { ...demands.sensory },
  };

  // Values kept visible no longer have to be held in mind.
  if (next.workingMemory >= 2) next.workingMemory = 1;

  // An alternative to dragging still needs a pointer, just not a precise one.
  if (next.fineMotor >= 2) next.fineMotor = 1;

  // Flexible timing removes the clock, not the work.
  if (next.timePressure >= 2) next.timePressure = 0;

  // A label or pattern alongside the colour, captions alongside the audio.
  next.sensory.colorOnly = false;
  next.sensory.audioOnly = false;

  // Offering written, recorded and live routes means speech is no longer the
  // only way through. "typed" stands for the least restrictive accepted route,
  // so a student who cannot speak is no longer blocked at this step.
  if (next.communication === "spoken" || next.communication === "handwritten" || next.communication === "video") {
    next.communication = "typed";
  }

  return next;
}

export function applyRepairs(analysis: Analysis, appliedStepIds: readonly string[]): Analysis {
  if (appliedStepIds.length === 0) return analysis;
  const applied = new Set(appliedStepIds);

  const steps: Step[] = analysis.steps.map((step) => {
    if (!applied.has(step.id) || step.repair === null) return step;
    return {
      ...step,
      // Information the repair keeps on screen is no longer carried in memory.
      producedInfoStaysVisible: true,
      demands: relax(step.demands),
      // Cleared in this measurement view only. The score penalises a step that
      // carries an *outstanding* repair, so leaving it set would keep charging
      // for a barrier the educator has already fixed and make a fully repaired
      // task unable to score clean. The original steps keep their repair text
      // for the repair plan and student preview.
      repair: null,
    };
  });

  // The stated limit only disappears once every step it pressed has been repaired;
  // repairing one timed step out of three does not make the assignment untimed.
  const stillTimed = analysis.steps.some(
    (step) => step.demands.timePressure >= 2 && !(applied.has(step.id) && step.repair !== null)
  );

  return {
    ...analysis,
    timeLimitMinutes: stillTimed ? analysis.timeLimitMinutes : null,
    steps,
  };
}

/** Steps that carry a repair the educator has not yet decided on. */
export function outstandingRepairs(analysis: Analysis, appliedStepIds: readonly string[]): number {
  const applied = new Set(appliedStepIds);
  return analysis.steps.filter((step) => step.repair !== null && !applied.has(step.id)).length;
}
