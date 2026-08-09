import type { Analysis, Step, TimeConstraint } from "./schema";

export interface NormalizedAnalysis {
  analysis: Analysis;
  warnings: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function counts(values: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function renamedId(base: string, occurrence: number, reserved: Set<string>): string {
  let candidate = `${base || "step"}__${occurrence}`;
  let suffix = occurrence;
  while (reserved.has(candidate)) candidate = `${base || "step"}__${++suffix}`;
  reserved.add(candidate);
  return candidate;
}

/**
 * Repairs relationships the JSON schema cannot express. The model result stays
 * usable, but every discarded or rewritten relationship is reported so the UI
 * never silently attributes a finding to the wrong step.
 */
export function normalizeAnalysisGraph(source: Analysis): NormalizedAnalysis {
  const warnings: string[] = [];
  const originalStepIds = source.steps.map((step) => step.id.trim());
  const stepCounts = counts(originalStepIds);
  const reservedStepIds = new Set(
    originalStepIds.filter((id) => id && stepCounts.get(id) === 1)
  );
  const occurrences = new Map<string, number>();

  let steps: Step[] = source.steps.map((step) => {
    const originalId = step.id.trim();
    if (originalId && stepCounts.get(originalId) === 1) return { ...step, id: originalId };

    const occurrence = (occurrences.get(originalId) ?? 0) + 1;
    occurrences.set(originalId, occurrence);
    const id = renamedId(originalId, occurrence, reservedStepIds);
    warnings.push(
      `Step id "${originalId || "(empty)"}" was ambiguous and was renamed to "${id}"; references to the ambiguous id were removed.`
    );
    return { ...step, id };
  });

  const validReferenceIds = new Set(
    originalStepIds.filter((id) => id && stepCounts.get(id) === 1)
  );
  const producedEarlier = new Set<string>();
  steps = steps.map((step, index) => {
    const produces = unique(step.produces);
    const requestedConsumes = unique(step.consumes);
    const consumes = requestedConsumes.filter((item) => producedEarlier.has(item));
    if (produces.length !== step.produces.length) {
      warnings.push(`Duplicate or empty produced values were removed from step "${step.id}".`);
    }
    if (consumes.length !== step.consumes.length) {
      warnings.push(
        `Dependencies without an earlier producer were removed from step "${step.id}".`
      );
    }
    for (const item of produces) producedEarlier.add(item);
    const contextSwitch =
      index > 0 && step.environment.trim() !== steps[index - 1].environment.trim();
    if (contextSwitch !== step.demands.contextSwitch) {
      warnings.push(`Context switching was recomputed for step "${step.id}".`);
    }
    return {
      ...step,
      produces,
      consumes,
      demands: { ...step.demands, contextSwitch },
    };
  });

  const constraintCounts = counts(source.timeConstraints.map((constraint) => constraint.id.trim()));
  const reservedConstraintIds = new Set(
    source.timeConstraints
      .map((constraint) => constraint.id.trim())
      .filter((id) => id && constraintCounts.get(id) === 1)
  );
  const constraintOccurrences = new Map<string, number>();
  const timeConstraints: TimeConstraint[] = [];

  for (const constraint of source.timeConstraints) {
    const originalId = constraint.id.trim();
    let id = originalId;
    if (!originalId || constraintCounts.get(originalId) !== 1) {
      const occurrence = (constraintOccurrences.get(originalId) ?? 0) + 1;
      constraintOccurrences.set(originalId, occurrence);
      id = renamedId(originalId || "timer", occurrence, reservedConstraintIds);
      warnings.push(
        `Timer id "${originalId || "(empty)"}" was ambiguous and was renamed to "${id}"; repair references to the ambiguous id were removed.`
      );
    }

    const stepIds = unique(constraint.stepIds).filter((stepId) =>
      validReferenceIds.has(stepId)
    );
    if (stepIds.length !== constraint.stepIds.length) {
      warnings.push(`Invalid or duplicate step references were removed from timer "${id}".`);
    }
    if (stepIds.length === 0) {
      warnings.push(`Timer "${id}" was removed because it had no valid steps.`);
      continue;
    }
    timeConstraints.push({ ...constraint, id, stepIds });
  }

  const validConstraintIds = new Set(
    timeConstraints
      .map((constraint) => constraint.id)
      .filter((id) => constraintCounts.get(id) === 1)
  );
  steps = steps.map((step) => {
    if (step.repair === null) return step;
    const named = step.repair.effects.timeConstraintId;
    if (named === null || validConstraintIds.has(named)) return step;

    // The repair points at a timer this assignment does not have, so the claim
    // is dropped rather than allowed to clear a constraint by coincidence.
    warnings.push(`Invalid timer changes were removed from the repair on step "${step.id}".`);
    return {
      ...step,
      repair: {
        ...step.repair,
        effects: {
          ...step.repair.effects,
          timeConstraintId: null,
          timeConstraintAction: null,
          timeConstraintLimitMinutes: null,
        },
      },
    };
  });

  const frictionIdCounts = counts(source.frictionMoments.map((moment) => moment.id.trim()));
  const frictionOccurrences = new Map<string, number>();
  const reservedFrictionIds = new Set(
    source.frictionMoments
      .map((moment) => moment.id.trim())
      .filter((id) => id && frictionIdCounts.get(id) === 1)
  );
  const frictionMoments = source.frictionMoments.flatMap((moment) => {
    const originalId = moment.id.trim();
    let id = originalId;
    if (!originalId || frictionIdCounts.get(originalId) !== 1) {
      const occurrence = (frictionOccurrences.get(originalId) ?? 0) + 1;
      frictionOccurrences.set(originalId, occurrence);
      id = renamedId(originalId || "friction", occurrence, reservedFrictionIds);
      warnings.push(`Friction id "${originalId || "(empty)"}" was renamed to "${id}".`);
    }
    const stepIds = unique(moment.stepIds).filter((stepId) => validReferenceIds.has(stepId));
    if (stepIds.length !== moment.stepIds.length) {
      warnings.push(`Invalid or duplicate step references were removed from finding "${id}".`);
    }
    if (stepIds.length === 0) {
      warnings.push(`Finding "${id}" was removed because it had no valid steps.`);
      return [];
    }
    return [{ ...moment, id, stepIds }];
  });

  return {
    analysis: { ...source, steps, timeConstraints, frictionMoments },
    warnings,
  };
}
