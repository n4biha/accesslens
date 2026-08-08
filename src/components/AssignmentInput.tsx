"use client";

import { SAMPLES } from "@/samples/biology";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}

export default function AssignmentInput({
  value,
  onChange,
  onSubmit,
  busy,
  error,
}: Props) {
  return (
    <section aria-labelledby="paste-heading" className="space-y-4">
      <div>
        <h2 id="paste-heading" className="text-lg font-semibold">
          Paste an assignment
        </h2>
        <p className="mt-1 text-sm text-muted">
          Everything a student would read: instructions, resource links, timing and
          submission requirements.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Or start from a sample:</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample.id}
            type="button"
            onClick={() => onChange(sample.text)}
            className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-sunken"
          >
            {sample.title}
          </button>
        ))}
      </div>

      <label htmlFor="assignment" className="sr-only">
        Assignment text
      </label>
      <textarea
        id="assignment"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={14}
        spellCheck={false}
        placeholder="Read the instructions below and the linked background article before you begin…"
        className="w-full rounded-lg border border-line bg-surface p-4 font-mono text-sm leading-relaxed shadow-sm placeholder:text-muted/60"
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || value.trim().length === 0}
        className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-fg disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "Reading the assignment…" : "Find the learning objective"}
      </button>
    </section>
  );
}
