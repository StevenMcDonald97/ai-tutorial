# Section 8 — `library-ecosystem-integration`
# The SaaS Library Stack: Redux Toolkit, Zustand, TanStack Query, Routing & Build Tooling

---

## Why This Matters

Library choices are architectural decisions with long tails. A library added in sprint one is still there in year three — with its bundle size, API surface, and learning curve baked into the team's daily work. The most expensive library mistakes aren't choosing the "wrong" library in some abstract sense; they're choosing a library that solves a different problem than the one you have, or treating a library addition as reversible when it isn't. This section gives you explicit selection criteria so library choices are driven by architectural understanding rather than familiarity or trend-following.

---

## Learning Objectives

1. **8.1** Compare Redux Toolkit and Zustand across complexity, boilerplate, middleware, and team scalability, and select the appropriate tool for a given SaaS context.
2. **8.2** Implement a Redux Toolkit slice with async thunks and selectors modelling a SaaS feature's server interaction lifecycle.
3. **8.3** Implement a Zustand store for client-UI state and explain how its design differs architecturally from an RTK slice.
4. **8.4** Configure TanStack Query for server cache management, including cache invalidation and optimistic updates.
5. **8.5** Design a routing architecture using React Router supporting role-based access control, code splitting, and nested layouts.
6. **8.6** Evaluate the build tooling decision (Vite vs. framework selection) for an SMB SaaS project.
7. **8.7** Explain what the React Compiler does, identify which manual memoization patterns it makes redundant, and articulate its current limitations.

---

## Key Terms & Definitions

**Redux Toolkit (RTK)** — The official, opinionated Redux wrapper. Provides `createSlice`, `createAsyncThunk`, `createSelector`, and RTK Query. Reduces Redux boilerplate while preserving its middleware and devtools ecosystem.

**Zustand** — A minimal global state library. A store is a hook. No reducers, no actions, no providers required. State is mutable by convention (Immer optional).

**`createSelector`** — RTK/Reselect's memoized selector factory. Computes derived state from store slices; re-runs only when inputs change.

**TanStack Query** — A server cache management library. Manages fetching, caching, background refetching, and invalidation for server state. Not a replacement for client state managers.

**`queryKey`** — TanStack Query's cache address. An array that uniquely identifies a query. Cache invalidation, refetching, and deduplication all key off this.

**`useMutation`** — TanStack Query's hook for write operations. Manages the `idle → pending → success | error` lifecycle of a mutation, with `onSuccess`/`onError` callbacks.

**Optimistic update** — Updating the UI cache immediately on mutation start, before the server responds. Rolled back on error.

**React Router loader** — A data-fetching function colocated with a route definition, executing before the route renders. Enables data and component to arrive together.

**Vite** — A build tool using native ES modules in development and Rollup for production. Fast HMR, minimal config. The default choice for new React SPAs.

**React Compiler** — A build-time compiler (React 19+) that automatically inserts memoization. Analyzes component and hook code to determine when re-renders are safe to skip.

---

## Lecture Content

### Part 1: RTK vs. Zustand — Choosing the Right Global State Tool

These are not competitors solving the same problem. They target different parts of the state topology.

| Dimension | Redux Toolkit | Zustand |
|---|---|---|
| **State model** | Normalized, event-sourced | Mutable slices, direct set |
| **Boilerplate** | Medium (slice + actions + selectors) | Low (one `create` call) |
| **Middleware** | First-class (thunk, saga, RTK Query) | Plugin-based, limited |
| **DevTools** | Excellent (time-travel, action log) | Basic |
| **Team scalability** | High (enforced patterns) | Medium (convention-dependent) |
| **Bundle size** | ~47kb gz | ~3kb gz |
| **Best fit** | Complex, event-sourced, auditable state | Simple cross-cutting client UI state |

**The selection heuristic:**

- Does the state need middleware (analytics events, saga orchestration, optimistic rollback coordination)? → RTK.
- Does the team need time-travel debugging or a strict action log? → RTK.
- Is this simple cross-cutting UI state (sidebar open, selected theme, notification queue)? → Zustand.
- Is it a small team that needs to move fast with minimal boilerplate? → Zustand.
- Is this server state? → Neither. TanStack Query.

Most SMB SaaS products don't need RTK. Zustand + TanStack Query covers the majority of real-world state needs with a fraction of the ceremony.

---

### Part 2: Redux Toolkit in Practice

When RTK is the right choice, use it fully — slices, `createAsyncThunk`, and `createSelector` together.

```tsx
// store/invoiceSlice.ts
import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';

// Async thunk — wraps the async operation and dispatches pending/fulfilled/rejected
export const fetchInvoices = createAsyncThunk(
  'invoices/fetchAll',
  async (filters: InvoiceFilters) => {
    const data = await api.get<Invoice[]>('/invoices', { params: filters });
    return data;
  }
);

const invoiceSlice = createSlice({
  name: 'invoices',
  initialState: {
    items: [] as Invoice[],
    status: 'idle' as 'idle' | 'loading' | 'succeeded' | 'failed',
    error: null as string | null,
  },
  reducers: {
    invoiceUpdated(state, action: PayloadAction<Invoice>) {
      const idx = state.items.findIndex(i => i.id === action.payload.id);
      if (idx !== -1) state.items[idx] = action.payload; // Immer handles immutability
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchInvoices.pending,   state => { state.status = 'loading'; })
      .addCase(fetchInvoices.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items  = action.payload;
      })
      .addCase(fetchInvoices.rejected,  (state, action) => {
        state.status = 'failed';
        state.error  = action.error.message ?? 'Unknown error';
      });
  },
});

// Memoized selector — recomputes only when items or filter changes
const selectInvoices = (state: RootState) => state.invoices.items;
const selectFilter   = (_: RootState, filter: string) => filter;

export const selectFilteredInvoices = createSelector(
  [selectInvoices, selectFilter],
  (invoices, filter) => invoices.filter(inv => inv.status === filter)
);
```

**The discriminated union gap:** RTK's `status: 'idle' | 'loading' | 'succeeded' | 'failed'` is close to a discriminated union but isn't one — `items` and `error` can coexist in ways that are technically invalid. For strict type safety, pair with the Section 3 discriminated union pattern. RTK's `extraReducers` approach prioritises developer ergonomics over exhaustive type narrowing.

---

### Part 3: Zustand in Practice

Zustand's entire API fits in one `create` call:

```tsx
// store/uiStore.ts
import { create } from 'zustand';

type UIState = {
  sidebarOpen:    boolean;
  activeToasts:   Toast[];
  toggleSidebar:  () => void;
  addToast:       (toast: Toast) => void;
  removeToast:    (id: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen:  false,
  activeToasts: [],

  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),

  addToast: (toast) => set(state => ({
    activeToasts: [...state.activeToasts, toast],
  })),

  removeToast: (id) => set(state => ({
    activeToasts: state.activeToasts.filter(t => t.id !== id),
  })),
}));

// Usage — no provider, no selector boilerplate
function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  return <aside aria-expanded={sidebarOpen}>{/* ... */}</aside>;
}
```

**Performance note:** By default, any `useUIStore()` call subscribes to the entire store — the component re-renders whenever any state changes. Use selector subscriptions for high-frequency state:

```tsx
// Only re-renders when sidebarOpen changes
const sidebarOpen = useUIStore(state => state.sidebarOpen);
```

**Architectural difference from RTK:** Zustand has no action log, no middleware pipeline, and no time-travel. You call setters directly — no dispatched actions. This is a feature for simple state and a liability for complex state that needs auditability.

---

### Part 4: TanStack Query — Server Cache Management

TanStack Query is not a state manager. It is a server cache. The distinction matters: it manages data that lives on the server and is temporarily cached on the client, with all the staleness and invalidation logic that implies.

**Core setup:**

```tsx
// main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes before refetch
      gcTime:    10 * 60 * 1000, // 10 minutes before cache eviction
      retry: 2,
    },
  },
});

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

**Query — reading server state:**

```tsx
function useInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: ['invoices', filters], // filters is part of the cache key
    queryFn:  () => api.get<Invoice[]>('/invoices', { params: filters }),
    select:   data => data.sort((a, b) => b.createdAt - a.createdAt), // transform without storing
  });
}
```

**Cache invalidation — the most important TanStack Query concept:**

```tsx
const createInvoice = useMutation({
  mutationFn: (data: CreateInvoiceData) => api.post('/invoices', data),
  onSuccess: () => {
    // Invalidate all queries whose key starts with 'invoices'
    // — triggers background refetch for active queries
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  },
});
```

**Optimistic update pattern:**

```tsx
const updateInvoiceStatus = useMutation({
  mutationFn: ({ id, status }: UpdateStatusData) =>
    api.patch(`/invoices/${id}`, { status }),

  onMutate: async ({ id, status }) => {
    // Cancel any in-flight refetches to prevent overwrite
    await queryClient.cancelQueries({ queryKey: ['invoices'] });

    // Snapshot current cache for rollback
    const previous = queryClient.getQueryData<Invoice[]>(['invoices']);

    // Apply optimistic update
    queryClient.setQueryData<Invoice[]>(['invoices'], old =>
      old?.map(inv => inv.id === id ? { ...inv, status } : inv) ?? []
    );

    return { previous }; // context passed to onError
  },

  onError: (_err, _vars, context) => {
    // Roll back on error
    if (context?.previous) {
      queryClient.setQueryData(['invoices'], context.previous);
    }
  },

  onSettled: () => {
    // Always refetch after mutation to sync with server
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  },
});
```

**`queryKey` design discipline:** Keys are the cache's addressing system. Treat them like a hierarchy: `['invoices']` → `['invoices', filters]` → `['invoices', id]`. Invalidating `['invoices']` invalidates all three levels. Design keys intentionally — inconsistent keys cause stale data bugs that are hard to trace.

---

### Part 5: React Router — Routing Architecture

React Router v6+ uses a declarative route config that supports nested layouts, loaders, and code splitting as first-class features.

**Nested layout architecture:**

```tsx
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,        // nav, sidebar, global error boundary
    errorElement: <RootError />,
    children: [
      {
        path: 'dashboard',
        element: <DashboardLayout />, // dashboard-specific chrome
        children: [
          { index: true,        element: <DashboardHome /> },
          { path: 'invoices',   element: <InvoiceList />,   lazy: () => import('./InvoiceList') },
          { path: 'invoices/:id', element: <InvoiceDetail />, lazy: () => import('./InvoiceDetail') },
        ],
      },
      {
        path: 'admin',
        element: <AdminGuard />,     // RBAC wrapper — redirects non-admins
        children: [
          { path: 'users', element: <UserManagement /> },
        ],
      },
    ],
  },
]);
```

**Role-based access control:**

```tsx
function AdminGuard() {
  const { user } = useCurrentUser();
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <Outlet />;  // renders matched child route
}
```

**Route-level code splitting with `lazy`:**

React Router's `lazy` property accepts a function returning a dynamic import. The route component loads only when the route is first visited — no `React.lazy` + `Suspense` wrapper required; React Router handles it.

```tsx
{ path: 'reports', lazy: () => import('./ReportsPage').then(m => ({ Component: m.default })) }
```

**Loaders for data + component co-arrival:**

```tsx
{
  path: 'invoices/:id',
  loader: ({ params }) => fetchInvoice(params.id), // runs before component renders
  element: <InvoiceDetail />,
}

function InvoiceDetail() {
  const invoice = useLoaderData() as Invoice; // data guaranteed present
}
```

Loaders eliminate the loading state inside the component for route-level data — the route doesn't render until the loader resolves. Pair with `errorElement` for error handling.

---

### Part 6: Build Tooling — Vite vs. Framework Selection

**The decision tree:**

```
Do you need SSR, SSG, or edge rendering?
  Yes → Next.js (App Router) or Remix
  No  → Do you need a meta-framework's conventions (file-based routing, API routes)?
          Yes → Next.js Pages Router or Remix
          No  → Vite + React Router
```

**Vite for SPAs:**

Vite is the correct default for a React SPA without SSR requirements. Native ES module dev server means near-instant HMR regardless of app size. Rollup-based production build with excellent tree-shaking. Minimal config for most SaaS use cases.

```ts
// vite.config.ts — typical SaaS SPA config
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          tanstack: ['@tanstack/react-query', '@tanstack/react-table'],
        },
      },
    },
  },
});
```

**When Next.js is the right answer:**
- SEO-critical public pages (marketing site, public reports).
- Server-side data fetching that must not be exposed client-side (auth tokens, private API keys).
- Edge-rendered personalisation.

**The architectural constraint to communicate to clients:** Migrating from Vite SPA to Next.js later is a significant refactor — routing model, data fetching patterns, and deployment infrastructure all change. Make the decision explicitly at project start, not by default.

---

### Part 7: The React Compiler

The React Compiler (stable in React 19) analyses component and hook source code at build time and automatically inserts `React.memo`, `useMemo`, and `useCallback` where it determines they are safe and beneficial.

**What becomes redundant:**

```tsx
// ❌ Manual memoization — redundant with the compiler
const expensiveValue = useMemo(() => computeExpensive(data), [data]);
const stableCallback = useCallback(() => handleClick(id), [id]);
const MemoizedChild  = React.memo(ChildComponent);

// ✅ With the compiler — write natural code; compiler inserts memoization
const expensiveValue = computeExpensive(data);
const handleClick    = () => onSelect(id);
```

**What the compiler cannot do:**

- Optimise components with impure render functions (side effects in render body). Purity is still required.
- Optimise code that the compiler cannot statically analyse (dynamic property access, non-local mutations).
- Replace architectural decisions about component granularity or state topology. The compiler optimises within your architecture — it doesn't fix a bad one.

**Current limitations (as of React 19 stable):**

- Opt-in per file or directory — not automatically applied to all code.
- Not all patterns are supported; the compiler silently skips components it can't safely analyse.
- Third-party libraries with impure patterns may block compilation of their consumers.

**The practical implication:** In a compiler-enabled codebase, audit existing manual memoization and remove redundant instances. `useMemo` for genuinely expensive computations and `useCallback` for stable references passed to non-compiled third-party components remain valid.

---

## Worked Example: Choosing a Stack for an SMB SaaS

**Client profile:** 8-person team building a B2B project management SaaS. No SSR requirement. Complex filtering UI. Real-time notifications. Admin panel with RBAC. 18-month runway.

**State topology first:**

| State | Kind | Tool |
|---|---|---|
| Projects, tasks, users | Server cache | TanStack Query |
| Notification queue | Global client | Zustand |
| Sidebar open/collapsed | Global client | Zustand |
| Active filters | Local UI / URL | URL params + useState |
| Current user session | Global client | Zustand (hydrated from auth cookie) |
| Form state | Ephemeral | React Hook Form |

**Library decisions:**

- **No Redux** — no middleware requirements, no audit log needed. Zustand covers global client state simply.
- **TanStack Query** — all server state. Background refetch covers real-time-like freshness without a WebSocket library for most features.
- **React Router v6** — nested layouts, route-level RBAC via guard components, `lazy` for code splitting per route.
- **Vite** — no SSR needed, fastest dev experience, minimal config.
- **React Compiler** — opt in gradually per feature module once stable in their toolchain.

**Conclusion:** The stack is determined by the state topology and the team's constraints — not by what the team has used before or what's trending. RTK is absent not because it's inferior but because it solves problems this client doesn't have.

---

## Common Errors

> ⚠️ **Error 1: Using TanStack Query as a global state replacement**
> TanStack Query has no mechanism for client-only state — there's no "query" for sidebar open/closed. Using `queryClient.setQueryData` with fake query keys for client state is a misuse. Keep client state in Zustand or Context.

> ⚠️ **Error 2: Inconsistent `queryKey` design**
> Using `['invoices']` in one hook and `['invoice-list']` in another for the same data means invalidating one doesn't invalidate the other. Establish a `queryKeys` constant map at project start.

> ⚠️ **Error 3: Forgetting `cancelQueries` before optimistic updates**
> Applying an optimistic update while a background refetch is in flight means the refetch may overwrite the optimistic value with stale server data before the mutation resolves. Always `cancelQueries` before `setQueryData`.

> ⚠️ **Error 4: Adding RTK to a project that needs Zustand**
> RTK's boilerplate (slices, actions, thunks, selectors) imposes a cognitive tax that's only justified by its middleware and devtools payoff. Using RTK for `sidebarOpen: boolean` is an over-engineered solution.

> ⚠️ **Error 5: Removing all `useMemo`/`useCallback` immediately on enabling the React Compiler**
> The compiler silently skips components it can't analyse. Remove manual memoization only after verifying the compiler processed the component (check the compiled output or use the compiler's debug flag).

---

## Practical Activity

**Exercise: Stack Selection and Architecture Sketch**

Given this brief:

> "A 4-person team is building an HR analytics SaaS. Features: employee data tables (server-paginated, filterable), a headcount dashboard (charts, KPI cards, all server data), a settings panel (user preferences, saved client-side), an audit log viewer (read-only, large dataset), and a report builder (complex multi-step form, saves drafts)."

1. Classify every state concern using the Section 5 taxonomy.
2. Select the global state tool (RTK or Zustand) and justify the choice explicitly.
3. Identify which data belongs in TanStack Query and design the `queryKey` hierarchy.
4. Design the React Router route structure: which routes get `lazy` loading, which need guard components?
5. Would you recommend Vite or Next.js? What is the one question whose answer would change your recommendation?

---

## Quiz

**Multiple Choice**

**Q1.** A developer puts all server-fetched data into Zustand because "it's simpler than TanStack Query." Three months later, users report seeing stale data after another user updates a record. What is the root cause?

A) Zustand doesn't support async state updates.
B) Zustand has no staleness model — there is no automatic background refetch or invalidation mechanism.
C) The Zustand store needs to be reset on every route change.
D) Server data must be stored in RTK to support invalidation.

**Answer: B.** Zustand is a client state tool with no concept of data staleness. Without manually implementing refetch and invalidation logic, server data cached in Zustand will never update unless the user refreshes.

---

**Q2.** What is the correct `queryKey` for a query fetching invoices filtered by `{ status: 'paid', clientId: 'c_123' }`?

A) `['invoices']`
B) `['invoices', 'paid', 'c_123']`
C) `['invoices', { status: 'paid', clientId: 'c_123' }]`
D) `['invoices-paid-c_123']`

**Answer: C.** The filter object is included as part of the key so different filter combinations produce different cache entries. TanStack Query serialises objects in keys for comparison. Option B works but loses the named parameter clarity.

---

**Short Answer**

**Q3.** Explain why the React Compiler does not eliminate the need for good component architecture.

*Model answer:* The compiler optimises memoization within a given architecture — it inserts `memo`, `useMemo`, and `useCallback` where safe. It cannot fix architectural problems: a component that re-renders because it subscribes to an entire Zustand store will still re-render; a poorly colocated state that causes unnecessary parent renders will still cause them. The compiler reduces the manual memoization tax, but the underlying decisions about component granularity, state topology, and data flow still determine the rendering behaviour.

---

**Q4.** A colleague suggests: "We should use Next.js by default for all new projects — it handles both SPA and SSR so we're covered either way." What is the architectural objection to this reasoning?

*Model answer:* Next.js imposes architectural constraints regardless of whether SSR is used: file-based routing, server/client component boundaries (App Router), and a specific deployment model. These constraints have a learning and maintenance cost. For a pure SPA with no SEO or SSR requirements, Vite with React Router is simpler, faster in development, and has fewer constraints. Choosing a framework "just in case" imports its complexity without its benefits — the decision should be driven by actual requirements, not optionality.

---

## Retrieval Cues

1. Name the three-question heuristic for choosing between RTK and Zustand.
2. What is a `queryKey`, and why does inconsistent key design cause bugs?
3. What three steps are required for a correct optimistic update in TanStack Query?
4. What single question determines whether a project should use Vite or Next.js?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| RTK vs. Zustand selection criteria | Day 1 | Day 3 | Day 7 |
| TanStack Query: queryKey hierarchy design | Day 1 | Day 4 | Day 10 |
| Optimistic update: 3-step pattern | Day 2 | Day 5 | Day 14 |
| React Router: nested layouts + RBAC guards | Day 2 | Day 6 | Day 14 |
| Vite vs. Next.js decision criteria | Day 3 | Day 7 | Day 21 |
| React Compiler: what it does / doesn't fix | Day 3 | Day 8 | Day 21 |

---

## Transfer Exercise

**Domain: Real-time collaborative whiteboard tool (not a SaaS management app)**

A small team is building a whiteboard SaaS: live canvas state (WebSocket-driven, updates dozens of times per second), user presence indicators (who's online, cursor positions), a shape library panel (fetched once, rarely changes), a comment thread per board (fetched, user-submitted), and user settings (theme, grid preferences, local only).

1. Classify each state concern. Note which ones are genuinely unusual — does the WebSocket-driven canvas state fit any of the six categories cleanly?
2. TanStack Query is designed for request/response patterns. For the WebSocket canvas state, does it still apply? What would you use instead, and why?
3. The shape library rarely changes but is large. What `staleTime` strategy would you choose? What `gcTime`?
4. Does this project warrant RTK over Zustand? Identify the specific characteristic of the canvas state that might tip the decision.

---

## Self-Guided Exercise

Audit the library choices in a real project you have access to:

1. List every state management library in `package.json`. For each, classify the state it manages using the Section 5 taxonomy. Is it managing the right kind of state?
2. Is server state stored in a client state manager (Redux, Zustand, Context)? Estimate the lines of code dedicated to manually managing loading/error/stale logic that TanStack Query would handle automatically.
3. Open the React Router (or equivalent) route config. Are there routes that load heavy components eagerly that should be `lazy`? Are RBAC checks happening in components rather than at the route level?
4. Write a one-paragraph "library audit" for each finding: what the current cost is and what the alternative would provide.
