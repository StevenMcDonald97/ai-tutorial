# Section 2 — `async-ui-coordination`
# Async UI Architecture: Suspense, Error Boundaries & Concurrent Features

---

## Why This Matters

Every SaaS application is fundamentally an async UI problem. Data loads. Requests fail. Some parts of the screen are ready before others. The naive solution — scattered `isLoading`, `isError`, and `data` booleans sprinkled across components — works until it doesn't. It creates loading states that disagree with each other, error states that get swallowed, and UIs that flash between skeleton screens in ways that feel broken even when they aren't.

Suspense and Error Boundaries are React's architectural answer to this problem. They are not convenience features — they are a *boundary placement system* that lets you declare, at the component tree level, which parts of your UI are allowed to fail or load independently. Understanding them as architectural tools — not as performance tricks or last-resort catches — changes how you design features from the ground up.

This section also covers the concurrent features (`useTransition`, `useDeferredValue`, `use()`) that React 18/19 introduced to give you fine-grained control over how async updates flow through the UI. These are not micro-optimizations. They are the tools that let you keep a UI interactive while data is in flight.

---

## Learning Objectives

By the end of this section, you will be able to:

1. **2.1** Explain the architectural role of Suspense as a declarative async boundary system, distinguishing it from the narrow `React.lazy` use case most developers know.
2. **2.2** Design a Suspense boundary layout for a SaaS feature with multiple independent async data regions, justifying boundary granularity decisions.
3. **2.3** Place Error Boundaries at appropriate granularity levels in a component tree and explain the consequences of coarse vs. fine-grained boundary placement.
4. **2.4** Apply `useTransition` to classify a state update as non-urgent and explain how this changes the rendering pipeline relative to an unclassified update.
5. **2.5** Use `useDeferredValue` to defer a computationally expensive derived render and explain when it is preferable to `useTransition`.
6. **2.6** Demonstrate use of the React 19 `use()` hook to consume a promise and a context value, and explain its relationship to Suspense.

---

## Key Terms & Definitions

**Suspense boundary** — A `<Suspense>` component that catches "suspended" renders from its subtree and displays a `fallback` prop until the suspended work resolves. Think of it as a declarative loading container.

**Suspended component** — A component that, during rendering, throws a Promise (directly or via a Suspense-compatible data library). React catches the thrown promise, renders the nearest Suspense boundary's fallback, and retries the component when the promise resolves.

**Error Boundary** — A class component that implements `componentDidCatch` and/or `getDerivedStateFromError`, catching JavaScript errors thrown during rendering or in lifecycle methods of its subtree. Used to display a fallback UI when a subtree fails.

**Boundary granularity** — The architectural decision of how large or small a subtree each Suspense or Error Boundary covers. Coarse granularity = one boundary covers the whole page. Fine granularity = each independent data region has its own boundary.

**`useTransition`** — A React 18 hook that returns `[isPending, startTransition]`. Wrapping a state update in `startTransition` marks it as non-urgent, allowing React to keep the current UI interactive while preparing the next state in the background.

**`useDeferredValue`** — A React 18 hook that accepts a value and returns a deferred version of it. React will use the old value for rendering until the main thread is free, then update to the new value. Unlike `useTransition`, it defers a *value* rather than wrapping a *setter call*.

**`use()` hook (React 19)** — A hook that can consume both Promises and Context values inside a component. When passed a Promise, it integrates with Suspense — the component suspends until the Promise resolves. Unlike other hooks, `use()` can be called conditionally.

**Waterfall loading** — A sequential loading pattern where component B can't start loading until component A has finished, creating cumulative latency. Proper Suspense boundary design can expose waterfalls and enable parallel data fetching.

---

## Lecture Content

### Part 1: Suspense Is a Boundary System, Not a Lazy-Loading Feature

Most React developers encountered Suspense through `React.lazy`:

```jsx
const HeavyChart = React.lazy(() => import('./HeavyChart'));

function Dashboard() {
  return (
    <Suspense fallback={<Spinner />}>
      <HeavyChart />
    </Suspense>
  );
}
```

This is one valid use of Suspense. It is not what Suspense is *for* architecturally.

**What Suspense actually does:**

`<Suspense>` is a boundary component. When any component in its subtree throws a Promise during rendering, Suspense catches that throw, renders its `fallback`, and retries the subtree when the Promise resolves. The thrown Promise is a signal: "I'm not ready yet — try me again when this resolves."

This protocol is what makes Suspense-compatible data libraries (TanStack Query, SWR, Relay) work: when data isn't in cache, the library throws a Promise for the in-flight request. React catches it, shows the Suspense fallback, and re-renders the component once the data arrives.

**The architectural consequence:**

Instead of scattering `if (isLoading) return <Spinner />` throughout your component tree, you move loading state *up* to the boundary level and express it declaratively:

```jsx
// ❌ Imperative loading scattered everywhere
function UserProfile({ userId }) {
  const { data: user, isLoading, isError } = useUser(userId);
  if (isLoading) return <ProfileSkeleton />;
  if (isError) return <ErrorMessage />;
  return <ProfileCard user={user} />;
}

// ✅ Suspense-compatible: component only handles the "ready" case
function UserProfile({ userId }) {
  const user = useUser(userId); // throws Promise if not cached
  return <ProfileCard user={user} />;
}

// Boundary placed in the parent layout
<Suspense fallback={<ProfileSkeleton />}>
  <UserProfile userId={userId} />
</Suspense>
```

The component becomes simpler because it only describes what the UI looks like when data is present. The boundary handles the async coordination.

**Why this matters beyond cleanliness:**

The boundary model lets React coordinate multiple suspended components as a unit. If `<UserProfile>` and `<ActivityFeed>` are both inside the same Suspense boundary, React waits for both to be ready before showing either — preventing a "content pop-in" where parts of the UI appear at different times. You control this coordination through boundary placement.

---

### Part 2: Boundary Granularity — the Core Design Decision

The single most important Suspense architectural decision is where to place your boundaries. This is not a performance detail — it is a UX and resilience design decision.

**The spectrum:**

```
Coarse: one boundary at the app root
                    ↕
Fine: one boundary per independent data region
```

**Coarse boundary (app root only):**

```jsx
<Suspense fallback={<FullPageSpinner />}>
  <App />
</Suspense>
```

The entire application shows a spinner until every suspended component is ready. This is the equivalent of a single `try-catch` around all your code. It's safe, but it means a slow secondary data source blocks the entire UI.

**Fine-grained boundaries (per independent region):**

```jsx
function DashboardLayout() {
  return (
    <div className="dashboard">
      <Suspense fallback={<HeaderSkeleton />}>
        <UserHeader />          {/* fast — cached user data */}
      </Suspense>

      <div className="dashboard-body">
        <Suspense fallback={<FiltersSkeleton />}>
          <FilterPanel />       {/* medium — fetches filter options */}
        </Suspense>

        <Suspense fallback={<ChartSkeleton />}>
          <RevenueChart />      {/* slow — large data query */}
        </Suspense>

        <Suspense fallback={<TableSkeleton />}>
          <UserTable />         {/* slow — paginated query */}
        </Suspense>
      </div>
    </div>
  );
}
```

Now each region loads independently. `UserHeader` appears immediately from cache. `FilterPanel` appears in 200ms. `RevenueChart` and `UserTable` appear when their data arrives — and they don't block each other.

**The design principle:** A Suspense boundary should wrap a region of the UI that is meaningfully independent from adjacent regions in terms of data and loading experience. When in doubt, finer is better — coarse boundaries can always be merged, but splitting them after the fact requires restructuring the component tree.

---

### Part 3: Error Boundaries — Scoped Resilience

Error Boundaries catch JavaScript errors thrown during rendering or in lifecycle methods of their subtree. They are the structural equivalent of Suspense boundaries but for the failure case.

```jsx
class FeatureErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to error monitoring (Sentry, Datadog, etc.)
    reportError(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultErrorUI error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

*(Note: Error Boundaries must be class components as of React 18. A future React version may introduce a hook-based API.)*

**Granularity for Error Boundaries follows the same logic as Suspense:**

A single root-level Error Boundary means any rendering error in your entire application crashes the page. For a SaaS product, that is unacceptable.

```jsx
function DashboardLayout() {
  return (
    <div className="dashboard">
      {/* The header failing should not crash the charts */}
      <FeatureErrorBoundary fallback={<HeaderError />}>
        <Suspense fallback={<HeaderSkeleton />}>
          <UserHeader />
        </Suspense>
      </FeatureErrorBoundary>

      <FeatureErrorBoundary fallback={<ChartError />}>
        <Suspense fallback={<ChartSkeleton />}>
          <RevenueChart />
        </Suspense>
      </FeatureErrorBoundary>
    </div>
  );
}
```

**The standard pattern:** Nest a Suspense boundary inside an Error Boundary for each independent UI region. The Error Boundary handles render failures; the Suspense boundary handles async loading. Together they give you full resilience for a UI region without any loading/error state inside the components themselves.

**What Error Boundaries do NOT catch:**
- Errors in event handlers (use try-catch there)
- Async errors outside of rendering (use-catch in async functions)
- Server-side rendering errors
- Errors in the Error Boundary component itself

---

### Part 4: `useTransition` — Classifying Updates as Urgent vs. Non-Urgent

React's concurrent scheduler assigns priorities to updates. By default, every state update is treated as urgent — React will interrupt whatever it was doing to process it. `useTransition` lets you explicitly mark an update as non-urgent.

**The problem it solves:**

Imagine a SaaS application with a search input that filters a large list. Every keystroke triggers a state update, which triggers an expensive re-render of the filtered list. With the legacy model, each keystroke can cause visible lag because React processes the expensive list re-render synchronously before the browser can repaint and show the next character.

**Without `useTransition`:**

```jsx
function SearchableList({ items }) {
  const [query, setQuery] = useState('');
  const filtered = items.filter(item =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <LargeList items={filtered} />  {/* expensive render */}
    </>
  );
}
```

Every `setQuery` call re-renders `LargeList` synchronously. On a large dataset, the input feels laggy.

**With `useTransition`:**

```jsx
function SearchableList({ items }) {
  const [query, setQuery] = useState('');
  const [deferredQuery, setDeferredQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = items.filter(item =>
    item.name.toLowerCase().includes(deferredQuery.toLowerCase())
  );

  function handleChange(e) {
    setQuery(e.target.value);  // urgent — update input immediately
    startTransition(() => {
      setDeferredQuery(e.target.value);  // non-urgent — update list when ready
    });
  }

  return (
    <>
      <input value={query} onChange={handleChange} />
      {isPending && <ListLoadingIndicator />}
      <LargeList items={filtered} />
    </>
  );
}
```

Now the input update is processed immediately (the user sees their keystroke). React defers the expensive list re-render, using the current list as a "stale" display while computing the new one in the background. `isPending` lets you show a subtle loading indicator during the transition.

**The architectural insight:** `useTransition` is not a performance hack — it's an API for expressing *intent*. You're telling React: "the input update is urgent; the list update can wait." This is an architectural decision about what the user cares about most at each moment.

---

### Part 5: `useDeferredValue` — Deferring a Value, Not a Setter

`useDeferredValue` solves a similar problem to `useTransition` but from a different angle. Use it when you don't control the state setter — for example, when a value comes from a prop or a library.

```jsx
function FilteredResults({ query }) {  // query comes from a parent or URL param
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(
    () => expensiveFilter(allItems, deferredQuery),
    [deferredQuery]
  );

  const isStale = query !== deferredQuery;

  return (
    <div style={{ opacity: isStale ? 0.7 : 1 }}>
      <ResultsList items={results} />
    </div>
  );
}
```

`useDeferredValue` returns a version of `query` that React may intentionally lag behind the actual value during concurrent renders. React renders with the old `deferredQuery` until the main thread is free to process the update, then switches to the new value.

**`useTransition` vs `useDeferredValue`:**

| | `useTransition` | `useDeferredValue` |
|---|---|---|
| What you control | The state setter call | The received value |
| When to use | You own the state update | Value comes from props/library |
| Granularity | Wraps an entire update | Defers one value |
| `isPending` flag | Yes | No (derive from value comparison) |

**The rule of thumb:** If you own the `setState` call, use `useTransition`. If you're receiving a value you don't control, use `useDeferredValue`.

---

### Part 6: The React 19 `use()` Hook

React 19 introduced `use()`, a hook with two distinct capabilities:

**1. Consuming Promises:**

```jsx
import { use, Suspense } from 'react';

function UserProfile({ userPromise }) {
  const user = use(userPromise);  // suspends until promise resolves
  return <ProfileCard user={user} />;
}

// In the parent:
const userPromise = fetchUser(userId);  // created outside the component

<Suspense fallback={<ProfileSkeleton />}>
  <UserProfile userPromise={userPromise} />
</Suspense>
```

When `use()` receives a Promise, the component suspends (throws the Promise) until it resolves, integrating seamlessly with the nearest Suspense boundary. When it rejects, the nearest Error Boundary catches the error.

**Critical:** The Promise must be created *outside* the component or be stable across renders (e.g., stored in a ref or passed from a parent). Creating the Promise inside the component body recreates it on every render, causing an infinite suspend/retry loop.

**2. Consuming Context conditionally:**

```jsx
function ConditionalFeature({ showFeature }) {
  if (!showFeature) return null;

  // use() can be called after a conditional return — unlike useContext
  const theme = use(ThemeContext);
  return <FeatureUI theme={theme} />;
}
```

Unlike `useContext`, `use()` can be called conditionally. This is a deliberate design choice enabling more flexible component logic.

**Relationship to Suspense:**

`use()` with a Promise is the React 19 primitive for Suspense-compatible data consumption. It makes explicit what libraries like TanStack Query have been doing internally: throwing a Promise to signal "not ready yet." The `use()` hook standardizes this pattern so you can use it directly without a library, while still integrating with the full Suspense boundary system.

---

### Worked Example: Designing a SaaS Feature's Async Boundary Map

**Scenario:** A project management SaaS has a "Project Detail" page with these regions:
- Project header (name, owner, status) — fast, usually cached
- Task list — medium, paginated query
- Activity feed — slow, aggregated from multiple sources
- Comment thread — medium, real-time subscription

**Step 1: Identify independent async regions.**

Each of these regions has a different data source, different loading time, and different failure mode. They are independent. A slow activity feed should not block the task list from appearing.

**Step 2: Map boundary granularity decisions.**

```jsx
function ProjectDetailPage({ projectId }) {
  return (
    <div className="project-detail">

      {/* Fast region — coarse boundary is fine */}
      <FeatureErrorBoundary fallback={<HeaderErrorUI />}>
        <Suspense fallback={<ProjectHeaderSkeleton />}>
          <ProjectHeader projectId={projectId} />
        </Suspense>
      </FeatureErrorBoundary>

      <div className="project-body">
        {/* Task list — independent, own boundary */}
        <FeatureErrorBoundary fallback={<TaskListError />}>
          <Suspense fallback={<TaskListSkeleton />}>
            <TaskList projectId={projectId} />
          </Suspense>
        </FeatureErrorBoundary>

        <div className="project-sidebar">
          {/* Activity feed — slow, independent */}
          <FeatureErrorBoundary fallback={<FeedError />}>
            <Suspense fallback={<ActivityFeedSkeleton />}>
              <ActivityFeed projectId={projectId} />
            </Suspense>
          </FeatureErrorBoundary>

          {/* Comment thread — real-time, separate boundary */}
          <FeatureErrorBoundary fallback={<CommentsError />}>
            <Suspense fallback={<CommentsSkeleton />}>
              <CommentThread projectId={projectId} />
            </Suspense>
          </FeatureErrorBoundary>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Apply `useTransition` for pagination.**

The task list has pagination. When the user clicks "Next page," a transition is appropriate: the current page should remain visible while the next page loads.

```jsx
function TaskList({ projectId }) {
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const tasks = useTasks(projectId, page);  // Suspense-compatible

  return (
    <div style={{ opacity: isPending ? 0.6 : 1 }}>
      <TaskGrid tasks={tasks} />
      <button onClick={() => startTransition(() => setPage(p => p + 1))}>
        {isPending ? 'Loading...' : 'Next page'}
      </button>
    </div>
  );
}
```

**Conclusion:** The boundary map is an architectural artifact you can draw before writing a single component. It answers: "Which regions can fail or load independently?" The answer to that question determines your Suspense and Error Boundary placement.

---

## Common Errors

> ⚠️ **Error 1: Treating Suspense as load-order control**
> Suspense does not guarantee that sibling components load sequentially. Two components inside the same boundary may load in any order — Suspense shows the fallback until *all* are ready. To sequence loads (show A, then add B), use nested boundaries or React 18's `SuspenseList` (experimental).

> ⚠️ **Error 2: Creating promises inside components used with `use()`**
> `const user = use(fetchUser(id))` where `fetchUser` is called in the render body creates a new Promise every render, causing an infinite suspend loop. The Promise must be stable — created outside the component, passed as a prop, or stored in state/refs.

> ⚠️ **Error 3: Wrapping all state updates in `startTransition` "for performance"**
> Transition updates are interruptible and may be abandoned. Wrapping urgent updates (like controlled input values) in `startTransition` will cause the UI to feel unresponsive — the input won't show the character until React finishes the transition. Only non-urgent, background updates belong in transitions.

> ⚠️ **Error 4: Single root-level Error Boundary**
> A single Error Boundary at the app root means any rendering error in any feature crashes the entire application. For SaaS products, this is equivalent to a full outage for a partial failure. Scope Error Boundaries to the feature they protect.

> ⚠️ **Error 5: Forgetting that Error Boundaries don't catch async errors**
> An unhandled rejection in a `useEffect` or event handler will not be caught by an Error Boundary. Only synchronous rendering errors are caught. Use separate error state management for async operation failures — or integrate with a Suspense-compatible library that converts async errors into rendering errors.

---

## Practical Activity

**Exercise: Async Boundary Mapping**

Take the following feature description for a SaaS analytics platform:

> "The Reports page shows: (1) a date-range filter bar at the top, (2) a summary stats row with 4 KPI cards, each fetching from a different endpoint, (3) a large line chart showing trend data for the selected date range, (4) a data table below the chart with exportable rows, and (5) a sidebar with saved report templates."

1. Draw (or describe in text) the component tree for this page.
2. For each data-fetching region, decide: independent boundary, or shared boundary with a sibling? Justify each decision.
3. Where would you apply `useTransition`? (Hint: think about the date-range filter interaction.)
4. Where would you apply `useDeferredValue`? Is there a case where you don't control the setter?
5. Write the JSX skeleton for the boundary layout (no implementation needed — just the `<Suspense>` and `<FeatureErrorBoundary>` nesting structure).

---

## Quiz

**Multiple Choice**

**Q1.** A SaaS dashboard has a `<Suspense>` boundary wrapping both `<RevenueChart>` and `<UserTable>`. `RevenueChart` resolves in 300ms. `UserTable` resolves in 1200ms. When does the boundary's fallback disappear and the content render?

A) After 300ms, when `RevenueChart` is ready — it renders immediately and `UserTable` renders later.
B) After 1200ms, when both components are ready — the boundary waits for all children.
C) After 750ms (average of the two).
D) The behavior depends on which component mounts first.

**Answer: B.** A Suspense boundary waits until all suspended children in its subtree have resolved before replacing the fallback with content. If you want each to appear independently, they need separate boundaries.

---

**Q2.** Which of the following is the correct use of `useTransition` for a tab-switching interaction where switching tabs triggers a data fetch?

A) `const [tab, setTab] = useTransition(useState('overview'));`
B) `startTransition(() => setTab('settings'))` — mark the tab change as non-urgent so the current tab remains visible while the new tab's data loads.
C) `startTransition(() => fetchData(newTab))` — wrap the fetch call in the transition.
D) `useTransition` is not appropriate for tab switching; use `useDeferredValue` instead.

**Answer: B.** `startTransition` wraps the *state setter call* that triggers the non-urgent update. The current tab stays visible (with `isPending` indicating the transition is in progress) while React prepares the new tab in the background.

---

**Q3.** An Error Boundary is placed at the root of a `<FeatureDashboard>` component. A `TypeError` is thrown inside a `useEffect` callback in a child component. Does the Error Boundary catch it?

A) Yes — Error Boundaries catch all errors in their subtree.
B) No — Error Boundaries only catch errors thrown during rendering, not in `useEffect` callbacks.
C) Yes — `useEffect` is part of the render lifecycle, so its errors propagate to boundaries.
D) It depends on whether the error is synchronous or asynchronous.

**Answer: B.** Error Boundaries only catch errors thrown during the render phase (component function execution) and in lifecycle methods. Errors in `useEffect`, event handlers, and async callbacks are not caught.

---

**Short Answer**

**Q4.** Explain the architectural difference between placing one Suspense boundary at the app root versus placing individual boundaries around each independent data region. What does each choice trade off?

*Model answer:* A single root boundary is simple but means the entire UI shows a loading state until every data source resolves — the slowest source blocks the fastest. Fine-grained boundaries per independent region allow each region to appear as soon as its data is ready, providing a progressive loading experience. The trade-off is complexity: more boundaries mean more fallback UIs to design and maintain. The correct choice depends on whether the regions are truly independent (different data sources, different load times) or whether the UX requires them to appear together.

---

**Q5.** When should you use `useDeferredValue` instead of `useTransition`? Give a concrete example.

*Model answer:* Use `useDeferredValue` when you receive a value from props or an external source and don't have access to its setter. For example, if a URL search parameter drives a filter query and the URL updating is handled by a router library you don't control, you can't wrap the router's update in `startTransition`. Instead, `useDeferredValue(searchParam)` lets React defer the expensive re-render that depends on `searchParam` while keeping the UI responsive.

---

## Retrieval Cues

*(Answer from memory before moving to Section 3.)*

1. What does a component do mechanically when it "suspends"? What does React do in response?
2. What are the consequences of placing a single Error Boundary at the app root versus scoping boundaries to individual features?
3. What is the difference between `useTransition` and `useDeferredValue`, and when would you choose each?
4. What constraint must be respected when using the React 19 `use()` hook with a Promise inside a component?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Suspense: boundary system vs. lazy-loading | Day 1 | Day 3 | Day 7 |
| Boundary granularity decision principle | Day 1 | Day 4 | Day 10 |
| Error Boundary: what it catches / doesn't catch | Day 2 | Day 5 | Day 14 |
| `useTransition`: urgent vs. non-urgent updates | Day 2 | Day 6 | Day 14 |
| `useTransition` vs. `useDeferredValue` | Day 3 | Day 7 | Day 21 |
| `use()` hook: Promise stability constraint | Day 3 | Day 8 | Day 21 |

---

## Transfer Exercise

**Domain: E-commerce product page (not a SaaS dashboard)**

An e-commerce product page has these regions:
- Product images and title — static, bundled with the page
- Price and availability — fetched in real time from an inventory service (can be slow or fail)
- Customer reviews — paginated, fetched from a reviews service
- "Frequently bought together" recommendations — fetched from a recommendation engine (often slow)
- Stock count notification form — a simple client-side form, no data fetch

1. For each region, decide whether it needs a Suspense boundary, an Error Boundary, both, or neither. Justify each decision.
2. A product manager asks: "Can we show the price immediately even if reviews are still loading?" What boundary design makes this possible? What would prevent it?
3. The recommendations widget is known to be slow (p95 = 3 seconds). A UX designer proposes that while recommendations are loading, the user should still be able to interact with the rest of the page normally. Which React API enables this, and where would you apply it?
4. The inventory service occasionally returns 503 errors. When it does, you want to show "Price temporarily unavailable" only in the price region — not crash the whole page. What mechanism handles this, and what are the limits of that mechanism?

---

## Self-Guided Exercise

**Real-world application outside this course:**

Choose a SaaS web application you use regularly — a project management tool, a CRM, a data analytics platform, or similar. Observe its loading behavior by:

1. Opening the app with browser DevTools network tab open, throttled to "Slow 3G."
2. Navigating to the most data-heavy page in the application.
3. Observing the loading sequence: what appears first? What blocks what? Are there cascading spinners, or do regions load independently?

Then answer:
- Does the app's loading behavior suggest fine-grained or coarse Suspense boundary usage?
- Are there any regions that appear to "pop in" after the rest of the page loads? What does that tell you about their boundary design?
- If you were the architect, what would you change about the loading sequence and why?

Write a 1-page "async UX audit" as if delivering it to the product team. This is the kind of observation-to-recommendation skill Section 11 will ask you to apply formally.
