# Section 10 — `performance-and-optimization`
# Performance Architecture: Code Splitting, Bundling & Render Optimization

---

## Why This Matters

Performance is an architectural discipline, not a finishing step. The decisions that most affect load time and runtime responsiveness — component granularity, import discipline, code split boundaries, rendering model — are made early and are expensive to retrofit. Waiting until the app feels slow to think about performance means paying the highest possible price to fix it. This section treats performance as a set of architectural choices made during design, with profiling as the tool that confirms where to apply them.

---

## Learning Objectives

1. **10.1** Design a code splitting strategy for a SaaS application, identifying route-level and component-level split points and their architectural rationale.
2. **10.2** Implement `React.lazy` + `Suspense` for a heavy feature component and explain how the split boundary integrates with Section 2's async UI architecture.
3. **10.3** Use bundle analysis to identify oversized chunks and explain the architectural choices that caused them.
4. **10.4** Apply list virtualization (TanStack Virtual) for a large data set and articulate when it is architecturally necessary vs. premature.
5. **10.5** Explain the React Compiler's automatic memoization model and identify which existing `useMemo`/`useCallback` patterns become redundant in a compiler-enabled codebase.

---

## Key Terms & Definitions

**Code splitting** — Dividing an application's JavaScript bundle into smaller chunks that load on demand rather than upfront. Reduces initial parse and execution time.

**Chunk** — A discrete JavaScript file produced by the bundler. Each split boundary creates a new chunk.

**Dynamic import** — `import('./Module')` — a JavaScript expression (not a static declaration) that loads a module asynchronously, returning a Promise. The mechanism behind `React.lazy` and React Router's `lazy`.

**Tree shaking** — The bundler's removal of exported code that is never imported. Requires ES module syntax (`import`/`export`); CommonJS (`require`) is not tree-shakeable.

**Bundle analysis** — Inspecting the contents and sizes of production chunks to identify what is large, what is duplicated, and what should be split or deferred.

**Virtualization** — Rendering only the DOM nodes that are currently visible in a scrollable list, rather than all items. Critical for lists of hundreds or thousands of items.

**`React.lazy`** — A React function that accepts a dynamic import and returns a component that suspends until the module loads. Requires a `Suspense` boundary ancestor.

**React Compiler** — A build-time compiler that statically analyses components and hooks and automatically inserts memoization where safe. Stable in React 19.

---

## Lecture Content

### Part 1: Code Splitting Strategy

Every byte of JavaScript shipped to the browser costs: download time, parse time, and execution time. Code splitting defers bytes that aren't needed for the initial view.

**Two tiers of split decisions:**

**Tier 1: Route-level splitting** — the default. Every route is a potential split boundary because users navigate to one route at a time. If the `/reports` route loads a charting library and a complex data table, users who only ever visit `/dashboard` should never pay for that code.

```tsx
// React Router v6 — lazy per route
const router = createBrowserRouter([
  {
    path: 'dashboard',
    lazy: () => import('./pages/Dashboard').then(m => ({ Component: m.default })),
  },
  {
    path: 'reports',
    // Heavy: loads Recharts + TanStack Table
    lazy: () => import('./pages/Reports').then(m => ({ Component: m.default })),
  },
  {
    path: 'settings',
    lazy: () => import('./pages/Settings').then(m => ({ Component: m.default })),
  },
]);
```

Every route loads independently. The initial bundle contains only the shell, routing logic, and shared utilities.

**Tier 2: Component-level splitting** — applied selectively to heavy components within a route. Rich text editors, PDF viewers, spreadsheet-like grids, large charting libraries — these can cost 200–500kb on their own.

```tsx
// Heavy component split — loads only when the user triggers it
const RichTextEditor = React.lazy(() => import('./RichTextEditor'));
const PdfViewer      = React.lazy(() => import('./PdfViewer'));

function ContractEditor({ contract }: { contract: Contract }) {
  const [showPdf, setShowPdf] = useState(false);

  return (
    <FeatureErrorBoundary fallback={<EditorError />}>
      <Suspense fallback={<EditorSkeleton />}>
        <RichTextEditor initialContent={contract.body} />
      </Suspense>

      {showPdf && (
        <Suspense fallback={<PdfSkeleton />}>
          <PdfViewer url={contract.pdfUrl} />
        </Suspense>
      )}
    </FeatureErrorBoundary>
  );
}
```

**The integration with Section 2:** Component-level splits use `React.lazy` + `Suspense`, which is exactly the async boundary system from Section 2. The split boundary *is* a Suspense boundary. The fallback shown while the chunk downloads is the same mechanism as the fallback shown while data loads. Design them together.

**When NOT to split:**

- Small components (< 10kb). The HTTP request overhead exceeds the savings.
- Components that are almost always needed on first visit.
- Components whose loading delay would be jarring without a suitable fallback.

---

### Part 2: Bundle Analysis

You cannot optimise what you cannot see. Bundle analysis surfaces the actual contents of each production chunk.

**Setup with `rollup-plugin-visualizer` (Vite):**

```ts
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true, gzipSize: true, brotliSize: true }),
  ],
});
```

Running `vite build` opens an interactive treemap of every module in every chunk.

**What to look for:**

| Finding | Likely cause | Fix |
|---|---|---|
| `lodash` is 70kb in vendor chunk | Full lodash imported: `import _ from 'lodash'` | Switch to `lodash-es` per-method imports or native equivalents |
| `moment.js` with all locales | Default import includes every locale | Use `date-fns` or `dayjs`; or tree-shake moment locales |
| A page chunk contains a charting library | Chart component not split from route | Apply component-level split |
| Same utility appears in multiple chunks | Shared module threshold not met | Adjust `manualChunks` to hoist shared modules |

**The architectural cause of large chunks is almost always an import discipline failure** — importing an entire library when only one function is needed, or not splitting a heavy feature from its containing route. Bundle analysis reveals the symptom; the fix is in the import or the split boundary.

---

### Part 3: List Virtualization

Rendering 10,000 DOM nodes for a list with 10,000 items blocks the main thread and makes scrolling janky. Virtualization renders only the items visible in the viewport — typically 20–50 nodes — plus a small buffer.

**When virtualization is architecturally necessary:**

- Lists of > ~200 items that are all rendered simultaneously.
- Tables with many columns and many rows.
- Infinite scroll feeds without pagination.

**When it's premature:**

- Paginated lists where each page has < 50 items — pagination already limits DOM size.
- Lists that never exceed 100 items in production.
- Lists with complex item heights that make virtualization harder than pagination.

**TanStack Virtual implementation:**

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualInvoiceList({ invoices }: { invoices: Invoice[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count:           invoices.length,
    getScrollElement: () => parentRef.current,
    estimateSize:    () => 72, // estimated row height in px
    overscan:        5,        // render 5 items beyond visible area
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      {/* Total height spacer — makes scrollbar accurate */}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position:  'absolute',
              top:        0,
              transform: `translateY(${virtualItem.start}px)`,
              width:     '100%',
              height:    `${virtualItem.size}px`,
            }}
          >
            <InvoiceRow invoice={invoices[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**The performance model:** Without virtualization, 10,000 items = 10,000 DOM nodes, all painted and laid out. With virtualization, ~55 nodes at any time (50 visible + 5 overscan). Scroll events shift which items are rendered; the DOM node count stays constant.

**Variable height items:** If items have variable heights, replace `estimateSize` with `measureElement` — TanStack Virtual measures each item after it renders and caches its actual size. This is more accurate but adds a small measurement pass per item.

---

### Part 4: Render Optimization — Memoization Done Right

Sections 1 and 8 established the basics. Here the focus is on *where memoization genuinely pays off* and what changes with the React Compiler.

**The measurement-first rule:** Profile before memoizing. React DevTools Profiler shows component render durations. A component that renders in 0.3ms does not need `memo` — the comparison overhead may cost more.

**Cases where manual memoization earns its cost (even with the compiler):**

```tsx
// 1. Genuinely expensive computation
const processedData = useMemo(
  () => aggregateMetrics(rawEvents, dateRange), // e.g., 50ms computation
  [rawEvents, dateRange]
);

// 2. Stable callback reference for a non-compiled third-party component
const handleChange = useCallback(
  (value: string) => onFilterChange(value),
  [onFilterChange]  // only if onFilterChange is stable
);

// 3. Stable object reference passed to a Context provider
const contextValue = useMemo(
  () => ({ user, permissions }),
  [user, permissions]
);
```

**Cases that become redundant with the React Compiler:**

```tsx
// ❌ Redundant — compiler handles these
const label = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName]);
const onClick = useCallback(() => setOpen(true), []);
const MemoChild = React.memo(({ count }) => <span>{count}</span>);
```

The compiler detects that `label` is a simple string concatenation whose result only changes when its inputs change — it inserts the memoization automatically. Same for stable callbacks and pure components.

**The compiler's blind spots:**

```tsx
// Compiler cannot optimise — dynamic property access is not statically analysable
const value = useMemo(() => config[dynamicKey], [config, dynamicKey]);

// Compiler cannot optimise — non-local mutation
function Component() {
  externalCache.set(id, value); // side effect in render — impure, compiler skips
  return <div />;
}
```

If the compiler can't safely analyse a component, it silently skips it. Check the compiled output (or use the compiler's `__DEV__` logging) to verify compilation succeeded for performance-critical components.

---

## Worked Example: Diagnosing a Slow Reports Page

**Symptom:** The `/reports` page takes 4.2 seconds to become interactive on a fast connection. The bundle is 1.8MB.

**Step 1: Bundle analysis.**

The visualizer reveals:
- `pdfjs-dist` (820kb): the PDF export feature — used by < 5% of users on this page.
- `recharts` (180kb): the charting library — used by 100% of users.
- `lodash` (70kb): imported as `import _ from 'lodash'` — full bundle pulled in.

**Step 2: Architectural decisions.**

- `pdfjs-dist` → component-level split. Wrap the PDF export button in a dynamic import triggered on user click.
- `recharts` → keep in the reports chunk. All users need it; no split benefit.
- `lodash` → switch to `lodash-es` with named imports: `import { groupBy } from 'lodash-es'`. Tree-shaking reduces to ~8kb.

**Step 3: Apply splits.**

```tsx
// PDF export — loads only when user requests it
const PdfExporter = React.lazy(() => import('./PdfExporter'));

function ReportsPage() {
  const [showPdf, setShowPdf] = useState(false);

  return (
    <>
      <RechartsChartGrid data={reportData} />
      <button onClick={() => setShowPdf(true)}>Export PDF</button>
      {showPdf && (
        <Suspense fallback={<ExportingIndicator />}>
          <PdfExporter data={reportData} />
        </Suspense>
      )}
    </>
  );
}
```

**Result:** Initial chunk drops from 1.8MB to ~980kb. PDF export chunk (820kb) loads on demand. `lodash` contribution drops from 70kb to 8kb. Page interactive in ~1.8 seconds.

**Conclusion:** All three gains came from architectural decisions (import style, split boundary placement) — not from adding `useMemo` or tweaking component internals.

---

## Common Errors

> ⚠️ **Error 1: Adding `useMemo` and `useCallback` speculatively**
> Memoization adds overhead: memory for the cached value, and a comparison on every render. For cheap computations (string concatenation, boolean checks, array filters over small sets), the cost exceeds the saving. Measure first; memoize only where the profiler shows genuine render time being saved.

> ⚠️ **Error 2: Splitting too aggressively**
> Splitting every component into its own chunk produces many small HTTP requests. Each request has overhead (DNS, TLS, HTTP/2 stream setup). The performance breakeven for a split is roughly when the component is > 30kb and not needed on first visit. Below that, keep it in the parent chunk.

> ⚠️ **Error 3: Virtualizing small lists**
> Virtualization adds complexity: scroll position management, variable height measurement, accessibility complications (screen readers struggle with virtual lists). Apply it only when the DOM node count demonstrably affects performance — typically > 200 simultaneously rendered items.

> ⚠️ **Error 4: Removing all manual memoization when enabling the React Compiler**
> The compiler silently skips components it can't analyse. Removing `useMemo` from a component the compiler doesn't process leaves it unmemoized. Verify compiler coverage before removing manual optimizations.

> ⚠️ **Error 5: Treating performance optimisation as a post-launch task**
> Import discipline (named imports from tree-shakeable packages) and route-level splitting are cheap to do at development time and expensive to retrofit. Large bundle sizes caused by architectural decisions — monolithic components, eager imports — require structural refactoring to fix.

---

## Practical Activity

**Exercise: Performance Audit and Split Plan**

Given this route setup:

```tsx
import Dashboard     from './pages/Dashboard';
import Reports       from './pages/Reports';      // loads Recharts + xlsx export
import UserAdmin     from './pages/UserAdmin';    // loads a rich data grid
import Settings      from './pages/Settings';
import { Editor }    from '@company/rich-text';   // 340kb, used only in Settings
import * as _        from 'lodash';               // full lodash
```

1. Identify every performance problem in these imports.
2. Rewrite the route config using React Router's `lazy` for appropriate routes.
3. Apply component-level splitting for the rich text editor inside Settings.
4. Fix the lodash import. What does the fix require of the library?
5. Which route(s) would you NOT split, and why?

---

## Quiz

**Multiple Choice**

**Q1.** A bundle analysis shows that `date-fns` appears in three separate route chunks. What is the most likely cause and the correct fix?

A) `date-fns` is being imported differently in each route; standardize the import style.
B) The shared module threshold in the bundler config is set too high — `date-fns` doesn't meet the size threshold to be hoisted to a shared chunk. Lower the threshold or add it to `manualChunks`.
C) `date-fns` does not support tree shaking and must be fully replaced.
D) Each route needs its own copy of `date-fns` for isolation; duplication is correct.

**Answer: B.** When a module appears in multiple chunks, the bundler decided not to hoist it to a shared chunk — usually because it's below the size threshold for automatic splitting. The fix is `manualChunks` configuration or adjusting the threshold.

---

**Q2.** A `<CommentThread>` component renders 5–15 comments per post. A developer proposes adding TanStack Virtual. What is the correct assessment?

A) Virtualization is always beneficial — apply it.
B) 15 DOM nodes is far below the threshold where virtualization provides measurable benefit; the added complexity is not justified.
C) Virtualization should be applied because comments can have variable heights.
D) Apply virtualization only if the comments contain images.

**Answer: B.** Virtualization has implementation complexity and accessibility trade-offs. For 5–15 items, the DOM cost is negligible. Virtualization is warranted at hundreds of simultaneously rendered items.

---

**Short Answer**

**Q3.** Explain how a component-level code split using `React.lazy` integrates with the Suspense boundary system from Section 2.

*Model answer:* `React.lazy` wraps a dynamic import and returns a component that suspends while the chunk downloads — exactly the same mechanism as a Suspense-compatible data library suspending while a request resolves. The nearest `Suspense` boundary catches the suspension and shows its fallback. This means a component-level split boundary *is* a Suspense boundary, and should be designed alongside the async data boundaries from Section 2 — they compose naturally. The Error Boundary that wraps the Suspense also catches chunk load failures (network errors), making the split boundary a full async resilience boundary, not just a loading boundary.

---

**Q4.** What does the React Compiler automate, and what architectural problems does it not solve?

*Model answer:* The React Compiler inserts `memo`, `useMemo`, and `useCallback` automatically for components and hooks whose behaviour it can statically verify is pure and referentially stable. It eliminates the manual memoization tax for straightforward cases. It does not fix architectural problems: a component subscribed to an entire Zustand store still re-renders on any store change; a deeply nested component tree where state is owned too high up still propagates re-renders through intermediate nodes. The compiler optimises within a given architecture — it doesn't substitute for correct state topology or appropriate component granularity.

---

## Retrieval Cues

1. What are the two tiers of code splitting, and what determines which tier applies?
2. What does bundle analysis reveal that profiling does not, and vice versa?
3. At what list size does virtualization typically become architecturally justified? What makes it premature below that threshold?
4. Name two categories of `useMemo` usage that remain valid in a React Compiler-enabled codebase.

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Two-tier splitting: route-level vs. component-level | Day 1 | Day 3 | Day 7 |
| Bundle analysis: what to look for | Day 1 | Day 4 | Day 10 |
| `React.lazy` + Suspense integration | Day 2 | Day 5 | Day 14 |
| Virtualization: when necessary vs. premature | Day 2 | Day 6 | Day 14 |
| React Compiler: what it handles / what it misses | Day 3 | Day 7 | Day 21 |

---

## Transfer Exercise

**Domain: Government permit application portal (not a commercial SaaS)**

A citizen-facing portal has: a public home page (must load fast, SEO-critical), a permit application form (15 steps, complex logic, loads a document scanner library), a submitted applications dashboard (can show thousands of items), a document viewer (large PDF library), and an admin review panel (role-gated, used by < 1% of visitors).

1. Design the code splitting strategy. Which routes get `lazy` splitting? Which components within routes get component-level splits?
2. The submitted applications list can show up to 5,000 items. Does it need virtualization? What information would change your answer?
3. The home page is SEO-critical. Does this change the build tooling recommendation from Section 8? What specifically changes?
4. The document scanner library is 600kb and loads only in the 15-step form. Sketch the `React.lazy` + Suspense + Error Boundary structure for that component, and explain what happens if the chunk fails to load.

---

## Self-Guided Exercise

Run a bundle analysis on a real project you have access to (or create a small Vite app with a few heavy dependencies to analyse).

1. Identify the three largest contributors to your initial bundle.
2. For each: is it needed on first visit? Could it be split, deferred, or replaced with a lighter alternative?
3. Check your `lodash` or `date-fns` imports — are they named imports from tree-shakeable packages, or full-library imports?
4. Open React DevTools Profiler and record a common user interaction. Identify the three slowest-rendering components. For each: is the render cost in the computation, the DOM reconciliation, or an unnecessary re-render? Does the cause suggest memoization, structural refactoring, or virtualization?

Write a one-page performance architecture brief: three findings, three recommendations, with estimated impact for each.
