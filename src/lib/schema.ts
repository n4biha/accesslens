import { z } from "zod";

/**
 * The task graph is the contract between the model and the rest of AccessLens.
 * The model's only job is turning assignment prose into this shape; every number
 * the interface shows is computed from it by lib/engine.ts, and every standards
 * citation is looked up from it by lib/standards.ts.
 *
 * `.describe()` text is sent to the model as part of the JSON schema, so these
 * strings are load-bearing prompt content, not comments.
 */

export const COMMUNICATION_MODES = [
  "none",
  "typed",
  "written",
  "spoken",
  "handwritten",
  "video",
  "multiple",
] as const;

export const barrierTypeSchema = z.enum([
  "working_memory",
  "context_switching",
  "fine_motor",
  "time_pressure",
  "reading_load",
  "single_modality_communication",
  "sensory_color_only",
  "sensory_audio_only",
  "navigation_ambiguity",
]);

export const goalRelevanceSchema = z.enum([
  "essential",
  "related",
  "incidental",
  "unknown",
]);

export const demandsSchema = z.object({
  workingMemory: z
    .number()
    .describe(
      "How much the student must hold in mind at this step, 0-3. 0 = nothing, 3 = several unaided values or instructions."
    ),
  fineMotor: z
    .number()
    .describe(
      "Pointer precision this step demands, 0-3. 0 = none, 2 = clicking small targets, 3 = dragging, drawing, or handwriting."
    ),
  timePressure: z
    .number()
    .describe(
      "How much this step is constrained by a clock, 0-3. 0 = untimed, 3 = a hard timer that keeps running."
    ),
  readingLoad: z
    .number()
    .describe(
      "Volume and density of text the student must process here, 0-3."
    ),
  contextSwitch: z
    .boolean()
    .describe(
      "True when reaching this step means moving to a different application, tab, document, or physical medium than the previous step."
    ),
  sensory: z.object({
    colorOnly: z
      .boolean()
      .describe(
        "True when information here is conveyed by color alone, with no label, pattern, or text equivalent."
      ),
    audioOnly: z
      .boolean()
      .describe(
        "True when information the student must RECEIVE here arrives by sound alone, with no captions or transcript. This is about listening, never about speaking: a step where the student records or presents aloud is producing sound, which belongs in `communication`, and must leave this false."
      ),
  }),
  communication: z
    .enum(COMMUNICATION_MODES)
    .describe(
      "The single response modality this step forces, or 'none' when the student is not producing a response here."
    ),
  wordCount: z
    .number()
    .describe(
      "Approximate number of words the student must read at this step, including any linked reading the instructions name. 0 when there is nothing to read."
    ),
});

/**
 * What a repair actually changes. Without this a repair is only a sentence, and
 * applying it can only be modelled as "this step is fine now" — which is how a
 * memory fix ends up silently clearing an unrelated time limit. Each flag maps
 * to exactly one demand, so an applied repair moves that demand and no other.
 */
export const repairEffectsSchema = z.object({
  keepsInfoVisible: z
    .boolean()
    .describe(
      "True when the change keeps information this step produces on screen or on paper for the rest of the task, so the student no longer has to hold it in mind."
    ),
  reducesWorkingMemory: z
    .boolean()
    .describe("True when the change lowers how much the student must remember here."),
  reducesFineMotor: z
    .boolean()
    .describe(
      "True when the change offers a route that needs less pointer precision, such as a typed entry instead of a drag."
    ),
  // Flat rather than a list of change objects. A repair is one concrete change
  // to one step, so it touches at most one timer, and constrained decoding
  // compiles a grammar from this schema: nesting an array of objects this deep
  // pushed the whole analysis past the size the API will accept.
  timeConstraintId: z
    .string()
    .nullable()
    .describe(
      "The id of the stated timer this repair changes, or null when it does not change a timer."
    ),
  timeConstraintAction: z
    .enum(["remove", "set_limit"])
    .nullable()
    .describe(
      "Whether the timer named above is removed outright or given a new limit. Null when no timer changes."
    ),
  timeConstraintLimitMinutes: z
    .number()
    .nullable()
    .describe(
      "The replacement limit in minutes when the action is set_limit. Null when the timer is removed or unchanged."
    ),
  reducesReadingLoad: z
    .boolean()
    .describe(
      "True when the change cuts how much text the student must process here, for example by splitting a dense paragraph into numbered steps."
    ),
  addsNonColorCue: z
    .boolean()
    .describe(
      "True when the change adds a label, pattern, or text equivalent alongside information currently carried by color alone."
    ),
  addsCaptionOrTranscript: z
    .boolean()
    .describe(
      "True when the change adds captions or a transcript to information currently carried by sound alone."
    ),
  addsResponseAlternative: z
    .boolean()
    .describe(
      "True when the change lets the student respond in a different modality, so a single forced response mode is no longer the only route."
    ),
  replacementEnvironment: z
    .string()
    .nullable()
    .describe(
      "The environment this step moves into when a repair consolidates tools or locations, otherwise null."
    ),
});

export const repairSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "A concrete change the educator could make to this step, phrased as revised instructions rather than advice."
    ),
  effects: repairEffectsSchema.describe(
    "Exactly which demands this change moves. Set only effects the suggestion genuinely delivers; use false, empty arrays, and null when it moves no measured demand."
  ),
  barrierReduced: z
    .string()
    .describe("The functional demand this change removes or lowers."),
  rigorPreserved: z
    .boolean()
    .describe(
      "True when the locked learning objective is still assessed just as fully after this change."
    ),
  rigorNote: z
    .string()
    .describe(
      "One sentence explaining what the student must still demonstrate after the change, or what academic evidence would be lost if rigorPreserved is false."
    ),
});

export const stepSchema = z.object({
  id: z
    .string()
    .describe("Stable identifier for this step, e.g. 'step-1'."),
  action: z
    .string()
    .describe(
      "What the student does here, in plain language and the imperative-free third person, e.g. 'Reads the assignment instructions in Canvas'."
    ),
  environment: z
    .string()
    .describe(
      "Where this happens, e.g. 'Canvas', 'PhET simulation', 'Google Docs', 'physical notebook'."
    ),
  produces: z
    .array(z.string())
    .describe(
      "Snake_case identifiers for information the student obtains at this step and may need later, e.g. ['trial_1_concentration']. Empty when nothing new is produced."
    ),
  consumes: z
    .array(z.string())
    .describe(
      "Identifiers from an earlier step's `produces` that the student must have at hand here. Empty when this step needs nothing carried forward."
    ),
  producedInfoStaysVisible: z
    .boolean()
    .describe(
      "True when everything produced here remains on screen for the rest of the assignment. False when the student must record or memorize it because leaving this step makes it disappear."
    ),
  demands: demandsSchema,
  estimatedMinutes: z
    .number()
    .nullable()
    .describe(
      "How many minutes this one step occupies because the assignment states or implies a duration for it — a twenty-minute video to watch, a three-minute answer to record, a fifty-minute lab period. Null when the step has no stated duration and takes only as long as the work itself."
    ),
  evidence: z
    .string()
    .describe(
      "The sentence or clause from the assignment text that this step comes from, copied VERBATIM and exactly as written, including original punctuation. Never paraphrase or reconstruct."
    ),
  goalRelevance: goalRelevanceSchema.describe(
    "How this step's demands relate to the locked learning objective. 'essential' = the objective directly requires this ability. 'related' = it supports the learning but is not what is assessed. 'incidental' = required only because of how the assignment was built. 'unknown' = there is not enough information and the educator should decide."
  ),
  relevanceReason: z
    .string()
    .describe(
      "One sentence justifying the goalRelevance judgement by referring to the locked objective."
    ),
  repair: repairSchema
    .nullable()
    .describe("A proposed change, or null when this step needs no repair."),
});

export const frictionMomentSchema = z.object({
  id: z.string().describe("Stable identifier, e.g. 'friction-1'."),
  title: z
    .string()
    .describe(
      "Short name for what goes wrong here, phrased from the student's perspective, e.g. 'Results vanish before the quiz'."
    ),
  stepIds: z
    .array(z.string())
    .describe("The step ids this friction moment spans."),
  severity: z.enum(["low", "medium", "high"]),
  barrierType: barrierTypeSchema.describe(
    "The functional barrier category. Must be one of the listed values; this key selects the accessibility standard cited to the educator."
  ),
  explanation: z
    .string()
    .describe(
      "Two or three sentences explaining what the student experiences here and why the design causes it."
    ),
});

export const timeConstraintSchema = z.object({
  id: z.string().describe("Stable identifier for this timer, e.g. 'timer-1'."),
  limitMinutes: z
    .number()
    .describe("How many minutes the student has while this timer is active."),
  stepIds: z
    .array(z.string())
    .describe("The ids of every step completed while this timer is running."),
  evidence: z
    .string()
    .describe(
      "The sentence or clause stating the limit, copied verbatim from the assignment."
    ),
});

export const analysisSchema = z.object({
  timeConstraints: z
    .array(timeConstraintSchema)
    .describe(
      "Every independent timer or deadline, with the exact steps completed while it runs. Empty when the assignment is untimed. Artefact lengths and video durations belong on the step instead."
    ),
  steps: z.array(stepSchema).min(1).describe(
    "The complete sequence of actions a student performs, in order, from opening the assignment to submitting it. Never empty: every assignment has at least one step."
  ),
  frictionMoments: z
    .array(frictionMomentSchema)
    .describe("Points in the journey where the design creates avoidable difficulty."),
});

export const objectiveCandidateSchema = z.object({
  text: z
    .string()
    .describe(
      "A learning objective phrased as what the student should be able to do, e.g. 'Explain how concentration gradients influence molecular movement across a membrane.'"
    ),
  source: z
    .string()
    .describe(
      "Where this came from: a verbatim quote from the assignment, or 'inferred' when it was derived rather than stated."
    ),
});

export const objectiveExtractionSchema = z.object({
  objectives: z
    .array(objectiveCandidateSchema)
    .min(1)
    .describe(
      "Candidate objectives, most likely first, at least one and at most three. When the assignment states no objective, infer one and mark its source 'inferred' rather than returning nothing."
    ),
});

export const revisedAssignmentSchema = z.object({
  title: z
    .string()
    .describe("The assignment's own title, carried over unchanged."),
  revisedText: z
    .string()
    .describe(
      "The complete rewritten assignment as a student will read it: every instruction, in order, in the educator's voice. Plain text with blank lines between paragraphs and numbered steps where the original had them."
    ),
  changes: z
    .array(
      z.object({
        what: z
          .string()
          .describe("One short sentence naming what changed in the instructions."),
        why: z
          .string()
          .describe(
            "One short sentence naming the barrier this removes, and confirming the academic demand it leaves intact."
          ),
      })
    )
    .describe("One entry per accepted repair, in the order they appear in the assignment."),
});

/**
 * The analysis is requested in two passes because constrained decoding compiles
 * a grammar from the schema, and the whole task graph in one request exceeds the
 * size the API accepts. Splitting the repair out of the step is the seam that
 * fits on both sides: the graph is one call, the repairs are another.
 *
 * The two are merged back into `analysisSchema` before anything downstream sees
 * them, so the engine, the UI and the tests keep working with one shape.
 */
export const taskGraphSchema = z.object({
  timeConstraints: analysisSchema.shape.timeConstraints,
  steps: z.array(stepSchema.omit({ repair: true })).min(1).describe(
    "The complete sequence of actions a student performs, in order, from opening the assignment to submitting it. Never empty: every assignment has at least one step."
  ),
  frictionMoments: analysisSchema.shape.frictionMoments,
});

export const repairProposalsSchema = z.object({
  repairs: z
    .array(
      z.object({
        stepId: z
          .string()
          .describe("The id of the step this repair changes, exactly as given."),
        repair: repairSchema,
      })
    )
    .describe(
      "One entry for each step that needs a repair. Steps that need no change are simply left out."
    ),
});

export type TaskGraph = z.infer<typeof taskGraphSchema>;
export type RepairProposals = z.infer<typeof repairProposalsSchema>;

export const objectiveRequestSchema = z.object({
  assignmentText: z.string().trim().min(40),
});

export const analysisRequestSchema = objectiveRequestSchema.extend({
  lockedObjective: z.string().trim().min(1),
});

export const acceptedRepairSchema = z.object({
  action: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
  rigorNote: z.string().trim().min(1),
});

export const previewRequestSchema = analysisRequestSchema.extend({
  repairs: z.array(acceptedRepairSchema).min(1),
});

export const repairClassificationRequestSchema = z.object({
  lockedObjective: z.string().trim().min(1),
  analysis: analysisSchema,
  stepId: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
});

export type RevisedAssignment = z.infer<typeof revisedAssignmentSchema>;

export type Demands = z.infer<typeof demandsSchema>;
export type Repair = z.infer<typeof repairSchema>;
export type RepairEffects = z.infer<typeof repairEffectsSchema>;

export interface TimeConstraintChange {
  constraintId: string;
  action: "remove" | "set_limit";
  limitMinutes: number | null;
}

/**
 * The timer change a repair states, as a list so callers can treat "no timer
 * touched" and "one timer touched" the same way. The schema carries the fields
 * flat to keep the compiled grammar small; this is the shape to reason with.
 */
export function timeConstraintChangesOf(
  effects: RepairEffects
): TimeConstraintChange[] {
  if (!effects.timeConstraintId || effects.timeConstraintAction === null) return [];
  return [
    {
      constraintId: effects.timeConstraintId,
      action: effects.timeConstraintAction,
      limitMinutes: effects.timeConstraintLimitMinutes,
    },
  ];
}
export type Step = z.infer<typeof stepSchema>;
export type FrictionMoment = z.infer<typeof frictionMomentSchema>;
export type TimeConstraint = z.infer<typeof timeConstraintSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type BarrierType = z.infer<typeof barrierTypeSchema>;
export type GoalRelevance = z.infer<typeof goalRelevanceSchema>;
export type ObjectiveCandidate = z.infer<typeof objectiveCandidateSchema>;
export type ObjectiveExtraction = z.infer<typeof objectiveExtractionSchema>;
