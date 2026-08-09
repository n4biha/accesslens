"use client";

import { getImageProps } from "next/image";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type IntroPhase =
  | "idle"
  | "artwork"
  | "lens"
  | "headline"
  | "description"
  | "actions"
  | "ready";

const heroImageCommon = { alt: "", sizes: "100vw", quality: 100 } as const;
const {
  props: { srcSet: desktopHeroSrcSet, ...desktopHeroProps },
} = getImageProps({
  ...heroImageCommon,
  src: "/accesslens-hero-v3.png",
  width: 3344,
  height: 1882,
});
const {
  props: { srcSet: mobileHeroSrcSet },
} = getImageProps({
  ...heroImageCommon,
  src: "/accesslens-hero-mobile-v2.png",
  width: 1882,
  height: 3344,
});

function ResponsiveHeroImage({
  eager = false,
  onLoad,
  onError,
}: {
  eager?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  return (
    <picture>
      <source media="(max-width: 800px)" srcSet={mobileHeroSrcSet} />
      <img
        {...desktopHeroProps}
        alt=""
        srcSet={desktopHeroSrcSet}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        onLoad={onLoad}
        onError={onError}
      />
    </picture>
  );
}

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
  const [phase, setPhase] = useState<IntroPhase>("idle");
  const [sequenceComplete, setSequenceComplete] = useState(false);
  const [assetSettled, setAssetSettled] = useState(false);
  const [instant, setInstant] = useState(false);
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
    setInstant(true);
    setPhase("ready");
    setSequenceComplete(true);
  }, [clearTimers]);

  const beginSequence = useCallback(() => {
    if (sequenceStarted.current) return;
    sequenceStarted.current = true;

    setPhase("artwork");
    timers.current = [
      window.setTimeout(() => setPhase("lens"), 650),
      window.setTimeout(() => setPhase("headline"), 1200),
      window.setTimeout(() => setPhase("description"), 1800),
      window.setTimeout(() => setPhase("actions"), 2400),
      window.setTimeout(() => {
        setPhase("ready");
        setSequenceComplete(true);
      }, 3300),
    ];
  }, []);

  useEffect(() => {
    if (!reducedMotion && !assetSettled) return;

    const startTimer = window.setTimeout(
      reducedMotion ? finishImmediately : beginSequence,
      0,
    );
    return () => window.clearTimeout(startTimer);
  }, [assetSettled, beginSequence, finishImmediately, reducedMotion]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => setAssetSettled(true), 1200);
    return () => window.clearTimeout(fallbackTimer);
  }, []);

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
    window.setTimeout(onEnter, reducedMotion ? 80 : 680);
  }

  return (
    <main
      className={`intro-screen intro-screen--lens ${sequenceComplete ? "is-sequence-complete" : ""} ${instant ? "is-instant" : ""} ${leaving ? "is-leaving" : ""}`}
      data-phase={phase}
      aria-busy={!sequenceComplete}
    >
      <div className="intro-artwork" aria-hidden="true">
        <div className="intro-artwork-layer intro-artwork-layer--sharp">
          <ResponsiveHeroImage
            eager
            onLoad={() => setAssetSettled(true)}
            onError={() => setAssetSettled(true)}
          />
        </div>
        <div className="intro-optical-bloom" />
        <div className="intro-light-sweep" />
        <div className="intro-artwork-shade" />
        <div className="intro-film-grain" />
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
      </div>

      <p className="sr-only" aria-live="polite">
        {sequenceComplete
          ? "AccessLens is ready. Remove the barrier. Keep the challenge. Analyze a task."
          : "Loading the AccessLens introduction."}
      </p>
    </main>
  );
}
