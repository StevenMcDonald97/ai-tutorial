# Course Engine

A website that hosts many online courses using a **single** course player.
Each course is just a JSON file. When someone visits `yoursite.com/some-course`,
the matching course is loaded into the player automatically. You never have to
build a separate page for each course.

---

## How it works (the short version)

1. Every course is a JSON file in the `courses/` folder.
2. At deploy time, two small scripts run:
   - one builds a **catalog** (`manifest.json`) listing every course,
   - one copies every course into **Cloudflare KV** (a fast key-value store).
3. The home page reads the catalog and shows a clickable list of courses.
4. When a visitor opens `yoursite.com/some-course`, a small piece of server
   code (a "Function") looks up that course, drops it into the player, and
   sends back a ready-to-use page. If the course doesn't exist, the visitor
   gets a real "404 Not Found" page.

The player itself never changes between courses — it just receives different
course data each time.

---

## Project structure

```
.
├─ functions/
│  └─ [slug].js              The server code that runs for /<course-name> URLs.
│
├─ public/                   Everything in here is served to visitors as-is.
│  ├─ index.html             The home page (the course catalog).
│  ├─ player.html            The course player (the engine that runs a course).
│  ├─ 404.html               The "course not found" page.
│  ├─ manifest.json          The catalog. AUTO-GENERATED — do not edit by hand.
│  └─ assets/
│     └─ og-default.png      Default preview image for link sharing.
│
├─ courses/                  Your course JSON files live here. NOT public.
│  └─ critical-thinking-101.json
│
├─ scripts/                  Small helper programs that run at deploy time.
│  ├─ build-manifest.js      Reads courses/ and writes public/manifest.json.
│  └─ sync-kv.js             Copies courses/ into Cloudflare KV.
│
├─ wrangler.toml             Cloudflare project settings (incl. the KV link).
└─ README.md                 This file.
```

---

## What each file does (in plain English)

### `functions/[slug].js` — the course router
This runs on Cloudflare's servers whenever someone visits a single-word URL
like `/critical-thinking-101`. The square brackets in the filename are how
Cloudflare says "match any name here and call it `slug`." For each request it:

1. Checks the catalog to see if that course name is real.
   - If not, it returns the `404.html` page with a true 404 status.
2. Fetches the course data from KV.
3. Loads `player.html`, inserts the course data into it, and also inserts
   social-media preview tags (title, description, image).
4. Sends the finished page to the visitor.

Because the course data lives in KV (not as a public file), nobody can grab a
course just by guessing a file URL. This is also what makes adding login/access
control easy later — you'd just add a check inside this one file.

### `public/player.html` — the course player
This is your existing course engine. It was changed in two small ways:

- The course that used to be hard-coded inside it is now a **placeholder**.
  The router fills that placeholder in with the real course at request time.
- If the page is ever opened directly (with no course), it shows a friendly
  "No course loaded" screen with a link back to the catalog and a button to
  upload a course file from your computer. The old upload feature still works.

### `public/index.html` — the home page
A simple catalog page. It reads `manifest.json` and shows every course as a
card with its title, description, length, and difficulty. It also has a search
box to filter the list — handy once you have many courses.

### `public/404.html` — the not-found page
Shown when someone visits a course name that doesn't exist.

### `public/manifest.json` — the catalog (auto-generated)
A list of all courses with the bits the home page and router need: name (slug),
title, description, duration, difficulty, and image. **Don't edit this by hand**
— it is rebuilt from the `courses/` folder every time you deploy.

### `public/assets/og-default.png` — default share image
When a course has no image of its own, this image is used for link previews
(for example, when a course link is pasted into Slack or a text message).

### `courses/*.json` — your courses
One file per course. The filename (minus `.json`) becomes the course's web
address. For example, `courses/intro-to-logic.json` becomes
`yoursite.com/intro-to-logic`. These files are the **source of truth**; KV is
just a fast copy used for serving.

Each course file must contain at least:
- `courseMetadata.courseId` — a unique id for the course.
- `courseMetadata.title` — the course name shown to visitors.

It can also include `description`, `estimatedDurationMinutes`,
`difficultyLevel`, and `thumbnailImage` (used for the share preview).

### `scripts/build-manifest.js` — catalog builder
Looks at every file in `courses/`, pulls out the key details, and writes
`public/manifest.json`. It also stops the build if two courses would share the
same web address, or if a course uses a reserved name (like `index` or
`assets`).

### `scripts/sync-kv.js` — course uploader to KV
Copies each course into Cloudflare KV so the router can read it quickly. It only
uploads courses that actually changed since last time, and it removes courses
from KV if you delete their file from `courses/`.

### `wrangler.toml` — Cloudflare settings
Tells Cloudflare the project name, which folder to serve (`public`), and which
KV store holds the courses. You paste your KV id here once during setup.

---

## The naming rule that ties it all together

For any course, four things share the same name:

```
courses/<name>.json   →   KV key "course:<name>"   →   catalog entry "<name>"   →   URL  /<name>
```

So the filename decides the web address. Keep filenames lowercase with dashes
(for example, `reading-the-evidence.json`) for clean, predictable URLs.

---

## Adding a new course (everyday workflow)

1. Create a new file in `courses/`, e.g. `courses/intro-to-logic.json`.
2. Make sure it has a `courseId` and a `title`.
3. Save, commit, and push to your Git repository.

That's it. Your deploy automatically rebuilds the catalog, uploads the course to
KV, and publishes the site. The course then appears on the home page and works
at `yoursite.com/intro-to-logic`.

To remove a course, delete its file and push — it disappears from the catalog
and is removed from KV.

---

## How courses get loaded (two paths)

- **Normal visit** (`/some-course`): the server inserts the course straight into
  the page, so it loads instantly and the course data is never exposed at a
  public file address.
- **Direct visit or file upload**: opening `player.html` directly shows the
  "No course loaded" screen, and the manual upload button still lets you load a
  course file from your computer for testing.

---

## Where progress is stored

A learner's progress is saved in their own browser (localStorage), separately
for each course. Nothing is sent to a server today. If you later want progress
to sync across devices, that can be added inside the player without changing how
courses are stored.

---

## Good to know

- **KV is a copy, not the original.** Your `courses/` files in Git are the real
  source. KV is just the fast lookup the live site uses. After a deploy, KV
  changes can take up to about a minute to spread worldwide.
- **Course files are private.** They are served only through the router, never
  as direct downloads. This keeps the door open for adding login-only courses
  later.
- **Big media (images, video)** referenced inside a course should be hosted
  elsewhere (such as Cloudflare R2) and linked by URL — keep the JSON itself
  lean.

---

## Glossary

- **Slug** — the short name in a URL (the `some-course` part). Here it comes
  from the course filename.
- **Manifest / catalog** — the auto-generated list of all courses.
- **KV** — Cloudflare's key-value store; a fast place to look up a course by
  name.
- **Function** — a small piece of server code (here, the course router).
- **OG tags** — hidden page tags that control how a link looks when shared
  (its preview title, description, and image).
