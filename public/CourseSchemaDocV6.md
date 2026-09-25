# Course Engine JSON Schema — v6.1

*Document revision 3 — reconciled against Course Engine Player v6.1. Every field below has been
verified against the player source; the [Field status index](#field-status-index) records, for
each field, whether the engine executes it, merely displays it, or accepts it without acting.*

**v6.1 adds runnable code** — playgrounds, graded challenges, predict-then-run, and test-suite
exercises — via a companion file, `codelab.js`. See [Runnable code](#runnable-code-v61).
Like every v6 addition before it, **v6.1 is optional-safe: a valid v6 course file is a valid v6.1
course file**, and a v6.1 course degrades visibly rather than silently on an older player.

Documentation for the course JSON consumed by the course player. A course is a single JSON object;
every screen, interaction, score, and review the player produces is driven by this file. The schema
reference lives in `exampleJsonV6.json`, where each field's value is a string describing its type
and allowed values.

This revision extends v5 (schema v4.1). **Every v6 addition is optional-safe: a valid v5 course file
is a valid v6 course file** (see [Backward compatibility](#backward-compatibility)).

`courseMetadata.schemaVersion` remains `"6.0"`. Revision 2 changes no course-file semantics — it
corrects the documentation where it described behavior the player does not have.

---

## Status legend

Used throughout this document and in `exampleJsonV6.json`.

| Marker | Meaning |
|---|---|
| **Executed** | The engine changes its behavior based on this field. |
| **Displayed** | Rendered to the learner, but drives no engine behavior. |
| **Validated** | Checked at load time for linkage/shape; otherwise unused. |
| **Inert** | Accepted and preserved, but neither displayed nor executed by this player. Safe to author for forward compatibility; do not expect it to do anything today. |
| **Defect** | The field is specified, but the player fails to honor it. No fields carry this marker in the current build — see [Resolved player defects](#resolved-player-defects). |

Authoring rule of thumb: **Inert** fields are documentation for humans and future engines. If a
course depends on one being honored, it will not work.

---

## What's new in v6

| Change | Kind | Status | Where |
|---|---|---|---|
| Markdown content rendering (`format: "markdown"`) | Content model | Executed | `contentBlocks[]` text blocks, plus most prose-bearing strings |
| New block types: `code`, `callout`, `table`, `key-terms` | Content model | Executed | `contentBlocks[].type` |
| Progressive chunking (`checkpointAfter`) | Content model | Executed | any content block |
| Section summaries + `prediction-resolution` hook | Pedagogy | Executed | `sections[].sectionSummary`, `motivationHooks[]` |
| Missed items enter the review queue (`reviewOnMiss`) | Engine behavior | Executed | `learningModel` |
| Confidence prompts executed + calibration feedback | Engine behavior | Executed | `learningModel`, `confidencePrompt` |
| Adaptive difficulty executed (`adaptiveRules`) | Engine behavior | Executed | `assessments[]` |
| In-lesson interleaving executed (`injectCount`) | Engine behavior | Executed | `learningModel.interleavingGroups[]` |
| `elaboration` interaction type | Pedagogy | Executed | `interactionSequence[].interactionType` |
| Faded worked examples (`fadedVariant`) | Pedagogy | Executed | `workedExamples[]` |
| Glossary auto-linking | Engine behavior | Executed | `glossary`, `key-terms` blocks |
| Flashcard decks assembled from course content | Engine behavior | Executed | see [Flashcards](#flashcards) |
| Calibration tracking (`analytics.calibrationTracking`) | Engine behavior | Executed | see [analytics and calibration](#analytics-and-calibration) |
| Sanitization of course-sourced strings | Security | Executed | see [Security](#security) |
| `courseMetadata.schemaVersion` | Versioning | Executed | `courseMetadata` |

Fields that were *declared intent* in v5 and are now *executed* in v6: `confidenceCalibrationEnabled`,
`adaptiveDifficultyEnabled` (via `assessments[].adaptiveDifficulty`), and `interleavingEnabled`
(via `interleavingGroups`).

**Corrected in revision 2:** several fields were documented as doing more than the player did. Those
gaps are now closed in both directions — the descriptions below match the player build dated
2026-08-29, and the four defects that revision 2 recorded have been fixed. See
[Resolved player defects](#resolved-player-defects).

---

## What's new in v6.1

| Change | Kind | Status | Where |
|---|---|---|---|
| Runnable code playgrounds | Content model | Executed | `contentBlocks[].type: "code-playground"` |
| Run button on read-only examples | Content model | Executed | `contentBlocks[].runnable` on `code` blocks |
| Graded code challenges | Pedagogy | Executed | `interactionType: "code-challenge"` |
| Predict-then-run | Pedagogy | Executed | `interactionType: "predict-run"` |
| Test-suite exercises (Jest-compatible / `unittest`) | Pedagogy | Executed | `codeExercise.check.mode: "tests"` |
| Editable regions inside locked scaffolding | Pedagogy | Executed | `[[edit]]` markers in `starterCode` |
| Failure-linked misconceptions | Pedagogy | Executed | `codeExercise.linkedMisconceptionId`, per-case |
| `code` evidence kind, weight 0.6 | Engine behavior | Executed | see [Evidence and mastery](#evidence-and-mastery) |

**All of it is inert in an older player, and visibly so.** A v6 player renders a `code-playground`
block as nothing (unknown block type) and a `code-challenge` as a textarea with no submit button.
Both already produce a load-time warning in v6 revision 2, so the failure is reported rather than
silent — but if a course depends on code widgets, it needs a v6.1 player.

### The `codelab.js` dependency

Code widgets live in a separate file that the player loads **lazily**, the first time a course that
uses them is opened. The player looks for it at `window.CODELAB_SRC`, then `codelab.js`, then
`/codelab.js`, in that order, and it must be served from the same origin as the player (or sit
beside it on disk — `file://` is supported).

If the file cannot be loaded, each code widget renders a bordered message saying the exercise could
not load, and **the rest of the lesson is unaffected**. Nothing else in the experience depends on it.

Execution happens inside a sandboxed `<iframe>` with an opaque origin, and JavaScript runs in a
Worker inside that frame so a runaway loop can be terminated. Learner code cannot reach the
player's DOM, its `localStorage`, or the course object.

---

## Design principles

**Everything is linked by ID.** Competencies are the hub: probes, experiences, objectives,
assessments, and reading resources all point at `competencyId`s, and misconceptions/error patterns
cross-reference each other by ID. The player validates these linkages at load and reports unresolved
IDs as warnings.

**The course JSON is static; the engine owns time.** Nothing in the course file carries timestamps.
Review due-dates, evidence timestamps, and decay live in learner state.

**Authored content degrades gracefully.** A missing block simply doesn't render; an unknown block
`type` renders nothing, silently. This is what makes v6 additive.

**Objective items are auto-scored; subjective items are self-graded.** Unchanged, including evidence
weights — which are now written down explicitly under [Evidence and mastery](#evidence-and-mastery).

**Structure lives in the schema, not in prose conventions.** v5 courses encoded headings as inline
caps (`"WHY THIS MATTERS: ..."`) because text blocks were flat strings. In v6 this is an authoring
error: use markdown headings, lists, and the dedicated block types.

---

## Top-level structure

The loader hard-fails only on a missing `courseMetadata` or a missing/empty `sections`. Everything
else produces warnings at most.

| Key | Type | Status | Purpose |
|---|---|---|---|
| `courseMetadata` | object | Mixed | Identity, description, difficulty. **Required.** |
| `learningModel` | object | Executed | Global pedagogy switches and thresholds. |
| `priorKnowledgeCheck` | object | Executed | Optional pre-course probes. |
| `competencies` | array | Executed | The skills being taught — the hub of the ID graph. |
| `sections` | array | Executed | Ordered course content. **Required.** |
| `assessments` | array | Executed | Formal checks linked via `masteryVerification`. |
| `retrievalSystem` | object | **Inert** | Declares the retrieval approach; the per-item `schedule` blocks drive the actual scheduler. |
| `masterySystem` | object | Mixed | `masteryLevels` and `decayModelEnabled` are executed; `reverificationRequired` is inert. |
| `analytics` | object | Mixed | `calibrationTracking` is executed; the `track` and `errorAnalysis` blocks are inert. |
| `glossary` | array | Executed | Term/definition pairs; auto-linked in content. |

### courseMetadata

| Field | Status | Notes |
|---|---|---|
| `courseId` | Executed | Keys learner progress (`course-progress:<courseId>`) and notes (`course-notes:<courseId>`). Changing it orphans existing saves. |
| `title` | Displayed | Cover, completion screen, progress-import prompts. |
| `description` | Displayed | Cover lede. Inline markdown. |
| `thumbnailImage` | Displayed | Cover art. See [Security](#security) — not URL-sanitized. |
| `estimatedDurationMinutes` | Displayed | Formatted as `Nh Nm` on the cover. |
| `difficultyLevel` | Displayed | Falls back into the completion seal when `version` is absent. |
| `version` | Displayed | Completion seal (`v<version>`). |
| `schemaVersion` | Executed | See below. |
| `lastUpdated` | **Inert** | Never displayed. |
| `language` | **Inert** | Never read. The player ships a Google Translate widget instead. |
| `tags` | **Inert** | Tag rendering is commented out in the current player. |
| `prerequisites[]` | Displayed | `type` and `description` listed on the cover. |

### courseMetadata.schemaVersion

Optional string, e.g. `"6.0"`. Parsed with `parseFloat`. Its one enforced effect: when present and
≥ `6.0`, text blocks default to `format: "markdown"`. When absent, text blocks default to
`format: "plain"` so pre-v6 courses render as before. Individual blocks can always override with
their own `format`.

---

## The v6 content model — `contentBlocks[]`

`type` accepts ten values (nine in v6, plus `code-playground` in v6.1); the first five carry the
structural payload. Any unrecognized value renders nothing and produces a load-time warning.

### `text`

| Field | Type | Notes |
|---|---|---|
| `blockId` | string | Unique within the experience. Used only in validation messages. |
| `type` | `"text"` | — |
| `format` | `markdown` \| `plain` | Default depends on `schemaVersion` (see above). `markdown` renders CommonMark-subset plus GFM tables and fenced code blocks. |
| `content` | string | The prose. |

**Markdown support is a pragmatic subset**, not full CommonMark. Supported: ATX headings `#`–`####`
(rendered one level down — `#` becomes `<h2>`), unordered and ordered lists with simple continuation
lines, fenced code blocks, blockquotes, horizontal rules, GFM pipe tables, paragraphs, and inline
code / links / bold / italic / strikethrough. **Not supported:** nested lists, reference links,
setext headings, footnotes, task lists, inline HTML (stripped by escaping).

**`format: "plain"` escapes the string and preserves newlines** (the block is rendered with
`white-space: pre-wrap`), so v5 courses that relied on line breaks in flat strings render as they
always did. Markdown syntax is not interpreted.

**Authoring rules for markdown text:**

- Use `##`/`###` headings, never inline caps pseudo-headings. Reserve `#` — the experience title owns it.
- Break enumerations into real markdown lists, not `(1) ... (2) ...` run-ons.
- Fenced code blocks work inside text blocks. Prefer a dedicated `code` block when the code is the point (it gains `caption` and `highlightLines`).
- Keep paragraphs under ~5 sentences. If a text block exceeds ~300 words without a heading, split it.

### `code`

First-class code with syntax highlighting and line numbers.

| Field | Type | Notes |
|---|---|---|
| `type` | `"code"` | — |
| `language` | string | Highlighter language id. Optional; omit for plain monospace. |
| `content` | string | The code, verbatim. Never markdown-processed. |
| `caption` | string | Optional caption below the block. Inline markdown. |
| `highlightLines` | integer[] | Optional 1-based line numbers to visually emphasize. |
| `runnable` | boolean | **New in v6.1.** Adds a Run button beneath the block. Requires a runnable `language` (JavaScript, Python or SQL) — with anything else the block renders normally and the loader warns. Output appears below the code; nothing is graded and no evidence is recorded. |

The highlighter maps many language ids onto three keyword sets: a C-family/JS set (`js`, `jsx`, `ts`,
`tsx`, `javascript`, `typescript`, `json`, `java`, `c`, `cpp`, `csharp`, `go`, `rust`, `swift`,
`kotlin`, `php`, `scala`, `dart`), a Python-family set (`py`, `python`, `rb`, `ruby`, `sh`, `bash`,
`shell`, `yaml`, `yml`, `r`), and SQL (`sql`, `postgres`, `mysql`, `sqlite`). Any other value still
displays as a language label with strings and numbers highlighted, just without keywords.

### `code-playground`

**New in v6.1.** An editable, runnable scratch space. Ungraded, records no evidence, and its
contents persist in learner state so a returning learner finds their experiment intact.

| Field | Type | Notes |
|---|---|---|
| `type` | `"code-playground"` | — |
| `blockId` | string | **Required in practice** — it keys the saved code. A playground without one still runs, but its contents are not reliably restored. |
| `caption` | string | Optional line above the editor. Inline markdown. |
| `codeExercise.language` | string | `javascript`, `python` or `sql`. Warned at load if unrunnable. |
| `codeExercise.starterCode` | string | The code the editor opens with. `[[edit]]` markers work here too. |

```json
{
  "blockId": "pg-reduce",
  "type": "code-playground",
  "caption": "Scratch space — nothing here is graded.",
  "codeExercise": {
    "language": "javascript",
    "starterCode": "const nums = [];\nconsole.log(nums.reduce((a, b) => a + b, 0));"
  }
}
```

Use a playground immediately after a claim you want the learner to falsify themselves
(*"remove the seed and run it against an empty array"*). It is the cheapest possible
prediction-gap.

### `callout`

| Field | Type | Notes |
|---|---|---|
| `type` | `"callout"` | — |
| `variant` | `note` \| `warning` \| `insight` \| `definition` \| `example` | Controls styling. Unrecognized values fall back to `note`. |
| `title` | string | Optional heading inside the callout. Inline markdown. |
| `content` | string | Block markdown. |

### `table`

| Field | Type | Notes |
|---|---|---|
| `type` | `"table"` | — |
| `headers` | string[] | Column headers. Omit or empty for a header-less table. |
| `rows` | string[][] | Row cells; inline markdown permitted. |
| `caption` | string | Optional. Inline markdown. |

### `key-terms`

| Field | Type | Notes |
|---|---|---|
| `type` | `"key-terms"` | — |
| `terms` | object[] | `{term, definition, addToGlossary}`. Rendered as collapsible chips. |
| `terms[].addToGlossary` | boolean | Default `true`. Merged into the course glossary at load; the course-file `glossary` wins on term collisions. |

An empty or missing `terms` array renders nothing and produces a load-time warning.

### `image`, `video`, `audio`, `interactive`

| Field | Applies to | Notes |
|---|---|---|
| `url` | image, video, audio | Absent renders a labelled placeholder. **Not sanitized** — see [Security](#security). |
| `altText` | image | Used as both `alt` and the visible caption. |
| `captionOrTranscript` | video, audio | Rendered in a collapsible *Transcript* disclosure. |
| `content` | interactive | Label text only. The `interactive` block is a styled placeholder; it embeds nothing. |

Authors of technical or process-heavy material should treat at least one visual per major concept as
the norm.

### `checkpointAfter` — progressive chunking

Any content block may set `checkpointAfter: true`.

- **No block in an experience sets it** → the experience renders as one scroll, exactly as v5.
- **Any block sets it** → the player renders the experience in segments. Each segment shows content up to and including a checkpoint block, then a *Continue* control and segment progress dots ("2 of 5"). The final segment contains everything after the last checkpoint (worked examples, self-guided exercise, interactions, retrieval, interleaved practice, transfer, mastery, section close).
- A checkpoint on the **last** block is ignored rather than producing an empty trailing segment.
- Segment position persists in learner state (`state.checkpoint[experienceId]`), so returning mid-lesson resumes at the last checkpoint.
- Authoring guidance: one checkpoint per 3–5 minutes of reading, ideally just before or after an interaction.

---

## Markdown scope elsewhere

Three tiers, corrected in revision 2 to match the renderer.

**Block markdown** (headings, lists, fenced code, tables, blockquotes): `contentBlocks[].content`
(text and callout), `sectionSummary.content`, `workedExamples.problem` / `steps[]` / `conclusion`,
`fadedVariant.problem` / `givenSteps[]`, interaction `prompt`, `probeQuestions[].prompt`,
`assessments[].questions[].prompt`, `feedback.elaborativeFeedback` / `correctiveFeedback`,
`transferExercises.scenario` / `task`, `selfGuidedExercise.objective`.

Several of these use *smart* block markdown: block rendering only when block-level syntax is
actually present, inline rendering otherwise. The distinction is invisible to authors.

**Inline markdown** (bold, italic, inline code, links, strikethrough — no block elements):
`courseMetadata.description`, `prerequisites[].description`, `motivationHooks.prompt`,
`learningObjectives[].description`, `desiredOutcomes[].description`, `furtherReading.rationaleNote`,
`optionFeedback[].feedback`, `feedback.hints[]`, `glossary` definitions, `key-terms` definitions,
`rubric.excellent` / `adequate` / `weak`, `successCriteria[]`, `probeQuestions[].scoringCriteria[]`,
`sectionSummary.keyTakeaways[]`, `selfGuidedExercise.instructions[]` /
`materialsOrPrerequisites[]` / `reflectionPrompts[]` / `verification.selfAssessmentCriteria[]`,
`retrievalPractice[].prompt`, `errorPatterns[].remediationAction`, `confidencePrompt.prompt`,
`transferExercises.successCriteria[]`.

Note that `selfGuidedExercise.instructions[]` and `retrievalPractice[].prompt` are **inline only**
— revision 1 wrongly listed them as full markdown. A fenced code block in an instruction step will
render as literal backticks.

**Plain text — escaped, markdown NOT rendered:** all `options[]` arrays (interaction multiple-choice,
drag-drop, likert, probe, and assessment questions), all titles (`courseMetadata.title`,
`sections[].title`, experience `title`, assessment `title`, callout `title` is the exception and does
take inline markdown), all IDs, `tags`, `experienceType`, `questionType`, `retrievalType`,
`assessmentType`, `resourceType`, `difficultyLevel`, `furtherReading.title` / `author` / `citation`,
`commonMisconceptions.misconception` (quoted verbatim in the UI),
`errorPatterns[].description`, and `contentBlocks[].altText`.

Revision 1 listed `options[]` under inline markdown. That was wrong: option text is escaped
everywhere it appears, so `**bold**` in an option shows the asterisks.

---

## sections

### motivationHooks

| Field | Type | Status | Notes |
|---|---|---|---|
| `type` | `real-world-stakes` \| `prediction-gap` \| `curiosity-prompt` \| `relevance-anchor` \| `prediction-resolution` | Executed | `prediction-resolution` renders at the **end** of the section, after the last experience. All other types render on the section intro. Unrecognized types still render, with a generic icon. |
| `hookId` | string | Executed | Lets a resolution or `sectionSummary` point back at a specific opening hook. |
| `prompt` | string | Displayed | Inline markdown. |
| `resolvesHookId` | string | Executed | Only on `prediction-resolution` hooks. When it resolves, the original hook's prompt is quoted back to the learner. Warned at load if it matches no `hookId` in the same section. |

### sectionSummary

Optional recap card rendered after the section's last experience, following any
`prediction-resolution` hook. Renders only if `content` or a non-empty `keyTakeaways` is present.

```json
"sectionSummary": {
  "content": "You should now believe three things: ...",
  "resolvesHookId": "hook-s1-prediction",
  "keyTakeaways": ["Rendering is pure and DOM-free", "Commit is synchronous"]
}
```

| Field | Type | Status | Notes |
|---|---|---|---|
| `content` | string | Displayed | Block markdown. 3–6 key claims, framed as "what you should now believe." |
| `resolvesHookId` | string | Validated | Warned if it matches no `hookId` in the section. The player does not render a back-link from the summary itself — only `prediction-resolution` hooks do that. |
| `keyTakeaways` | string[] | Executed | Rendered as a checklist, **and** collected into the flashcard deck (see [Flashcards](#flashcards)). |

### furtherReading

All fields are displayed. `url` is passed through URL sanitization (only `http:`, `https:`, `mailto:`
and fragment URLs survive). `citation` renders only when `url` is absent.

---

## learningExperiences

| Field | Status | Notes |
|---|---|---|
| `experienceId` | Executed | Unique; keys learner answers, checkpoints, and review back-links. |
| `title` | Displayed | — |
| `experienceType` | Displayed | Label only. |
| `difficultyProfile.overall` | Displayed | Difficulty dots. |
| `difficultyProfile.conceptualComplexity` / `ambiguity` | Displayed | Shown in the experience header when non-zero. |
| `estimatedDurationMinutes` | Displayed | — |
| `linkedCompetencies` | Executed | Every scored event in the experience records evidence against these. Validated. |
| `desiredCognitiveActions` | Displayed | Colored tags. `elaboration` is a valid value. |

---

## interactionSequence

| Field | Status | Notes |
|---|---|---|
| `interactionId` | Executed | Unique within experience; keys answers, reveals, and missed-item review entries. |
| `interactionType` | Executed | See table below. |
| `prompt` | Displayed | Block markdown. |
| `required` | Executed | Free-text interactions refuse to submit empty. Has no effect on multiple-choice, drag-drop, or likert. |
| `responseFormat` | Partially executed | Only the value `likert` does anything, and only in combination with `interactionType: "reflection"`. Otherwise inert — the input type is chosen from `interactionType`. |
| `revealCondition` | **Inert** | Not read. Everything reveals immediately after response. |
| `options` | Executed | Required for multiple-choice, drag-drop, and likert. Escaped, not markdown. |
| `correctIndex` | Executed | Multiple-choice scoring; drag-drop fallback key. |
| `correctOrder` | Executed | Drag-drop positional scoring. |
| `optionFeedback[]` | Displayed | Shown after reveal. |
| `feedback` | Displayed | See below. |
| `confidencePrompt` | Executed | See below. |

### Interaction types

| `interactionType` | Input | Evidence recorded |
|---|---|---|
| `multiple-choice` | Option list (requires `options`) | `mc`, weight 0.5, score 1 or 0 |
| `drag-drop` | Reorderable list (requires `options`) | `ranking`, weight 0.5, positional score |
| `reflection` with `responseFormat: "likert"` | Likert row (requires `options`) | `participation`, weight override **0.05** |
| `prediction`, `reflection`, `elaboration`, `scenario-analysis`, `compare-responses` | Textarea + submit | `participation`, weight 0.15, score 1 |
| `code-challenge` **(v6.1)** | Code editor + Run/Check (requires `codeExercise`) | `code`, weight 0.6, score from the attempt ladder |
| `predict-run` **(v6.1)** | Prediction box, then the real output (requires `codeExercise`) | `participation`, weight 0.15, score 1 |

Any other `interactionType` falls through to the textarea but gets **no submit button** — it will
render and never record. Stick to the enumerated values.

`elaboration` is mechanically identical to `reflection`: a free-text prompt placed **after** an
explanation or worked example, asking the learner to restate or apply the idea in their own words.
It exists as a distinct type so authoring and analytics can separate *generation after instruction*
from open reflection, and so the player can style and label it as a closing beat.

### feedback

| Field | Notes |
|---|---|
| `type` | `elaborative` \| `corrective` \| `hint-only` \| `socratic`. With `socratic`, the hints are concatenated into the feedback body. With any unrecognized value (including `hint-only`), the player falls back to whichever of `elaborativeFeedback`, `correctiveFeedback`, or joined `hints` is present. |
| `elaborativeFeedback` | Block markdown. |
| `correctiveFeedback` | Block markdown. |
| `hints[]` | Inline markdown. Revealed one at a time via a *Need a hint?* control, shown only before the interaction is answered. |

For multiple-choice, the feedback header is chosen from correctness (`Correct` / `Not quite`)
regardless of `feedback.type`.

### confidencePrompt

Shape: `{enabled, scaleMin, scaleMax, prompt}`. Defaults: `scaleMin` 1, `scaleMax` 5, prompt
"How confident are you?". The slider starts at the midpoint.

Behavior when `learningModel.confidenceCalibrationEnabled` is true:

1. The slider renders before submit on interactions that set `enabled: true` and have not yet been answered.
2. The rating is stored in the answer record (`{choice, confidence}` / `{order, confidence}` / `{answer, confidence}`) and in exported progress files, and — when `analytics.calibrationTracking` is true — in the evidence ledger as a normalised `c` value.
3. After reveal, a calibration note is shown — but **only for multiple-choice and drag-drop**, since those are the only interactions with a computable score. Free-text and likert interactions capture confidence with no calibration feedback; likert does not capture it at all.
4. When `learningModel.confidenceSchedulingEnabled` is true, confidence modulates scheduling — see [reviewOnMiss](#reviewonmiss).

Confidence prompts exist **only on interactions**. Probes and assessment questions do not support them.

---

## Runnable code (v6.1)

Two interaction types — `code-challenge` and `predict-run` — plus the `code-playground` block all
read the same `codeExercise` object. Requires `codelab.js`; see
[The codelab.js dependency](#the-codelabjs-dependency).

### Languages

Only three execute. Anything else renders as a normal code block and produces a load-time warning.

| `language` | Accepted aliases | Runtime | Offline? |
|---|---|---|---|
| JavaScript | `js`, `jsx`, `javascript`, `node` | Built in | **Yes** — always |
| Python | `py`, `python`, `python3` | Pyodide, lazy-loaded from CDN (~10 MB first use, then cached) | No, first run needs network |
| SQL | `sql`, `sqlite` | sql.js, lazy-loaded from CDN (~1 MB first use, then cached) | No, first run needs network |

If a runtime cannot be fetched, the widget says so in plain language rather than hanging. **Author
JavaScript exercises if offline use matters.**

### `codeExercise`

| Field | Status | Applies to | Notes |
|---|---|---|---|
| `language` | Executed | all | See table above. |
| `starterCode` | Executed | challenge, playground | What the editor opens with. Supports `[[edit]]` markers. |
| `code` | Executed | `predict-run` | The read-only program the learner predicts. **Required** for `predict-run`. |
| `functionName` | Executed | `check.mode: "cases"` | The function the checker calls. Must be a plain identifier; anything else is rejected at run time. Called **synchronously, with no `await`** — see the warning under `codeExercise.check` below. |
| `testSource` | Executed | `check.mode: "tests"` | Author-supplied tests, appended after the learner's code. Shown to the learner read-only (see `showTests`). |
| `showTests` | Executed | `check.mode: "tests"` | Default `true`. Set `false` to hide author tests — rarely right, since the tests are the specification. |
| `setupSql` | Executed | SQL only | Schema and seed rows, run before the learner's query. |
| `check` | Executed | challenge | The grader. See below. |
| `solution` | Executed | challenge | Worked solution, revealed on request once earned. |
| `solutionNote` | Displayed | challenge | Optional line beneath the solution. Block markdown. |
| `solutionAfter` | Executed | challenge | Failed Checks before *Show solution* appears. Default `3`. Exhausting all hints also unlocks it. |
| `linkedMisconceptionId` | Executed | challenge | Surfaced on failure. Warned at load if unresolved. |
| `explanation` | Displayed | `predict-run` | Shown after the prediction resolves. Falls back to `feedback.elaborativeFeedback`. |

`feedback.hints[]` works exactly as it does elsewhere — revealed one at a time, and each one
revealed costs 0.1 of the final score.

### `codeExercise.check`

| `mode` | What it compares | Needs |
|---|---|---|
| `cases` | Return values from calling one function with argument lists | `functionName`, `cases[]` |
| `stdout` | Printed output against an expected string | `expectedOutput` |
| `tests` | A test suite must run and fully pass | `testSource`, or `describe(` in `starterCode` |
| `none` | Nothing — always marked correct | — (warned at load) |

**`cases`** is the workhorse and produces the clearest feedback: each case renders as a call
signature with expected and actual values side by side.

**`functionName` is invoked synchronously — the checker does not `await` its return value and
does not drain pending promises.** If `functionName` is an `async` function, or otherwise returns
a Promise, `expected` is compared against the *pending Promise itself*, which has no comparable
value and always fails, regardless of what the function actually resolves to. This mode is only
correct for functions whose return value is available the instant the call returns. If the logic
being tested is asynchronous — awaits a timer, a `Promise.all`, a network/IO stand-in — use
`check.mode: "tests"` instead, with an `async it()` that does
`expect(await targetFn(...)).toEqual(expected)`.

```json
"check": {
  "mode": "cases",
  "cases": [
    { "args": [[{ "price": 2 }, { "price": 3 }]], "expected": 5 },
    { "args": [[]], "expected": 0, "linkedMisconceptionId": "mis-reduce-seed" }
  ]
}
```

| Field | Notes |
|---|---|
| `args` | Array of arguments, spread into the call. `[[1,2]]` passes *one* array argument; `[1,2]` passes two. |
| `expected` | Compared by deep equality. |
| `name` | Optional label shown instead of the generated call signature. |
| `linkedMisconceptionId` | Per-case. The first failing case that declares one wins, overriding the exercise-level link. |

**`stdout`** compares printed output. `match` controls strictness:

| `match` | Behavior |
|---|---|
| `trim` | Default. Ignores leading/trailing whitespace on the whole output. |
| `exact` | Byte-for-byte after newline normalisation. |
| `normalize-whitespace` | Collapses runs of whitespace and trims each line. Forgiving of formatting. |
| `regex` | `expectedOutput` is treated as a regular expression, matched multiline. |

On failure this renders a **line-aligned diff** with trailing spaces and tabs made visible — which
is nearly always the actual explanation when output "looks identical".

**`tests`** runs a test suite. `minimumTests` (default 1) sets how many tests must exist, which is
what makes *"write the tests"* exercises gradeable: passing one trivial test is not enough. When
every test passes but there are too few, the learner is told exactly that rather than just "failed".

`timeoutMs` overrides the execution deadline (default 5000, or 15000 for Python).

### The JavaScript test environment

Test exercises run against a **Jest-compatible subset**, not Jest. Available:

- `describe`, `it` / `test`, `it.skip`
- `beforeEach`, `afterEach` — sync, promise, or `done` callback, run around every test
- `expect(...)` with `toBe`, `toEqual`, `toStrictEqual`, `toBeTruthy`, `toBeFalsy`, `toBeNull`,
  `toBeUndefined`, `toBeDefined`, `toBeNaN`, `toBeGreaterThan(OrEqual)`, `toBeLessThan(OrEqual)`,
  `toBeCloseTo`, `toContain`, `toContainEqual`, `toHaveLength`, `toHaveProperty`, `toMatch`,
  `toBeInstanceOf`, `toThrow`, `toHaveBeenCalled(Times|With)`, `toHaveBeenLastCalledWith`
- `.not`
- `.resolves` / `.rejects` for promises — but **only** chained with `toBe`, `toEqual`, `toContain`,
  `toHaveLength`, `toMatch`, `toBeTruthy`, or `toBeFalsy`. Any other matcher chained after
  `.resolves`/`.rejects` — including `toThrow` and `toBeInstanceOf`, both listed above — is not
  implemented and throws `"... is not a function"` at run time, failing the whole test. To assert
  on a rejection with any other matcher, write it out by hand instead of chaining:
  ```js
  let caught = null;
  try { await mightReject(); } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(Error);
  expect(caught.message).toMatch('reason');
  ```
  `.not` cannot be combined with `.resolves`/`.rejects` at all.
- `jest.fn()` with `mockReturnValue(Once)`, `mockImplementation(Once)`, `mockResolvedValue`,
  `mockRejectedValue`, `mockClear`, `mockReset`

**Not available:** module mocking (`jest.mock`), snapshots, fake timers, the CLI, and `it.only`
(accepted, but it does not filter). **`beforeAll` and `afterAll` are accepted and stored without
error but are never executed** — the runner only ever invokes `beforeEach`/`afterEach` hooks, so
anything written in a `beforeAll`/`afterAll` silently never runs. Use `beforeEach`/`afterEach`
instead, even for one-time-looking setup. **Say so in the course.** A `callout` stating that these
exercises use a compatible subset is an honest sentence that costs nothing.

For Python, `check.mode: "tests"` uses the standard library's `unittest` — define
`unittest.TestCase` subclasses and they are discovered automatically.

### Editable regions — `[[edit]]`

Mark the part the learner fills in with sentinel comments. Any line *containing* `[[edit]]` opens a
region and `[[/edit]]` closes it, so the markers work in `//`, `#` and `--` comment syntax alike.
The marker lines themselves are stripped before display and before execution.

```json
"starterCode": "function total(items) {\n  // [[edit]]\n  return 0;\n  // [[/edit]]\n}"
```

Locked lines render dimmed and uneditable; editable regions get a gold edge and a *your code*
label. Line numbering runs continuously across the whole program.

This is the code analogue of [`fadedVariant`](#workedexamplesfadedvariant) — the middle rung of
worked → faded → independent. **Use it.** Three editable lines inside twenty of context is a far
better first exercise than an empty editor, and it keeps the grader's `functionName` contract
stable. With no markers at all, the entire program is editable.

### Run vs Check — and why they are separate

**Run** executes and shows output. Unlimited, ungraded, records nothing.
**Check** runs the grader and can commit evidence.

This separation is load-bearing. If every execution were scored, learners would brute-force against
the checker and the competency ledger would fill with noise. It also protects
[confidence calibration](#confidenceprompt), which only means anything if the answer is committed
before feedback arrives.

**Evidence is recorded once per challenge, not once per Check.** The commit point is the first
passing Check, or revealing the solution while still unsolved. Iterating — exactly the behaviour
these exercises are meant to encourage — therefore costs nothing.

Score on that first pass:

| Situation | Score |
|---|---|
| Passed on the 1st Check | 1.0 |
| 2nd Check | 0.8 |
| 3rd Check | 0.6 |
| 4th or later | 0.4 (floor) |
| Each hint revealed | −0.1, never below 0.4 |
| Solution revealed | capped at 0.3 |
| Never passed, solution revealed | 0.3 × 0 = recorded as 0 |
| Never passed, never revealed | nothing recorded |

Recorded as `code` evidence at weight 0.6. When `learningModel.reviewOnMiss` is true, a score below
0.75 also enters the review queue.

### Authoring guidance

- **Give every challenge a failing case that matters.** The empty array, the boundary, the error
  path. A challenge whose cases all exercise the happy path teaches the happy path.
- **Attach misconceptions to the case that exposes them**, not just to the exercise. The learner
  sees the remediation at the moment they hit it.
- **Prefer `cases` over `stdout`** unless printing is genuinely the skill being taught. Output
  matching fails on trailing whitespace and teaches formatting, not thinking.
- **Both directions of a test exercise are valuable.** Author the code and have the learner write
  tests (`testSource` empty, `minimumTests` ≥ 3); or author the tests and have the learner fix the
  code (`testSource` supplied, `starterCode` deliberately broken). The second is the better
  introduction; the first is the better assessment.
- **Use `predict-run` before you explain**, not after. Its value is the commitment.
- Keep starter code under ~25 lines. Beyond that, lock most of it.

---

## workedExamples

| Field | Status | Notes |
|---|---|---|
| `exampleId` | Executed | Keys the faded-variant answer record. |
| `title` | Displayed | **New in revision 2.** Optional. Used as flashcard context for faded steps; falls back to "Worked example". |
| `problem` | Displayed | Block markdown. |
| `steps[]` | Displayed | Block markdown, rendered as an ordered list. |
| `conclusion` | Displayed | Block markdown. |
| `fadedVariant` | Executed | See below. |

### workedExamples.fadedVariant

The middle rung of the *worked → faded → independent* progression, rendered immediately after its
worked example.

| Field | Type | Notes |
|---|---|---|
| `problem` | string | A parallel problem of the same class. Block markdown. |
| `givenSteps` | string[] | Steps provided to the learner. Block markdown. |
| `blankedStepPrompts` | string[] | One prompt per step the learner must supply (free text). |
| `blankedStepAnswers` | string[] | Model answers revealed after submission, index-aligned. |

Submitting records participation evidence (weight 0.15); the learner self-checks against the revealed
answers. Misaligned prompt/answer lengths produce a load warning, and such a variant contributes no
flashcards. Pair with a subsequent `transferExercise` or `selfGuidedExercise` to complete the
progression.

---

## selfGuidedExercise

| Field | Status | Notes |
|---|---|---|
| `objective` | Displayed | Block markdown. |
| `realWorldContext` | Displayed | Inline markdown, labelled *Where*. |
| `estimatedRealWorldDurationMinutes` | Displayed | — |
| `instructions[]` | Displayed | **Inline** markdown only. |
| `materialsOrPrerequisites[]` | Displayed | Inline markdown. |
| `reflectionPrompts[]` | Displayed | Inline markdown. |
| `verification.mode` | Displayed | Shown as a meta chip unless the value is `none`. |
| `verification.isGating` | **Inert** | Self-guided exercises are formative only and never gate; the field is not read. Author it as `false`. |
| `verification.selfAssessmentCriteria[]` | Displayed | Inline markdown. |

The exercise records no evidence of its own — it is entirely formative.

---

## retrievalPractice

| Field | Status | Notes |
|---|---|---|
| `retrievalItemId` | Executed | **Unique across the whole course** — keys the review schedule. |
| `retrievalType` | Displayed | Label. |
| `prompt` | Displayed | **Inline** markdown only. |
| `difficulty` | Displayed | Difficulty dots. |
| `schedule.initialReviewDays` | Executed | Default 1. |
| `schedule.subsequentReviewDays` | Executed | Default `[3, 7, 14, 30]`. |
| `schedule.decayParameters.strengthMultiplier` | Executed | Default 2. |
| `schedule.decayParameters.minimumIntervalDays` | Executed | Default 1. |
| `schedule.decayParameters.maximumIntervalDays` | Executed | Default 365. |
| `schedule.decayParameters.decayRate` | **Inert** | Reserved. |

Items are self-graded (`retrieval`, weight 0.5) and enter the review queue on first grading.

---

## transferExercises

| Field | Status | Notes |
|---|---|---|
| `exerciseId` | Executed | Also a valid target for `desiredOutcomes.verifiedBy`. |
| `context` | Displayed | Short label beside the section header. |
| `scenario` | Displayed | Block markdown. |
| `task` | Displayed | Block markdown. |
| `successCriteria[]` | Displayed | Inline markdown. The *Success criteria* heading renders even when the array is empty. |

Self-rated on a three-point scale (1 / 0.55 / 0.15) and recorded as `transfer` evidence, weight 0.8.

---

## masteryVerification

| Field | Status | Notes |
|---|---|---|
| `assessmentIds[]` | Executed | Renders buttons that open each assessment. Validated. |
| `requiredPerformance.minimumAccuracy` | **Displayed** | Shown as a percentage badge. Not enforced — nothing gates on it. |
| `requiredPerformance.minimumTransferScore` | **Displayed** | Same. |

---

## learningModel

| Field | Status | Notes |
|---|---|---|
| `masteryThreshold` | Executed | Default mastery bar, default 0.85. Per-competency `masteryThreshold` overrides. |
| `passingThreshold` | **Inert** | Never read or displayed. |
| `retrievalPracticeEnabled` | Displayed | Renders as a cover pill. Retrieval items render regardless of this flag. |
| `spacedRepetitionEnabled` | Displayed | Cover pill only; the review queue operates regardless. |
| `confidenceCalibrationEnabled` | Executed | Gates the confidence slider and calibration notes. |
| `confidenceSchedulingEnabled` | Executed | Default false. See [reviewOnMiss](#reviewonmiss). |
| `adaptiveDifficultyEnabled` | Executed | **Defaults to enabled.** The player suppresses adaptive serving only when this is explicitly `false`. An absent flag does not disable it. |
| `interleavingEnabled` | Executed | Gates in-lesson interleaving. |
| `interleavingGroups[]` | Executed | See below. |
| `reviewOnMiss` | Executed | Default false. |
| `missedItemSchedule` | Executed | See below. |

### reviewOnMiss

```json
"reviewOnMiss": true,
"missedItemSchedule": { "initialReviewDays": 1, "subsequentReviewDays": [3, 7, 14, 30] }
```

When `reviewOnMiss` is true, any auto-scored item answered **incorrectly** is synthesized into a
review-queue item:

- Sources: interaction multiple-choice; interaction drag-drop scoring below 0.75; scored PKC probes; assessment multiple-choice (both the standard and adaptive paths). Written assessment answers self-rated *Weak* (0.25) also qualify.
- The review item's cue is the item's `prompt` — or, **for assessment questions only**, `reviewPromptOverride` when present. Interaction and probe overrides are not used by the review queue (they are used by flashcards).
- Keyed by the item's `interactionId` / `probeId` / `questionId` in `state.reviewSchedule`, tagged `kind: "missed"`, scheduled per `missedItemSchedule`, and interleaved into the existing review queue alongside `retrievalPractice` items.
- Re-answering in review advances a ladder of `[initialReviewDays, ...subsequentReviewDays]`: a self-grade ≥ 0.75 steps up and increments a streak; ≥ 0.4 halves the current interval and resets the streak; below that resets to the first rung. Three consecutive successes retire the item from the queue (its evidence remains in the ledger).
- With `confidenceSchedulingEnabled`: a *correct* multiple-choice answer given at low confidence (< 40% of the scale) also enters the queue at `initialReviewDays`; a *miss* at high confidence (> 80%) is flagged **miscalibrated** and badged in the review UI.

No course-file changes are required to benefit — flipping the flag activates it for every auto-scored
item in an existing course.

### interleavingGroups

**Corrected in revision 2.** Selection is driven by `experienceIds`, not `competencyIds`.

When `interleavingEnabled` is true and an experience appears in a group's `experienceIds`, the player
gathers the `retrievalPractice` items belonging to the group's *other* listed experiences, ranks them
(due first, then previously practiced, then most recently reviewed), and injects up to `injectCount`
of them — rendered between the transfer/retrieval flow and the mastery block, labeled as interleaved
practice. Grades feed the normal retrieval scheduler.

| Field | Status | Notes |
|---|---|---|
| `groupId` | Displayed | Used in validation messages. |
| `competencyIds[]` | **Validated only** | Linkage-checked at load. Not used to select items. A group whose siblings are described only by `competencyIds` will inject nothing. |
| `experienceIds[]` | Executed | The actual selection pool. Needs at least two entries to produce any injection. |
| `injectCount` | Executed | Default 1. `0` keeps a group advisory-only. |
| `rationaleNote` | **Inert** | Not rendered. |

Authoring implication: list every experience whose retrieval items should cross-pollinate, and keep
`competencyIds` accurate for documentation and validation.

---

## priorKnowledgeCheck

| Field | Status | Notes |
|---|---|---|
| `enabled` | Executed | Gates the pre-course screen and the cover's start-button label. |
| `placement` | **Inert** | Always `before-course` in practice. |
| `probeQuestions[].probeId` | Executed | Keys answers and missed-item review entries. |
| `probeQuestions[].prompt` | Displayed | Block markdown. |
| `probeQuestions[].questionType` | Executed | `multiple-choice` renders options; everything else renders a textarea. |
| `probeQuestions[].options` / `correctIndex` | Executed | Auto-scored; records `pkc` evidence, weight 0.4. |
| `probeQuestions[].optionFeedback[]` | Displayed | Shown after answering, with linked misconception. |
| `probeQuestions[].linkedCompetencies` | Executed | Validated. |
| `probeQuestions[].scoringCriteria[]` | Displayed | Inline markdown. Rendered beneath short-answer probes under the heading *What a strong answer covers*. Not shown for multiple-choice probes. |
| `probeQuestions[].routingRules[]` | **Inert** | Not rendered. Revision 1 described these as "displayed, not executed"; they are neither. |
| `probeQuestions[].reviewPromptOverride` | Executed (flashcards) | **New in revision 2.** Used as the flashcard front for this probe. Not used by the review queue. |

Short-answer probes record participation evidence and are never auto-scored.

---

## competencies

| Field | Status | Notes |
|---|---|---|
| `competencyId` | Executed | The hub ID everything links to. |
| `title` | Displayed | Used on every competency tag and in the mastery sidebar. |
| `description` | Displayed | Competency detail. |
| `taxonomyLevel` | **Inert** | Not read. |
| `difficultyProfile.overall` | Displayed | — |
| `difficultyProfile.conceptualComplexity` / `ambiguity` | Displayed | — |
| `difficultyProfile.technicalSkill` / `readingDemand` | **Inert** | Not read. |
| `transferRequired` | **Inert** | Not read; transfer exercises are never gated on it. |
| `masteryThreshold` | Executed | Overrides `learningModel.masteryThreshold`. Also sets the boundaries for the intermediate mastery labels (see below). |
| `desiredOutcomes[].outcomeId` | Validated | Used in warnings. |
| `desiredOutcomes[].description` | Displayed | Listed on the cover as course outcomes. |
| `desiredOutcomes[].verifiedBy[]` | Validated | Must match an `assessmentId` or a transfer `exerciseId`. |
| `desiredOutcomes[].verificationCriteria` | **Inert** | Not read. |
| `commonMisconceptions[].misconceptionId` | Executed | Referenced by `optionFeedback` and `errorPatterns`. |
| `commonMisconceptions[].misconception` | Displayed | Quoted verbatim in feedback and as a flashcard front. |
| `commonMisconceptions[].whyIncorrect` | Executed (flashcards) | The correction side of a misconception flashcard. A misconception without it produces no card. |
| `commonMisconceptions[].remediationStrategy` | **Inert** | Not read. Put the learner-facing correction in `whyIncorrect`. |
| `commonMisconceptions[].linkedErrorPatterns[]` | **Inert** | Not read; the reverse link (`errorPatterns[].linkedMisconceptionId`) is the one that works. |

---

## assessments — adaptive difficulty

`adaptiveDifficulty: true` changes serving behavior, unless `learningModel.adaptiveDifficultyEnabled`
is explicitly `false` or the assessment has no scorable multiple-choice questions. Optional tuning via
`adaptiveRules`:

| Field | Default | Behavior |
|---|---|---|
| `startDifficulty` | 2 | Level the serving loop starts at. |
| `promoteAfter` | 2 | Consecutive correct answers before stepping up one difficulty level. |
| `demoteAfter` | 1 | Consecutive incorrect answers before stepping down one level. |
| `servePerLevel` | 2 | Questions served at a level before forced promotion (prevents stalling). |

Serving picks the nearest unanswered question to the current level, searching outward by distance and
preferring the higher level on ties; questions without a `difficulty` are treated as level 3. Levels
are clamped to 1–5. Adaptive serving applies to multiple-choice questions with `options` and a
`correctIndex`, served one at a time with feedback between each; written questions are appended after
the adaptive phase in authored order. When `adaptiveDifficulty` is false, all questions render at once
in authored order — exactly as v5.

**Authoring implication:** an adaptive assessment needs MC coverage across at least three difficulty
levels to adapt meaningfully; the loader warns when it doesn't.

### questions[]

| Field | Status | Notes |
|---|---|---|
| `questionId` | Executed | Unique within assessment; keys the missed-item review entry. |
| `difficulty` | Executed | Consumed by adaptive serving; also displayed. Missing values are treated as 3. |
| `prompt` | Displayed | Block markdown. |
| `questionType` | Executed | `multiple-choice` with a valid `options` array is auto-scored; anything else renders as free text with a rubric. |
| `options` / `correctIndex` | Executed | Auto-scored as `assessment` evidence, weight 1.0. |
| `optionFeedback[]` | Displayed | The chosen option's feedback, plus the correct option's feedback when wrong. |
| `successCriteria[]` | Displayed | Shown post-submit for written questions. |
| `rubric.excellent` / `adequate` / `weak` | Displayed | Drive the self-rating row (1 / 0.6 / 0.25). |
| `reviewPromptOverride` | Executed | Recall cue used when this question enters the review queue via `reviewOnMiss`, and as the flashcard front. |
| `errorPatterns[]` | Displayed | Shown after submission for written questions and after a wrong adaptive answer. `linkedMisconceptionId` is validated. |

---

## glossary — auto-linking

At render time the player scans rendered text blocks, callout bodies, **and section summary bodies**
for glossary terms (longest-match-first, whole-word, case-insensitive) and wraps the **first
occurrence per experience screen** as a tappable link that opens the glossary drawer filtered to that
term. Terms contributed by `key-terms` blocks (`addToGlossary: true`, the default) participate. Code
blocks, links, buttons, disclosure summaries, prompts, and options are never auto-linked. No schema
change is required — existing glossaries light up automatically.

Definitions accept inline markdown in the drawer, and are used verbatim as the link's tooltip.

---

## Flashcards

**Undocumented in revision 1.** The player builds shuffled recall decks from course content. Authors
should know which fields become cards, because content authored for one purpose shows up here.

| Source | Front | Back | Requirements |
|---|---|---|---|
| Glossary terms | Term (or definition, in reverse mode) | Definition | Both non-empty. Includes merged `key-terms`. |
| Lesson questions | Interaction `reviewPromptOverride` or `prompt` | Correct option, plus its `optionFeedback` or `elaborativeFeedback` | Multiple-choice with `options` + `correctIndex`; drag-drop with a full `correctOrder`. |
| Prior-knowledge probes | Probe `reviewPromptOverride` or `prompt` | Correct option + feedback | Multiple-choice probes only. |
| Assessment questions | Question `reviewPromptOverride` or `prompt` | Correct option + feedback | `questionType: "multiple-choice"` with `options` + `correctIndex`. |
| Worked-example steps | `fadedVariant.blankedStepPrompts[i]` | `fadedVariant.blankedStepAnswers[i]` | Arrays must be non-empty, equal length, and both entries non-empty. |
| Section takeaways | "What should you now be able to state about *<section title>*?" | `sectionSummary.keyTakeaways[]` as a list | At least one non-empty takeaway. |
| Misconceptions | The misconception, quoted | `whyIncorrect` | `whyIncorrect` must be authored. |

This is why `reviewPromptOverride` is worth adding to interactions and probes even though the review
queue ignores it there: it strips answer-revealing context from the flashcard front.

---

## Evidence and mastery

Each scored event appends an attempt `{s, w, t, k}` to the competency ledger —
score 0–1, weight, timestamp, kind — plus `c` (normalised confidence) when
`analytics.calibrationTracking` is on and a rating was captured. See
[analytics and calibration](#analytics-and-calibration).

| Kind | Weight | Produced by |
|---|---|---|
| `assessment` | 1.0 | Assessment MC auto-scoring and written self-ratings |
| `transfer` | 0.8 | Transfer exercise self-ratings |
| `code` | 0.6 | **v6.1.** Code challenges, once, on first pass or solution reveal |
| `mc` | 0.5 | Interaction multiple-choice |
| `ranking` | 0.5 | Interaction drag-drop |
| `retrieval` | 0.5 | Retrieval practice and all review-queue grading |
| `pkc` | 0.4 | Scored prior-knowledge probes |
| `participation` | 0.15 | Free-text interactions, faded variants, short-answer probes, completing an experience |
| *(override)* | 0.05 | Likert reflections |

Progress = decay-weighted mean accuracy × evidence saturation, where saturation is
`min(1, total weight / 3.0)`. When `masterySystem.decayModelEnabled` is true, each attempt's weight is
multiplied by `0.5 ^ (days / 30)`. A single lucky answer therefore cannot reach mastery, and unused
knowledge drifts down.

Mastery labels come from `masterySystem.masteryLevels` (four labels, novice → mastered; defaults
`['novice','developing','proficient','mastered']`) and are assigned at the competency's threshold,
65% of it, and 30% of it.

---

## Security

The player accepts arbitrary course files at runtime, so course-sourced strings are sanitized before
DOM injection. The design is escape-first: strings are HTML-escaped *before* any markdown transform,
so raw HTML in a course file is neutralized and markdown syntax is the only formatting channel.
`plain`-format strings are escaped and nothing else. Code block content is escaped verbatim before
highlighting. Markdown link targets are filtered to `http:`, `https:`, `mailto:` and fragment URLs.

Media sources — `contentBlocks[].url` (image, video, audio) and `courseMetadata.thumbnailImage` —
are filtered through a media-specific sanitizer that is deliberately more permissive than the link
sanitizer, because relative asset paths are a normal authoring pattern. It accepts:

- absolute `http:` / `https:` URLs
- protocol-relative (`//host/path`) and relative paths (`assets/x.png`, `/media/x.mp4`)
- `blob:` URLs and `data:image/*` payloads

Everything else — `javascript:`, `vbscript:`, `data:text/html`, and any other scheme — is rejected,
as are URLs containing control characters used to smuggle a scheme past the check. A rejected URL
renders the block's normal placeholder (or, for `thumbnailImage`, the completion seal) rather than a
broken element. Quote characters are escaped so a URL cannot break out of its attribute.

---

## Load-time validation

Hard errors (course does not load): root is not an object; `courseMetadata` missing; `sections`
missing or empty.

Warnings (course loads, report shown):

- `competencies[]` missing or empty.
- Unresolved `competencyId` in objectives, further reading, experiences, assessments, interleaving groups, or probes.
- Unresolved `assessmentId` in `masteryVerification`.
- `desiredOutcomes.verifiedBy` matching no assessment or transfer exercise.
- `errorPatterns.linkedMisconceptionId` matching no misconception.
- Interaction multiple-choice or drag-drop with no `options`, or multiple-choice with `options` but no `correctIndex`.
- Assessment multiple-choice without `options` or `correctIndex`.
- `prediction-resolution.resolvesHookId` or `sectionSummary.resolvesHookId` matching no `hookId` in the same section.
- `key-terms` block with empty `terms`.
- `fadedVariant` with misaligned `blankedStepPrompts` / `blankedStepAnswers` lengths.
- Adaptive assessment whose MC questions span fewer than three difficulty levels.

- Unknown `contentBlocks[].type` — renders nothing, so the warning is the only signal.
- Unknown `interactionType` — renders a text box with no submit control, so it can never be recorded.

**v6.1 — runnable code:**

- `code` block with `runnable: true` but a language that cannot be executed.
- `code-playground` with an unrunnable language.
- `code-challenge` or `predict-run` with no `codeExercise` block at all.
- `codeExercise.language` outside JavaScript / Python / SQL.
- `predict-run` without `codeExercise.code`.
- `code-challenge` with no `check.mode`, or `mode: "none"` — it would always be marked correct.
- `check.mode: "cases"` without `functionName`, or with an empty `cases[]`.
- `check.mode: "stdout"` without `expectedOutput`.
- `check.mode: "tests"` with neither `testSource` nor a `describe(` in `starterCode`.

---

## Progress files

Exported as `{courseId, exportedAt, state}`. Answer records may include `confidence`;
`reviewSchedule` entries carry `kind: "retrieval" | "missed"`, plus `streak`, `step`, `intervalDays`,
and an optional `flag: "miscalibrated"`; chunked experiences store the last checkpoint reached in
`state.checkpoint`. Older progress files import cleanly — missing fields default. Importing a file
whose `courseId` differs from the loaded course prompts for confirmation.

---

## Backward compatibility

| Scenario | Result |
|---|---|
| v5 course file, v6 player | Text blocks default to `plain` (no `schemaVersion`), no checkpoints, no summaries. Two behavioral deltas to know about: (1) confidence prompts and interleaving now actually appear if their `learningModel` flags were already true — set the flags false to suppress; (2) adaptive difficulty activates on any assessment with `adaptiveDifficulty: true` unless `adaptiveDifficultyEnabled` is explicitly false. |
| v6 course file, v5 player | Loads. Unknown block types render nothing; markdown displays as literal syntax; new fields are ignored. Author for v6 players. |
| v5 progress file, v6 player | Imports cleanly; missing fields default. |
| **v6 course file, v6.1 player** | Identical behaviour. v6.1 adds only new opt-in types and one new evidence kind; nothing existing changed. `codelab.js` is never fetched for a course that doesn't use it. |
| **v6.1 course file, v6 player** | Loads with warnings. `code-playground` blocks render nothing; `code-challenge` and `predict-run` render an empty textarea with no submit button. Both are warned at load, so the loss is reported rather than silent — but the exercises are gone. A course whose assessment depends on them needs a v6.1 player. |
| **v6.1 course, v6.1 player, `codelab.js` missing** | Every code widget renders a bordered "this exercise could not load" message. The rest of the lesson is completely unaffected. |
| **v6.1 progress file, v6 player** | Imports cleanly. Code answers sit unused in `answers`; `code` evidence attempts are counted in the ledger like any other kind, since the maths is weight-driven and does not enumerate kinds. |

---

## Resolved player defects

The four defects recorded in revision 2 were fixed in the player build dated 2026-08-29. They are
listed here for anyone running an older build.

| ID | Field | Symptom in earlier builds | Status |
|---|---|---|---|
| **PL-1** | `probeQuestions[].scoringCriteria[]` | Markup was built and never inserted, so criteria never appeared. | Fixed — rendered for short-answer probes. |
| **PL-2** | `contentBlocks[].url`, `courseMetadata.thumbnailImage` | Interpolated into `src` without escaping or scheme filtering. | Fixed — both routed through a media URL sanitizer; see [Security](#security). |
| **PL-3** | misconception flashcards | Context label read `competency.name`, which is not a schema field, so every card fell back to a generic label. | Fixed — reads `title`. `remediationStrategy` is now also accepted as a correction source, after `whyIncorrect`. |
| **PL-4** | `analytics.calibrationTracking` | Unimplemented; confidence never reached the evidence ledger. | Implemented — see [analytics](#analytics-and-calibration). |

If you are on a pre-fix build, treat `scoringCriteria` as inert, do not load untrusted course files,
and expect no calibration data.

---

## analytics and calibration

When `analytics.calibrationTracking` is true **and** a confidence rating was captured, each evidence
attempt gains a `c` field alongside `{s, w, t, k}` — the rating normalised to 0–1 against its own
`scaleMin`/`scaleMax`, so prompts using different scales stay comparable.

From that the player derives a per-competency readout, shown beneath the competency's progress bar on
the home screen once at least three rated attempts exist: mean confidence when correct, mean
confidence when incorrect, and a verdict of *well calibrated* / *leaning overconfident* /
*leaning underconfident*. Overconfidence is counted as a miss rated above 80% of the scale;
underconfidence as a correct answer rated below 40%.

Confidence reaches the ledger from the three interaction paths that capture it: free-text submits,
multiple-choice, and drag-drop. Likert reflections do not capture confidence, and probes and
assessment questions have no confidence prompt, so neither contributes calibration data.

The remaining `analytics` keys — `track`, `errorAnalysis` and its children — are still **Inert**.

---

## Migration guide (v5 course → v6)

1. Add `"schemaVersion": "6.0"` to `courseMetadata` (flips text blocks to markdown by default).
2. Rewrite text block `content`: convert caps pseudo-headings to `##`/`###`, run-on enumerations to lists, and split blocks that exceed ~300 words without a heading. Avoid nested lists — the renderer flattens them.
3. Extract inline definitions into `key-terms` blocks; extract emphasized asides into `callout` blocks; move any code out of prose into `code` blocks.
4. Add `checkpointAfter: true` roughly every 3–5 minutes of reading.
5. Add a `sectionSummary` — with `keyTakeaways`, which also become flashcards — and a `prediction-resolution` hook where a `prediction-gap` opened the section.
6. Flip `reviewOnMiss: true` and add `reviewPromptOverride` to any assessment question whose prompt gives away its own answer. Add it to interactions and probes too, for the flashcard deck.
7. Decide adaptive posture per assessment: add `adaptiveRules` and difficulty-spread MC coverage, or set `adaptiveDifficulty: false` — and remember that leaving `adaptiveDifficultyEnabled` unset does **not** turn adaptivity off.
8. Re-enable `confidencePrompt` blocks where calibration matters — prefer multiple-choice and drag-drop, since those are the only types that produce calibration feedback.
9. Populate `whyIncorrect` on every misconception you want as a flashcard; `remediationStrategy` is not read.
10. Check `interleavingGroups[].experienceIds` lists every experience that should cross-pollinate — `competencyIds` alone injects nothing.
11. Load the file into the player — the validation report will list anything the engine can see but not use.

## Authoring checklist (v6.1)

**Additionally, for courses using runnable code:** every `code-challenge` has an explicit
`check.mode` that can actually fail; every `cases` checker names a `functionName` and includes at
least one non-happy-path case; every `stdout` checker states its `match` strictness deliberately;
every `tests` exercise sets a `minimumTests` above 1; every challenge whose failure has a known
cause carries a `linkedMisconceptionId`, ideally on the specific case that exposes it; every
challenge longer than a few lines uses `[[edit]]` markers rather than presenting an empty editor;
every `predict-run` supplies `codeExercise.code` and an `explanation`; every course that uses
Python or SQL says somewhere that the first run needs a network connection; and every course that
uses `tests` states plainly that the environment is a Jest-compatible subset rather than Jest
itself.

## Authoring checklist (v6)

A course is well-formed for v6 when: every `multiple-choice` item has `options` and `correctIndex`;
every plausible distractor has `optionFeedback` and, where it embodies a known wrong belief, a
`linkedMisconceptionId`; every `drag-drop` item has a full `correctOrder`; every experience and
assessment lists accurate `linkedCompetencies`; every retrieval item has a tuned `schedule` and a
course-unique `retrievalItemId`; each competency sets a deliberate `masteryThreshold`; no text block
contains pseudo-headings or unformatted enumerations; no `options[]` entry relies on markdown; every
major concept has at least one non-text block (code, table, callout, key-terms, or media);
experiences longer than ~5 minutes use checkpoints; every section closes with a `sectionSummary`;
every `prediction-gap` has a matching `prediction-resolution`; every interaction uses one of the nine
enumerated `interactionType` values (seven in v6, plus `code-challenge` and `predict-run` in v6.1);
no interaction uses an unenumerated type (the loader now warns); and no course logic depends on a
field marked **Inert**.
