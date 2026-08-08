import type { Demands } from "@/lib/schema";

interface Chip {
  label: string;
  level?: number;
  tone: "danger" | "warn" | "neutral";
}

function levelDots(level: number) {
  return "●".repeat(level) + "○".repeat(Math.max(0, 3 - level));
}

export function chipsForDemands(demands: Demands): Chip[] {
  const chips: Chip[] = [];

  if (demands.workingMemory >= 2)
    chips.push({ label: "Working memory", level: demands.workingMemory, tone: "danger" });
  if (demands.fineMotor >= 2)
    chips.push({ label: "Pointer precision", level: demands.fineMotor, tone: "danger" });
  if (demands.timePressure >= 2)
    chips.push({ label: "Time pressure", level: demands.timePressure, tone: "danger" });
  if (demands.readingLoad >= 3)
    chips.push({ label: "Heavy reading", level: demands.readingLoad, tone: "warn" });
  if (demands.contextSwitch)
    chips.push({ label: "Switches environment", tone: "warn" });
  if (demands.sensory.colorOnly)
    chips.push({ label: "Colour is the only cue", tone: "danger" });
  if (demands.sensory.audioOnly)
    chips.push({ label: "Audio is the only cue", tone: "danger" });
  if (demands.communication !== "none")
    chips.push({ label: `${demands.communication} response required`, tone: "warn" });

  return chips;
}

const TONE_CLASS: Record<Chip["tone"], string> = {
  danger: "bg-danger-soft text-danger border-danger/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  neutral: "bg-surface-sunken text-muted border-line",
};

export default function DemandChips({ demands }: { demands: Demands }) {
  const chips = chipsForDemands(demands);
  if (chips.length === 0) {
    return <p className="text-xs text-muted">No notable functional demands.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASS[chip.tone]}`}
        >
          <span className="first-letter:uppercase">{chip.label}</span>
          {chip.level !== undefined && (
            <span aria-label={`level ${chip.level} of 3`} className="font-mono text-[10px] tracking-tight opacity-80">
              {levelDots(chip.level)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
