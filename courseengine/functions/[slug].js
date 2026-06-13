/**
 * functions/[slug].js
 * ────────────────────────────────────────────────────────────────────────
 * Catch-all route for  https://mysite/<slug>
 *
 * Flow (Option A — manifest-validated, KV-read):
 *   1. Read <slug> from the path.
 *   2. Load manifest.json (static asset, via env.ASSETS) and look up the slug.
 *        - not found  -> serve 404.html with a real HTTP 404
 *   3. Read the course object from KV:  env.COURSES.get('course:'+slug,'json')
 *        - missing in KV (shouldn't happen if deploy synced) -> real 404
 *   4. Fetch the player shell (player.html, static asset).
 *   5. Inject:
 *        - the course JSON into the placeholder  (script-safe escaped)
 *        - per-course Open Graph <meta> tags      (attribute-safe escaped)
 *   6. Return the populated HTML with 200.
 *
 * Bindings expected on the Pages project:
 *   - ASSETS   : the static-asset fetcher (provided automatically to Functions)
 *   - COURSES  : a KV namespace binding holding keys  course:<slug>
 *
 * Reserved top-level asset paths (index.html, manifest.json, /assets/*, etc.)
 * are served as real files BEFORE this Function runs, so they never reach here.
 */

const SITE_NAME       = 'Course Engine';
const DEFAULT_OG_IMAGE = '/assets/og-default.png'; // site-wide fallback preview image

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const slug = String(params.slug || '').trim();

  // ── 1 + 2. Validate the slug against the manifest ──────────────────────
  let manifest;
  try {
    manifest = await readManifest(env, request);
  } catch (err) {
    // If the manifest itself can't be read, fail safe with a 500 rather than
    // pretending the slug is invalid.
    return new Response('Manifest unavailable', { status: 500 });
  }

  const entry = manifest.find((c) => c.slug === slug);
  if (!entry) {
    return serve404(env, request);
  }

  // ── 3. Read the course object from KV ──────────────────────────────────
  let course;
  try {
    course = await env.COURSES.get('course:' + slug, 'json');
  } catch (err) {
    course = null;
  }
  if (!course) {
    // Slug was in the manifest but the KV value is missing — treat as not
    // found so the user never sees a half-broken player. (A deploy that
    // updated the manifest but failed to sync KV would land here.)
    return serve404(env, request);
  }

  // ── 4. Fetch the player shell ──────────────────────────────────────────
  const shellRes = await env.ASSETS.fetch(new URL('/player.html', request.url));
  if (!shellRes.ok) {
    return new Response('Player shell unavailable', { status: 500 });
  }
  let html = await shellRes.text();

  // ── 5. Inject course JSON (script-safe) ────────────────────────────────
  const courseJson = scriptSafeJson(course);
  html = html.replace('"__INJECTED_COURSE__"', courseJson);

  // ── 5b. Inject Open Graph / Twitter meta tags ──────────────────────────
  const ogTags = buildOgTags(entry, request);
  html = html.replace('<!--__OG_TAGS__-->', ogTags);

  // ── 6. Respond ─────────────────────────────────────────────────────────
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short edge cache; course content changes only on deploy. Tune to taste.
      'cache-control': 'public, max-age=60, s-maxage=300',
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function readManifest(env, request) {
  const res = await env.ASSETS.fetch(new URL('/manifest.json', request.url));
  if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
  return res.json();
}

async function serve404(env, request) {
  const res = await env.ASSETS.fetch(new URL('/404.html', request.url));
  const body = res.ok ? await res.text() : 'Not found';
  return new Response(body, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * Stringify a value for safe embedding inside an inline <script>.
 * Escapes the characters that could otherwise break out of the element or
 * confuse the HTML parser: <, >, &, and the U+2028 / U+2029 line separators
 * (which are valid JSON but illegal in JS string literals).
 */
function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Escape a string for safe use inside an HTML attribute value. */
function attrEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOgTags(entry, request) {
  const url = new URL(request.url);
  const pageUrl = url.origin + '/' + entry.slug;

  // Per-course image if present, else the site-wide fallback. Resolve relative
  // image paths against the origin so crawlers get an absolute URL.
  let img = entry.ogImage && String(entry.ogImage).trim()
    ? entry.ogImage
    : DEFAULT_OG_IMAGE;
  if (img.startsWith('/')) img = url.origin + img;

  // A description enriched with duration + difficulty, mirroring the listing.
  const bits = [];
  if (entry.durationLabel) bits.push(entry.durationLabel);
  if (entry.difficulty)    bits.push(entry.difficulty);
  const meta = bits.length ? ' · ' + bits.join(' · ') : '';
  const desc = (entry.description || '') + meta;

  const title = entry.title || SITE_NAME;

  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${attrEscape(SITE_NAME)}">`,
    `<meta property="og:title" content="${attrEscape(title)}">`,
    `<meta property="og:description" content="${attrEscape(desc)}">`,
    `<meta property="og:url" content="${attrEscape(pageUrl)}">`,
    `<meta property="og:image" content="${attrEscape(img)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${attrEscape(title)}">`,
    `<meta name="twitter:description" content="${attrEscape(desc)}">`,
    `<meta name="twitter:image" content="${attrEscape(img)}">`,
  ].join('\n  ');
}
