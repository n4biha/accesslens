"use client";

import dynamic from "next/dynamic";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

const BrainScene = dynamic(() => import("@/components/BrainScene"), {
  ssr: false,
  loading: () => <div className="brain-placeholder" />,
});

export default function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);

  function enter() {
    setLeaving(true);
    window.setTimeout(onEnter, 620);
  }

  return (
    <main className={`intro-screen ${leaving ? "is-leaving" : ""}`}>
      <div className="intro-atmosphere" aria-hidden="true" />
      <div className="brain-stage">
        <BrainScene />
      </div>
      <div className="intro-copy">
        <p className="intro-kicker">AccessLens</p>
        <h1 data-screen-heading tabIndex={-1}>
          We don&rsquo;t just test the page.
          <em>We test the task.</em>
        </h1>
        <p className="intro-description">
          AccessLens reveals the cognitive and functional demands hidden inside digital assignments,
          helping educators remove unnecessary barriers without lowering academic rigor.
        </p>
        <button type="button" className="button button--primary button--large" onClick={enter} disabled={leaving}>
          <span>Analyze a task</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="intro-footnote">Accessibility preflight for digital learning</p>
        <p className="brain-credit">
          3D anatomy: {" "}
          <a href="https://3d.nih.gov/entries/2739?version=1" target="_blank" rel="noreferrer">
            Nevit Dilmen / NIH 3D
          </a>{" "}
          · CC BY
        </p>
      </div>
    </main>
  );
}
