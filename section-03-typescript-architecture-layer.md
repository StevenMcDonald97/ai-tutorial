# Section 3 — `typescript-architecture-layer`
# TypeScript as Architecture: Contracts, Invariants & Type-Driven Design

---

## Why This Matters

Most React developers use TypeScript to annotate props. That's the smallest return on the investment. TypeScript's real architectural value is encoding *constraints* — making impossible states unrepresentable, making design intent visible to future maintainers, and catching category errors at compile time rather than in production. When you treat the type layer as architecture, your types become documentation that can't go stale, and your compiler becomes a reviewer that never sleeps.

---

## Learning Objectives

1. **3.1** Define discriminated union types that model all valid states of a UI feature.
2. **3.2** Write generic React components and custom hooks that preserve full type inference at the call site.
3. **3.3** Evaluate prop types and identify where `any`, missing narrowing, or loose types create architectural holes.
4. **3.4** Apply branded/nominal types to distinguish domain entities sharing the same primitive representation.
5. **3.5** Explain how discriminated union state types integrate with Suspense and Error Boundary patterns to eliminate impossible UI states.

---

## Key Terms & Definitions

**Discriminated union** — A union type where each member has a shared literal field (the "discriminant") that TypeScript uses to narrow to the correct member. `type State = { status: 'loading' } | { status: 'success'; data: User } | { status: 'error'; error: Error }`.

**Branded type** — A technique for creating nominal typing in TypeScript's structural type system. A `UserId` and an `OrderId` that are both `string` under the hood become incompatible at the type level by attaching a phantom brand: `type UserId = string & { __brand: 'UserId' }`.

**Type narrowing** — The process by which TypeScript refines a broad type to a specific member within a conditional block. `if (state.status === 'success') { /* TypeScript knows state.data exists here */ }`.

**Generic constraint** — A bound on a type parameter that limits what types it can be. `<T extends { id: string }>` requires that `T` has an `id` field.

**`unknown` vs `any`** — `unknown` is the type-safe alternative to `any`. A value typed as `unknown` cannot be used without first narrowing it; `any` bypasses the type system entirely for all downstream consumers.

**Exhaustiveness check** — A pattern using a `never`-typed default branch to ensure a switch or if-chain handles every member of a union. If a new member is added, the compiler flags the uncovered branch.

---

## Lecture Content

### Part 1: Discriminated Unions — Eliminating Impossible States

The most common TypeScript mistake in React is this:

```tsx
// ❌ These flags can contradict each other
interface DataState {
  isLoading: boolean;
  isError: boolean;
  data?: User;
  error?: Error;
}
```

This type allows `{ isLoading: true, isError: true, data: user }` — a state that should be impossible. When you have three booleans, you have eight possible combinations; only three or four are valid. The impossible combinations become runtime bugs.

The fix is a discriminated union:

```tsx
// ✅ Every combination is valid by construction
type UserState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: Error };
```

Now TypeScript enforces at compile time that you only access `data` when `status === 'success'`:

```tsx
function UserProfile({ state }: { state: UserState }) {
  switch (state.status) {
    case 'idle':    return <EmptyState />;
    case 'loading': return <Skeleton />;
    case 'success': return <ProfileCard user={state.data} />; // data is safe
    case 'error':   return <ErrorUI error={state.error} />;   // error is safe
  }
}
```

**Exhaustiveness checking** — add a `never` assertion to catch unhandled cases when the union grows:

```tsx
default:
  const _exhaustive: never = state;
  throw new Error(`Unhandled state: ${JSON.stringify(_exhaustive)}`);
```

If you add a `{ status: 'refreshing' }` member later and forget to handle it, the compiler flags the `never` assignment.

---

### Part 2: Generics — Type-Safe Reusable Abstractions

Generics are not an advanced library author feature. They are the primary tool for building reusable, type-safe components and hooks in application code.

**Generic component example — a typed list:**

```tsx
// ❌ Loses type information at the call site
function List({ items, renderItem }: { items: any[]; renderItem: (item: any) => ReactNode }) { ... }

// ✅ Preserves full type inference
function List<T>({
  items,
  renderItem,
  keyExtractor,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  keyExtractor: (item: T) => string;
}) {
  return <ul>{items.map(item => <li key={keyExtractor(item)}>{renderItem(item)}</li>)}</ul>;
}

// Call site: TypeScript infers T = User from the items prop
<List
  items={users}
  keyExtractor={u => u.id}
  renderItem={u => <UserCard user={u} />}   // u is User — fully typed
/>
```

**Generic custom hook example:**

```tsx
function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });

  const execute = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fn();
      setState({ status: 'success', data });
    } catch (error) {
      setState({ status: 'error', error: error as Error });
    }
  }, [fn]);

  return { ...state, execute };
}

// T is inferred from the return type of the passed function
const { status, data } = useAsync(() => fetchUser(id));
// data is User | undefined — not any
```

The generic makes the hook useful across every data type in the application while preserving the type contract at every call site.

---

### Part 3: `any` Is an Architectural Hole

```tsx
// ❌ any disables type checking for all downstream consumers
function processResponse(data: any) {
  return data.user.name; // TypeScript won't catch data.user being undefined
}

// ✅ unknown forces narrowing before use
function processResponse(data: unknown) {
  if (isUserResponse(data)) {
    return data.user.name; // safe — narrowed by type guard
  }
  throw new Error('Unexpected response shape');
}

function isUserResponse(data: unknown): data is UserResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'user' in data &&
    typeof (data as any).user?.name === 'string'
  );
}
```

The practical alternative to `any` in API boundary code is to validate the shape at the entry point (Section 7 covers Zod for this) and narrow to a known type. Everything inside the trust boundary can then use fully typed data.

---

### Part 4: Branded Types — Preventing Domain Confusion

TypeScript's type system is structural: two types with the same shape are interchangeable. This becomes a problem for domain identifiers:

```tsx
// ❌ TypeScript accepts this — both are string
function assignTask(taskId: string, userId: string) { ... }
assignTask(userId, taskId); // arguments swapped — compiles fine
```

Branded types add a phantom marker that makes these incompatible:

```tsx
type UserId  = string & { readonly __brand: 'UserId' };
type TaskId  = string & { readonly __brand: 'TaskId' };

// Constructor functions that perform the cast once, at the trust boundary
function UserId(id: string): UserId   { return id as UserId; }
function TaskId(id: string): TaskId   { return id as TaskId; }

function assignTask(taskId: TaskId, userId: UserId) { ... }

assignTask(UserId('u_123'), TaskId('t_456')); // ❌ compiler error — correct
assignTask(TaskId('t_456'), UserId('u_123')); // ✅ correct order
```

Use branded types wherever your domain has multiple entity types sharing the same primitive representation — IDs are the most common case, but monetary amounts (`USD`, `EUR`) and validated strings (`EmailAddress`, `SlugString`) are other common applications.

---

### Part 5: Integration with Suspense and Error Boundaries

Section 2 established Suspense and Error Boundaries as structural components that handle the async lifecycle. Discriminated union types are the compile-time complement — they ensure that when you're inside the "success" branch, the type system guarantees data is present.

With a Suspense-compatible library, the component only ever runs in the success state:

```tsx
// The component is only rendered when data is present
// — Suspense handles loading, Error Boundary handles errors
function UserProfile({ userId }: { userId: UserId }) {
  const user = useUser(userId); // User — not User | undefined | Error
  return <ProfileCard user={user} />;
}
```

Without Suspense, you handle all states manually, and a discriminated union enforces correct handling:

```tsx
function UserProfileWithState({ userId }: { userId: UserId }) {
  const state = useUserState(userId); // UserState discriminated union

  if (state.status !== 'success') {
    // handle loading/error inline
    return <StateHandler state={state} />;
  }
  // TypeScript narrows state.data here — guaranteed present
  return <ProfileCard user={state.data} />;
}
```

Both patterns are valid. The key insight is that **the type system and the boundary system solve the same problem at different layers** — impossible runtime states vs. impossible compile-time states. Using them together eliminates an entire class of bugs.

---

## Worked Example: Auditing a Type Contract

**Scenario:** A code review reveals this hook in a SaaS billing module:

```tsx
function useBillingData(accountId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchBilling(accountId)
      .then(res => { setData(res); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [accountId]);

  return { data, loading, error };
}
```

**Step 1: Identify the contract holes.**
- `data: any` — all downstream consumers lose type safety.
- `error: boolean` — callers can't display error details or distinguish error types.
- `accountId: string` — any string is accepted; a `TeamId` could be passed by mistake.
- Three independent flags allow contradictory states (`loading: true, error: true`).

**Step 2: Rewrite with correct types.**

```tsx
type BillingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: BillingRecord }
  | { status: 'error'; error: Error };

function useBillingData(accountId: AccountId): BillingState {
  const [state, setState] = useState<BillingState>({ status: 'idle' });

  useEffect(() => {
    setState({ status: 'loading' });
    fetchBilling(accountId)
      .then(data  => setState({ status: 'success', data }))
      .catch(error => setState({ status: 'error', error }));
  }, [accountId]);

  return state;
}
```

**Conclusion:** The rewrite is the same logic with four improvements: impossible states eliminated, error details preserved, branded `AccountId` prevents wrong-ID bugs, and the return type is explicit — no `any` leaks to consumers.

---

## Common Errors

> ⚠️ **Error 1: Using `as` to suppress type errors**
> `const user = data as User` is the same architectural problem as `any` — it bypasses type checking without providing safety. Use `as` only at validated trust boundaries (e.g., after a Zod parse). Inside application logic, narrowing should come from type guards or discriminated union checks.

> ⚠️ **Error 2: Putting all types in a global `types.ts` file**
> Types should live close to the code that owns them. A global types file becomes a grab-bag with no clear ownership, creating merge conflicts and making it hard to reason about what depends on what. Co-locate types with their feature module.

> ⚠️ **Error 3: Optional chaining as a substitute for narrowing**
> `state.data?.name` compiles but doesn't verify that accessing `data` is valid in the current state. Use discriminated unions to narrow to the correct state first, then access properties directly without optional chaining.

---

## Practical Activity

**Exercise: Type Audit**

Find one data-fetching hook or API integration in a codebase you have access to (or use the billing hook from the worked example above). Apply this checklist:

1. Are loading/error/data represented as a discriminated union or as independent flags?
2. Are any IDs typed as bare `string` or `number` that could benefit from branding?
3. Is `any` or unconstrained `unknown` used anywhere in the return type?
4. Does each component that consumes this hook only access fields that are guaranteed present in its current state?

Rewrite the hook (or the types around it) to close the holes you find.

---

## Quiz

**Multiple Choice**

**Q1.** A component receives `state: { isLoading: boolean; isError: boolean; data?: User }`. The developer writes `if (!state.isLoading && !state.isError) { return <ProfileCard user={state.data!} /> }`. What is the problem?

A) The non-null assertion `!` is unnecessary since `data` is always present.
B) The type allows `data` to be `undefined` even when both flags are false — the `!` suppresses a real type error.
C) `isLoading` and `isError` should be checked with strict equality.
D) There is no problem — the logic correctly guards against invalid states.

**Answer: B.** Three boolean flags can be simultaneously `false` while `data` is still `undefined`. The type doesn't guarantee presence of `data` in the success case. A discriminated union would make this impossible.

---

**Q2.** Which of the following is the correct way to prevent `UserId` and `TeamId` from being accidentally swapped in function arguments, given that both are `string` at runtime?

A) Create a TypeScript `interface UserId extends String {}` for each.
B) Use a branded type: `type UserId = string & { readonly __brand: 'UserId' }`.
C) Use runtime validation to check the format of each string.
D) Use `enum UserId {}` to create distinct types.

**Answer: B.** Branded types create nominal distinctions at the type level with zero runtime overhead. The brand is a phantom property that exists only in the type system.

---

**Short Answer**

**Q3.** Explain why `unknown` is architecturally preferable to `any` for typing API responses at a trust boundary.

*Model answer:* `any` propagates through the type system silently — any code that touches an `any` value loses type safety without warning. `unknown` forces the developer to narrow the type before using it, making the validation explicit and local to the trust boundary. Everything downstream of a successful `unknown` → `KnownType` narrowing has full type safety.

---

**Q4.** How do discriminated union state types complement Suspense boundaries? What problem does each solve?

*Model answer:* Suspense boundaries are a runtime mechanism — they handle the async lifecycle by showing fallbacks during loading and delegating error display to Error Boundaries. Discriminated unions are a compile-time mechanism — they prevent impossible states (like accessing `data` during loading) from being expressed in code. Together, they eliminate impossible UI states at two layers: the type system catches it at compile time, and the boundary system coordinates it at runtime. A component inside a Suspense boundary can use a type that only has a `success` variant because loading and error are handled structurally by the boundary, not inline.

---

## Retrieval Cues

1. What makes a union type "discriminated"? Give the structural requirement.
2. What is the runtime cost of a branded type?
3. Why is `unknown` safer than `any` at API trust boundaries?
4. What is an exhaustiveness check, and when does it earn its maintenance cost?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Discriminated union structure and narrowing | Day 1 | Day 3 | Day 7 |
| Exhaustiveness check with `never` | Day 1 | Day 4 | Day 10 |
| Generic components: type inference at call site | Day 2 | Day 5 | Day 14 |
| `any` vs `unknown` — architectural difference | Day 2 | Day 6 | Day 14 |
| Branded types: use cases and construction | Day 3 | Day 7 | Day 21 |

---

## Transfer Exercise

**Domain: Ride-sharing dispatch system (not a SaaS dashboard)**

A ride-sharing app has these entities: `DriverId`, `RiderId`, `VehicleId`, and `TripId` — all `string` at runtime. The dispatch function signature is currently:

```tsx
function dispatchRide(driverId: string, riderId: string, vehicleId: string): Promise<string>
```

1. Rewrite the signature using branded types. What category of bug does this prevent?
2. The trip has these possible states: waiting for driver acceptance, driver en route to pickup, ride in progress, completed, cancelled. Model this as a discriminated union. What fields are only valid in specific states (e.g., `actualPickupTime`, `cancellationReason`)?
3. A UI component needs to show the driver's current location — only available during "driver en route" and "ride in progress" states. How does the discriminated union make the component's conditional logic safe?

---

## Self-Guided Exercise

Pick one feature module in a real TypeScript React codebase you have access to. Run the TypeScript compiler with `strict: true` if it isn't already enabled, and address the first 5 errors it surfaces. For each error:

- Classify it: is this a real bug that was hiding, a loose type that needs tightening, or a missing discriminated union?
- Fix it correctly — no `as` casts, no `any` suppressions.
- Write one sentence explaining what category of runtime bug this type improvement prevents.

If you don't have a codebase available, enable `strict` mode in the TypeScript playground on a ~50-line component you write from scratch and deliberately introduce type holes, then correct them.
