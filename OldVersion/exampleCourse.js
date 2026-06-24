{
  "courseTitle": "name",
  "courseDescription": "description",
  "courseImage": "image url",
  "estimatedDuration": "estimated duration",
  "lastUpdated": "YYYY-MM-DD",
  "version": "1.0",
  "prerequisites": [
    "prerequisite 1",
    "prerequisite 2"
  ],
  "difficultyLevel": "beginner | intermediate | advanced",
  "learningOutcomes": [
    "learning outcome 1",
    "learning outcome 2"
  ],
  "glossary": [
    { "term": "term 1", "definition": "definition 1" },
    { "term": "term 2", "definition": "definition 2" }
  ],
  "sections": [
    {
      "sectionTitle": "section name",
      "sectionDescription": "section description",
      "estimatedDuration": "estimated duration",
      "whyThisMatters": "brief statement connecting this section to real-world relevance",
      "learningObjectives": [
        "learning objective 1",
        "learning objective 2"
      ],
      "reviewContent": [
        "spaced repetition prompt 1",
        "spaced repetition prompt 2"
      ],
      "lectures": [
        {
          "lectureTitle": "lecture name",
          "lectureDescription": "lecture description",
          "estimatedDuration": "estimated duration",
          "learningObjectives": [
            "lecture-level objective 1",
            "lecture-level objective 2"
          ],
          "workedExample": {
            "problem": "problem statement",
            "steps": ["step 1", "step 2", "step 3"],
            "conclusion": "what this example demonstrates"
          },
          "lectureTopics": [
            {
              "text": "full topic text",
              "summary": "one or two sentence recap of this topic",
              "media": [
                {
                  "type": "image",
                  "url": "image url",
                  "label": "image label",
                  "altText": "descriptive text for accessibility"
                },
                {
                  "type": "video",
                  "url": "video url",
                  "transcript": "transcript url"
                },
                {
                  "type": "text",
                  "content": "text content"
                }
              ]
            }
          ],
          "summary": [
            "lecture summary point 1",
            "lecture summary point 2"
          ]
        }
      ],
      "quiz": {
        "passingScore": 80,
        "attemptsAllowed": 3,
        "interleaved": true,
        "questions": [
          {
            "question": "question text",
            "questionType": "multiple-choice | true-false | short-answer",
            "options": [
              { "text": "option 1", "explanation": "why this is or isn't correct" },
              { "text": "option 2", "explanation": "why this is or isn't correct" },
              { "text": "option 3", "explanation": "why this is or isn't correct" },
              { "text": "option 4", "explanation": "why this is or isn't correct" }
            ],
            "answer": "option 1",
            "explanation": "overall explanation of the correct answer"
          }
        ]
      },
      "practicalActivity": {
        "title": "activity title",
        "description": "what the learner must do",
        "scenario": "real-world context framing the task",
        "steps": ["step 1", "step 2", "step 3"],
        "successCriteria": ["criterion 1", "criterion 2"],
        "downloadableTemplate": "url to template if applicable"
      },
      "summary": [
        "section summary point 1",
        "section summary point 2"
      ]
    }
  ]
}