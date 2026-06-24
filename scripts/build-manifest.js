#!/usr/bin/env node
/**
 * scripts/build-manifest.js
 * ────────────────────────────────────────────────────────────────────────
 * Scans  courses/*.json  and emits  public/manifest.json — the single source
 * of truth for (a) the home-page listing and (b) slug validation in the
 * catch-all Function.
 *
 * Each manifest entry:
 *   {
 *     slug,            // derived from filename:  someName.json -> "someName"
 *     courseId,        // courseMetadata.courseId
 *     title,           // courseMetadata.title
 *     description,     // courseMetadata.description
 *     duration,        // RAW minutes  (courseMetadata.estimatedDurationMinutes)
 *     durationLabel,   // convenience display string, e.g. "9h" / "1h 30m"
 *     difficulty,      // courseMetadata.difficultyLevel  (verbatim pass-through)
 *     ogImage          // courseMetadata.thumbnailImage if non-empty, else ""
 *   }
 *
 * Run:  node scripts/build-manifest.js
 */

const fs   = require('fs');
const path = require('path');

const COURSES_DIR  = path.resolve(__dirname, '..', 'courses');
const OUT_PATH     = path.resolve(__dirname, '..', 'public', 'manifest.json');

// Slugs that must never be a course, because a real static asset / route owns
// that top-level path. Keep in sync with anything you add under public/.
const RESERVED_SLUGS = new Set([
  'index', 'player', '404', 'manifest', 'assets', 'courses',
  'favicon', 'robots', 'sitemap',
]);

function slugFromFilename(file) {
  return path.basename(file, '.json');
}

function formatDuration(mins) {
  const m = Number(mins);
  if (!Number.isFinite(m) || m <= 0) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h)      return `${h}h`;
  return `${r}m`;
}

function main() {
  if (!fs.existsSync(COURSES_DIR)) {
    console.error(`No courses directory at ${COURSES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(COURSES_DIR).filter((f) => f.endsWith('.json'));
  const manifest = [];
  const seenSlugs = new Set();
  let errors = 0;

  for (const file of files) {
    const slug = slugFromFilename(file);
    const full = path.join(COURSES_DIR, file);

    if (RESERVED_SLUGS.has(slug)) {
      console.error(`✗ ${file}: slug "${slug}" is reserved — rename the file.`);
      errors++; continue;
    }
    if (seenSlugs.has(slug)) {
      console.error(`✗ ${file}: duplicate slug "${slug}".`);
      errors++; continue;
    }

    let course;
    try {
      course = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      console.error(`✗ ${file}: invalid JSON — ${e.message}`);
      errors++; continue;
    }

    const meta = course.courseMetadata || {};
    if (!meta.courseId || !meta.title) {
      console.error(`✗ ${file}: courseMetadata.courseId and .title are required.`);
      errors++; continue;
    }

    const duration = Number(meta.estimatedDurationMinutes) || 0;
    const thumb = (meta.thumbnailImage || '').trim();

    manifest.push({
      slug,
      courseId:      meta.courseId,
      title:         meta.title,
      description:   meta.description || '',
      duration,                              // raw minutes
      durationLabel: formatDuration(duration),
      difficulty:    meta.difficultyLevel || '', // verbatim
      ogImage:       thumb,                  // "" -> Function uses site default
    });

    seenSlugs.add(slug);
  }

  if (errors) {
    console.error(`\nManifest build failed with ${errors} error(s).`);
    process.exit(1);
  }

  // Stable order so diffs are clean: alphabetical by title.
  manifest.sort((a, b) => a.title.localeCompare(b.title));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ Wrote ${manifest.length} course(s) to ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();
