#!/usr/bin/env node
/**
 * scripts/sync-kv.js
 * ────────────────────────────────────────────────────────────────────────
 * Pushes  courses/*.json  into the Cloudflare KV namespace under keys
 * of the form  course:<slug>  — so the catch-all Function can read each
 * course by slug at request time.
 *
 * Change detection: a small  .kv-sync-cache.json  records the content hash
 * last written for each slug, so re-runs only upload what actually changed.
 * Delete that cache file to force a full re-sync.
 *
 * This script shells out to Wrangler, so it needs:
 *   - wrangler installed and authenticated  (npx wrangler ...)
 *   - the KV namespace id available, either via:
 *       a) env var  KV_NAMESPACE_ID, or
 *       b) the binding name resolved from wrangler.toml (set BINDING below)
 *
 * Run:  node scripts/sync-kv.js
 *
 * NOTE: Cloudflare KV writes are eventually consistent (propagation can take
 * up to ~60s globally). KV is the SERVING store; courses/*.json in the repo
 * remain the source of truth.
 */

const fs            = require('fs');
const path          = require('path');
const crypto        = require('crypto');
const { execFileSync } = require('child_process');

const COURSES_DIR = path.resolve(__dirname, '..', 'courses');
const CACHE_PATH  = path.resolve(__dirname, '..', '.kv-sync-cache.json');

// Either set KV_NAMESPACE_ID in the environment, or rely on --binding via
// wrangler.toml by setting BINDING and leaving NAMESPACE_ID empty.
const NAMESPACE_ID = process.env.KV_NAMESPACE_ID || '';
const BINDING      = 'COURSES';

function sh(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
}

function namespaceArgs() {
  // Prefer an explicit namespace id; fall back to the binding name.
  return NAMESPACE_ID
    ? ['--namespace-id', NAMESPACE_ID]
    : ['--binding', BINDING];
}

function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); }
  catch { return {}; }
}

function main() {
  if (!fs.existsSync(COURSES_DIR)) {
    console.error(`No courses directory at ${COURSES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(COURSES_DIR).filter((f) => f.endsWith('.json'));
  const cache = loadCache();
  const nextCache = {};
  let written = 0, skipped = 0;

  for (const file of files) {
    const slug = path.basename(file, '.json');
    const full = path.join(COURSES_DIR, file);
    const raw  = fs.readFileSync(full, 'utf8');

    // Validate it parses before we ever push it.
    try { JSON.parse(raw); }
    catch (e) {
      console.error(`✗ ${file}: invalid JSON, not syncing — ${e.message}`);
      process.exit(1);
    }

    const h   = hash(raw);
    const key = 'course:' + slug;
    nextCache[slug] = h;

    if (cache[slug] === h) {
      skipped++;
      continue; // unchanged since last sync
    }

    // Write via stdin-less path: wrangler reads the value from a file.
    sh(['kv', 'key', 'put', key, '--path', full, ...namespaceArgs()]);
    console.log(`✓ put ${key}`);
    written++;
  }

  // Optional: detect courses removed from the repo and delete their KV keys.
  for (const slug of Object.keys(cache)) {
    if (!nextCache[slug]) {
      const key = 'course:' + slug;
      sh(['kv', 'key', 'delete', key, ...namespaceArgs()]);
      console.log(`✗ deleted stale ${key}`);
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 2) + '\n');
  console.log(`\nSync complete — ${written} written, ${skipped} unchanged.`);
}

main();
