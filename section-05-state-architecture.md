# Section 5 — `state-architecture`
# State Topology: Ownership, Classification & Flow Design

---

## Why This Matters

The most expensive architectural mistakes in React applications are state mistakes. State placed in the wrong layer causes prop drilling, stale data, unnecessary re-renders, over-complex stores, and synchronization bugs. Getting state topology right — classifying what kind of state you have, then assigning it to the correct ownership layer — is the single decision that most determines how maintainable a SaaS front end will be six months after launch.

---

## Learning Objectives

1. **5.1** Classify a given set of application state variables by kind: server cache, global client, local UI, derived, ephemeral, and form.
2. **5.2** Design a state ownership map for a realistic SaaS feature.
3. **5.3** Explain the architectural consequences of placing server state in a client global store.
4. **5.4** Explain why Context is a dependency injection mechanism, not a state manager, and implement the value/dispatch separation pattern.
5. **5.5** Identify and resolve a prop-drilling anti-pattern using the most appropriate mechanism.

---

## Key Terms & Definitions

**State topology** — The map of what state exists in an application, what kind each piece is, and which layer owns it.

**Server cache state** — Data that originates on the server and is cached client-side. Has unique lifecycle properties: staleness, background refetch, cache invalidation. Examples: user records, paginated lists, dashboard metrics.

**Global client state** — Client-owned state that multiple unrelated parts of the UI need simultaneously. Examples: current user session, theme preference, notification queue.

**Local UI state** — State relevant only to one component or a small local subtree. Examples: whether a dropdown is open, a hover state, a local toggle.

**Derived state** — State computed from other state. Should never be stored independently — recompute or memoize it. Examples: filtered lists, totals, formatted values.

**Ephemeral state** — Transient state with a very short lifetime, typically tied to a single interaction. Examples: tooltip visibility, drag position, animation state.

**Form state** — The specific lifecycle of user input from first keystroke through validation to submission. Architecturally distinct from all other state kinds (covered in depth in Section 7).

**Prop drilling** — Passing props through intermediate components that don't use them, solely to deliver data to a deeply nested consumer. A symptom of incorrect state placement.

**Colocation** — Placing state as close as possible to the components that use it. The first principle of state ownership.

---

## Lecture Content

### Part 1: The State Classification Framework

Before choosing a mechanism, classify the state. The classification determines the mechanism — not the other way around.

```
State Kind         | Owner                    | Mechanism
-------------------|--------------------------|----------------------------------
Server cache       | Server + client cache    | TanStack Query / SWR
Global client      | Application              | Zustand / Redux Toolkit
Local UI           | Component                | useState / useReducer
Derived            | Nowhere (compute it)     | useMemo / selector
Ephemeral          | Component                | useState / useRef
Form               | Form library             | React Hook Form
```

**The classification questions:**
1. Does this data originate on the server? → Server cache. Don't put it in a global store.
2. Do multiple *unrelated* components need it simultaneously? → Global client state.
3. Does only one component (or a small local subtree) need it? → Local UI state. Keep it local.
4. Can it be computed from other state? → Derived. Delete the stored copy.
5. Does it live only for the duration of a single interaction? → Ephemeral.
6. Is it user input in progress toward a submission? → Form state.

**The most common misclassification** is treating server cache state as global client state — fetching data from an API and storing it in Redux. This leads to manual loading/error flag management, stale data bugs, and cache invalidation complexity that TanStack Query handles automatically.

---

### Part 2: State Ownership and Colocation

**The colocation principle:** state should live as close as possible to the components that need it. Lift only as high as necessary.

```tsx
// ❌ Lifted too high — app-level state for a local concern
function App() {
  const [dropdownOpen, setDropdownOpen] = useState(false); // only UserMenu needs this
  return <UserMenu dropdownOpen={dropdownOpen} setDropdownOpen={setDropdownOpen} />;
}

// ✅ Colocated — state lives where it's used
function UserMenu() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  return <>{/* ... */}</>;
}
```

Lifting state has a real cost: every state update re-renders the component that owns it and potentially its entire subtree. Unnecessary lifting creates unnecessary re-renders and couples unrelated components.

**The ownership design process for a feature:**

1. List every piece of state the feature needs.
2. Classify each using the framework above.
3. For each piece, ask: "What is the smallest subtree that contains all components needing this state?" That subtree's root owns it.
4. Server cache state gets no owner in the component tree — TanStack Query owns it.

---

### Part 3: Server State vs. Client State — Why They're Different

Server state has a fundamentally different lifecycle from client state:

| Property | Client state | Server state |
|---|---|---|
| Source of truth | The client | The server |
| Goes stale? | No | Yes — other users may change it |
| Needs background refetch? | No | Yes |
| Needs deduplication? | No | Yes — multiple components may request same data |
| Cache invalidation? | Not applicable | Critical |

Storing server state in Redux or Zustand means you own all of the above manually. You write loading flags, error handling, refetch logic, cache expiry, and invalidation — all code that TanStack Query provides as first-class features.

```tsx
// ❌ Server state stored in Redux — manual everything
const userSlice = createSlice({
  name: 'user',
  initialState: { data: null, loading: false, error: null },
  reducers: { /* ... loading/success/error actions */ }
});
// Plus: thunks, background refetch logic, stale detection, cache invalidation...

// ✅ Server state in TanStack Query — lifecycle handled
function useUser(id: UserId) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

**The rule:** If it came from an API and will go back to the API, it's server cache state. Use a dedicated server cache layer.

---

### Part 4: Context — Dependency Injection, Not State Management

Context is the most architecturally misunderstood React API. The misconception: "Context is a lightweight alternative to Redux." The reality: **Context is a dependency injection mechanism.** Its job is to make a value available anywhere in a subtree without prop drilling — not to manage state changes efficiently.

**Why Context is not a state manager:**

Every consumer of a Context re-renders when the context value changes by reference. If you put a large object in Context and update any field, every consumer re-renders — even consumers that only use an unrelated field.

```tsx
// ❌ Single context with everything — all consumers re-render on any change
const AppContext = createContext({ user, theme, notifications, dispatch });
```

**The value/dispatch separation pattern:**

Split Context into two: one for the stable state value (or a slice of it), one for the dispatch function (which never changes reference):

```tsx
const UserStateContext  = createContext<UserState | null>(null);
const UserDispatchContext = createContext<Dispatch<UserAction> | null>(null);

function UserProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(userReducer, initialUserState);

  return (
    <UserStateContext.Provider value={state}>
      <UserDispatchContext.Provider value={dispatch}>
        {children}
      </UserDispatchContext.Provider>
    </UserStateContext.Provider>
  );
}
```

Components that only dispatch actions consume `UserDispatchContext` — they never re-render due to state changes. Components that read state consume `UserStateContext` — and can be further optimized by splitting state into smaller, more focused contexts.

**When Context is the right tool:**
- Injecting theme, locale, or feature flags into a subtree.
- Making a service (analytics client, router) available without prop drilling.
- Sharing state within a tightly scoped feature subtree (e.g., compound component internal state).

**When Context is the wrong tool:**
- High-frequency state updates (every keystroke, animation frames).
- State needed by many unrelated components across the app.
- Complex state with many independent slices.

Use a global store (Zustand, RTK) for those cases.

---

### Part 5: Resolving Prop Drilling

Prop drilling is a symptom — diagnose before treating. The correct fix depends on *why* the drilling exists.

**Diagnosis questions:**
1. Is the state genuinely shared, or is it local state lifted too high? → Move it down (colocation).
2. Is it shared across a well-defined feature subtree? → Context for that subtree.
3. Is it truly cross-cutting (needed by unrelated parts of the app)? → Global store.
4. Is the component hierarchy the actual problem? → Composition via `children` or render props.

**The composition fix** — often overlooked:

```tsx
// ❌ UserAvatar drilled through Layout and Header just to reach Nav
function App() {
  const user = useCurrentUser();
  return <Layout user={user} />;        // Layout doesn't use user
}
function Layout({ user }) {
  return <Header user={user} />;        // Header doesn't use user
}
function Header({ user }) {
  return <Nav user={user} />;           // Nav finally uses user
}

// ✅ Composition — App owns the assembly, no drilling
function App() {
  const user = useCurrentUser();
  return (
    <Layout>
      <Header>
        <Nav user={user} />             {/* user passed directly to consumer */}
      </Header>
    </Layout>
  );
}
```

Composition via `children` eliminates drilling without introducing Context or a global store. It's the simplest fix and is underused.

---

## Worked Example: Designing a State Ownership Map

**Feature:** A SaaS project dashboard with:
- A list of projects (fetched from API, paginated)
- Active project filter (user-selected, persisted in URL)
- Current user session (used in header, project cards, and permission checks)
- A "new project" modal (open/closed state)
- Project count badge (computed from project list)

**Step 1: Classify each piece of state.**

| State | Kind | Reason |
|---|---|---|
| Project list | Server cache | Originates on server, goes stale |
| Active filter | Local UI / URL | One feature, survable via URL param |
| Current user session | Global client | Used across unrelated parts of UI |
| Modal open/closed | Ephemeral / Local UI | Only the modal trigger and modal need it |
| Project count badge | Derived | Computed from project list length |

**Step 2: Assign ownership.**

```
TanStack Query         → project list (server cache)
URL param / useState   → active filter (local to dashboard feature)
Zustand / Context      → current user session (global)
useState in Dashboard  → modal open/closed (ephemeral local)
useMemo                → project count (derived — never store it)
```

**Step 3: Sketch the implementation.**

```tsx
function ProjectDashboard() {
  // Server cache — TanStack Query owns this
  const { data: projects } = useProjects(activeFilter);

  // Local UI state — colocated here
  const [modalOpen, setModalOpen] = useState(false);

  // Global — read from store, not drilled down
  const currentUser = useCurrentUser();

  // Derived — computed, never stored
  const projectCount = useMemo(() => projects?.length ?? 0, [projects]);

  return (
    <>
      <DashboardHeader count={projectCount} user={currentUser} />
      <ProjectGrid projects={projects} onNewProject={() => setModalOpen(true)} />
      {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
```

**Conclusion:** Each state piece is owned at the correct layer. No prop drilling, no server data in a global store, no stored derived state.

---

## Common Errors

> ⚠️ **Error 1: Storing derived state**
> `const [filteredUsers, setFilteredUsers] = useState([])` where `filteredUsers` is always computed from `users` and `filter` — this is a synchronization bug waiting to happen. Delete the stored copy. Use `useMemo` or compute inline.

> ⚠️ **Error 2: Putting server data in Redux/Zustand**
> This trades TanStack Query's automatic staleness management, background refetching, and deduplication for manual equivalents you write and maintain. The only exception: server data that genuinely needs to be transformed or combined with client state before storage.

> ⚠️ **Error 3: One large Context for everything**
> A single `AppContext` holding user, theme, permissions, and feature flags means every consumer re-renders whenever any of those change. Split into focused, stable contexts. A theme context changes rarely; a notification context may change frequently — they should not be coupled.

> ⚠️ **Error 4: Reaching for Context before trying composition**
> Before adding a Context, ask if passing via `children` or lifting the JSX assembly to a common ancestor eliminates the drilling without any new mechanism. It often does.

> ⚠️ **Error 5: Treating all global state the same**
> Auth session (rarely changes, read by many), notification queue (changes frequently, read by few), and UI preferences (changes occasionally, read by layout) have very different update frequencies and consumer counts. Group state by update frequency, not by "it's global."

---

## Practical Activity

**Exercise: State Topology Mapping**

Given this SaaS CRM feature description:

> "A contact detail page shows the contact's profile (fetched from API), a list of their recent activities (fetched separately, paginated), an inline note editor (draft text, not yet saved), a tags input (local multi-select, saved on blur), a sidebar with the assigned team member (fetched as part of contact profile), and a 'merge duplicate' modal triggered by a button."

1. List every piece of state implied by this description.
2. Classify each using the six-category framework.
3. Assign each to an ownership layer and mechanism.
4. Identify any derived state that should not be stored.
5. Draw the ownership map as a table (state | kind | owner | mechanism).

---

## Quiz

**Multiple Choice**

**Q1.** A developer stores the result of a `GET /api/users` call in a Redux slice. Three weeks later, users complain that the list shows deleted users until they hard-refresh. What is the root cause?

A) Redux doesn't support async operations natively.
B) The server state stored in Redux has no staleness or invalidation mechanism — the cache never expires.
C) The API response is being mutated inside the reducer.
D) Redux Toolkit's `createSlice` doesn't support array state.

**Answer: B.** Redux has no concept of staleness. Without explicit invalidation logic (which must be written manually), the cached data never refreshes. TanStack Query's `staleTime` and `invalidateQueries` handle this automatically.

---

**Q2.** A `ThemeContext` provides `{ theme, setTheme }` as a single object. A component that only reads `theme` will re-render when `setTheme` is called and updates `theme`. A button component that only calls `setTheme` will also re-render when `theme` changes. What is the fix?

A) Use `React.memo` on the button component.
B) Split into `ThemeValueContext` and `ThemeDispatchContext` — consumers subscribe to only what they need.
C) Replace Context with a global Zustand store.
D) Wrap the context value in `useMemo`.

**Answer: B.** The value/dispatch separation pattern. The dispatch function reference is stable (it's `setTheme` or a `useReducer` dispatch — same reference across renders). Consumers that only dispatch never re-render due to value changes.

---

**Short Answer**

**Q3.** A junior developer argues: "We should put all shared state in Context to avoid prop drilling." Identify two specific architectural problems with this approach at scale.

*Model answer:* First, every Context consumer re-renders whenever the context value changes by reference — putting high-frequency state (e.g., a search query updated on every keystroke) in Context causes cascading re-renders across all consumers. Second, a single large Context couples unrelated concerns: updating a notification badge causes the theme-reading header to re-render. At scale, this creates a performance problem and a coupling problem that a global store with selector-based subscriptions handles better.

---

**Q4.** When is composition via `children` a better solution to prop drilling than introducing a Context?

*Model answer:* When the intermediate components don't actually need the data — they're just passing it through. Composition lets the parent that owns the data render the consumer directly as a child or slot, bypassing the intermediate tree entirely. It adds no new API, no provider, and no consumer hook. It's the right choice when the drilling is a JSX assembly problem rather than a genuine cross-cutting concern.

---

## Retrieval Cues

1. Name the six state kinds and their correct ownership layers.
2. Why is Context unsuitable as a high-frequency state manager? What is the architectural alternative?
3. What question do you ask to distinguish "should this be in Context" from "should this be in a global store"?
4. Why should derived state never be stored? What mechanism should replace it?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Six state kinds + ownership table | Day 1 | Day 3 | Day 7 |
| Server state vs. client state lifecycle differences | Day 1 | Day 4 | Day 10 |
| Context: value/dispatch separation pattern | Day 2 | Day 5 | Day 14 |
| Colocation principle | Day 2 | Day 6 | Day 14 |
| Composition fix for prop drilling | Day 3 | Day 7 | Day 21 |
| Derived state: never store, always compute | Day 3 | Day 8 | Day 21 |

---

## Transfer Exercise

**Domain: Hospital patient management system (not a SaaS dashboard)**

A patient detail screen shows:
- Patient demographics (fetched from a records API, updated by other staff in real time)
- Active medications list (fetched separately, can be updated by prescribing physicians)
- Current bed assignment (fetched, changes frequently during busy periods)
- A nurse's in-progress handover note (typed, not yet submitted)
- Allergy count badge (computed from patient record)
- A "flag for review" modal

1. Classify each piece of state. Note which ones are most likely to go stale and why.
2. Assign ownership. What `staleTime` strategy would you choose for each server cache piece, and why?
3. The demographics and medications are fetched separately. A doctor changes the medications — how does TanStack Query's invalidation model handle this, versus how Redux would require you to handle it?
4. The handover note is in-progress. What happens to it if the nurse accidentally navigates away? Is that acceptable, and what would you need to change architecturally to prevent data loss?

---

## Self-Guided Exercise

Open a React codebase you work with. Find one place where state is stored in a global store (Redux, Zustand, or Context). For each piece of state you find:

1. Apply the six-category classification. Is it correctly classified, or is it server cache state masquerading as global client state?
2. If it's server state in a global store, estimate: how much code exists solely to manage the loading/error/stale lifecycle manually? What would that code look like replaced with a `useQuery` call?
3. Find one piece of derived state that is stored rather than computed. What synchronization bug could this cause?

Write a one-paragraph diagnosis for each finding, as if presenting to the team in an architecture review.
