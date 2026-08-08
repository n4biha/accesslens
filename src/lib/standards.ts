import type { BarrierType } from "./schema";

/**
 * Citations are looked up from this table using the model's `barrierType` key.
 * The model never writes citation text, so it cannot invent a success criterion
 * that does not exist. Adding a barrier type means adding a row here.
 */

export interface WcagCriterion {
  id: string;
  name: string;
  level: "A" | "AA" | "AAA";
  url: string;
}

export interface StandardsEntry {
  label: string;
  summary: string;
  wcag: WcagCriterion[];
  coga: string[];
  udl: string[];
  research: string[];
}

const COGA_URL = "https://www.w3.org/TR/coga-usable/";
const UDL_URL = "https://udlguidelines.cast.org/";

function wcag(
  id: string,
  name: string,
  level: WcagCriterion["level"],
  slug: string
): WcagCriterion {
  return {
    id,
    name,
    level,
    url: `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
  };
}

export const STANDARDS: Record<BarrierType, StandardsEntry> = {
  working_memory: {
    label: "Working-memory dependency",
    summary:
      "The task requires the student to hold information in mind that the interface could simply keep visible.",
    wcag: [wcag("3.3.2", "Labels or Instructions", "A", "labels-or-instructions")],
    coga: ["Ensure processes do not rely on memory"],
    udl: ["Provide options for executive functions: support memory and information management"],
    research: ["Cowan (2001): working memory holds about 4 chunks without rehearsal or external aids"],
  },
  context_switching: {
    label: "Context switching",
    summary:
      "Completing the task requires moving repeatedly between applications, tabs, or media, and re-establishing place each time.",
    wcag: [wcag("3.2.3", "Consistent Navigation", "AA", "consistent-navigation")],
    coga: ["Help users maintain focus", "Make it easy to find the most important features"],
    udl: ["Minimize threats and distractions"],
    research: [
      "Monsell (2003): switching tasks carries a measurable performance cost",
      "Altmann & Trafton (2002): goal activation decays across intervening tasks",
    ],
  },
  fine_motor: {
    label: "Fine-motor precision",
    summary:
      "The task requires precise pointer control such as dragging or hitting small targets, with no alternative path.",
    wcag: [
      wcag("2.5.7", "Dragging Movements", "AA", "dragging-movements"),
      wcag("2.5.8", "Target Size (Minimum)", "AA", "target-size-minimum"),
    ],
    coga: ["Use a simple and clear interaction design"],
    udl: ["Optimize access to tools and assistive technologies", "Vary methods for response and navigation"],
    research: ["Fitts (1954): pointing time increases as targets get smaller or further away"],
  },
  time_pressure: {
    label: "Time pressure",
    summary:
      "A fixed time limit constrains the task, so processing speed affects the grade alongside understanding.",
    wcag: [wcag("2.2.1", "Timing Adjustable", "A", "timing-adjustable")],
    coga: ["Allow enough time to complete tasks"],
    udl: ["Vary the methods for response, navigation, and movement"],
    research: [
      "Brysbaert (2019): mean silent reading rate for adults reading non-fiction is about 238 words per minute, with wide individual variation",
    ],
  },
  reading_load: {
    label: "Reading and instruction load",
    summary:
      "Dense or unstructured instructions add reading and parsing work that is separate from the subject being assessed.",
    wcag: [
      wcag("3.3.2", "Labels or Instructions", "A", "labels-or-instructions"),
      wcag("3.1.5", "Reading Level", "AAA", "reading-level"),
    ],
    coga: ["Use clear and understandable content", "Break up long text into manageable pieces"],
    udl: ["Clarify vocabulary and symbols", "Support decoding of text"],
    research: [
      "Sweller (1988): presentation that adds load unrelated to the concept reduces learning",
    ],
  },
  single_modality_communication: {
    label: "Single required response modality",
    summary:
      "Only one way of demonstrating learning is accepted, so students who cannot use that channel cannot show what they know.",
    wcag: [],
    coga: ["Support different ways for people to complete an activity"],
    udl: [
      "Provide multiple means of action and expression",
      "Use multiple media for communication",
    ],
    research: [
      "Assessment validity: demands unrelated to the construct being measured introduce construct-irrelevant variance",
    ],
  },
  sensory_color_only: {
    label: "Colour as the only cue",
    summary: "Information is carried by colour alone, with no label, pattern, or text equivalent.",
    wcag: [
      wcag("1.4.1", "Use of Color", "A", "use-of-color"),
      wcag("1.3.3", "Sensory Characteristics", "A", "sensory-characteristics"),
    ],
    coga: ["Use a clear and understandable visual design"],
    udl: ["Offer alternatives for visual information"],
    research: [],
  },
  sensory_audio_only: {
    label: "Audio as the only cue",
    summary: "Information is carried by sound alone, with no captions or transcript.",
    wcag: [
      wcag("1.2.2", "Captions (Prerecorded)", "A", "captions-prerecorded"),
      wcag("1.2.1", "Audio-only and Video-only (Prerecorded)", "A", "audio-only-and-video-only-prerecorded"),
    ],
    coga: ["Provide alternatives to sound"],
    udl: ["Offer alternatives for auditory information"],
    research: [],
  },
  navigation_ambiguity: {
    label: "Unclear sequence or destination",
    summary:
      "The student cannot tell what comes next or where a required resource lives, so finding the path becomes part of the work.",
    wcag: [
      wcag("2.4.6", "Headings and Labels", "AA", "headings-and-labels"),
      wcag("3.2.3", "Consistent Navigation", "AA", "consistent-navigation"),
    ],
    coga: ["Help users find what they need", "Make each step clear"],
    udl: ["Support planning and strategy development"],
    research: [],
  },
};

export function citationsFor(barrierType: BarrierType): StandardsEntry {
  return STANDARDS[barrierType];
}

/** One-line citation used in compact places such as the barrier trace header. */
export function shortCitation(barrierType: BarrierType): string {
  const entry = STANDARDS[barrierType];
  if (entry.wcag.length > 0) {
    const first = entry.wcag[0];
    return `WCAG ${first.id} ${first.name} (Level ${first.level})`;
  }
  if (entry.coga.length > 0) return `W3C COGA: ${entry.coga[0]}`;
  if (entry.udl.length > 0) return `CAST UDL: ${entry.udl[0]}`;
  return entry.label;
}

export const STANDARDS_SOURCES = {
  wcag: { name: "WCAG 2.2", url: "https://www.w3.org/TR/WCAG22/" },
  coga: { name: "W3C COGA — Making Content Usable", url: COGA_URL },
  udl: { name: "CAST UDL Guidelines 3.0", url: UDL_URL },
};
