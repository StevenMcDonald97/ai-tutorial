# Course Engine JSON Schema

**Technical Reference Documentation**

Version 1.0 | Learning Engine Schema

## Overview

This document describes the JSON schema used to define online learning courses for the adaptive course engine. The schema covers course metadata, learning model configuration, competencies, section content, assessments, retrieval scheduling, and analytics tracking.

The schema is designed around evidence-based learning principles: spaced retrieval practice, confidence calibration, mastery-based progression, elaborative feedback, and transfer-focused assessment.

## Top-Level Structure

The root object contains the following top-level keys:

|Field                |Type  |Required|Description                                                           |
|---------------------|------|--------|----------------------------------------------------------------------|
|`courseMetadata`     |object|Yes     |Identity and descriptive information about the course.                |
|`learningModel`      |object|Yes     |Global learning science configuration flags and interleaving groups.  |
|`priorKnowledgeCheck`|object|No      |Pre-course or pre-section knowledge probe with adaptive routing.      |
|`competencies`       |array |Yes     |Skills or knowledge areas the course develops and assesses.           |
|`sections`           |array |Yes     |Ordered list of course sections, each containing learning experiences.|
|`assessments`        |array |Yes     |Formal assessments linked to competencies.                            |
|`retrievalSystem`    |object|Yes     |Global retrieval practice algorithm and mode configuration.           |
|`masterySystem`      |object|Yes     |Mastery level definitions, decay model, and reverification rules.     |
|`analytics`          |object|Yes     |Tracking configuration including error analysis settings.             |
|`glossary`           |array |No      |Term definitions surfaced to learners during the course.              |

## courseMetadata

Descriptive and administrative information identifying the course.

|Field                     |Type         |Required|Description                                                                                              |
|--------------------------|-------------|--------|---------------------------------------------------------------------------------------------------------|
|`courseId`                |string       |Yes     |Unique identifier for the course (e.g. critical-thinking-101).                                           |
|`title`                   |string       |Yes     |Display title shown to learners.                                                                         |
|`description`             |string       |Yes     |Short summary of course content and goals.                                                               |
|`thumbnailImage`          |url          |No      |URL of the course thumbnail image.                                                                       |
|`estimatedDurationMinutes`|integer      |Yes     |Total estimated completion time in minutes.                                                              |
|`difficultyLevel`         |string       |Yes     |One of: novice, intermediate, advanced.                                                                  |
|`version`                 |string       |Yes     |Semantic version string (e.g. 2.0).                                                                      |
|`lastUpdated`             |ISO-8601 date|Yes     |Date of most recent content update.                                                                      |
|`language`                |string       |Yes     |BCP-47 language tag (e.g. en, fr).                                                                       |
|`tags`                    |string[]     |No      |Searchable topic tags.                                                                                   |
|`prerequisites`           |object[]     |No      |Pre-conditions required before starting. Each has type (knowledge | course | assessment) and description.|

## learningModel

Controls global learning science behaviours applied across the course.

|Field                         |Type       |Required|Description                                                                                                    |
|------------------------------|-----------|--------|---------------------------------------------------------------------------------------------------------------|
|`masteryThreshold`            |float (0-1)|Yes     |Default accuracy required to mark a competency mastered.                                                       |
|`passingThreshold`            |float (0-1)|Yes     |Minimum accuracy required to pass the course.                                                                  |
|`retrievalPracticeEnabled`    |boolean    |Yes     |Enables spaced retrieval practice across all experiences.                                                      |
|`confidenceCalibrationEnabled`|boolean    |Yes     |Enables confidence rating prompts after interactions.                                                          |
|`adaptiveDifficultyEnabled`   |boolean    |Yes     |Enables difficulty adjustment based on learner performance.                                                    |
|`interleavingEnabled`         |boolean    |Yes     |Enables interleaving of content across competencies.                                                           |
|`interleavingGroups`          |object[]   |Cond.   |Required when interleavingEnabled is true. Defines which competencies and experiences are interleaved together.|
|`spacedRepetitionEnabled`     |boolean    |Yes     |Enables spaced repetition scheduling for retrieval items.                                                      |

### interleavingGroups[]

|Field          |Type    |Required|Description                                                                             |
|---------------|--------|--------|----------------------------------------------------------------------------------------|
|`groupId`      |string  |Yes     |Unique identifier for the interleaving group.                                           |
|`competencyIds`|string[]|No      |Competency IDs whose content should be interleaved.                                     |
|`experienceIds`|string[]|No      |Experience IDs explicitly added to the interleaving pool.                               |
|`rationaleNote`|string  |No      |Optional note explaining the interleaving rationale (e.g. contrast near-transfer items).|

## priorKnowledgeCheck

An optional pre-assessment that probes existing knowledge before course or section content is presented. Results drive adaptive routing, allowing learners to skip content they already know or be directed to remediation.

|Field           |Type    |Required|Description                                                    |
|----------------|--------|--------|---------------------------------------------------------------|
|`enabled`       |boolean |Yes     |Activates or disables the prior knowledge check.               |
|`placement`     |string  |Yes     |When the probe is shown. One of: before-course, before-section.|
|`probeQuestions`|object[]|Yes     |List of probe questions. See below.                            |

### probeQuestions[]

|Field               |Type    |Required|Description                                                                                                                                    |
|--------------------|--------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------|
|`probeId`           |string  |Yes     |Unique identifier for the probe question.                                                                                                      |
|`prompt`            |string  |Yes     |Question text shown to the learner.                                                                                                            |
|`questionType`      |string  |Yes     |One of: multiple-choice, short-answer, scenario-analysis.                                                                                      |
|`linkedCompetencies`|string[]|Yes     |Competency IDs this probe question measures.                                                                                                   |
|`scoringCriteria`   |string[]|Yes     |Criteria used to evaluate the learner response.                                                                                                |
|`routingRules`      |object[]|Yes     |Conditional routing based on probe score. Each rule has a condition (e.g. score >= 0.85) and an action (e.g. skip-to-section, unlock-advanced).|

## competencies

Competencies define the skills or knowledge the course develops. Each competency has its own mastery threshold, difficulty profile, desired outcomes, and misconception registry.

|Field                 |Type       |Required|Description                                                                                        |
|----------------------|-----------|--------|---------------------------------------------------------------------------------------------------|
|`competencyId`        |string     |Yes     |Unique identifier referenced by sections and assessments.                                          |
|`title`               |string     |Yes     |Short label for the competency.                                                                    |
|`description`         |string     |Yes     |Full description of what the competency covers.                                                    |
|`taxonomyLevel`       |string     |Yes     |Bloom’s taxonomy level: remember | understand | apply | analyze | evaluate | create.               |
|`difficultyProfile`   |object     |Yes     |Five integer scores (1-5): overall, conceptualComplexity, ambiguity, technicalSkill, readingDemand.|
|`transferRequired`    |boolean    |Yes     |Whether learners must demonstrate transfer to a novel context for mastery.                         |
|`masteryThreshold`    |float (0-1)|Yes     |Competency-level mastery threshold (overrides course-level default).                               |
|`desiredOutcomes`     |object[]   |Yes     |Observable outcomes verifying competency acquisition. See below.                                   |
|`commonMisconceptions`|object[]   |No      |Known misconceptions with remediation strategies. See below.                                       |

### desiredOutcomes[]

|Field                 |Type    |Required|Description                                                                                      |
|----------------------|--------|--------|-------------------------------------------------------------------------------------------------|
|`outcomeId`           |string  |Yes     |Unique identifier for the outcome.                                                               |
|`description`         |string  |Yes     |Observable behaviour that demonstrates the outcome.                                              |
|`verifiedBy`          |string[]|Yes     |Assessment or exercise IDs that verify this outcome.                                             |
|`verificationCriteria`|object  |Yes     |minimumAccuracy (float), minimumConfidenceCalibration (float), requiresTransferSuccess (boolean).|

### commonMisconceptions[]

|Field                |Type    |Required|Description                                                              |
|---------------------|--------|--------|-------------------------------------------------------------------------|
|`misconceptionId`    |string  |Yes     |Unique identifier, referenced by error patterns in assessments.          |
|`misconception`      |string  |Yes     |Statement of the incorrect belief.                                       |
|`whyIncorrect`       |string  |Yes     |Explanation of why the belief is wrong.                                  |
|`remediationStrategy`|string  |Yes     |Instructional action to address the misconception.                       |
|`linkedErrorPatterns`|string[]|No      |errorPatternIds from assessment questions that map to this misconception.|

## sections

Sections group related learning experiences. Each section has learning objectives, motivation hooks, and an ordered list of experiences.

|Field                |Type    |Required|Description                                                                                                                      |
|---------------------|--------|--------|---------------------------------------------------------------------------------------------------------------------------------|
|`sectionId`          |string  |Yes     |Unique section identifier.                                                                                                       |
|`title`              |string  |Yes     |Display title of the section.                                                                                                    |
|`description`        |string  |Yes     |Brief summary of the section content.                                                                                            |
|`learningObjectives` |object[]|Yes     |Objectives with objectiveId, description, and linkedCompetencies.                                                                |
|`motivationHooks`    |object[]|No      |Engagement prompts shown before the section begins. Types: real-world-stakes, prediction-gap, curiosity-prompt, relevance-anchor.|
|`learningExperiences`|object[]|Yes     |Ordered list of learning experiences. See below.                                                                                 |

### learningExperiences[]

A learning experience is the primary instructional unit. It contains content blocks, interactions, worked examples, retrieval practice, and transfer exercises.

|Field                     |Type    |Required|Description                                                                                       |
|--------------------------|--------|--------|--------------------------------------------------------------------------------------------------|
|`experienceId`            |string  |Yes     |Unique identifier for the experience.                                                             |
|`title`                   |string  |Yes     |Display title.                                                                                    |
|`experienceType`          |string  |Yes     |One of: guided-analysis, worked-example, case-study, simulation, discussion.                      |
|`difficultyProfile`       |object  |Yes     |overall, conceptualComplexity, ambiguity scores (integers 1-5).                                   |
|`estimatedDurationMinutes`|integer |Yes     |Estimated time to complete the experience.                                                        |
|`linkedCompetencies`      |string[]|Yes     |Competency IDs addressed by this experience.                                                      |
|`desiredCognitiveActions` |string[]|Yes     |Cognitive operations prompted: prediction, analysis, reflection, retrieval, comparison, synthesis.|
|`contentBlocks`           |object[]|Yes     |Instructional content units. See below.                                                           |
|`interactionSequence`     |object[]|Yes     |Ordered learner interactions. See below.                                                          |
|`workedExamples`          |object[]|No      |Step-by-step solved examples. See below.                                                          |
|`retrievalPractice`       |object[]|No      |Spaced retrieval items with scheduling. See below.                                                |
|`transferExercises`       |object[]|No      |Novel-context application tasks. See below.                                                       |
|`masteryVerification`     |object  |No      |Assessment IDs and minimum performance required for mastery sign-off.                             |

### contentBlocks[]

|Field                |Type  |Required|Description                                         |
|---------------------|------|--------|----------------------------------------------------|
|`blockId`            |string|Yes     |Unique block identifier.                            |
|`type`               |string|Yes     |One of: text, image, video, audio, interactive.     |
|`content`            |string|Cond.   |Text content (required when type is text).          |
|`url`                |url   |Cond.   |Media URL (required for image, video, audio types). |
|`altText`            |string|Cond.   |Accessibility description (required for image type).|
|`captionOrTranscript`|string|No      |Caption or transcript text for video/audio content. |

### interactionSequence[]

Defines each learner interaction step, including the prompt, response format, feedback configuration, and optional confidence rating.

|Field             |Type   |Required|Description                                                                                      |
|------------------|-------|--------|-------------------------------------------------------------------------------------------------|
|`interactionId`   |string |Yes     |Unique identifier for the interaction.                                                           |
|`interactionType` |string |Yes     |One of: prediction, compare-responses, reflection, multiple-choice, drag-drop, scenario-analysis.|
|`prompt`          |string |Yes     |Question or instruction shown to the learner.                                                    |
|`required`        |boolean|Yes     |Whether the interaction must be completed before proceeding.                                     |
|`responseFormat`  |string |Yes     |One of: short-answer, multiple-choice, ranking, likert.                                          |
|`revealCondition` |string |Yes     |When feedback is shown: after-response, after-attempt, on-request.                               |
|`feedback`        |object |Yes     |Feedback configuration. See below.                                                               |
|`confidencePrompt`|object |No      |Optional confidence rating. Fields: enabled, scaleMin, scaleMax, prompt.                         |

#### feedback (within interactionSequence)

> **Note:** Elaborative feedback — which explains the reasoning behind correct and incorrect answers — produces significantly better retention than simple corrective feedback.

|Field                |Type    |Required|Description                                                                               |
|---------------------|--------|--------|------------------------------------------------------------------------------------------|
|`type`               |string  |Yes     |Feedback mode: elaborative, corrective, hint-only, socratic.                              |
|`elaborativeFeedback`|string  |Cond.   |Full explanation of why the answer is correct or incorrect. Used when type is elaborative.|
|`correctiveFeedback` |string  |Cond.   |Direct correction statement. Used when type is corrective.                                |
|`hints`              |string[]|Cond.   |Progressive hints revealed on request. Used when type is hint-only.                       |

### workedExamples[]

|Field       |Type    |Required|Description               |
|------------|--------|--------|--------------------------|
|`exampleId` |string  |Yes     |Unique identifier.        |
|`problem`   |string  |Yes     |The problem being solved. |
|`steps`     |string[]|Yes     |Ordered solution steps.   |
|`conclusion`|string  |Yes     |Final summary or takeaway.|

### retrievalPractice[]

Retrieval items are scheduled using spaced repetition. Decay parameters allow the engine to adapt intervals per learner based on recall strength.

|Field                                         |Type         |Required|Description                                                                                       |
|----------------------------------------------|-------------|--------|--------------------------------------------------------------------------------------------------|
|`retrievalItemId`                             |string       |Yes     |Unique identifier for the retrieval item.                                                         |
|`retrievalType`                               |string       |Yes     |One of: free-recall, cued-recall, application, scenario-analysis, contrast.                       |
|`prompt`                                      |string       |Yes     |Retrieval prompt shown to the learner.                                                            |
|`difficulty`                                  |integer (1-5)|Yes     |Relative difficulty of the retrieval item.                                                        |
|`schedule.initialReviewDays`                  |integer      |Yes     |Days after first exposure before initial review.                                                  |
|`schedule.subsequentReviewDays`               |integer[]    |Yes     |Fixed subsequent review intervals (overridden if adaptiveDifficulty is enabled).                  |
|`schedule.decayParameters.decayRate`          |float        |Cond.   |Rate of forgetting. Higher values = faster decay. Required when adaptiveDifficultyEnabled is true.|
|`schedule.decayParameters.strengthMultiplier` |float        |Cond.   |Scales the interval after a successful recall. Required when adaptiveDifficultyEnabled is true.   |
|`schedule.decayParameters.minimumIntervalDays`|integer      |No      |Floor on the computed review interval.                                                            |
|`schedule.decayParameters.maximumIntervalDays`|integer      |No      |Ceiling on the computed review interval.                                                          |

### transferExercises[]

|Field            |Type    |Required|Description                                                        |
|-----------------|--------|--------|-------------------------------------------------------------------|
|`exerciseId`     |string  |Yes     |Unique identifier.                                                 |
|`context`        |string  |Yes     |Domain the scenario is drawn from (e.g. finance, medicine, policy).|
|`scenario`       |string  |Yes     |Novel situation the learner must reason about.                     |
|`task`           |string  |Yes     |Specific action or analysis required.                              |
|`successCriteria`|string[]|Yes     |Criteria used to evaluate whether transfer was successful.         |

## assessments

Formal assessments are linked to competencies and used to verify mastery. Questions include rubrics and error pattern mappings.

|Field               |Type    |Required|Description                                                                |
|--------------------|--------|--------|---------------------------------------------------------------------------|
|`assessmentId`      |string  |Yes     |Unique identifier referenced by masteryVerification blocks.                |
|`title`             |string  |Yes     |Display title.                                                             |
|`assessmentType`    |string  |Yes     |One of: scenario-analysis, multiple-choice, short-answer, performance-task.|
|`linkedCompetencies`|string[]|Yes     |Competency IDs this assessment measures.                                   |
|`adaptiveDifficulty`|boolean |Yes     |Whether question difficulty adjusts based on learner responses.            |
|`questions`         |object[]|Yes     |List of assessment questions. See below.                                   |

### questions[]

|Field            |Type         |Required|Description                                                            |
|-----------------|-------------|--------|-----------------------------------------------------------------------|
|`questionId`     |string       |Yes     |Unique identifier.                                                     |
|`difficulty`     |integer (1-5)|Yes     |Question difficulty rating.                                            |
|`prompt`         |string       |Yes     |Question text.                                                         |
|`questionType`   |string       |Yes     |One of: short-answer, multiple-choice, scenario-analysis.              |
|`successCriteria`|string[]     |Yes     |Criteria applied when scoring the response.                            |
|`rubric`         |object       |Yes     |Scoring descriptors. Fields: excellent, adequate, weak (each a string).|
|`errorPatterns`  |object[]     |No      |Observable wrong-answer patterns linked to misconceptions. See below.  |

#### errorPatterns[] (within questions)

> **Note:** Error patterns bridge assessment responses to the competency misconception registry, enabling targeted remediation rather than generic retry loops.

|Field                  |Type  |Required|Description                                                                                          |
|-----------------------|------|--------|-----------------------------------------------------------------------------------------------------|
|`errorPatternId`       |string|Yes     |Unique identifier, referenced by misconception.linkedErrorPatterns.                                  |
|`description`          |string|Yes     |Observable pattern in incorrect learner responses.                                                   |
|`linkedMisconceptionId`|string|Yes     |ID from competencies[].commonMisconceptions[].misconceptionId.                                       |
|`remediationAction`    |string|Yes     |Action taken when pattern is detected (e.g. resurface worked-example-01, flag for instructor review).|

## retrievalSystem

Global configuration for the retrieval practice scheduling algorithm. Item-level schedules in retrievalPractice[] take precedence over these defaults.

|Field                |Type    |Required|Description                                                                                     |
|---------------------|--------|--------|------------------------------------------------------------------------------------------------|
|`algorithm`          |string  |Yes     |Scheduling algorithm: spaced-repetition, fixed-interval, performance-adaptive.                  |
|`confidenceWeighting`|boolean |Yes     |Adjusts review intervals based on learner confidence ratings.                                   |
|`interleavingEnabled`|boolean |Yes     |Interleaves retrieval items across competencies during review sessions.                         |
|`retrievalModes`     |string[]|Yes     |Permitted retrieval formats: free-recall, cued-recall, application, scenario-analysis, contrast.|

## masterySystem

Defines mastery progression levels and whether mastery can decay over time.

|Field                   |Type    |Required|Description                                                             |
|------------------------|--------|--------|------------------------------------------------------------------------|
|`masteryLevels`         |string[]|Yes     |Ordered progression levels: novice, developing, proficient, mastered.   |
|`decayModelEnabled`     |boolean |Yes     |Whether mastery level can decrease due to elapsed time without practice.|
|`reverificationRequired`|boolean |Yes     |Whether a learner must re-verify mastery after a decay event.           |

## analytics

Controls what learner data is collected and how error analysis is structured.

|Field                                        |Type    |Required|Description                                                                                                              |
|---------------------------------------------|--------|--------|-------------------------------------------------------------------------------------------------------------------------|
|`track`                                      |string[]|Yes     |Metrics to record: accuracy, confidence, time-on-task, retrieval-strength, transfer-performance, misconception-frequency.|
|`errorAnalysis.enabled`                      |boolean |Yes     |Activates structured error analysis logging.                                                                             |
|`errorAnalysis.errorPatternTracking`         |boolean |Yes     |Tracks which error patterns are triggered per learner.                                                                   |
|`errorAnalysis.misconceptionFrequencyLogging`|boolean |Yes     |Logs how often each misconception is observed across learners.                                                           |
|`errorAnalysis.linkedToMisconceptionIds`     |boolean |Yes     |Whether error pattern events are associated to misconceptionId for reporting.                                            |

## glossary

Optional list of term definitions surfaced contextually to learners. Each entry has a term (string) and definition (string).

## ID Linking Reference

The schema uses string IDs to create relationships across objects. The table below summarises key linkages.

|From                                |Field                |Links To                                                    |
|------------------------------------|---------------------|------------------------------------------------------------|
|`sections[].learningObjectives`     |linkedCompetencies[] |competencies[].competencyId                                 |
|`sections[].learningExperiences`    |linkedCompetencies[] |competencies[].competencyId                                 |
|`masteryVerification`               |assessmentIds[]      |assessments[].assessmentId                                  |
|`desiredOutcomes`                   |verifiedBy[]         |assessments[].assessmentId or transferExercises[].exerciseId|
|`questions[].errorPatterns`         |linkedMisconceptionId|competencies[].commonMisconceptions[].misconceptionId       |
|`commonMisconceptions`              |linkedErrorPatterns[]|questions[].errorPatterns[].errorPatternId                  |
|`learningModel.interleavingGroups`  |competencyIds[]      |competencies[].competencyId                                 |
|`priorKnowledgeCheck.probeQuestions`|linkedCompetencies[] |competencies[].competencyId                                 |

-----

*Course Engine Schema v1.0 — All IDs must be unique within their collection. String IDs are case-sensitive.*