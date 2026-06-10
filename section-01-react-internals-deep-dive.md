# Section 1 — `react-internals-deep-dive`
# React Internals: Rendering, Fiber, and the Reconciliation Contract

---

## Why This Matters

Most experienced React developers have a working model of React that gets them through 90% of their work. They know that state changes trigger re-renders, that `useEffect` runs after the render, and that `memo` can stop unnecessary renders. That working model breaks down exactly when they need it most: debugging a dashboard that renders hundreds of times per second, explaining to a client why a feature feels sluggish despite "no unnecessary re-renders," or reasoning about what concurrent mode actually changes in their application.

This section rebuilds your mental model from the engine level. Not because you need to read the React source code, but because the architectural decisions you'll make in every subsequent section — where to place Suspense boundaries, how to design state topology, when to reach for `useMemo` — are only coherent if you understand *why* React works the way it does.

Knowing React's rendering model is the difference between guessing at optimizations and reasoning about them.

---

## Learning Objectives

By the end of this section, you will be able to:

1. **1.1** Explain the three phases of a React render cycle (render, reconcile, commit) and what work happens in each.
2. **1.2** Predict which components re-render given a specific state or context change, and justify the prediction using reconciliation rules.
3. **1.3** Distinguish between React 18/19 concurrent rendering behaviors and the legacy synchronous model, and explain the implications for component design.
4. **1.4** Diagnose a provided component tree for unnecessary re-renders and identify the correct mitigation strategy (`memo`, `useMemo`, `useCallback`, or structural refactoring).

---

## Key Terms & Definitions

**Fiber** — React's internal unit of work. Each component instance in your tree corresponds to a fiber node. The fiber stores the component's type, props, state, and the output from its last render. The fiber tree is what React actually works with during reconciliation — not your JSX.

**Reconciliation** — The process by which React compares the output of the current render to the previous fiber tree and determines the minimal set of DOM mutations required. Often called "diffing."

**Commit phase** — The phase where React applies the mutations determined during reconciliation to the actual DOM. Side effects (`useEffect`, `useLayoutEffect`) are scheduled and flushed here.

**Work loop** — The scheduler's mechanism for processing fiber units of work. In concurrent mode, the work loop can be interrupted between fibers to yield to higher-priority work.

**Re-render** — A JavaScript function call: React calls your component function again to get a new element tree. It does *not* mean the DOM is updated — that only happens if reconciliation finds a difference.

**Bailout** — React's optimization where it skips re-rendering a subtree because props and state haven't changed. `React.memo`, `PureComponent`, and `shouldComponentUpdate` all trigger bailouts.

**Lanes** — React 18's internal priority model. Each update is assigned a lane (e.g., SyncLane for urgent updates, TransitionLane for non-urgent). The scheduler processes higher-priority lanes first.

**Concurrent mode** — The React 18+ rendering model where the work loop can be paused and resumed, allowing React to keep the UI responsive by yielding to urgent updates mid-render.

---

## Lecture Content

### Part 1: The Three Phases of a React Render

Every React update — whether triggered by `setState`, a context change, or a parent re-render — goes through three sequential phases. Understanding what happens in each phase is the foundation for all performance reasoning.

#### Phase 1: Render (a.k.a. "the render phase")

React calls your component function. That's it. Your function receives its current props and returns a React element tree (JSX). React does this for every component that needs to be evaluated in the current update.

Critical properties of the render phase:
- **It is pure.** Your function should return the same output for the same inputs. React may call your component function multiple times in concurrent mode (e.g., to prepare a pending UI), so side effects in the render body create bugs.
- **It is not the DOM.** Nothing in the browser changes during this phase. React is just calling functions and building a description of what the UI should look like.
- **It cascades.** When a component re-renders, all of its children re-render by default — not because their props changed, but because React needs to evaluate what they would return given the new parent output.

#### Phase 2: Reconcile (a.k.a. "diffing")

React compares the element tree produced in the render phase against the existing fiber tree. The reconciler applies a set of heuristics to make this fast:

1. **Elements of different types produce different trees.** If a `<div>` is replaced with a `<span>`, React tears down the entire subtree and creates a new one.
2. **Elements of the same type are updated in place.** Props are diffed and the fiber is updated with the delta.
3. **Keys tell React which children are which across re-renders.** Without keys, React uses positional matching — a common source of subtle bugs in dynamic lists.

The output of reconciliation is a set of effects: which DOM nodes to create, update, or delete; which refs to attach; which effects to fire.

#### Phase 3: Commit

React applies the effects from reconciliation to the DOM. This phase is synchronous and cannot be interrupted — once React starts committing, it finishes before the browser can paint. This is why large commit phases cause jank.

The commit phase has three sub-phases:
- **Before mutation** — `getSnapshotBeforeUpdate` lifecycle fires.
- **Mutation** — DOM nodes are created, updated, deleted. Refs are attached.
- **Layout** — `useLayoutEffect` runs synchronously. `useEffect` callbacks are *scheduled* to run after the browser has had a chance to paint.

> **The key insight:** `useEffect` runs after the browser paint, not synchronously after the commit. This makes it safe for non-visual side effects (data fetching, subscriptions). `useLayoutEffect` runs synchronously before paint — use it only when you need to read DOM layout measurements to avoid visual flicker.

---

### Part 2: The Fiber Architecture

Before React 16, React's reconciler was a recursive, synchronous algorithm. It walked the component tree, diffed it, and committed — all in one synchronous call. This was a problem for large trees: a 200ms reconciliation meant 200ms of blocked JavaScript, visible as a dropped frame.

Fiber replaced this with an incremental, interruptible model.

**How Fiber works:**

Instead of a single recursive call, React maintains a linked list of fiber nodes. Each fiber node represents one unit of work (one component). The "work loop" processes fibers one at a time. Between fibers, the scheduler can check whether higher-priority work has arrived and yield if so.

Each fiber stores:
- `type` — the component function or class
- `key` and `props` — the current props
- `stateNode` — the DOM node (for host components) or component instance
- `child`, `sibling`, `return` — pointers that form the fiber tree
- `alternate` — a pointer to the previous version of this fiber (the "work in progress" vs. "current" tree)

React maintains two fiber trees simultaneously: the **current tree** (what's on screen) and the **work-in-progress tree** (what React is computing). When a commit finishes, the work-in-progress tree becomes the current tree.

**Why this matters architecturally:**

In concurrent mode, React can render the work-in-progress tree, discover that a higher-priority update arrived (e.g., a user typed in an input), discard the in-progress work, and start over on the higher-priority update. This is safe because the current tree (what's on screen) is never mutated until commit.

The implication for your components: **render functions must be pure and free of side effects**, because React may call them multiple times before committing any output.

---

### Part 3: When Do Components Re-Render?

This is the most commonly misunderstood aspect of React's model. A component re-renders in exactly four situations:

1. **Its own state changes** via `useState` or `useReducer` dispatch.
2. **Its parent re-renders** — React calls all children of a re-rendering component by default, regardless of whether their props changed. This is the most frequently overlooked trigger.
3. **A context it consumes changes** — specifically, when the value passed to `Context.Provider` changes by reference equality.
4. **A hook it uses triggers a re-render** — e.g., `useSelector` in Redux detects a state change and triggers a re-render of that component.

> **The critical mental model:** A re-render is not expensive by itself. Calling a function that returns a small JSX tree is cheap. What can be expensive is (a) the work inside the render function itself, and (b) the reconciliation of a very large subtree. Over-applying `memo` to avoid "unnecessary" re-renders adds memoization overhead that often costs more than the re-renders it prevents.

**The bailout mechanism:**

When React processes a fiber, it can "bail out" — skip re-rendering the component and reuse the previous output — if it determines nothing has changed. Bailouts happen:
- For components wrapped in `React.memo`, when props pass a shallow equality check.
- For class components that implement `shouldComponentUpdate` or extend `PureComponent`.
- Internally, when React detects that `useState`'s new value is identical to the current value (same reference for objects/arrays, same primitive value for primitives).

**What bailout does NOT do:**

A bailout does not skip reconciliation of a component's children if the component itself did re-render. Bailout applies at the subtree level only when the *parent* component's output indicates the child's props are unchanged.

---

### Part 4: Concurrent Rendering and What Changed in React 18/19

React 18 introduced the concurrent renderer. The key change is not what components do — it's when and how often React calls them.

**The legacy synchronous model:**

Every `setState` call triggered a synchronous, uninterruptible render → reconcile → commit pipeline. This guaranteed predictable component call timing but blocked the main thread.

**The concurrent model:**

Updates are assigned priorities (lanes). React can:
- **Pause** rendering mid-tree and yield to the browser for input events.
- **Abandon** a low-priority render in progress if a high-priority update arrives.
- **Prepare** multiple versions of the UI simultaneously (used by `useTransition` and Suspense).

**What this changes for component design:**

Almost nothing, deliberately. React's concurrent features were designed to be backward-compatible. Your component functions should already be pure (render phase purity was always a requirement). The main implication:

- Components may render more times than in the legacy model — React may render a component, discard the output, and render it again. Any side effects in the render body will fire multiple times.
- The order of renders is not guaranteed in the same way as before. Don't rely on render-phase side effects for sequencing.
- `useEffect` cleanup and re-run behavior is the same — but with strict mode in development, React intentionally double-invokes effects to expose non-idempotent cleanup.

> **Common misconception to address directly:** Concurrent mode does not require you to rewrite your components. It changes *React's scheduler behavior*, not the component contract. Components that were correct before React 18 are correct after it — assuming they were pure.

---

### Worked Example: Diagnosing Re-Render Cascades

**Scenario:** A SaaS analytics dashboard has a `<Dashboard>` component at the top level that holds a `filters` state object. It renders a `<Sidebar>` (the filter controls) and a `<ChartGrid>` (12 chart components). Every time a user adjusts a filter, all 12 charts re-render — even the ones whose data is unaffected by the changed filter.

**Step 1: Map the re-render triggers.**

```
Dashboard (owns filters state)
├── Sidebar (reads filters, dispatches filter changes)
└── ChartGrid (receives filters as prop)
    ├── RevenueChart (receives filters.dateRange)
    ├── UserChart (receives filters.segment)
    └── ... (10 more charts)
```

When `filters` changes, `Dashboard` re-renders. Because `ChartGrid` is a child of `Dashboard`, it re-renders. Because all 12 charts are children of `ChartGrid`, they all re-render — even if only `filters.dateRange` changed and `UserChart` only depends on `filters.segment`.

**Step 2: Identify the correct mitigation.**

Option A — Wrap each chart in `React.memo` with a custom comparison function that only re-renders when its specific filter slice changes.

Option B — Restructure: lift each chart's filter slice out and pass only the relevant slice as a prop. A chart that only needs `filters.dateRange` should receive `dateRange` directly, not the whole `filters` object. Then `React.memo` with default shallow equality will correctly bail out.

Option C (often the best) — If the charts are fetching their own data via TanStack Query or similar, the filter is just a query key. The charts re-render on prop change, but each chart's re-render is cheap (it just triggers a cache lookup). Measure before optimizing.

**Step 3: Apply the diagnosis.**

Profile first. In React DevTools Profiler, record a filter change. If `RevenueChart`'s render time is 2ms, the 12 re-renders cost 24ms — likely below the 16ms frame budget once spread across the event loop. If one chart takes 40ms, that's the one to optimize, not all 12.

**Conclusion:** Re-render cascades are often benign. The correct response is always *measure, then optimize the measured bottleneck* — not add `memo` preemptively to every component.

---

## Common Errors

> ⚠️ **Error 1: Assuming re-render = DOM update**
> Re-rendering is a JavaScript function call. The DOM is only updated if reconciliation finds a difference. A component that re-renders 50 times but always returns the same output causes zero DOM updates. The cost is the function call and diffing, not DOM manipulation.

> ⚠️ **Error 2: Using `useMemo`/`useCallback` everywhere as a "safety net"**
> Every `useMemo` and `useCallback` call adds memory overhead and a comparison on every render. If the wrapped computation is cheap (e.g., an array filter over 10 items), the memoization overhead can exceed the cost it's preventing. Reserve them for genuinely expensive computations and stable references that are dependencies of other memos or effects.

> ⚠️ **Error 3: Writing side effects in render functions**
> React's concurrent renderer may call your component function multiple times before committing. Side effects in the render body (API calls, subscriptions, mutations) will fire multiple times unpredictably. All side effects belong in `useEffect` or event handlers.

> ⚠️ **Error 4: Misreading `useEffect` dependency arrays**
> `useEffect` runs after renders where the dependency values have changed by *reference equality* for objects and arrays. `[user]` where `user` is a new object literal on every render will cause the effect to run on every render. This is the most common source of infinite loops in React.

---

## Practical Activity

**Exercise: Re-render Archaeology**

Take any medium-complexity React component tree you've worked with recently (a client project, a personal project, or a public GitHub repository). Open it in development mode with React DevTools installed.

1. Enable "Highlight updates when components render" in React DevTools settings.
2. Perform one user interaction (click a button, type in a field, change a dropdown).
3. Note every component that highlighted. For each highlighted component, answer: *why* did it re-render? Map it to one of the four re-render triggers from the lecture.
4. Identify one component that re-rendered but whose output you believe didn't change. Is that re-render expensive or benign? How would you verify?
5. Write a one-paragraph diagnosis: what is the rendering behavior of this tree, and is it a problem?

*There is no "correct" answer — the goal is developing the habit of reasoning about re-render causality rather than reacting to symptoms.*

---

## Quiz

**Multiple Choice**

**Q1.** A `<Modal>` component is wrapped in `React.memo`. Its parent re-renders. The `Modal`'s props are the same as the last render. What happens?

A) `Modal` re-renders because its parent re-rendered.
B) `Modal` skips re-rendering because `React.memo` performs a shallow prop comparison and finds no change.
C) `Modal` re-renders because `React.memo` only prevents re-renders when `shouldComponentUpdate` returns false.
D) `Modal` skips re-rendering because React always bails out when a parent re-renders with the same JSX.

**Answer: B.** `React.memo` wraps a component and performs a shallow comparison of its props. If props are shallowly equal, React bails out and reuses the previous render output.

---

**Q2.** Which phase of the React render cycle is responsible for updating the actual browser DOM?

A) Render phase
B) Reconciliation phase
C) Commit phase
D) Scheduling phase

**Answer: C.** The commit phase is where React applies the mutations calculated during reconciliation to the real DOM.

---

**Q3.** Your `useEffect` is running on every render despite having a dependency array of `[user]`. What is the most likely cause?

A) The `user` object is being recreated on every render, so its reference changes each time.
B) `useEffect` always runs on every render when the dependency is an object.
C) The dependency array is being ignored because `user` is a non-primitive.
D) React 18 changed `useEffect` to always re-run for object dependencies.

**Answer: A.** If `user` is created inline in the component body (e.g., `const user = { id: userId, name }`), it's a new object reference every render, making the effect think the dependency changed.

---

**Short Answer**

**Q4.** Explain in 2-3 sentences what "concurrent mode" changes about React's rendering behavior, and what it does *not* change about how you write component functions.

*Model answer:* Concurrent mode changes React's scheduler so that rendering work can be paused, abandoned, and resumed — allowing the browser to remain responsive to high-priority user input during long renders. It does not change what component functions do or their contract: they still receive props and return JSX. The implication for developers is that render functions must be side-effect-free (they were always supposed to be), because React may call them multiple times before committing.

---

**Q5.** A junior developer on your team adds `React.memo` to every component in a new feature "just to be safe." What is the architectural problem with this approach?

*Model answer:* `React.memo` adds overhead on every render: a shallow comparison of all props. For components that receive objects or functions as props (which change reference frequently), this comparison may be incorrect and fail to prevent re-renders. For components with cheap render functions, the comparison overhead likely exceeds any savings. The correct approach is to profile first, identify which re-renders are expensive, and apply memoization surgically where the measured evidence justifies it.

---

## Retrieval Cues

*(Answer these from memory before moving to Section 2.)*

1. Name the three phases of a React render cycle and describe one thing that happens in each.
2. List the four conditions that cause a React component to re-render.
3. What is the difference between `useEffect` and `useLayoutEffect` in terms of when they run relative to the browser paint?
4. What does React's concurrent renderer change about how component functions should be written, and what does it not change?

---

## Spaced Repetition Schedule

Review these items at the following intervals after first study:

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Three render phases (render, reconcile, commit) | Day 1 | Day 3 | Day 7 |
| Four re-render triggers | Day 1 | Day 4 | Day 10 |
| Fiber: current tree vs. work-in-progress tree | Day 2 | Day 5 | Day 14 |
| `useEffect` vs `useLayoutEffect` timing | Day 2 | Day 6 | Day 14 |
| Concurrent mode: what changes / what doesn't | Day 3 | Day 7 | Day 21 |
| Bailout conditions and `React.memo` cost model | Day 3 | Day 8 | Day 21 |

---

## Transfer Exercise

**Domain: Document editing application (not a SaaS dashboard)**

A collaborative document editor has the following component structure:

```
EditorApp (owns documentState — a large object with all page content)
├── Toolbar (reads documentState.formatting, dispatches formatting changes)
├── PageCanvas (reads documentState.pages, renders all pages)
│   └── [PageComponent × N] (one per page)
└── CommentPanel (reads documentState.comments)
```

Every time a user makes a formatting change (e.g., bolds a word), `documentState` is replaced with a new object, triggering a full re-render of the tree including all N `PageComponent` instances.

1. Using the re-render trigger model from this section, explain precisely why all `PageComponent` instances re-render when only the `formatting` slice changed.
2. Propose two different architectural approaches to prevent `PageComponent` from re-rendering unnecessarily — one using memoization, one using structural refactoring.
3. Which approach would you recommend for a production application, and why? Consider maintainability, not just performance.

---

## Self-Guided Exercise

**Real-world application outside this course:**

Find an open-source React application on GitHub with at least 50 stars and a meaningful feature set (a task manager, a dashboard, a form-heavy app). Clone it and run it locally in development mode.

Install React DevTools and use the Profiler tab to record 3–5 user interactions. For each interaction, identify:
- Which components re-rendered
- How long each render took
- Whether any re-renders appear to be unnecessary (the component's visible output didn't change)

Write a one-page "rendering audit" as if you were delivering it to the client who owns this codebase. Include: a description of what you found, your assessment of whether it's a problem, and one concrete recommendation with reasoning.

*This exercise builds the diagnostic habit that Section 11 will formalize into a full architectural audit methodology.*
