import type { Analysis, ObjectiveCandidate, Step } from "@/lib/schema";

export interface Sample {
  id: string;
  title: string;
  course: string;
  text: string;
  objectives: ObjectiveCandidate[];
  analysis: Analysis;
}

export const BIOLOGY_TEXT = `Diffusion Lab: Concentration Gradients

Read the instructions below and the linked background article before you begin.

Open the PhET diffusion simulation in a new tab. Adjust the concentration slider for each of three trials, and drag the molecule markers into the chamber to set up each run.

Observe and remember your three equilibrium values. The simulation does not save your results, so make sure you have them before you close the tab.

Close the simulation and return to Canvas. Find the Module 4 quiz and enter your three values.

Answer questions 1 through 5 within twelve minutes. The timer starts when you open the quiz and does not pause.

Finally, record a two-minute spoken explanation of what you observed and submit it with the quiz.`;

const TRIALS = ["equilibrium_trial_1", "equilibrium_trial_2", "equilibrium_trial_3"];

const steps: Step[] = [
  {
    id: "s1",
    action: "Reads the assignment instructions in Canvas",
    environment: "Canvas",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 1,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 2,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 140,
    },
    evidence: "Read the instructions below",
    goalRelevance: "related",
    relevanceReason:
      "Understanding the task is necessary, though reading speed is not what the objective assesses.",
    repair: null,
  },
  {
    id: "s2",
    action: "Opens and reads the linked background article",
    environment: "External article",
    produces: ["gradient_concept"],
    consumes: [],
    producedInfoStaysVisible: false,
    demands: {
      workingMemory: 2,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 3,
      contextSwitch: true,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 1400,
    },
    evidence: "the linked background article before you begin",
    goalRelevance: "essential",
    relevanceReason:
      "The article supplies the concentration-gradient concept the objective asks the student to explain.",
    repair: null,
  },
  {
    id: "s3",
    action: "Opens the PhET diffusion simulation in a second tab",
    environment: "PhET simulation",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 0,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: true,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
    },
    evidence: "Open the PhET diffusion simulation in a new tab.",
    goalRelevance: "related",
    relevanceReason:
      "The simulation is the evidence source for the explanation, but opening it is mechanical.",
    repair: null,
  },
  {
    id: "s4",
    action: "Drags molecule markers into the chamber and adjusts the concentration slider",
    environment: "PhET simulation",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 1,
      fineMotor: 3,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
    },
    evidence: "drag the molecule markers into the chamber to set up each run",
    goalRelevance: "incidental",
    relevanceReason:
      "Deciding where each molecule belongs is the scientific reasoning; performing that placement by dragging is not part of the objective.",
    repair: {
      suggestion:
        "Allow students to either drag a molecule or select it and choose its destination from a list.",
      barrierReduced: "Fine-motor precision",
      rigorPreserved: true,
      rigorNote:
        "The student still decides where each molecule belongs and why, which is the reasoning being assessed.",
    },
  },
  {
    id: "s5",
    action: "Observes and memorises three equilibrium values before closing the tab",
    environment: "PhET simulation",
    produces: TRIALS,
    consumes: [],
    producedInfoStaysVisible: false,
    demands: {
      workingMemory: 3,
      fineMotor: 0,
      timePressure: 1,
      readingLoad: 1,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 40,
    },
    evidence: "Observe and remember your three equilibrium values.",
    goalRelevance: "incidental",
    relevanceReason:
      "The objective is about explaining molecular movement, not about retaining arbitrary numbers across applications.",
    repair: {
      suggestion:
        "Add a results panel that stays visible beside the quiz, or a notes field that carries the recorded values forward automatically.",
      barrierReduced: "Working-memory dependency",
      rigorPreserved: true,
      rigorNote:
        "Students still gather and interpret their own data; only the requirement to memorise it disappears.",
    },
  },
  {
    id: "s6",
    action: "Closes the simulation and returns to Canvas",
    environment: "Canvas",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 2,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: true,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
    },
    evidence: "Close the simulation and return to Canvas.",
    goalRelevance: "incidental",
    relevanceReason:
      "Navigating between environments is a consequence of how the assignment was assembled.",
    repair: null,
  },
  {
    id: "s7",
    action: "Locates the Module 4 quiz",
    environment: "Canvas",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 1,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 1,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 60,
    },
    evidence: "Find the Module 4 quiz",
    goalRelevance: "incidental",
    relevanceReason:
      "Finding the quiz is navigation, unrelated to understanding diffusion.",
    repair: {
      suggestion: "Link directly to the quiz from the instructions.",
      barrierReduced: "Unclear destination",
      rigorPreserved: true,
      rigorNote: "No academic content changes.",
    },
  },
  {
    id: "s8",
    action: "Enters the three remembered values into the quiz",
    environment: "Canvas quiz",
    produces: [],
    consumes: TRIALS,
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 3,
      fineMotor: 0,
      timePressure: 3,
      readingLoad: 1,
      contextSwitch: true,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "typed",
      wordCount: 40,
    },
    evidence: "enter your three values",
    goalRelevance: "incidental",
    relevanceReason:
      "Recalling numbers under time pressure measures memory, not the molecular reasoning being assessed.",
    repair: {
      suggestion:
        "Show the student's recorded observations alongside the quiz questions.",
      barrierReduced: "Working-memory dependency across a context switch",
      rigorPreserved: true,
      rigorNote:
        "The values are the student's own measurements; displaying them does not answer any question for them.",
    },
  },
  {
    id: "s9",
    action: "Answers questions 1 to 5 against a running twelve-minute timer",
    environment: "Canvas quiz",
    produces: [],
    consumes: ["gradient_concept"],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 2,
      fineMotor: 0,
      timePressure: 3,
      readingLoad: 2,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "typed",
      wordCount: 220,
    },
    evidence: "Answer questions 1 through 5 within twelve minutes.",
    goalRelevance: "essential",
    relevanceReason:
      "The questions themselves assess the locked objective, though the time limit is a separate demand.",
    repair: {
      suggestion:
        "Remove the twelve-minute limit, or extend it, unless completing the reasoning quickly is itself being assessed.",
      barrierReduced: "Processing-speed pressure",
      rigorPreserved: true,
      rigorNote:
        "Students answer the same questions with the same evidence; only the clock changes.",
    },
  },
  {
    id: "s10",
    action: "Records a two-minute spoken explanation",
    environment: "Recording tool",
    produces: [],
    consumes: ["gradient_concept"],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 2,
      fineMotor: 1,
      timePressure: 2,
      readingLoad: 0,
      contextSwitch: true,
      sensory: { colorOnly: false, audioOnly: true },
      communication: "spoken",
      wordCount: 0,
    },
    evidence: "record a two-minute spoken explanation of what you observed",
    goalRelevance: "incidental",
    relevanceReason:
      "The locked objective assesses scientific explanation, not spoken delivery.",
    repair: {
      suggestion:
        "Accept a recorded explanation, a written explanation, or a live explanation, graded on the same rubric.",
      barrierReduced: "Single required response modality",
      rigorPreserved: true,
      rigorNote:
        "Every format still requires identifying the pattern, citing evidence from the trials, and connecting evidence to conclusion.",
    },
  },
  {
    id: "s11",
    action: "Submits the quiz and the recording together",
    environment: "Canvas",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    demands: {
      workingMemory: 1,
      fineMotor: 0,
      timePressure: 1,
      readingLoad: 0,
      contextSwitch: true,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
    },
    evidence: "submit it with the quiz",
    goalRelevance: "incidental",
    relevanceReason: "Submission mechanics are unrelated to the objective.",
    repair: null,
  },
];

export const BIOLOGY_SAMPLE: Sample = {
  id: "biology",
  title: "Diffusion Lab: Concentration Gradients",
  course: "Introductory Biology",
  text: BIOLOGY_TEXT,
  objectives: [
    {
      text: "Explain how concentration gradients influence molecular movement across a membrane.",
      source: "inferred",
    },
    {
      text: "Interpret equilibrium data from a diffusion simulation.",
      source: "inferred",
    },
  ],
  analysis: {
    timeLimitMinutes: 12,
    steps,
    frictionMoments: [
      {
        id: "f1",
        title: "Results vanish before they are needed",
        stepIds: ["s5", "s6", "s8"],
        severity: "high",
        barrierType: "working_memory",
        explanation:
          "The three equilibrium values are produced in the simulation, are not saved, and are not needed until the quiz two environments later. The student has to hold arbitrary numbers in mind while closing one application and finding their place in another.",
      },
      {
        id: "f2",
        title: "Setting up a trial requires dragging",
        stepIds: ["s4"],
        severity: "high",
        barrierType: "fine_motor",
        explanation:
          "Placing each molecule requires sustained pointer precision. A student who cannot drag reliably cannot set up the trial at all, even when they know exactly where every molecule belongs.",
      },
      {
        id: "f3",
        title: "The timer runs while the student is still reading",
        stepIds: ["s9"],
        severity: "high",
        barrierType: "time_pressure",
        explanation:
          "Twelve minutes covers recalling three values, reading five questions and writing answers. The clock does not pause, so processing speed contributes to the grade alongside understanding.",
      },
      {
        id: "f4",
        title: "Only a spoken explanation is accepted",
        stepIds: ["s10"],
        severity: "medium",
        barrierType: "single_modality_communication",
        explanation:
          "The final artefact must be speech. A student who is deaf, has a speech disability, or cannot record audio in their environment has no alternative route to demonstrate the same understanding.",
      },
      {
        id: "f5",
        title: "Five environments in one assignment",
        stepIds: ["s2", "s3", "s6", "s10"],
        severity: "medium",
        barrierType: "context_switching",
        explanation:
          "Completing the task means moving between Canvas, an article, a simulation, a quiz and a recording tool, re-establishing place each time.",
      },
    ],
  },
};

export const SAMPLES: Sample[] = [BIOLOGY_SAMPLE];
