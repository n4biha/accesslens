# AccessLens

**Most accessibility tools check whether a student can access the page. AccessLens checks whether they can access the learning.**

**Live app: https://accesslens-mauve.vercel.app**

Paste an assignment. AccessLens breaks it into the actions a student actually performs, measures the cognitive, motor, sensory, timing and communication demands each action imposes, and shows which of those demands have nothing to do with what you are trying to teach. Then it proposes fixes that remove the barrier and keep the academic difficulty.

---

## The problem

Here is a real biology assignment. Every page in it passes every accessibility checker on the market.

> Open the PhET diffusion simulation in a new tab. Adjust the concentration slider for each of three trials, and drag the molecule markers into the chamber to set up each run.
>
> Observe and remember your three equilibrium values. The simulation does not save your results, so make sure you have them before you close the tab.
>
> Close the simulation and return to Canvas. Find the Module 4 quiz and enter your three values.
>
> Answer questions 1 through 5 within twelve minutes. The timer starts when you open the quiz and does not pause.
>
> Finally, record a two-minute spoken explanation of what you observed and submit it with the quiz.

The learning objective is *explain how concentration gradients influence molecular movement across a membrane*. Now count what the task demands that the objective does not:

| What the task requires | What the research says | Is it what you are grading? |
|---|---|---|
| Hold 3 unsaved numbers in mind across two app switches | Working memory holds about 4 chunks without rehearsal or external aids (Cowan, 2001) | No |
| Drag markers with sustained pointer precision | Pointer time scales with target distance and size (Fitts, 1954). WCAG 2.2 SC 2.5.7 requires a non-drag alternative | No |
| Move between Canvas, an article, a simulation, a quiz and a recording tool | Task-switch costs persist even with preparation time (Monsell, 2003), and goal activation decays across intervening tasks (Altmann & Trafton, 2002) | No |
| Read and answer under a 12-minute clock that does not pause | Mean adult silent reading rate is about 238 wpm with wide individual variance (Brysbaert, 2019). WCAG 2.0 SC 2.2.1 has required adjustable timing since 2008 | No |
| Speak the final answer, with no other option accepted | UDL 3.0 asks for multiple means of action and expression (CAST, 2024) | No |

A student who cannot drag reliably fails this assignment even when they know exactly where every molecule belongs. A student with a working memory impairment loses the three numbers between the simulation and the quiz, then scores badly on a question about diffusion. In educational measurement this is called construct-irrelevant variance: the score moves because of an ability the assessment was never meant to test. It is a validity problem before it is an accessibility problem.

That framing comes from Cognitive Load Theory (Sweller, 1988), which separates *intrinsic* load, the difficulty of the concept, from *extraneous* load, the difficulty added by how the task was built. **AccessLens is an extraneous load detector.** You lock the objective, which fixes the intrinsic load. Everything else it measures is a candidate for removal.

### Why this matters now

The Department of Justice's ADA Title II final rule (April 2024) requires web content at state and local government entities to conform to WCAG 2.1 AA, with the first compliance deadline on **April 24, 2026** for entities serving 50,000 or more people. That covers public schools, community colleges and state universities. Institutions are auditing content right now. None of the tools doing that auditing look at the task layer.

### Where existing tools stop

| Tool | Scope | What it answers |
|---|---|---|
| Ally, UDOIT, Pope Tech | LMS content items | Is this file or page conformant? |
| axe-core, WAVE, Lighthouse | Individual pages | Does this page violate a success criterion? |
| **AccessLens** | **The assignment as a task** | **Can a student get through this, and is every demand one you meant to set?** |

These tools are good at what they do and AccessLens does not compete with them. A course can score 100% conformant and still be unusable as an experience, because no page-level scanner models the sequence of actions, the information carried between them, the environment switches, the timers, or the forced response modality.

---

## How it works

The pipeline is deliberately split. **The model reads. The engine measures.**

```
Assignment text
      |
      v
[1] Extract objective ........ model
      |
      v
[2] Educator locks it ........ human. This is the reference point for every judgement.
      |
      v
[3] Decompose into a task graph ........ model
      |    steps, environments, produces/consumes, demands, verbatim evidence
      v
[4] Normalize + verify the graph ........ code
      |    drop bad references, check every quote against the source
      v
[5] Measure ........ code, no model involved
      |    liveness analysis, switch counting, reading time, readability, score
      v
[6] Repair ........ model proposes, educator decides, code recomputes
      |
      v
[7] Revised assignment + exportable summary
```

The model observes. It does not measure. It turns prose into a typed graph: what happens at each step, what information that step produces, whether it stays on screen, and a 0-3 rating of each demand in isolation. It also copies across what the assignment states outright, like a stated word count or a twelve-minute limit.

Every aggregate figure is computed from that graph by `src/lib/engine.ts`, with no model involvement. Peak memory load, carry distance, transition counts, required minutes, the readability grade and the score are all derived in code. Same graph in, same numbers out. That reproducibility is what lets a barrier report cite a measurement instead of an opinion.

The difference matters most when the two disagree. The model rated one step's working memory a 3 in isolation. The engine traced three values from the simulation where they were produced, through the tab close and the quiz, and found four live at once against a capacity of four. The second number is the one an educator can check, because the reasoning behind it is a function they can read.

### The measurements

**Working memory** uses liveness analysis, the same pass a compiler runs to find live variables. An information item is live from the step that produces it until the last step that consumes it. It only counts against memory when the producing step does not keep it visible. Peak live-set size is the load, compared against a capacity of 4 (Cowan, 2001).

**Context switching** counts environment transitions and A→B→A bounces, and flags every value carried across a switch as a decay risk.

**Timing** estimates required minutes from word counts at 238 wpm and again at a deliberately conservative 130 wpm, plus a per-step action allowance. A stated timer is judged only against the steps it actually runs during, so a twenty-minute pre-lab video is not charged against a fifteen-minute quiz clock.

**Reading load** runs Flesch-Kincaid and SMOG over the instructions and finds the paragraph with the most imperatives packed into it.

**Score** subtracts from 100 for each measured problem and shows the full breakdown. Every line is traceable to the thing that caused it. It is not a compliance score and it does not claim to be one.

### Worked example: the biology assignment above

```
11 steps, 5 environments, 6 transitions, 5 friction moments

Score 45 / 100
  -20   4 values carried across an environment change
   -9   6 environment switches
  -12   3 high-severity friction moments
   -4   2 moderate friction moments
  -10   5 repairable demands unrelated to the goal
```

Accept all six proposed repairs and the graph is measured again:

```
Score 84 / 100        4 of 5 friction moments resolved
   -5   1 value carried across an environment change
   -9   6 environment switches
   -2   1 moderate friction moment
```

The score does not reach 100, and that is the point. The remaining deductions are real. Six environment switches survive because no repair consolidates the tools, and one context-switching finding stays open because nothing an educator accepted changes where the student works. AccessLens will not mark a barrier resolved unless the recomputed graph shows it resolved.

---

## Why you can trust the numbers

An LLM in this position has three easy ways to be wrong: invent a quote, invent a citation, or claim a fix worked. Each one is blocked structurally rather than by asking the model nicely.

**Evidence is verified, not trusted.** Every step carries a quote from the assignment. `src/lib/evidenceGuard.ts` checks it appears in the source, tolerant of whitespace and smart quotes but nothing else. Quotes that fail are blanked instead of displayed, so the interface can never show an educator a sentence their assignment does not contain.

**Citations are looked up, not generated.** The model picks a `barrierType` from a fixed enum. The WCAG, COGA and UDL citation text renders from `src/lib/standards.ts`. A fabricated success criterion is not possible, because the model never writes one.

**Repairs state what they change.** Each repair carries an explicit set of effects: which demand it lowers, which timer it removes, which environment it consolidates into. Applying a memory repair moves the memory demand and nothing else. A friction moment is only marked resolved when it was present on the original graph and is absent on the repaired one.

**Barriers the schema cannot measure are never marked fixed.** Nothing in the task graph describes motion or keyboard operability, so those conditions report "data unavailable" rather than a guess.

**The graph is checked for integrity.** `src/lib/graphNormalizer.ts` repairs relationships JSON schema cannot express: duplicate step ids, findings that point at steps which do not exist, values consumed but never produced. Every discarded relationship is reported instead of silently attributed to the wrong step.

**Accessibility is audited, not assumed.** The interface is tested with axe-core against WCAG 2.2 A and AA. That audit found a real 4.44:1 contrast failure where AA requires 4.5:1, which is now fixed.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.3 (App Router), React 19, TypeScript | Server routes keep the API key server side. |
| Styling | Tailwind CSS v4 | CSS-variable theming, no config file. |
| Model | Claude Opus 5 via `@anthropic-ai/sdk` | `messages.parse()` with structured outputs. |
| Schema | Zod v4 | One schema is the model's output contract, the API's request validator, and the app's TypeScript types. `.describe()` text is sent to the model, so the schema is also the prompt. |
| Measurement | Plain TypeScript, no dependencies | `src/lib/engine.ts`. Deterministic and unit tested. |
| Readability | `text-readability` | Flesch-Kincaid and SMOG. |
| File input | `pdfjs-dist` | Text extraction with baseline grouping so wrapped lines reflow correctly. |
| Read aloud | Web Speech API | Runs in the browser, no network call. |
| Icons | `lucide-react` | |
| Testing | `node --test` with `tsx` | 35 tests over the engine, repairs, graph normalizer and rate limiter. |
| Audit | `axe-core` | Dev dependency, kept so the audit is repeatable. |
| Hosting | Vercel | |

Cost control matters for a public demo. The system prompt is sent as a cached prefix with a one-hour TTL, so repeat calls read it at a fraction of the input price. All four routes are rate limited to 8 analyses per caller per hour and 120 globally, checked before any model call.

### Layout

```
src/lib/schema.ts            The contract. Task graph, repair effects, request validation.
src/lib/engine.ts            All measurement. No model involvement.
src/lib/repairs.ts           Applying repairs and recomputing what resolved.
src/lib/evidenceGuard.ts     Verbatim quote verification.
src/lib/graphNormalizer.ts   Structural integrity of the model's graph.
src/lib/standards.ts         WCAG / COGA / UDL citation table.
src/lib/rateLimit.ts         Sliding window limiter.
src/app/api/objective        Propose learning objectives.
src/app/api/analyze          Decompose into the task graph.
src/app/api/repair           Reclassify an educator's reworded repair.
src/app/api/preview          Rewrite the assignment with accepted repairs only.
```

---

## Running locally

Requires Node 20 or later and an Anthropic API key.

```bash
git clone https://github.com/n4biha/accesslens.git
cd accesslens
npm install
```

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your-key-here
```

```bash
npm run dev
```

Open http://localhost:3000. The built-in biology sample runs entirely offline from a cached fixture, so you can explore the whole workflow without an API key or spending anything. Pasting your own assignment is what triggers a model call.

```bash
npm test          # 35 unit tests
npx tsc --noEmit  # types
npx eslint src    # lint
npm run build     # production build
```

---

## Roadmap for educators

Ordered by how often educators asked for it, not by how hard it is to build.

**Analyze a whole course, not one assignment.** Point AccessLens at a Canvas or Moodle module and get a barrier profile for the term. Repeated patterns matter more than one bad assignment. If eleven of your fourteen tasks require a timed quiz right after an unsaved simulation, that is a course design problem, not eleven separate ones.

**LMS integration.** An LTI tool that runs on the assignment an instructor is already editing, and writes the revised version back. Nobody adopts a workflow that requires copy and paste.

**Institutional dashboard.** Accessibility offices currently learn about a barrier when a student files an accommodation request, which is after the student already struggled. A department-level view of task friction turns that into something you can fix before term starts.

**Student-side profiles.** Let a student set their own functional profile, then show them which steps in an assignment are likely to be difficult and what accommodations already apply. Right now the burden of predicting that is entirely theirs.

**Accommodation letter matching.** Map detected barriers onto the accommodations a student already has on file, so an instructor can see that a task conflicts with an approved accommodation before it is assigned.

**Embed the page layer.** Run axe-core over linked resources and fold those findings in, so one report covers both the task and the pages it touches.

**Rubric-aware repair.** Read the rubric alongside the objective. A repair can then check itself against the specific criteria being graded rather than against a one-line objective.

**Expert-labeled evaluation set.** Build a golden set labeled by accessibility specialists and instructional designers, and report precision and recall per barrier type. This is the honest way to claim accuracy and it does not exist yet.

---

## Limitations

Worth saying plainly, because a tool that overstates its confidence is worse than no tool.

- It reads the assignment text. It cannot inspect the software the assignment sends students into, so it will not know whether a specific simulation supports keyboard input. Where the task graph cannot answer a question, the interface says so rather than guessing.
- Step duration is counted only where the assignment states it. A task whose length is implied rather than written may take longer than the estimate.
- The action time model is coarse. A step is worth 30 seconds plus fixed allowances for precision and response, so "answer six analysis questions" is undercounted. It errs toward understating friction rather than inventing it.
- The score reflects task-level friction. It is not a WCAG conformance score and does not substitute for a compliance audit.
- Goal relevance is a judgement. The model marks steps `essential`, `related`, `incidental` or `unknown`, prefers `unknown` when genuinely ambiguous, and every call is visible and overridable. The educator decides.

---

## References

- Altmann, E. M., & Trafton, J. G. (2002). Memory for goals: An activation-based model. *Cognitive Science*, 26(1).
- Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. *Journal of Memory and Language*, 109.
- CAST (2024). *Universal Design for Learning Guidelines version 3.0*.
- Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1).
- Fitts, P. M. (1954). The information capacity of the human motor system in controlling the amplitude of movement. *Journal of Experimental Psychology*, 47(6).
- Monsell, S. (2003). Task switching. *Trends in Cognitive Sciences*, 7(3).
- Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2).
- U.S. Department of Justice (2024). *Nondiscrimination on the Basis of Disability; Accessibility of Web Information and Services of State and Local Government Entities* (ADA Title II final rule).
- W3C (2021). *Making Content Usable for People with Cognitive and Learning Disabilities* (COGA Group Note).
- W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*.

---

AccessLens identifies potential task-level accessibility barriers. Educator judgment remains part of every decision.

Built by Nabiha Sharif.
