# Section 4 — `functional-programming-foundations`
# Functional Programming for React Architects

---

## Why This Matters

React's design is soaked in functional programming ideas — but React is not a functional programming framework. It uses FP idioms where they reduce bugs and improve composability, and pragmatically breaks them where it needs to. Understanding which FP principles React applies, why, and where the boundaries are gives you a principled vocabulary for every state management, hook design, and data transformation decision that follows in this course.

---

## Learning Objectives

1. **4.1** Distinguish pure from impure functions and explain why component render functions should be pure.
2. **4.2** Apply function composition and higher-order functions to build reusable data transformation pipelines.
3. **4.3** Explain structural sharing and demonstrate how Immer achieves immutability without full cloning.
4. **4.4** Compose custom React hooks from smaller hooks, articulating what separates a well-designed hook contract from mere code extraction.

---

## Key Terms & Definitions

**Pure function** — A function that (a) always returns the same output for the same inputs, and (b) has no side effects. Given the same arguments, it is completely predictable.

**Side effect** — Any interaction with the outside world from within a function: mutating external state, making network requests, reading from a DOM, writing to a log. React isolates side effects to `useEffect` and event handlers.

**Immutability** — The principle that data is never mutated in place. Updates produce new values; old values remain unchanged. This makes change detection cheap (reference equality) and history trivial to preserve.

**Structural sharing** — An optimization where an immutable update reuses unchanged parts of a data structure rather than copying the whole thing. A tree with 1000 nodes where one leaf changes shares 999 nodes with the previous version.

**Higher-order function (HOF)** — A function that takes a function as an argument or returns a function. `Array.map`, `Array.filter`, and React's HOC pattern are all higher-order.

**Function composition** — Combining two or more functions so the output of one becomes the input of the next. `compose(f, g)(x)` is equivalent to `f(g(x))`.

**Referential transparency** — A property of pure functions: any call can be replaced with its return value without changing program behavior. This is what makes memoization safe.

---

## Lecture Content

### Part 1: Purity and Why React Requires It

A pure function has no memory and no agenda — it takes inputs and returns an output, every time, without touching anything else.

```tsx
// ✅ Pure — same input always produces same output
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// ❌ Impure — reads external mutable state
function formatCurrency(amount: number): string {
  return amount.toFixed(userPreferences.decimalPlaces); // external dependency
}
```

**React component render functions must be pure.** This is not a style preference — it's a correctness requirement enforced by concurrent mode. As Section 1 established, React may call your component function multiple times before committing. If your render function mutates state, fires analytics events, or reads non-stable external values, those side effects fire unpredictably.

```tsx
// ❌ Impure render — mutates ref during render
function Counter({ count }: { count: number }) {
  renderCount.current++; // mutation in render body — wrong
  return <div>{count}</div>;
}

// ✅ Move side effects to useEffect
function Counter({ count }: { count: number }) {
  useEffect(() => { renderCount.current++; }, [count]);
  return <div>{count}</div>;
}
```

**React is not purely functional.** Side effects are necessary and expected — they live in `useEffect`, event handlers, and server actions. The constraint is *where* side effects live, not their elimination.

---

### Part 2: Immutability and Structural Sharing

Immutability is how React detects change cheaply. React's reconciler, `React.memo`, Redux selectors, and `useEffect` dependencies all use reference equality (`===`) to detect change. If you mutate an object in place, the reference doesn't change, and React doesn't know something changed.

```tsx
// ❌ Mutation — React won't detect the change
const items = state.items;
items.push(newItem); // same reference — React sees no change
setState(items);

// ✅ New reference — React detects the change
setState([...state.items, newItem]);
```

**The full-clone misconception:** Many developers avoid immutability because they assume it means cloning the entire state tree on every update. That's not how production immutability works.

**Structural sharing** means only the changed path is copied; unchanged branches are shared:

```
Before update:         After adding item to list[2]:
root                   root (new)
├── user ─────────────►├── user (shared — same reference)
├── settings ─────────►├── settings (shared — same reference)
└── list               └── list (new)
    ├── [0] ──────────►    ├── [0] (shared)
    ├── [1] ──────────►    ├── [1] (shared)
    └── [2]                └── [2] (new)
```

**Immer** implements structural sharing automatically. You write mutating code; Immer produces an immutable result:

```tsx
import { produce } from 'immer';

const nextState = produce(state, draft => {
  // draft is a mutable proxy — mutations are intercepted
  draft.list.push(newItem);
  draft.user.lastModified = Date.now();
});
// state is unchanged; nextState is a new object with structural sharing
```

Immer's `produce` is pure from the caller's perspective — same state + same recipe = same nextState. The mutation syntax is a convenience; the output is immutable.

---

### Part 3: Function Composition and Higher-Order Functions

**Data transformation pipelines** are where composition pays off most clearly in React. Rather than nesting transformations, chain them:

```tsx
// ❌ Nested — hard to read, hard to test individual steps
const result = formatForDisplay(sortByDate(filterActive(filterByRole(users, role))));

// ✅ Composed pipeline — each step is testable in isolation
const processUsers = (role: Role) => (users: User[]) =>
  users
    .filter(u => u.role === role)
    .filter(u => u.isActive)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(formatForDisplay);

const displayUsers = processUsers('admin')(allUsers);
```

Each transformation is a pure function. The pipeline is the composition.

**Higher-order functions in React architecture:**

HOFs appear at multiple levels in React:
- **Component level** — HOCs wrap a component and return a new component: `withAuth(Dashboard)`.
- **Hook level** — A hook that returns another hook's interface, extended: `useEnhancedQuery(useQuery(...))`.
- **Selector level** — Reselect's `createSelector` composes selector functions: `createSelector(selectUsers, selectRole, filterByRole)`.

The unifying principle: a HOF takes behavior as input and returns behavior as output. This is function composition applied to React's abstraction layers.

---

### Part 4: Custom Hook Composition — Contracts vs. Code Extraction

The distinction between a *well-designed hook* and *extracted code* is the difference between an abstraction and a shortcut.

**Code extraction** — moves lines out of a component without defining a new concept:

```tsx
// ❌ This is just copy-paste in a trench coat
function useUserStuff(id: string) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  // ... 40 lines that were in the component
  return { user, loading, setUser, setLoading }; // leaks internal state
}
```

**A hook contract** — encapsulates a complete behavioral unit with a stable, minimal interface:

```tsx
// ✅ Encapsulates the full async user lifecycle
function useUser(id: UserId): UserState {
  const [state, dispatch] = useReducer(userReducer, { status: 'idle' });

  useEffect(() => {
    dispatch({ type: 'FETCH_START' });
    fetchUser(id)
      .then(data  => dispatch({ type: 'FETCH_SUCCESS', data }))
      .catch(error => dispatch({ type: 'FETCH_ERROR', error }));
  }, [id]);

  return state; // returns a discriminated union — caller gets the contract, not the internals
}
```

**The test for a good hook contract:**
1. Can you describe what the hook *does* in one sentence without mentioning its implementation?
2. Could you replace the internals (swap `useState` for `useReducer`) without changing any call sites?
3. Is it testable with `renderHook` without mocking its internal structure?

If yes to all three, you have a contract. If no, you have extracted code.

**Composing hooks from smaller hooks** is FP composition at the behavioral layer:

```tsx
function useDashboardData(filters: Filters) {
  const user    = useCurrentUser();           // encapsulated user contract
  const metrics = useMetrics(filters);        // encapsulated metrics contract
  const permissions = usePermissions(user.id); // encapsulated permissions contract

  return { user, metrics, permissions };
}
```

Each sub-hook is independently testable, independently replaceable. `useDashboardData` composes behavior the same way `compose(f, g)` composes functions.

---

## Worked Example: Refactoring an Impure, Mutation-Heavy Hook

**Before:**

```tsx
function useFilteredReports(reports: Report[]) {
  const filtered = reports; // ❌ same reference
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (!filtered[i].isPublished) filtered.splice(i, 1); // ❌ mutates prop
  }
  filtered.sort((a, b) => a.title.localeCompare(b.title)); // ❌ mutates array
  return filtered;
}
```

Problems: mutates the `reports` prop directly, sorts in-place, returns the same reference regardless of changes.

**After:**

```tsx
function useFilteredReports(reports: Report[]): Report[] {
  return useMemo(
    () =>
      reports
        .filter(r => r.isPublished)       // new array, original unchanged
        .sort((a, b) => a.title.localeCompare(b.title)), // sort on new array
    [reports]  // recomputes only when reports reference changes
  );
}
```

**Conclusion:** Pure transformation, no mutation, memoized for stability. The output reference is stable as long as `reports` is stable — safe as a `useEffect` dependency.

---

## Common Errors

> ⚠️ **Error 1: Mutating state directly in a reducer**
> `state.items.push(item); return state;` — Redux and `useReducer` both depend on reference equality to detect changes. Mutating and returning the same reference means the store/component sees no change. Return a new object. Use Immer if mutation syntax is preferred.

> ⚠️ **Error 2: Treating Immer as permission to mutate anywhere**
> Immer's mutation syntax is only safe inside `produce`'s `draft` callback. Outside of it, the same immutability rules apply. A common mistake is using Immer in reducers but then mutating state directly in `useEffect` callbacks.

> ⚠️ **Error 3: Over-abstracting with composition**
> A three-function pipeline where one function would do is not better architecture — it's indirection. Compose when each step is independently reusable or testable. Don't compose for composition's sake.

> ⚠️ **Error 4: Returning internal state setters from hooks**
> Returning `setUser` or `setLoading` from a custom hook breaks encapsulation — callers can put the hook into states its internals don't expect. Return the minimal interface: state and named action dispatchers only.

---

## Practical Activity

**Exercise: Pipeline and Hook Refactor**

Given this component:

```tsx
function ReportList({ reports }: { reports: Report[] }) {
  const [search, setSearch] = useState('');
  const results = [];
  for (const r of reports) {
    if (r.isPublished && r.title.toLowerCase().includes(search.toLowerCase())) {
      results.push({ ...r, title: r.title.trim().toUpperCase() });
    }
  }
  results.sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <input value={search} onChange={e => setSearch(e.target.value)} />
      {results.map(r => <ReportCard key={r.id} report={r} />)}
    </>
  );
}
```

1. Extract the data transformation into a pure function pipeline (filter → transform → sort). Each step should be a named, separately testable function.
2. Extract the search + filtering logic into a `useFilteredReports(reports, search)` hook with a clean contract.
3. Apply `useMemo` correctly to avoid recomputing the pipeline on every keystroke.
4. Identify: is `useFilteredReports` now a contract or just extracted code? Apply the three-question test.

---

## Quiz

**Multiple Choice**

**Q1.** Which of the following makes a React component render function impure?

A) Reading from `props` inside the function body.
B) Calling `useState` to get the current state value.
C) Incrementing a module-level counter variable on every render.
D) Returning different JSX based on the value of a prop.

**Answer: C.** Modifying a module-level variable is a side effect — it changes something outside the function's scope and is non-deterministic across multiple calls. A and B are pure reads; D is deterministic given the same prop value.

---

**Q2.** Immer's `produce(state, draft => { draft.list.push(item) })` returns:

A) The same `state` object with `item` appended to `list`.
B) A new object where only the changed path (`list`) is a new reference; unchanged parts share references with `state`.
C) A deep clone of `state` with `item` appended.
D) A frozen copy of `state` that cannot be mutated further.

**Answer: B.** Immer uses structural sharing — only the modified path gets new references. This makes reference equality checks in React efficient.

---

**Short Answer**

**Q3.** What is the practical difference between a custom hook that is a "contract" versus one that is merely "extracted code"? How does the distinction affect testability?

*Model answer:* A contract exposes a stable, minimal interface that describes *what* the hook does, hiding *how* it does it. Extracted code leaks internals (raw state setters, implementation details) and has no clear conceptual boundary. A contract is testable via `renderHook` by exercising its public interface — you can refactor the internals without changing the tests. Extracted code tests break when you refactor internals because the tests are coupled to implementation details.

---

**Q4.** Why does mutating an array in place cause bugs when that array is a `useEffect` dependency?

*Model answer:* `useEffect` compares dependencies by reference equality. If you push to an existing array, the reference doesn't change — the array object is the same. React sees no change in the dependency and doesn't re-run the effect, even though the contents changed. Creating a new array (`[...arr, newItem]`) changes the reference, correctly triggering the effect.

---

## Retrieval Cues

1. Name two React mechanisms that rely on reference equality — and explain why mutation breaks them.
2. What is structural sharing, and why does it make immutability practical for large state trees?
3. What are the three questions that distinguish a hook contract from extracted code?
4. At which three abstraction levels do higher-order functions appear in React architecture?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Render function purity requirement | Day 1 | Day 3 | Day 7 |
| Mutation vs. new reference for change detection | Day 1 | Day 4 | Day 10 |
| Structural sharing mental model | Day 2 | Day 5 | Day 14 |
| Immer: what `produce` guarantees | Day 2 | Day 6 | Day 14 |
| Hook contract vs. extracted code — 3 questions | Day 3 | Day 7 | Day 21 |

---

## Transfer Exercise

**Domain: Financial data processing pipeline (not a React UI)**

A Node.js ETL script processes daily transaction records:

```ts
function processTransactions(transactions: Transaction[]) {
  // filters, enriches, and aggregates — all in one impure function
  for (const t of transactions) {
    t.amount = t.amount * exchangeRates[t.currency]; // mutates input
    if (t.amount < 0) transactions.splice(transactions.indexOf(t), 1);
  }
  transactions.sort((a, b) => b.date - a.date);
  globalReport.total = transactions.reduce((s, t) => s + t.amount, 0);
  return transactions;
}
```

1. Identify every purity violation. Classify each as: (a) mutates input, (b) reads external mutable state, or (c) writes external state.
2. Rewrite as a composed pipeline of pure functions. Each step — normalize currency, filter negatives, sort by date, compute total — should be a named pure function.
3. The pipeline now needs to be testable. What does purity give you for free that the original function didn't?

---

## Self-Guided Exercise

Find or write a custom hook in a real codebase that you suspect is "extracted code" rather than a proper contract. Apply the three-question test:

1. Can you describe what it does in one sentence without mentioning its internals?
2. Could you replace the internals without changing call sites?
3. Is it testable without mocking its internal state shape?

If it fails any question, refactor it into a proper contract. Write a `renderHook` test (even a skeleton) that exercises only the public interface. Note what you had to change about the hook's return type to make the test possible without internal knowledge.

