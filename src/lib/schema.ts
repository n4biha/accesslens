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
        "True when information here is conveyed by sound alone, with no captions or transcript."
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

export const repairSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "A concrete change the educator could make to this step, phrased as revised instructions rather than advice."
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

export const analysisSchema = z.object({
  timeLimitMinutes: z
    .number()
    .nullable()
    .describe(
      "A deadline the student must finish work within, in minutes — for example a quiz timer or a session that closes. Null when no such limit exists. This is NOT the length of an artefact the student produces: a three-minute recording, a four-minute presentation, or a twenty-minute video to watch are durations, not limits, and must leave this null."
    ),
  steps: z.array(stepSchema).describe(
    "The complete sequence of actions a student performs, in order, from opening the assignment to submitting it."
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
    .describe("Candidate objectives, most likely first, at most three."),
});

export type Demands = z.infer<typeof demandsSchema>;
export type Repair = z.infer<typeof repairSchema>;
export type Step = z.infer<typeof stepSchema>;
export type FrictionMoment = z.infer<typeof frictionMomentSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type BarrierType = z.infer<typeof barrierTypeSchema>;
export type GoalRelevance = z.infer<typeof goalRelevanceSchema>;
export type ObjectiveCandidate = z.infer<typeof objectiveCandidateSchema>;
export type ObjectiveExtraction = z.infer<typeof objectiveExtractionSchema>;
