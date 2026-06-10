/**
 * src/worker.js
 *
 * Cloudflare Worker — handles all routing and HTML rendering.
 * JSON pages and Eta templates are imported from the auto-generated
 * registry (run `npm run build` to regenerate it from data/ and views/).
 */

import { Eta } from 'eta';
import { pages, templates } from './registry.js';

const eta = new Eta();

// --- Helpers ---

function renderTemplate(name, data = {}) {
  const src = templates[name];
  if (!src) throw new Error(`Template "${name}" not found in registry`);
  return eta.renderString(src, data);
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function cssResponse(css) {
  return new Response(css, {
    headers: { 'Content-Type': 'text/css; charset=utf-8' },
  });
}

// --- Worker entry point ---

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Strip leading slash and any trailing slash, e.g. "/test/" → "test"
    const pathname = url.pathname.replace(/^\/|\/$/g, '');

    // Homepage
    if (pathname === '') {
      const html = renderTemplate('index', { pages: Object.keys(pages) });
      return htmlResponse(html);
    }

    // Data-driven page
    if (pages[pathname]) {
      const html = renderTemplate('template', { data: pages[pathname], pageName: pathname });
      return htmlResponse(html);
    }

    // 404
    const html = renderTemplate('404', { page: pathname });
    return htmlResponse(html, 404);
  },
};
