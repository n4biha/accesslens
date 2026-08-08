"use client";

import { createContext, useContext } from "react";
import type { FrictionMoment } from "@/lib/schema";

export type WorkflowStage =
  | "intro"
  | "analyze"
  | "loading"
  | "goal"
  | "journey"
  | "barrier"
  | "repair"
  | "constraint"
  | "preview"
  | "complete";

export type ConditionId =
  | "working_memory"
  | "keyboard_only"
  | "fine_motor"
  | "no_spoken"
  | "no_audio"
  | "no_color"
  | "processing_time"
  | "reduced_motion";

interface WorkflowActions {
  goTo: (stage: WorkflowStage) => void;
  selectFriction: (friction: FrictionMoment) => void;
  selectCondition: (condition: ConditionId) => void;
  applyRepair: (stepId: string) => void;
  startOver: () => void;
}

const WorkflowContext = createContext<WorkflowActions | null>(null);

export const WorkflowProvider = WorkflowContext.Provider;

export function useWorkflow() {
  const value = useContext(WorkflowContext);
  if (!value) throw new Error("Workflow components must be inside WorkflowProvider.");
  return value;
}
