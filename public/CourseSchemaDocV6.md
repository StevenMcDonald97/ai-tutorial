# Course Engine JSON Schema — v6

Documentation for the course JSON consumed by the course player. A course is a single JSON object; every screen, interaction, score, and review the player produces is driven by this file. The schema reference lives in `exampleJsonV6.json`, where each field's value is a string describing its type and allowed values.

This revision extends v5 (schema v4.1). **Every v6 addition is optional-safe: a valid v5 course file is a valid v6 course file and renders identically** (see [Backward compatibility](#backward-compatibility)).

---

## What's new in v6

| Change | Kind | Where |
|---|---|---|
| Markdown content rendering (`format: "markdown"`) | Content model | `contentBlocks[]` text blocks, plus most prose-bearing strings |
| New block types: `code`, `callout`, `table`, `key-terms` | Content model | `contentBlocks[].type` |
| Progressive chunking (`checkpointAfter`) | Content model | any content block |
| Section summaries + `prediction-resolution` hook | Pedagogy | `sections[].sectionSummary`, `motivationHooks[]` |
| Missed items enter the review queue (`reviewOnMiss`) | Engine behavior | `learningModel` |
| Confidence prompts executed + calibration feedback | Engine behavior | `learningModel`, `confidencePrompt` |
| Adaptive difficulty executed (`adaptiveRules`) | Engine behavior | `assessments[]` |
| In-lesson interleaving executed (`injectCount`) | Engine behavior | `learningModel.interleavingGroups[]` |
| `elaboration` interaction type | Pedagogy | `interactionSequence[].interactionType` |
| Faded worked examples (`fadedVariant`) | Pedagogy | `workedExamples[]` |
| Glossary auto-linking | Engine behavior | `glossary`, `key-terms` blocks |
| Mandatory sanitization of course-sourced strings | Security | player requirement |
| `courseMetadata.schemaVersion` | Versioning | `courseMetadata` |

Fields that were *declared intent* in v5 and are now *executed* in v6: `confidenceCalibrationEnabled`, `adaptiveDifficultyEnabled` (via `assessments[].adaptiveDifficulty`), and `interleavingEnabled` (via `interleavingGroups`). Their meanings are unchanged; the player now honors them.

---

## Design principles (unchanged from v5, one addition)

**Everything is linked by ID.** Competencies are the hub: probes, experiences, objectives, assessments, and reading resources all point at `competencyId`s, and misconceptions/error patterns cross-reference each other by ID. The player validates these linkages at load.

**The course JSON is static; the engine owns time.** Nothing in the course file carries timestamps. Review due-dates, evidence timestamps, and decay live in learner state.

**Authored content degrades gracefully.** A missing block simply doesn't render; an unknown block `type` renders nothing. This is what makes v6 additive.

**Objective items are auto-scored; subjective items are self-graded.** Unchanged, including evidence weights.

**NEW — Structure lives in the schema, not in prose conventions.** v5 courses encoded headings as inline caps (`"WHY THIS MATTERS: ..."`) because text blocks were flat strings. In v6 this is an authoring error: use markdown headings, lists, and the dedicated block types. The renderer, search, accessibility, and future tooling all depend on structure being machine-readable.

---

## Top-level structure

Unchanged from v5, except `courseMetadata` gains `schemaVersion`. The loader hard-fails only on a missing `courseMetadata` or a missing/empty `sections`.

| Key | Type | Purpose |
|---|---|---|
| `courseMetadata` | object | Identity, description, difficulty, tags. **Required.** |
| `learningModel` | object | Global pedagogy switches and thresholds. |
| `priorKnowledgeCheck` | object | Optional pre-course probes with routing. |
| `competencies` | array | The skills being taught — the hub of the ID graph. |
| `sections` | array | Ordered course content. **Required.** |
| `assessments` | array | Formal checks linked via `masteryVerification`. |
| `retrievalSystem` | object | Declares the retrieval/spacing approach. |
| `masterySystem` | object | Mastery labels, decay, re-verification. |
| `analytics` | object | What the engine should track. |
| `glossary` | array | Term/definition pairs; **v6: auto-linked in content.** |

### courseMetadata.schemaVersion (new)

Optional string, e.g. `"6.0"`. Its one enforced effect: when present and ≥ `6.0`, text blocks default to `format: "markdown"`. When absent, text blocks default to `format: "plain"` so pre-v6 courses render byte-for-byte as before. Individual blocks can always override with their own `format`.

---

## The v6 content model — `contentBlocks[]`

This is the centerpiece of v6. `type` now accepts nine values; the first five carry the structural payload.

### `text`

| Field | Type | Notes |
|---|---|---|
| `blockId` | string | Unique within the experience. |
| `type` | `"text"` | — |
| `format` | `markdown` \| `plain` | Default depends on `schemaVersion` (see above). `markdown` renders full CommonMark plus GFM tables and fenced code blocks. Plain prose is valid markdown, so `"markdown"` is always safe to set. |
| `content` | string | The prose. |

**Authoring rules for markdown text:**

- Use `##`/`###` headings, never inline caps pseudo-headings. Reserve `#` — the experience title owns it.
- Break enumerations into real markdown lists, not `(1) ... (2) ...` run-ons.
- Fenced code blocks (```` ```lang ````) work inside text blocks. Prefer a dedicated `code` block when the code is the point (it gains `caption` and `highlightLines`); use fences for short incidental snippets.
- Keep paragraphs under ~5 sentences. If a text block exceeds ~300 words without a heading, split it.

### `code`

First-class code with syntax highlighting.

| Field | Type | Notes |
|---|---|---|
| `type` | `"code"` | — |
| `language` | string | Highlighter language id (`javascript`, `python`, `sql`, ...). Optional; omit for plain monospace. |
| `content` | string | The code, verbatim. Never markdown-processed. |
| `caption` | string | Optional caption below the block. |
| `highlightLines` | integer[] | Optional 1-based line numbers to visually emphasize. |

### `callout`

Semantic asides with consistent color/icon treatment (replacing ad-hoc emphasis in prose).

| Field | Type | Notes |
|---|---|---|
| `type` | `"callout"` | — |
| `variant` | `note` \| `warning` \| `insight` \| `definition` \| `example` | Controls styling. |
| `title` | string | Optional heading inside the callout. |
| `content` | string | Markdown body. |

Callouts complement `motivationHooks` (which are section-level framing); use callouts for in-flow emphasis inside an experience.

### `table`

| Field | Type | Notes |
|---|---|---|
| `type` | `"table"` | — |
| `headers` | string[] | Column headers. |
| `rows` | string[][] | Row cells; inline markdown permitted. |
| `caption` | string | Optional. |

(Markdown text blocks can also carry GFM tables; the dedicated type exists for programmatic authoring and consistent styling.)

### `key-terms`

Definitions as tappable chips instead of buried prose — and the bridge into the glossary.

| Field | Type | Notes |
|---|---|---|
| `type` | `"key-terms"` | — |
| `terms` | object[] | `{term, definition, addToGlossary}`. |
| `terms[].addToGlossary` | boolean | Default `true`. Merged into the course glossary at load; the course-file `glossary` wins on term collisions. |

### `image`, `video`, `audio`, `interactive`

Unchanged from v5 (`url`, `altText`, `captionOrTranscript`). Authors of technical or process-heavy material should treat at least one visual per major concept as the norm, not the exception — dual coding is a retention multiplier the schema has always supported and courses have underused.

### `checkpointAfter` — progressive chunking

Any content block may set `checkpointAfter: true`.

- **No block in an experience sets it** → the experience renders as one scroll, exactly as v5.
- **Any block sets it** → the player renders the experience in segments. Each segment shows content up to and including a checkpoint block, then a *Continue* control and segment progress dots ("2 of 5"). The final segment contains everything after the last checkpoint (interactions, retrieval, transfer, mastery).
- Segment position persists in learner state, so returning mid-lesson resumes at the last checkpoint.
- Authoring guidance: one checkpoint per 3–5 minutes of reading, ideally just before or after an interaction so each chunk ends in an active moment.

---

## Markdown scope elsewhere

Prose-bearing strings across the schema accept markdown in v6. Two tiers:

**Full markdown** (headings, lists, fenced code): `contentBlocks[].content` (text), `callout.content`, `workedExamples` fields, assessment/interaction `prompt`s, `feedback.elaborativeFeedback` / `correctiveFeedback`, `sectionSummary.content`, `transferExercises.scenario`/`task`, `selfGuidedExercise.instructions[]`.

**Inline-only markdown** (bold, italics, inline code — no block elements): `optionFeedback.feedback`, `options[]`, glossary definitions, `key-terms` definitions, hints, rubric levels, scoring/success criteria, `motivationHooks.prompt`.

Strings not listed (titles, IDs, labels, tags) are plain text.

---

## sections — additions

### motivationHooks — new type and pairing

`type` gains `prediction-resolution`, and hooks gain optional `hookId` / `resolvesHookId`:

| Field | Type | Notes |
|---|---|---|
| `type` | ... \| `prediction-resolution` | Rendered at the **end** of the section (after the last experience), explicitly resolving the opening prediction. All other hook types render on the section intro, as in v5. |
| `hookId` | string | Optional. Lets a resolution (or `sectionSummary`) point back at a specific opening hook. |
| `resolvesHookId` | string | Only on `prediction-resolution` hooks. Linkage-warned if it matches no hook in the same section. |

### sectionSummary (new)

Optional recap card rendered after the section's last experience (after any `prediction-resolution` hook):

```json
"sectionSummary": {
  "content": "You should now believe three things: ...",
  "resolvesHookId": "hook-s1-prediction",
  "keyTakeaways": ["Rendering is pure and DOM-free", "Commit is synchronous", "..."]
}
```

| Field | Type | Notes |
|---|---|---|
| `content` | string | Markdown. 3–6 key claims, framed as "what you should now believe." |
| `resolvesHookId` | string | Optional back-link to the opening `prediction-gap`. |
| `keyTakeaways` | string[] | Optional; rendered as a checklist beneath the prose. |

---

## interactionSequence — additions

### `elaboration` interaction type (new)

A free-text prompt placed **after** an explanation or worked example, asking the learner to restate or apply the idea in their own words ("In your own words, why does this matter for your current project?"). Mechanically identical to `reflection` (participation evidence, weight 0.15); it exists as a distinct type so authoring and analytics can separate *generation after instruction* from open reflection, and so the player can style it as a closing beat. Authoring guidance: one elaboration per major explanation; place it after the feedback/explanation, not before.

### confidencePrompt — now executed

Unchanged shape (`{enabled, scaleMin, scaleMax, prompt}`). v6 behavior when `learningModel.confidenceCalibrationEnabled` is true:

1. The slider renders before submit on interactions that define it.
2. The rating is stored in the answer record (`{choice, confidence, ...}`) and in exported progress files.
3. After reveal, a one-line calibration note is shown when confidence and correctness disagree ("You were 5/5 confident and incorrect — flagged for review") or strongly agree at the low end ("Low confidence but correct — worth one more pass").
4. When `learningModel.confidenceSchedulingEnabled` is true, confidence modulates scheduling — see [reviewOnMiss](#reviewonmiss--misses-feed-the-review-queue).

### workedExamples.fadedVariant (new)

The middle rung of the *worked → faded → independent* progression:

| Field | Type | Notes |
|---|---|---|
| `problem` | string | A parallel problem of the same class. |
| `givenSteps` | string[] | Steps provided to the learner. |
| `blankedStepPrompts` | string[] | One prompt per step the learner must supply (free text). |
| `blankedStepAnswers` | string[] | Model answers revealed after submission, index-aligned. |

Rendered immediately after its worked example. Submitting records participation evidence; the learner self-checks against the revealed answers. Pair with a subsequent `transferExercise` or `selfGuidedExercise` to complete the progression.

---

## learningModel — new engine behaviors

### reviewOnMiss — misses feed the review queue

```json
"reviewOnMiss": true,
"missedItemSchedule": { "initialReviewDays": 1, "subsequentReviewDays": [3, 7, 14, 30] }
```

When `reviewOnMiss` is true, any auto-scored item answered **incorrectly** is synthesized into a review-queue item:

- Sources: interaction multiple-choice and drag-drop, scored PKC probes, assessment multiple-choice. Written assessment answers self-rated *Weak* also qualify.
- The review item's cue is the item's `prompt` — or the question's `reviewPromptOverride` when present (use it to strip answer-revealing context such as the options list).
- Keyed by the item's `interactionId`/`probeId`/`questionId` in `state.reviewSchedule`, tagged `kind: "missed"`, scheduled per `missedItemSchedule` (same ladder mechanics as retrieval items), and interleaved into the existing review queue alongside `retrievalPractice` items.
- Re-answering correctly in review advances the ladder; three consecutive successes retire the item from the queue (its evidence remains in the ledger).
- With `confidenceSchedulingEnabled`: a *correct* answer given at low confidence (< 40% of the scale) also enters the queue at `initialReviewDays`; a *miss* at high confidence (> 80%) is flagged **miscalibrated** in the review UI.

This is deliberately conservative: no course-file changes are required to benefit — flipping the flag activates it for every auto-scored item in an existing course.

### interleavingGroups — now executed

When `interleavingEnabled` is true and an experience appears in a group's `experienceIds`, the player injects up to `injectCount` (default 1) retrieval items drawn from the group's *other* competencies — preferring due items, else the most recently practiced — rendered between the content/interaction flow and the mastery block, labeled as interleaved practice. Grades feed the normal retrieval scheduler. Set `injectCount: 0` to keep a group advisory-only.

---

## assessments — adaptive difficulty, executed

`adaptiveDifficulty: true` now changes serving behavior. Optional tuning via `adaptiveRules`:

| Field | Default | Behavior |
|---|---|---|
| `startDifficulty` | 2 | First question served is the first unanswered question at this difficulty. |
| `promoteAfter` | 2 | Consecutive correct answers before stepping up one difficulty level. |
| `demoteAfter` | 1 | Consecutive incorrect answers before stepping down one level. |
| `servePerLevel` | 2 | Max questions served at a level before forced promotion (prevents stalling). |

Adaptive serving applies to auto-scorable (multiple-choice) questions, served one at a time; written questions are appended after the adaptive phase in authored order. Levels with no remaining questions are skipped in the promotion/demotion direction. When `adaptiveDifficulty` is false, all questions render at once in authored order — exactly as v5. **Authoring implication:** an adaptive assessment needs MC coverage across at least three difficulty levels to adapt meaningfully; the loader warns when it doesn't.

`questions[]` gains one optional field:

| Field | Type | Notes |
|---|---|---|
| `reviewPromptOverride` | string | Recall cue used when this question enters the review queue via `reviewOnMiss`, replacing the raw prompt. |

---

## glossary — auto-linking

At render time the player scans text and callout content for glossary terms (longest-match-first, whole-word, case-insensitive) and wraps the **first occurrence per experience** as a tappable link that opens the glossary drawer filtered to that term. Terms contributed by `key-terms` blocks (`addToGlossary: true`) participate. Code blocks, prompts, and options are never auto-linked. No schema change is required — existing glossaries light up automatically.

---

## Security — sanitization is mandatory

The player accepts arbitrary course files at runtime, so **all course-sourced strings must be sanitized before DOM injection** — this is a v6 conformance requirement for player implementations, not an authoring field. Markdown is rendered then sanitized (allow-list: standard markdown output elements; strip `script`, `style`, event handlers, `javascript:` URLs). `plain`-format strings are HTML-escaped. Raw HTML embedded in markdown is stripped, not rendered — markdown syntax is the only formatting channel. Code block content is always escaped verbatim.

---

## Engine mechanics carried forward unchanged

The mastery ledger formula, evidence weights, retrieval ladder and lifecycle, decay model, progress-file format, and load-time validation all carry forward from v5 unchanged, with these additions:

- **Evidence ledger:** when `analytics.calibrationTracking` is true and confidence is collected, events retain `{confidence}` alongside `{s, w, t, k}`, enabling per-competency calibration reporting.
- **Progress files:** answer records may include `confidence`; `reviewSchedule` entries may carry `kind: "retrieval" | "missed"` and, for chunked experiences, learner state stores the last checkpoint reached. Older progress files import cleanly (missing fields default).
- **Validation warnings added in v6:** `resolvesHookId` matching no hook in its section; `fadedVariant` with misaligned `blankedStepPrompts`/`blankedStepAnswers` lengths; adaptive assessments with MC questions spanning fewer than three difficulty levels; `key-terms` blocks with empty `terms`; unknown `contentBlocks[].type` (renders nothing, as always).

---

## Backward compatibility

| Scenario | Result |
|---|---|
| v5 course file, v6 player | Renders identically to v5. Text defaults to `plain` (no `schemaVersion`), no checkpoints, no summaries, dormant features stay dormant unless their `learningModel` flags were already true — in which case confidence prompts and interleaving now actually appear (this is the one behavioral delta; set the flags false to suppress). |
| v6 course file, v5 player | Loads. Unknown block types render nothing; markdown displays as literal syntax; new fields are ignored. Author for v6 players. |
| v5 progress file, v6 player | Imports cleanly; missing fields default. |

---

## Migration guide (v5 course → v6)

1. Add `"schemaVersion": "6.0"` to `courseMetadata` (flips text blocks to markdown by default).
2. Rewrite text block `content`: convert caps pseudo-headings to `##`/`###`, run-on enumerations to lists, and split blocks that exceed ~300 words without a heading.
3. Extract inline definitions into `key-terms` blocks; extract emphasized asides into `callout` blocks; move any code out of prose into `code` blocks.
4. Add `checkpointAfter: true` roughly every 3–5 minutes of reading.
5. Add a `sectionSummary` (and a `prediction-resolution` hook where a `prediction-gap` opened the section) to every section.
6. Flip `reviewOnMiss: true` and add `reviewPromptOverride` to any assessment question whose prompt gives away its own answer.
7. Decide adaptive posture per assessment: add `adaptiveRules` and difficulty-spread MC coverage, or set `adaptiveDifficulty: false` to stop advertising it.
8. Re-enable `confidencePrompt` blocks where calibration matters (predictions, high-stakes MC), and set `confidenceSchedulingEnabled` if you want confidence to drive scheduling.
9. Load the file into the player — the validation report will list anything the engine can see but not use.

## Authoring checklist (v6)

A course is well-formed for v6 when: every `multiple-choice` item has `options` and `correctIndex`; every plausible distractor has `optionFeedback` and, where it embodies a known wrong belief, a `linkedMisconceptionId`; every `drag-drop` item has a full `correctOrder`; every experience and assessment lists accurate `linkedCompetencies`; every retrieval item has a tuned `schedule`; each competency sets a deliberate `masteryThreshold`; **no text block contains pseudo-headings or unformatted enumerations; every major concept has at least one non-text block (code, table, callout, key-terms, or media); experiences longer than ~5 minutes use checkpoints; every section closes with a `sectionSummary`; and every `prediction-gap` has a matching `prediction-resolution`.**
