import type { EngineReport } from "@/lib/engine";

interface Props {
  report: EngineReport;
}

type Tone = "ok" | "warn" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-line",
  warn: "border-warn/40",
  danger: "border-danger/40",
};

const VALUE_CLASS: Record<Tone, string> = {
  ok: "text-foreground",
  warn: "text-warn",
  danger: "text-danger",
};

function Measurement({
  label,
  value,
  detail,
  source,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  source: string;
  tone: Tone;
}) {
  return (
    <div className={`rounded-lg border bg-surface p-4 shadow-sm ${TONE_CLASS[tone]}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </h3>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${VALUE_CLASS[tone]}`}>
        {value}
      </p>
      <p className="mt-1 text-sm leading-snug">{detail}</p>
      <p className="mt-2 text-xs text-muted">{source}</p>
    </div>
  );
}

export default function MeasurementStrip({ report }: Props) {
  const { memory, switching, timing, text } = report;

  const memoryTone: Tone =
    memory.peakLoad > memory.capacity
      ? "danger"
      : memory.carried.some((item) => item.decayRisk)
        ? "warn"
        : "ok";

  const timingTone: Tone =
    timing.verdict === "infeasible"
      ? "danger"
      : timing.verdict === "tight" || timing.verdictConservative === "infeasible"
        ? "warn"
        : "ok";

  const decayCount = memory.carried.filter((item) => item.decayRisk).length;

  return (
    <section aria-labelledby="measurements-heading" className="space-y-3">
      <div>
        <h2 id="measurements-heading" className="text-lg font-semibold">
          Measurements
        </h2>
        <p className="mt-1 text-sm text-muted">
          Computed from the task structure, not generated. The same assignment always
          produces the same numbers.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Measurement
          label="Working memory"
          value={`${memory.peakLoad} item${memory.peakLoad === 1 ? "" : "s"} held`}
          detail={
            decayCount > 0
              ? `${decayCount} value${decayCount === 1 ? "" : "s"} must survive an environment change before being used.`
              : "Nothing has to be carried between steps unaided."
          }
          source={`Capacity is about ${memory.capacity} chunks (Cowan, 2001)`}
          tone={memoryTone}
        />

        <Measurement
          label="Context switching"
          value={`${switching.transitions} switches`}
          detail={`The student moves between ${switching.uniqueEnvironments.length} environments to finish one assignment.`}
          source="Switch costs: Monsell (2003)"
          tone={switching.transitions >= 4 ? "warn" : "ok"}
        />

        <Measurement
          label="Time needed"
          value={
            timing.timeLimitMinutes === null
              ? "Untimed"
              : `${timing.requiredMinutesMean} of ${timing.timeLimitMinutes} min`
          }
          detail={
            timing.timeLimitMinutes === null
              ? `About ${timing.requiredMinutesMean} minutes of reading and actions, with no limit imposed.`
              : `${timing.totalWords} words to read plus ${timing.actionMinutes} minutes of actions. A slower reader needs ${timing.requiredMinutesConservative} minutes.`
          }
          source="Reading rate 238 wpm (Brysbaert, 2019)"
          tone={timingTone}
        />

        <Measurement
          label="Instructions"
          value={`Grade ${text.fleschKincaidGrade}`}
          detail={`${text.instructionDensity} separate instructions sit in the densest paragraph.`}
          source="Flesch-Kincaid grade level"
          tone={text.instructionDensity >= 4 ? "warn" : "ok"}
        />
      </div>
    </section>
  );
}
