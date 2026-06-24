# Course Engine JSON Schema — v5

Documentation for the course JSON consumed by `coursePlayerV4.html`. A course is a single JSON object; every screen, interaction, score, and review the player produces is driven by this file. The schema reference itself lives in `exampleJsonV4.json`, where each field's value is a string describing its type and allowed values.

This revision (v4.1) adds **machine-readable answer keys** (`options`, `correctIndex`, `correctOrder`, `optionFeedback`) to interactions, prior-knowledge probes, and assessment questions, and documents the engine behaviors that now consume the schema: the evidence-based mastery ledger, the spaced-repetition review queue, load-time validation, and portable progress files.

---

## Design principles

**Everything is linked by ID.** Competencies are the hub: probes, experiences, objectives, assessments, and reading resources all point at `competencyId`s, and misconceptions/error patterns cross-reference each other by ID. The player validates these linkages when a course is loaded (see [Validation](#validation-at-load-time)).

**The course JSON is static; the engine owns time.** Nothing in the course file carries timestamps. Review due-dates, evidence timestamps, and decay are computed and stored in learner state (browser `localStorage`, exportable as a progress file). The same course file can be redistributed to any number of learners.

**Authored content degrades gracefully.** Every array and object is optional-safe — a missing block simply doesn't render. The exceptions are the answer-key fields: a `multiple-choice` item without `options` falls back to a free-text box, and one without `correctIndex` cannot be scored. The loader warns about both.

**Objective items are auto-scored; subjective items are self-graded.** Multiple-choice and ranking items score against their answer keys. Free-recall, transfer, and written assessment answers are graded by the learner against rubrics and success criteria, at a trust-discounted weight. Both feed the same mastery ledger.

---

## Top-level structure

| Key | Type | Purpose |
|---|---|---|
| `courseMetadata` | object | Identity, description, difficulty, tags. **Required.** |
| `learningModel` | object | Global pedagogy switches and thresholds. |
| `priorKnowledgeCheck` | object | Optional pre-course probe questions with routing. |
| `competencies` | array | The skills being taught — the hub of the ID graph. |
| `sections` | array | Ordered course content; each contains `learningExperiences`. **Required.** |
| `assessments` | array | Formal checks linked from experiences via `masteryVerification`. |
| `retrievalSystem` | object | Declares the retrieval/spacing approach. |
| `masterySystem` | object | Mastery level labels, decay, re-verification flags. |
| `analytics` | object | What the engine should track. |
| `glossary` | array | Term/definition pairs for the glossary drawer. |

The loader hard-fails only on a missing `courseMetadata` or a missing/empty `sections`. Everything else produces warnings.

---

## courseMetadata

| Field | Type | Notes |
|---|---|---|
| `courseId` | string | Unique ID. Keys the learner's saved progress (`course-progress:<courseId>`) and is stamped into exported progress files. Changing it orphans existing saves. |
| `title`, `description` | string | Shown on the intro screen and sidebar. |
| `thumbnailImage` | url | Optional. |
| `estimatedDurationMinutes` | integer | Shown in the intro meta strip. |
| `difficultyLevel` | string | `novice` \| `intermediate` \| `advanced`. |
| `version` | string | Displayed on the completion seal. |
| `lastUpdated` | ISO-8601 date | Informational. |
| `language` | string | BCP-47 tag. |
| `tags` | string[] | Informational. |
| `prerequisites` | object[] | `{type: knowledge \| course \| assessment, description}`. Displayed, not enforced. |

---

## learningModel

Global switches and defaults. Per-competency settings override these where both exist.

| Field | Type | Engine behavior |
|---|---|---|
| `masteryThreshold` | float 0–1 | Default mastery bar for any competency that doesn't set its own. Falls back to `0.85` if absent. |
| `passingThreshold` | float 0–1 | Informational in the current player. |
| `retrievalPracticeEnabled` | boolean | Informational; retrieval items render whenever present. |
| `confidenceCalibrationEnabled` | boolean | Enables confidence prompts on interactions that define them. |
| `adaptiveDifficultyEnabled` | boolean | Declared intent; surfaced in the UI on assessments with `adaptiveDifficulty: true`. |
| `interleavingEnabled` | boolean | Declared intent. The review queue always interleaves due items across competencies. |
| `interleavingGroups` | object[] | `{groupId, competencyIds[], experienceIds[], rationaleNote}`. Competency IDs are linkage-validated at load. |
| `spacedRepetitionEnabled` | boolean | Declared intent; scheduling itself is driven per-item by `retrievalPractice[].schedule`. |

---

## priorKnowledgeCheck

An optional probe screen shown before the course (`placement: before-course`).

```json
"priorKnowledgeCheck": {
  "enabled": true,
  "placement": "before-course",
  "probeQuestions": [ ... ]
}
```

### probeQuestions[]

| Field | Type | Notes |
|---|---|---|
| `probeId` | string | Unique within the course. |
| `prompt` | string | The question. |
| `questionType` | string | `multiple-choice` \| `short-answer` \| `scenario-analysis`. |
| `options` | string[] | **Required for `multiple-choice`.** The choices shown. |
| `correctIndex` | integer | **Required for `multiple-choice`.** Index into `options[]`. Lets the engine score prior knowledge: a correct probe answer records a passing evidence event against the linked competencies; an incorrect one records a failing event. |
| `optionFeedback` | object[] | Per-option explanations shown immediately after answering. See [optionFeedback](#optionfeedback-the-distractor--misconception-map). |
| `linkedCompetencies` | string[] | `competencyId`s this probe measures. |
| `scoringCriteria` | string[] | Rubric-style criteria, shown for short-answer probes. |
| `routingRules` | object[] | `{condition, action}` strings describing what strong/weak performance should unlock. Currently advisory (displayed, not executed). |

Short-answer probes are not auto-scored; submitting one records a small participation event only.

---

## competencies

The skills the course teaches. Every scored event in the player lands on one or more of these.

| Field | Type | Notes |
|---|---|---|
| `competencyId` | string | The hub ID everything else links to. |
| `title`, `description` | string | Title appears in the sidebar mastery rail and on tags throughout the UI. |
| `taxonomyLevel` | string | `remember` \| `understand` \| `apply` \| `analyze` \| `evaluate` \| `create`. |
| `difficultyProfile` | object | Five 1–5 ratings: `overall`, `conceptualComplexity`, `ambiguity`, `technicalSkill`, `readingDemand`. |
| `transferRequired` | boolean | Declared intent. |
| `masteryThreshold` | float 0–1 | **Enforced.** This competency counts as mastered only when its computed progress reaches this value. Overrides `learningModel.masteryThreshold`. Level bands derive from it: proficient at ≥ 65% of threshold, developing at ≥ 30%. |
| `desiredOutcomes` | object[] | `{outcomeId, description, verifiedBy[], verificationCriteria}`. `verifiedBy` entries must match an `assessmentId` or transfer `exerciseId` (linkage-validated). |
| `commonMisconceptions` | object[] | See below. |

### commonMisconceptions[]

| Field | Type | Notes |
|---|---|---|
| `misconceptionId` | string | Referenced by `optionFeedback.linkedMisconceptionId` and `errorPatterns.linkedMisconceptionId`. |
| `misconception` | string | The wrong belief, stated as the learner would hold it. Quoted verbatim in the UI when a linked distractor is chosen. |
| `whyIncorrect` | string | Explanation. |
| `remediationStrategy` | string | Author guidance. |
| `linkedErrorPatterns` | string[] | Cross-reference to assessment `errorPatternId`s. |

Misconceptions earn their keep through linkage: when a learner picks a multiple-choice distractor whose `optionFeedback` carries a `linkedMisconceptionId`, the player surfaces the misconception text alongside the corrective feedback. This is the cheapest diagnostic loop in the schema — write each distractor to embody one misconception.

---

## sections

Ordered top-level units. Each renders a section-intro screen followed by its experiences.

| Field | Type | Notes |
|---|---|---|
| `sectionId` | string | Unique. |
| `title`, `description` | string | Section intro screen. |
| `learningObjectives` | object[] | `{objectiveId, description, linkedCompetencies[]}`. |
| `motivationHooks` | object[] | `{type, prompt}` where type is `real-world-stakes` \| `prediction-gap` \| `curiosity-prompt` \| `relevance-anchor`. |
| `furtherReading` | object[] | `{resourceId, title, resourceType, url, citation, author, rationaleNote, linkedCompetencies[]}`. |
| `learningExperiences` | array | The lessons. See below. |

### learningExperiences[]

| Field | Type | Notes |
|---|---|---|
| `experienceId` | string | Unique. Keys learner answers and review-queue back-links. |
| `title` | string | Sidebar and topbar label. |
| `experienceType` | string | `guided-analysis` \| `worked-example` \| `case-study` \| `simulation` \| `discussion` \| `self-guided-exercise`. |
| `difficultyProfile` | object | `overall`, `conceptualComplexity`, `ambiguity` (1–5). |
| `estimatedDurationMinutes` | integer | Shown in the experience header. |
| `linkedCompetencies` | string[] | **Every scored event inside this experience records evidence against these IDs.** |
| `desiredCognitiveActions` | string[] | `prediction` \| `analysis` \| `reflection` \| `retrieval` \| `comparison` \| `synthesis`. |
| `contentBlocks` | object[] | `{blockId, type, content, url, altText, captionOrTranscript}`. Types: `text`, `image`, `video`, `audio`, `interactive`. |
| `interactionSequence` | object[] | Active-learning items. See next section. |
| `workedExamples` | object[] | `{exampleId, problem, steps[], conclusion}`. |
| `selfGuidedExercise` | object | Real-world application task. Formative only — its `verification.isGating` must be `false`. |
| `retrievalPractice` | object[] | Recall items that feed the review queue. See [Retrieval practice](#retrievalpractice-and-the-review-queue). |
| `transferExercises` | object[] | `{exerciseId, context, scenario, task, successCriteria[]}`. Submitted answers are self-rated against the success criteria; the rating records high-weight transfer evidence. |
| `masteryVerification` | object | `{assessmentIds[], requiredPerformance:{minimumAccuracy, minimumTransferScore}}`. Assessment IDs are linkage-validated. |

---

## interactionSequence — items and answer keys

Each item in `interactionSequence` is one active-learning moment.

| Field | Type | Notes |
|---|---|---|
| `interactionId` | string | Unique within the experience. |
| `interactionType` | string | `prediction` \| `compare-responses` \| `reflection` \| `multiple-choice` \| `drag-drop` \| `scenario-analysis`. |
| `prompt` | string | The question or instruction. |
| `required` | boolean | Required items are flagged in the UI. |
| `responseFormat` | string | `short-answer` \| `multiple-choice` \| `ranking` \| `likert`. |
| `revealCondition` | string | `after-response` \| `after-attempt` \| `on-request`. |
| `options` | string[] | **Required for `multiple-choice`, `drag-drop`, and likert reflections.** Without it the item degrades to a free-text box (the loader warns). |
| `correctIndex` | integer | **Required for `multiple-choice`** — index of the correct option. For `drag-drop` it is the fallback key: if no `correctOrder` is given, the ranking is scored on whether the learner's top item matches it. |
| `correctOrder` | integer[] | For `drag-drop`: option indices in best-to-worst order. Enables positional scoring — the item's score is the fraction of positions the learner gets exactly right. |
| `optionFeedback` | object[] | Per-option explanations. See below. |
| `feedback` | object | `{type: elaborative \| corrective \| hint-only \| socratic, elaborativeFeedback, correctiveFeedback, hints[]}`. Shown after reveal; `hints` reveal progressively on request. |
| `confidencePrompt` | object | `{enabled, scaleMin, scaleMax, prompt}` — collects a confidence rating alongside the answer. |

### How interactions are scored

| Item | Score recorded | Evidence kind / weight |
|---|---|---|
| Multiple-choice | 1 if `choice === correctIndex`, else 0 | `mc` / 0.5 |
| Drag-drop with `correctOrder` | fraction of exactly-correct positions | `ranking` / 0.5 |
| Drag-drop with only `correctIndex` | 1 if top item correct, else 0.3 | `ranking` / 0.5 |
| Prediction / reflection / scenario free text | participation (score 1) | `participation` / 0.15 |
| Likert reflection | participation | `participation` / 0.05 |

### optionFeedback — the distractor → misconception map

```json
"optionFeedback": [
  {
    "optionIndex": 1,
    "feedback": "Reversing the arrow is just as unsupported — the data alone cannot pick a direction.",
    "linkedMisconceptionId": "mis-corr-cause"
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `optionIndex` | integer | Index into the item's `options[]`. |
| `feedback` | string | Why this specific option is right or wrong. Shown after the learner answers. |
| `linkedMisconceptionId` | string | Optional. When the learner picks this option, the linked misconception's text is quoted beneath the feedback — turning a wrong answer into a named diagnosis. |

The player shows the feedback for the chosen option, and — when the choice was wrong — also the feedback attached to the correct option. Authoring guidance: write feedback for every option, and give each plausible distractor a `linkedMisconceptionId` drawn from the relevant competency's `commonMisconceptions`.

---

## retrievalPractice and the review queue

| Field | Type | Notes |
|---|---|---|
| `retrievalItemId` | string | Unique across the whole course (it keys the learner's review schedule). |
| `retrievalType` | string | `free-recall` \| `cued-recall` \| `application` \| `scenario-analysis` \| `contrast`. |
| `prompt` | string | The recall cue. No stored answer — these are self-graded. |
| `difficulty` | integer 1–5 | Displayed. |
| `schedule.initialReviewDays` | integer | First interval after a successful in-lesson recall. Default 1. |
| `schedule.subsequentReviewDays` | integer[] | The interval ladder after the first. Default `[3, 7, 14, 30]`. |
| `schedule.decayParameters.strengthMultiplier` | float | Once the ladder is exhausted, each further success multiplies the interval by this. Default 2. |
| `schedule.decayParameters.minimumIntervalDays` | integer | Clamp floor. Default 1. |
| `schedule.decayParameters.maximumIntervalDays` | integer | Clamp ceiling. Default 365. |
| `schedule.decayParameters.decayRate` | float | Reserved for forgetting-curve models; not consumed by the current scheduler. |

### Lifecycle

In a lesson, the learner writes their recall, submits, and self-grades on a three-point scale: *Recalled it* (1.0), *Partially* (0.5), *Couldn't* (0). The grade records `retrieval` evidence (weight 0.5) and schedules the item:

| Self-grade | Scheduling effect |
|---|---|
| ≥ 0.75 | Advance one step up the interval ladder; beyond the ladder, multiply the current interval by `strengthMultiplier`. |
| 0.4 – 0.74 | Keep the ladder position but halve the current interval. |
| < 0.4 | Reset to step 0 (`initialReviewDays`). |

All intervals are clamped to `[minimumIntervalDays, maximumIntervalDays]`. The engine stores `{due, intervalDays, step, reps, lastScore, lastReviewed}` per item in learner state — never in the course file.

The **Review queue** screen (sidebar entry with a due-count badge, plus an intro-screen card) lists every item whose `due` has passed, interleaved round-robin across competencies so adjacent items exercise different skills. Source content is deliberately not shown — the learner recalls cold, self-grades, and the item is rescheduled. A *revisit lesson* link is available per item for genuine dead-ends.

---

## assessments

Formal checks, opened from an experience's `masteryVerification` or the sidebar.

| Field | Type | Notes |
|---|---|---|
| `assessmentId` | string | Referenced by `masteryVerification.assessmentIds` and `desiredOutcomes.verifiedBy`. |
| `title` | string | — |
| `assessmentType` | string | `scenario-analysis` \| `multiple-choice` \| `short-answer` \| `performance-task`. |
| `linkedCompetencies` | string[] | **All question scores in this assessment record evidence against these.** |
| `adaptiveDifficulty` | boolean | Surfaced in the UI as declared intent. |
| `questions` | object[] | See below. |

### questions[]

| Field | Type | Notes |
|---|---|---|
| `questionId` | string | Unique within the assessment. |
| `difficulty` | integer 1–5 | Displayed. |
| `prompt` | string | — |
| `questionType` | string | `short-answer` \| `multiple-choice` \| `scenario-analysis`. |
| `options` | string[] | **Required for `multiple-choice`.** Renders a choice UI instead of a textarea. |
| `correctIndex` | integer | **Required for `multiple-choice`.** On submit, each answered MC question is auto-scored 1/0 and recorded as `assessment` evidence (weight 1.0). |
| `optionFeedback` | object[] | Same shape as on interactions; shown per option after submission. |
| `successCriteria` | string[] | Shown post-submit for written questions. |
| `rubric` | object | `{excellent, adequate, weak}`. Post-submit, written answers get a self-rating row keyed to these levels: Excellent = 1.0, Adequate = 0.6, Weak = 0.25 — each recorded once as `assessment` evidence. |
| `errorPatterns` | object[] | `{errorPatternId, description, linkedMisconceptionId, remediationAction}`. Displayed as "watch for" diagnostics; misconception links are validated at load. |

Mixed assessments work naturally: MC questions score themselves on submit; each written question then shows its rubric and a one-time self-rating row. There is no blanket completion credit — only scored events move mastery.

---

## retrievalSystem, masterySystem, analytics, glossary

**retrievalSystem** — `{algorithm, confidenceWeighting, interleavingEnabled, retrievalModes[]}`. Declares the spacing approach; per-item `schedule` blocks are what the scheduler actually executes.

**masterySystem**

| Field | Type | Engine behavior |
|---|---|---|
| `masteryLevels` | string[] | The four level labels, novice → mastered, used in the sidebar rail. |
| `decayModelEnabled` | boolean | **Enforced.** When true, every evidence event's weight halves per 30 days at read time — mastery drifts down unless refreshed by reviews. |
| `reverificationRequired` | boolean | Declared intent. |

**analytics** — `{track[], errorAnalysis:{enabled, errorPatternTracking, misconceptionFrequencyLogging, linkedToMisconceptionIds[]}}`. Declarative; the evidence ledger retains per-event kind and timestamp, which is the raw material for these metrics.

**glossary** — `{term, definition}[]`, rendered in the searchable glossary drawer.

---

## The mastery ledger (how progress is computed)

Every scored event appends an attempt `{s: score 0–1, w: weight, t: timestamp, k: kind}` to the learner's per-competency evidence list. Progress for a competency is:

```
progress = (Σ wᵢ·sᵢ / Σ wᵢ)  ×  min(1, Σ wᵢ / 3.0)
           └── accuracy ──┘      └── saturation ──┘
```

with each `wᵢ` decayed by `0.5^(days/30)` when `masterySystem.decayModelEnabled` is true. The saturation term means a single lucky answer cannot reach mastery — roughly three assessment-grade events (or six interaction-grade ones) of perfect work are needed for full credit, and accuracy is what gets you over the competency's `masteryThreshold`.

Evidence weights by kind:

| Kind | Weight | Sources |
|---|---|---|
| `assessment` | 1.0 | Auto-scored MC questions; rubric self-ratings on written answers |
| `transfer` | 0.8 | Self-ratings against transfer success criteria |
| `mc` / `ranking` / `retrieval` | 0.5 | Interaction MC, drag-drop, retrieval self-grades |
| `pkc` | 0.4 | Scored prior-knowledge probes |
| `participation` | 0.15 | Free-text reflections, completions (0.05 for likert) |

---

## Validation at load time

A course can be loaded into the player at runtime ("Load course JSON" button, or drag a `.json` onto the window). The loader runs a linkage validator first.

**Errors (block the load):** root is not an object; missing `courseMetadata`; missing or empty `sections`.

**Warnings (load proceeds, report shown):** empty `competencies`; unresolved `competencyId` references from objectives, experiences, probes, further reading, assessments, or interleaving groups; `masteryVerification.assessmentIds` or `verifiedBy` entries matching no assessment or transfer exercise; `errorPatterns.linkedMisconceptionId` matching no misconception; multiple-choice items or questions missing `options`/`correctIndex` (they render but cannot be scored).

---

## Progress files

The player persists learner state in `localStorage` under `course-progress:<courseId>`, and can export/import it as JSON:

```json
{
  "courseId": "critical-thinking-101",
  "exportedAt": "2026-06-10T21:14:00.000Z",
  "state": {
    "completedExperiences": ["exp-..."],
    "competencyEvidence": { "causal-reasoning": { "attempts": [ { "s": 1, "w": 0.5, "t": 1760000000000, "k": "mc" } ] } },
    "reviewSchedule": { "rp-01": { "due": 1760086400000, "intervalDays": 3, "step": 1, "reps": 2 } },
    "answers": {}, "assessAnswers": {}, "assessSelfRatings": {}
  }
}
```

Importing a file whose `courseId` doesn't match the loaded course prompts for confirmation. Imports merge over a fresh state object, so files from older player versions load without breaking.

---

## Authoring checklist

A course is well-formed for v4.1 when every `multiple-choice` item (interaction, probe, or assessment question) has `options` and `correctIndex`; every plausible distractor has `optionFeedback` and, where it embodies a known wrong belief, a `linkedMisconceptionId`; every `drag-drop` item has a full `correctOrder`; every experience and assessment lists accurate `linkedCompetencies` (this is where its scores land); every retrieval item has a `schedule` tuned to the material's half-life; and each competency sets a deliberate `masteryThreshold`. Load the file into the player once before distribution — the validation report will list anything the engine can see but not use.
