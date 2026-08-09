"use client";

import dynamic from "next/dynamic";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type IntroPhase = "blackout" | "brain" | "hold" | "lift" | "message" | "ready";

const BrainScene = dynamic(() => import("@/components/BrainScene"), {
  ssr: false,
  loading: () => <div className="brain-placeholder" />,
});

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export default function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const [phase, setPhase] = useState<IntroPhase>("blackout");
  const [sequenceComplete, setSequenceComplete] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const reducedMotion = useReducedMotion();
  const sequenceStarted = useRef(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const finishImmediately = useCallback(() => {
    clearTimers();
    sequenceStarted.current = true;
    setPhase("ready");
    setSequenceComplete(true);
  }, [clearTimers]);

  const beginSequence = useCallback(() => {
    if (sequenceStarted.current) return;
    sequenceStarted.current = true;

    if (reducedMotion) {
      finishImmediately();
      return;
    }

    timers.current = [
      window.setTimeout(() => setPhase("brain"), 450),
      window.setTimeout(() => setPhase("hold"), 1650),
      window.setTimeout(() => setPhase("lift"), 2150),
      window.setTimeout(() => setPhase("message"), 3250),
      window.setTimeout(() => setPhase("ready"), 4050),
      window.setTimeout(() => setSequenceComplete(true), 4850),
    ];
  }, [finishImmediately, reducedMotion]);

  useEffect(() => {
    if (!reducedMotion) return;
    const timer = window.setTimeout(finishImmediately, 0);
    return () => window.clearTimeout(timer);
  }, [finishImmediately, reducedMotion]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(beginSequence, 2500);
    return () => window.clearTimeout(fallbackTimer);
  }, [beginSequence]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!sequenceComplete) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sequenceComplete]);

  function enter() {
    if (!sequenceComplete) return;
    setLeaving(true);
    window.setTimeout(onEnter, reducedMotion ? 80 : 620);
  }

  return (
    <main
      className={`intro-screen intro-screen--cinematic ${sequenceComplete ? "is-sequence-complete" : ""} ${leaving ? "is-leaving" : ""}`}
      data-phase={phase}
      aria-busy={!sequenceComplete}
    >
      <div className="intro-atmosphere" aria-hidden="true" />
      <div className="brain-stage">
        <BrainScene interactive={sequenceComplete} onReady={beginSequence} />
      </div>
      <div className="intro-copy" aria-hidden={!sequenceComplete}>
        <p className="intro-kicker">AccessLens</p>
        <h1 data-screen-heading tabIndex={sequenceComplete ? -1 : undefined}>
          Remove the barrier.
          <em>Keep the challenge.</em>
        </h1>
        <p className="intro-description">
          AccessLens reveals the cognitive and functional demands hidden inside digital assignments,
          helping educators remove unnecessary barriers without lowering academic rigor.
        </p>
        <button
          type="button"
          className="button button--primary button--large"
          onClick={enter}
          disabled={!sequenceComplete || leaving}
          tabIndex={sequenceComplete ? 0 : -1}
        >
          <span>Analyze a task</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="intro-footnote">Accessibility preflight for digital learning</p>
        <p className="brain-credit">
          3D anatomy:{" "}
          <a
            href="https://3d.nih.gov/entries/2739?version=1"
            target="_blank"
            rel="noreferrer"
            tabIndex={sequenceComplete ? 0 : -1}
          >
            Nevit Dilmen / NIH 3D
          </a>{" "}
          · CC BY
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {sequenceComplete
          ? "AccessLens is ready. Remove the barrier. Keep the challenge. Analyze a task."
          : "Loading the AccessLens introduction."}
      </p>
    </main>
  );
}
