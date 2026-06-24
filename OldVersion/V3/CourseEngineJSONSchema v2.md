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

|Field                     |Type         |Required|Description                                                   |
|--------------------------|-------------|--------|--------------------------------------------------------------|
|`courseId`                |string       |Yes     |Unique identifier for the course (e.g. critical-thinking-101).|
|`title`                   |string       |Yes     |Display title shown to learners.                              |
|`description`             |string       |Yes     |Short summary of course content and goals.                    |
|`thumbnailImage`          |url          |No      |URL of the course thumbnail image.                            |
|`estimatedDurationMinutes`|integer      |Yes     |Total estimated completion time in minutes.                   |
|`difficultyLevel`         |string       |Yes     |One of: novice, intermediate, advanced.                       |
|`version`                 |string       |Yes     |Semantic version string (e.g. 2.0).                           |
|`lastUpdated`             |ISO-8601 date|Yes     |Date of most recent content update.                           |
|`language`                |string       |Yes     |BCP-47 language tag (e.g. en, fr).                            |
|`tags`                    |string[]     |No      |Searchable topic tags.                                        |
|`prerequisites`           |object[]     |No      |Pre-conditions required before starting. See below.           |

### prerequisites[]

|Field        |Type  |Required|Description                           |
|-------------|------|--------|--------------------------------------|
|`type`       |string|Yes     |One of: knowledge, course, assessment.|
|`description`|string|Yes     |Description of the pre-condition.     |

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

|Field               |Type    |Required|Description                                              |
|--------------------|--------|--------|---------------------------------------------------------|
|`probeId`           |string  |Yes     |Unique identifier for the probe question.                |
|`prompt`            |string  |Yes     |Question text shown to the learner.                      |
|`questionType`      |string  |Yes     |One of: multiple-choice, short-answer, scenario-analysis.|
|`linkedCompetencies`|string[]|Yes     |Competency IDs this probe question measures.             |
|`scoringCriteria`   |string[]|Yes     |Criteria used to evaluate the learner response.          |
|`routingRules`      |object[]|Yes     |Conditional routing based on probe score. See below.     |

### routingRules[]

|Field      |Type  |Required|Description                                                                                     |
|-----------|------|--------|------------------------------------------------------------------------------------------------|
|`condition`|string|Yes     |Score condition that triggers the rule (e.g. score >= 0.85).                                    |
|`action`   |string|Yes     |Action taken when the condition is met (e.g. skip-to-section, unlock-advanced, flag-for-review).|

## competencies

Competencies define the skills or knowledge the course develops. Each competency has its own mastery threshold, difficulty profile, desired outcomes, and misconception registry.

|Field                 |Type       |Required|Description                                                               |
|----------------------|-----------|--------|--------------------------------------------------------------------------|
|`competencyId`        |string     |Yes     |Unique identifier referenced by sections and assessments.                 |
|`title`               |string     |Yes     |Short label for the competency.                                           |
|`description`         |string     |Yes     |Full description of what the competency covers.                           |
|`taxonomyLevel`       |string     |Yes     |Bloom’s taxonomy level: remember                                          |
|`difficultyProfile`   |object     |Yes     |Five integer scores (1-5). See below.                                     |
|`transferRequired`    |boolean    |Yes     |Whether learners must demonstrate transfer to a novel context for mastery.|
|`masteryThreshold`    |float (0-1)|Yes     |Competency-level mastery threshold (overrides course-level default).      |
|`desiredOutcomes`     |object[]   |Yes     |Observable outcomes verifying competency acquisition. See below.          |
|`commonMisconceptions`|object[]   |No      |Known misconceptions with remediation strategies. See below.              |

### difficultyProfile (within competencies)

|Field                 |Type         |Required|Description                 |
|----------------------|-------------|--------|----------------------------|
|`overall`             |integer (1-5)|Yes     |Overall difficulty score.   |
|`conceptualComplexity`|integer (1-5)|Yes     |Conceptual complexity score.|
|`ambiguity`           |integer (1-5)|Yes     |Ambiguity score.            |
|`technicalSkill`      |integer (1-5)|Yes     |Technical skill score.      |
|`readingDemand`       |integer (1-5)|Yes     |Reading demand score.       |

### desiredOutcomes[]

|Field                 |Type    |Required|Description                                         |
|----------------------|--------|--------|----------------------------------------------------|
|`outcomeId`           |string  |Yes     |Unique identifier for the outcome.                  |
|`description`         |string  |Yes     |Observable behaviour that demonstrates the outcome. |
|`verifiedBy`          |string[]|Yes     |Assessment or exercise IDs that verify this outcome.|
|`verificationCriteria`|object  |Yes     |Verification thresholds for the outcome. See below. |

#### verificationCriteria (within desiredOutcomes)

|Field                         |Type       |Required|Description                                                |
|------------------------------|-----------|--------|-----------------------------------------------------------|
|`minimumAccuracy`             |float (0-1)|Yes     |Minimum accuracy required to verify the outcome.           |
|`minimumConfidenceCalibration`|float (0-1)|Yes     |Minimum confidence calibration required.                   |
|`requiresTransferSuccess`     |boolean    |Yes     |Whether transfer success is required to verify the outcome.|

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

|Field                |Type    |Required|Description                                                                                  |
|---------------------|--------|--------|---------------------------------------------------------------------------------------------|
|`sectionId`          |string  |Yes     |Unique section identifier.                                                                   |
|`title`              |string  |Yes     |Display title of the section.                                                                |
|`description`        |string  |Yes     |Brief summary of the section content.                                                        |
|`learningObjectives` |object[]|Yes     |Section learning objectives. See below.                                                      |
|`motivationHooks`    |object[]|No      |Engagement prompts shown before the section begins. See below.                               |
|`furtherReading`     |object[]|No      |Optional supplementary resources for learners who want depth beyond the core path. See below.|
|`learningExperiences`|object[]|Yes     |Ordered list of learning experiences. See below.                                             |

### learningObjectives[]

|Field               |Type    |Required|Description                             |
|--------------------|--------|--------|----------------------------------------|
|`objectiveId`       |string  |Yes     |Unique identifier for the objective.    |
|`description`       |string  |Yes     |Description of the learning objective.  |
|`linkedCompetencies`|string[]|Yes     |Competency IDs this objective addresses.|

### motivationHooks[]

|Field   |Type  |Required|Description                                                                   |
|--------|------|--------|------------------------------------------------------------------------------|
|`type`  |string|Yes     |One of: real-world-stakes, prediction-gap, curiosity-prompt, relevance-anchor.|
|`prompt`|string|Yes     |Engagement prompt text shown to the learner.                                  |

### furtherReading[]

Optional supplementary resources surfaced at the section level for learners who want to go beyond the required content. Entries are extension material and never gate progression. Each entry should supply either a `url` or a `citation` so the resource is locatable.

|Field               |Type    |Required|Description                                                   |
|--------------------|--------|--------|--------------------------------------------------------------|
|`resourceId`        |string  |Yes     |Unique identifier for the resource within the section.        |
|`title`             |string  |Yes     |Display title of the resource.                                |
|`resourceType`      |string  |Yes     |One of: article, book, paper, video, website, other.          |
|`url`               |url     |Cond.   |Link to the resource. Provide when the resource is linkable.  |
|`citation`          |string  |Cond.   |Bibliographic citation for non-linkable sources such as books.|
|`author`            |string  |No      |Author or publisher of the resource.                          |
|`rationaleNote`     |string  |No      |Brief note on why the resource is worth reading.              |
|`linkedCompetencies`|string[]|No      |Competency IDs the resource extends.                          |

### learningExperiences[]

A learning experience is the primary instructional unit. It contains content blocks, interactions, worked examples, retrieval practice, and transfer exercises.

|Field                     |Type    |Required|Description                                                                                                                         |
|--------------------------|--------|--------|------------------------------------------------------------------------------------------------------------------------------------|
|`experienceId`            |string  |Yes     |Unique identifier for the experience.                                                                                               |
|`title`                   |string  |Yes     |Display title.                                                                                                                      |
|`experienceType`          |string  |Yes     |One of: guided-analysis, worked-example, case-study, simulation, discussion, self-guided-exercise.                                  |
|`difficultyProfile`       |object  |Yes     |Subset of difficulty scores. See below.                                                                                             |
|`estimatedDurationMinutes`|integer |Yes     |Estimated time to complete the experience.                                                                                          |
|`linkedCompetencies`      |string[]|Yes     |Competency IDs addressed by this experience.                                                                                        |
|`desiredCognitiveActions` |string[]|Yes     |Cognitive operations prompted: prediction, analysis, reflection, retrieval, comparison, synthesis.                                  |
|`contentBlocks`           |object[]|Yes     |Instructional content units. See below.                                                                                             |
|`interactionSequence`     |object[]|Yes     |Ordered learner interactions. See below.                                                                                            |
|`workedExamples`          |object[]|No      |Step-by-step solved examples. See below.                                                                                            |
|`selfGuidedExercise`      |object  |No      |Real-world application task the learner performs outside the engine. Present when experienceType is self-guided-exercise. See below.|
|`retrievalPractice`       |object[]|No      |Spaced retrieval items with scheduling. See below.                                                                                  |
|`transferExercises`       |object[]|No      |Novel-context application tasks. See below.                                                                                         |
|`masteryVerification`     |object  |No      |Assessment IDs and minimum performance required for mastery sign-off. See below.                                                    |

#### difficultyProfile (within learningExperiences)

Unlike the competency-level profile, the experience-level profile uses only the first three scores.

|Field                 |Type         |Required|Description                 |
|----------------------|-------------|--------|----------------------------|
|`overall`             |integer (1-5)|Yes     |Overall difficulty score.   |
|`conceptualComplexity`|integer (1-5)|Yes     |Conceptual complexity score.|
|`ambiguity`           |integer (1-5)|Yes     |Ambiguity score.            |

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
|`confidencePrompt`|object |No      |Optional confidence rating. See below.                                                           |

#### feedback (within interactionSequence)

> **Note:** Elaborative feedback — which explains the reasoning behind correct and incorrect answers — produces significantly better retention than simple corrective feedback.

|Field                |Type    |Required|Description                                                                               |
|---------------------|--------|--------|------------------------------------------------------------------------------------------|
|`type`               |string  |Yes     |Feedback mode: elaborative, corrective, hint-only, socratic.                              |
|`elaborativeFeedback`|string  |Cond.   |Full explanation of why the answer is correct or incorrect. Used when type is elaborative.|
|`correctiveFeedback` |string  |Cond.   |Direct correction statement. Used when type is corrective.                                |
|`hints`              |string[]|Cond.   |Progressive hints revealed on request. Used when type is hint-only.                       |

#### confidencePrompt (within interactionSequence)

|Field     |Type   |Required|Description                            |
|----------|-------|--------|---------------------------------------|
|`enabled` |boolean|Yes     |Whether the confidence prompt is shown.|
|`scaleMin`|integer|Yes     |Minimum value of the confidence scale. |
|`scaleMax`|integer|Yes     |Maximum value of the confidence scale. |
|`prompt`  |string |Yes     |Confidence rating prompt text.         |

### workedExamples[]

|Field       |Type    |Required|Description               |
|------------|--------|--------|--------------------------|
|`exampleId` |string  |Yes     |Unique identifier.        |
|`problem`   |string  |Yes     |The problem being solved. |
|`steps`     |string[]|Yes     |Ordered solution steps.   |
|`conclusion`|string  |Yes     |Final summary or takeaway.|

### selfGuidedExercise (within learningExperiences)

> **Note:** Self-guided exercises drive far transfer by prompting learners to apply the material in an authentic, uncontrolled real-world setting (e.g. attending an open mic night, building an open-ended personal project). Because the engine cannot directly verify real-world completion, these exercises are formative and must never gate mastery progression.

Present when `experienceType` is `self-guided-exercise`. A single application task per experience.

|Field                              |Type    |Required|Description                                                          |
|-----------------------------------|--------|--------|---------------------------------------------------------------------|
|`exerciseId`                       |string  |Yes     |Unique identifier for the exercise.                                  |
|`realWorldContext`                 |string  |Yes     |The authentic setting in which the learner applies the material.     |
|`objective`                        |string  |Yes     |What applying the material in this context should accomplish.        |
|`instructions`                     |string[]|Yes     |Ordered steps guiding the learner through the real-world application.|
|`estimatedRealWorldDurationMinutes`|integer |No      |Approximate time the activity takes outside the engine.              |
|`materialsOrPrerequisites`         |string[]|No      |Anything the learner needs to arrange or obtain beforehand.          |
|`reflectionPrompts`                |string[]|No      |Prompts the learner answers on return to consolidate the experience. |
|`verification`                     |object  |Yes     |How (or whether) completion is acknowledged. See below.              |
|`linkedCompetencies`               |string[]|No      |Competency IDs the exercise applies.                                 |

#### verification (within selfGuidedExercise)

|Field                   |Type    |Required|Description                                                                             |
|------------------------|--------|--------|----------------------------------------------------------------------------------------|
|`mode`                  |string  |Yes     |One of: self-attested, reflection-submission, none.                                     |
|`isGating`              |boolean |Yes     |Must be false. Self-guided exercises are formative and do not block mastery progression.|
|`selfAssessmentCriteria`|string[]|No      |Criteria the learner uses to judge the quality of their own application.                |

### retrievalPractice[]

Retrieval items are scheduled using spaced repetition. Decay parameters allow the engine to adapt intervals per learner based on recall strength.

|Field            |Type         |Required|Description                                                                |
|-----------------|-------------|--------|---------------------------------------------------------------------------|
|`retrievalItemId`|string       |Yes     |Unique identifier for the retrieval item.                                  |
|`retrievalType`  |string       |Yes     |One of: free-recall, cued-recall, application, scenario-analysis, contrast.|
|`prompt`         |string       |Yes     |Retrieval prompt shown to the learner.                                     |
|`difficulty`     |integer (1-5)|Yes     |Relative difficulty of the retrieval item.                                 |
|`schedule`       |object       |Yes     |Review scheduling configuration. See below.                                |

#### schedule (within retrievalPractice)

|Field                 |Type     |Required|Description                                                                     |
|----------------------|---------|--------|--------------------------------------------------------------------------------|
|`initialReviewDays`   |integer  |Yes     |Days after first exposure before initial review.                                |
|`subsequentReviewDays`|integer[]|Yes     |Fixed subsequent review intervals (overridden if adaptiveDifficulty is enabled).|
|`decayParameters`     |object   |Cond.   |Adaptive decay configuration. See below.                                        |

#### schedule.decayParameters (within retrievalPractice)

|Field                |Type   |Required|Description                                                                                       |
|---------------------|-------|--------|--------------------------------------------------------------------------------------------------|
|`decayRate`          |float  |Cond.   |Rate of forgetting. Higher values = faster decay. Required when adaptiveDifficultyEnabled is true.|
|`strengthMultiplier` |float  |Cond.   |Scales the interval after a successful recall. Required when adaptiveDifficultyEnabled is true.   |
|`minimumIntervalDays`|integer|No      |Floor on the computed review interval.                                                            |
|`maximumIntervalDays`|integer|No      |Ceiling on the computed review interval.                                                          |

### transferExercises[]

|Field            |Type    |Required|Description                                                        |
|-----------------|--------|--------|-------------------------------------------------------------------|
|`exerciseId`     |string  |Yes     |Unique identifier.                                                 |
|`context`        |string  |Yes     |Domain the scenario is drawn from (e.g. finance, medicine, policy).|
|`scenario`       |string  |Yes     |Novel situation the learner must reason about.                     |
|`task`           |string  |Yes     |Specific action or analysis required.                              |
|`successCriteria`|string[]|Yes     |Criteria used to evaluate whether transfer was successful.         |

### masteryVerification (within learningExperiences)

Assessment IDs and minimum performance required for mastery sign-off.

|Field                |Type    |Required|Description                                               |
|---------------------|--------|--------|----------------------------------------------------------|
|`assessmentIds`      |string[]|Yes     |Assessment IDs used to verify mastery for this experience.|
|`requiredPerformance`|object  |Yes     |Minimum performance thresholds. See below.                |

#### requiredPerformance (within masteryVerification)

|Field                 |Type       |Required|Description                                          |
|----------------------|-----------|--------|-----------------------------------------------------|
|`minimumAccuracy`     |float (0-1)|Yes     |Minimum accuracy required for mastery sign-off.      |
|`minimumTransferScore`|float (0-1)|Yes     |Minimum transfer score required for mastery sign-off.|

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

|Field            |Type         |Required|Description                                                          |
|-----------------|-------------|--------|---------------------------------------------------------------------|
|`questionId`     |string       |Yes     |Unique identifier.                                                   |
|`difficulty`     |integer (1-5)|Yes     |Question difficulty rating.                                          |
|`prompt`         |string       |Yes     |Question text.                                                       |
|`questionType`   |string       |Yes     |One of: short-answer, multiple-choice, scenario-analysis.            |
|`successCriteria`|string[]     |Yes     |Criteria applied when scoring the response.                          |
|`rubric`         |object       |Yes     |Scoring descriptors. See below.                                      |
|`errorPatterns`  |object[]     |No      |Observable wrong-answer patterns linked to misconceptions. See below.|

#### rubric (within questions)

|Field      |Type  |Required|Description                          |
|-----------|------|--------|-------------------------------------|
|`excellent`|string|Yes     |Descriptor for an excellent response.|
|`adequate` |string|Yes     |Descriptor for an adequate response. |
|`weak`     |string|Yes     |Descriptor for a weak response.      |

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

|Field          |Type    |Required|Description                                                                                                              |
|---------------|--------|--------|-------------------------------------------------------------------------------------------------------------------------|
|`track`        |string[]|Yes     |Metrics to record: accuracy, confidence, time-on-task, retrieval-strength, transfer-performance, misconception-frequency.|
|`errorAnalysis`|object  |Yes     |Structured error analysis configuration. See below.                                                                      |

### errorAnalysis (within analytics)

|Field                          |Type   |Required|Description                                                   |
|-------------------------------|-------|--------|--------------------------------------------------------------|
|`enabled`                      |boolean|Yes     |Activates structured error analysis logging.                  |
|`errorPatternTracking`         |boolean|Yes     |Tracks which error patterns are triggered per learner.        |
|`misconceptionFrequencyLogging`|boolean|Yes     |Logs how often each misconception is observed across learners.|
|`linkedToMisconceptionIds`     |array  |Yes     |misconceptionIds for reporting.                               |

## glossary

Optional list of term definitions surfaced contextually to learners.

|Field       |Type  |Required|Description            |
|------------|------|--------|-----------------------|
|`term`      |string|Yes     |The glossary term.     |
|`definition`|string|Yes     |Definition of the term.|

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
|`sections[].furtherReading`         |linkedCompetencies[] |competencies[].competencyId                                 |
|`selfGuidedExercise`                |linkedCompetencies[] |competencies[].competencyId                                 |

-----

*Course Engine Schema v1.0 — All IDs must be unique within their collection. String IDs are case-sensitive.*