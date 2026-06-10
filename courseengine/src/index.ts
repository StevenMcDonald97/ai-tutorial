import { Eta } from 'eta';
import { pages, templates } from './registry';

// Eta instance is only needed to provide config (escape function etc.)
// to the pre-compiled template functions — no renderString() calls,
// so no eval() is used at runtime.
const eta = new Eta();

// --- Helpers ---

type CompiledTemplate = (it: Record<string, unknown>, options: unknown) => string;

function renderTemplate(name: string, data: Record<string, unknown> = {}): string {
	const fn = (templates as Record<string, Function>)[name];
	if (!fn) throw new Error(`Template "${name}" not found in registry`);
	// Call with eta as `this` so the compiled function can access
	// eta.config.escapeFunction and eta.config.filterFunction
	return fn.call(eta, data, eta.config);
}

function htmlResponse(html: string, status = 200): Response {
	return new Response(html, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

// --- Worker ---

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		// Strip leading/trailing slashes e.g. "/test/" → "test"
		const pathname = url.pathname.replace(/^\/|\/$/g, '');

		// Homepage
		if (pathname === '') {
			const html = renderTemplate('index', { pages: Object.keys(pages) });
			return htmlResponse(html);
		}

		// Data-driven pages
		if ((pages as Record<string, unknown>)[pathname]) {
			const html = renderTemplate('template', {
				data: (pages as Record<string, unknown>)[pathname],
				pageName: pathname,
			});
			return htmlResponse(html);
		}

		// 404
		const html = renderTemplate('404', { page: pathname });
		return htmlResponse(html, 404);
	},
} satisfies ExportedHandler<Env>;
