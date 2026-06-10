# Section 7 — `forms-and-mutations`
# Forms Architecture: State, Validation & Server Mutation Design

---

## Why This Matters

Forms are the primary way users write data in a SaaS application. Yet form architecture is routinely under-designed — scattered `useState` calls, validation logic duplicated between front end and API, mutation state bolted on as an afterthought. The result is brittle, hard-to-test form code that breaks in predictable ways: stale error messages, double submissions, lost input on network errors. A well-designed form architecture treats form state, validation, and mutation as three distinct but connected concerns, each with its own mechanism.

---

## Learning Objectives

1. **7.1** Explain the trade-offs between fully controlled forms and uncontrolled forms (RHF's `register` pattern) in terms of render performance and coupling.
2. **7.2** Implement a React Hook Form + Zod schema generating TypeScript types and runtime validators from a single source of truth.
3. **7.3** Design the state lifecycle of a form submission — from ephemeral input through validation to async mutation state — mapping each phase to the correct React mechanism.
4. **7.4** Classify form state in a state topology map and explain why it is architecturally distinct from general client UI state and server cache state.

---

## Key Terms & Definitions

**Controlled input** — An input whose value is driven by React state. Every keystroke calls `setState`, causing a re-render. The component is the source of truth.

**Uncontrolled input** — An input that manages its own value in the DOM. React reads the value via a ref only when needed (e.g., on submit). The DOM is the source of truth.

**React Hook Form (RHF)** — A form library using uncontrolled inputs via refs. Avoids per-keystroke re-renders. Provides `register`, `handleSubmit`, `formState`, and `watch`.

**Zod** — A TypeScript-first schema validation library. A Zod schema is both a runtime validator and a TypeScript type source. `z.infer<typeof schema>` extracts the static type.

**Schema resolver** — RHF's integration point with validation libraries. `zodResolver(schema)` wires a Zod schema into RHF's validation pipeline.

**Mutation state** — The async lifecycle of a write operation: `idle → pending → success | error`. Distinct from form input state.

**Optimistic update** — Updating UI state immediately on user action, before the server confirms, then reconciling with the server response. Reduces perceived latency.

---

## Lecture Content

### Part 1: Controlled vs. Uncontrolled — The Render Cost Trade-off

Every fully controlled form re-renders on every keystroke:

```tsx
// ❌ Fully controlled — re-renders entire form on every key press
function InvoiceForm() {
  const [amount, setAmount]   = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes]     = useState('');
  // Each keystroke in any field re-renders all three fields + validation
}
```

For simple forms, this is fine. For complex forms — 20+ fields, expensive validation, heavy subtrees — per-keystroke re-renders are a real performance and coupling liability.

React Hook Form's `register` pattern keeps inputs uncontrolled:

```tsx
// ✅ RHF — inputs are uncontrolled; no re-render per keystroke
function InvoiceForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<InvoiceSchema>();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('amount')} />
      <input {...register('dueDate')} />
      <textarea {...register('notes')} />
    </form>
  );
}
```

`register` attaches a ref and event handlers. RHF reads values from the DOM only on submit and on validation triggers — not on every keystroke.

**The architectural trade-off:**

| | Controlled | RHF (Uncontrolled) |
|---|---|---|
| Re-renders per keystroke | Yes | No |
| Real-time derived UI (character count, live preview) | Easy | Requires `watch` |
| Integration with external state | Natural | Awkward |
| Form complexity sweet spot | Simple–medium | Medium–complex |

**Rule of thumb:** Use controlled inputs for simple forms where real-time reactivity matters. Use RHF for any form with 5+ fields, complex validation, or submission mutation state.

---

### Part 2: Zod + RHF — Single Source of Truth

The classic form validation problem: validation logic defined three times — in the UI, in the API request, and in the API handler. They drift apart. Zod solves this by making the schema the single source of truth for both the TypeScript type and the runtime validator.

```tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Schema is the source of truth — defines shape, types, and validation rules
const invoiceSchema = z.object({
  clientId:    z.string().uuid('Invalid client'),
  amount:      z.number().positive('Amount must be positive').max(1_000_000),
  dueDate:     z.string().datetime('Invalid date format'),
  notes:       z.string().max(500).optional(),
});

// TypeScript type derived from schema — not written separately
type InvoiceFormData = z.infer<typeof invoiceSchema>;

function InvoiceForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema), // wires schema into RHF validation
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('amount', { valueAsNumber: true })} />
      {errors.amount && <span>{errors.amount.message}</span>}

      <input {...register('dueDate')} />
      {errors.dueDate && <span>{errors.dueDate.message}</span>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Create Invoice'}
      </button>
    </form>
  );
}
```

**The contract benefit:** `invoiceSchema` can be exported and used in the API route handler for server-side validation. Same rules, one definition, both layers validated. If the schema changes, both layers update together.

---

### Part 3: The Form Submission Lifecycle

A form submission passes through three distinct state phases. Each has a different mechanism:

```
Phase 1: Input (ephemeral)
  → RHF / local state owns this
  → Lives until submission; discarded after success

Phase 2: Validation
  → Triggered by RHF on submit (or on blur/change if configured)
  → Synchronous (Zod) or async (server-side uniqueness checks)
  → Errors surface back into Phase 1 state

Phase 3: Mutation (async)
  → TanStack Query useMutation / server action
  → idle → pending → success | error
  → Distinct from form input state
```

**Wiring the phases:**

```tsx
const createInvoice = useMutation({
  mutationFn: (data: InvoiceFormData) => api.post('/invoices', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] }); // invalidate cache
    toast.success('Invoice created');
    reset(); // clear form — Phase 1 state discarded
  },
  onError: (error) => {
    toast.error(error.message);
    // optionally: setError('root', { message: error.message }) — surface to form
  },
});

const onSubmit = (data: InvoiceFormData) => createInvoice.mutate(data);
```

**What connects the phases:**

- `handleSubmit` bridges Phase 1 → 2: it runs validation, then calls `onSubmit` with typed data only if valid.
- `onSubmit` bridges Phase 2 → 3: it passes validated, typed data to the mutation.
- `onSuccess`/`onError` closes the loop: mutation result flows back into the form (reset, error display).

**Preventing double submission:**

```tsx
<button
  type="submit"
  disabled={isSubmitting || createInvoice.isPending}
>
```

Both RHF's `isSubmitting` and the mutation's `isPending` should disable the button — they cover different parts of the lifecycle.

---

### Part 4: Form State in the Topology Map

Revisiting Section 5's classification: form state is architecturally distinct from all other state kinds.

| Property | General client UI state | Form state |
|---|---|---|
| Lifetime | Persistent while feature is mounted | Ephemeral until submission |
| Structure | Relatively flat | Field-level + form-level validity |
| Update pattern | Discrete events | Continuous input stream |
| Success terminal | State persists | State is discarded |
| Error handling | Component-level | Field-level + form-level + server errors |

**The classification consequence:** form state does not belong in a global store. Putting it in Redux or Zustand adds boilerplate for an ephemeral structure that will be discarded on submit success. RHF is the right owner — it is purpose-built for this specific lifecycle.

**The exception:** multi-step forms where step state must survive navigation. In that case, RHF manages each step's field state, but step progression and accumulated valid data across steps may live in a local `useReducer` or a scoped Context — not a global store.

---

## Worked Example: A Multi-Field Form with Server Error Handling

**Scenario:** A SaaS onboarding form collects company name (must be unique — server-validated), admin email, and plan selection.

```tsx
const onboardingSchema = z.object({
  companyName: z.string().min(2).max(100),
  adminEmail:  z.string().email(),
  plan:        z.enum(['starter', 'growth', 'enterprise']),
});

type OnboardingData = z.infer<typeof onboardingSchema>;

function OnboardingForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingData>({ resolver: zodResolver(onboardingSchema) });

  const createOrg = useMutation({
    mutationFn: (data: OnboardingData) => api.post('/organisations', data),
    onSuccess: (org) => navigate(`/dashboard/${org.id}`),
    onError: (error) => {
      // Server returns field-specific errors — map them back into RHF
      if (error.field === 'companyName') {
        setError('companyName', { message: 'This company name is already taken' });
      } else {
        setError('root', { message: 'Something went wrong. Please try again.' });
      }
    },
  });

  return (
    <form onSubmit={handleSubmit(data => createOrg.mutate(data))}>
      <input {...register('companyName')} placeholder="Company name" />
      {errors.companyName && <p>{errors.companyName.message}</p>}

      <input {...register('adminEmail')} type="email" placeholder="Admin email" />
      {errors.adminEmail && <p>{errors.adminEmail.message}</p>}

      <select {...register('plan')}>
        <option value="starter">Starter</option>
        <option value="growth">Growth</option>
        <option value="enterprise">Enterprise</option>
      </select>

      {errors.root && <p className="form-error">{errors.root.message}</p>}

      <button type="submit" disabled={isSubmitting || createOrg.isPending}>
        {createOrg.isPending ? 'Creating...' : 'Create account'}
      </button>
    </form>
  );
}
```

**Key points demonstrated:**
- Zod schema is the single source of truth for types and validation.
- `setError` surfaces server-side validation errors back into RHF field state.
- `errors.root` handles non-field server errors.
- Double-submission prevention covers both RHF and mutation pending states.

---

## Common Errors

> ⚠️ **Error 1: Using `watch` for every field**
> `watch('fieldName')` re-subscribes the component to per-keystroke updates — it recreates the controlled input problem. Use `watch` only when you genuinely need real-time derived UI (live preview, character count). For validation feedback, use `errors` from `formState` instead.

> ⚠️ **Error 2: Storing form state in a global store**
> Form state is ephemeral and field-structured. A Redux slice for a form adds actions for every field change, every validation state, and every submission phase — all code that RHF handles internally. The maintenance cost is high with no architectural benefit.

> ⚠️ **Error 3: Defining TypeScript types separately from Zod schemas**
> `interface InvoiceFormData { amount: number; ... }` written alongside a Zod schema is a synchronization hazard. Use `z.infer<typeof schema>` to derive the type. One definition, zero drift.

> ⚠️ **Error 4: Not handling server validation errors in the form**
> Displaying server errors in a toast and clearing them on the next render leaves users without field-level guidance. Use `setError` to route server errors back into RHF's field error state — they appear inline, adjacent to the field they describe.

> ⚠️ **Error 5: Forgetting to disable submit during mutation pending**
> RHF's `isSubmitting` covers only the synchronous validation phase. Once `handleSubmit` calls `onSubmit` and the mutation is in flight, `isSubmitting` may be false while `createX.isPending` is true. Both must gate the submit button.

---

## Practical Activity

**Exercise: Form Architecture Design**

Given this feature brief:

> "Users can edit their billing address. The form has 6 fields: name, line 1, line 2 (optional), city, country (dropdown, 200 options), postcode. On save, the API may return a validation error if the postcode format doesn't match the country. The form should not close on error."

1. Write the Zod schema. Mark optional fields. Add appropriate string constraints.
2. Derive the TypeScript type from the schema using `z.infer`.
3. Sketch the RHF setup: `useForm`, `resolver`, and `handleSubmit` structure.
4. Design the mutation's `onError` handler: how do you route a postcode/country mismatch error back into the form as a field-level error?
5. Identify which fields benefit from `valueAsNumber` or `valueAsDate` transforms in `register`.

---

## Quiz

**Multiple Choice**

**Q1.** A form has 15 fields and live character counts on two text areas. Which approach is correct?

A) Use fully controlled inputs for all 15 fields to keep everything consistent.
B) Use RHF with `register` for all fields; use `watch` only on the two text area fields that need live character counts.
C) Use RHF for the 13 simple fields and controlled inputs for the two text areas.
D) Use RHF's `watch` on all fields to enable future real-time features.

**Answer: B.** RHF's `register` avoids per-keystroke re-renders for all 15 fields. `watch` is used surgically only where real-time reactivity is needed.

---

**Q2.** A Zod schema validation fails client-side on submit. The `handleSubmit` callback is:

A) Called with partial data, and the developer must check `errors` manually.
B) Not called — RHF populates `errors` in `formState` and stops execution.
C) Called with `undefined` data to signal failure.
D) Called regardless; Zod errors are surfaced via a separate `zodErrors` state.

**Answer: B.** `handleSubmit` calls the callback only when validation passes. On failure, it populates `formState.errors` and does not invoke the submit handler.

---

**Short Answer**

**Q3.** Why is form state architecturally distinct from general client UI state? Give two concrete differences.

*Model answer:* First, form state is ephemeral — it exists only until submission succeeds, at which point it is discarded. General client UI state persists for the lifetime of the feature. Second, form state has a field-level structure with per-field validity, touched, and dirty states that general client state doesn't have. These differences mean a general-purpose state manager is a poor fit for forms; purpose-built libraries like RHF handle the lifecycle correctly with less code.

---

**Q4.** A server returns `{ error: 'postcode_invalid', field: 'postcode' }` after a form submission. How do you surface this as a field-level error in RHF without losing the user's other field values?

*Model answer:* Use RHF's `setError('postcode', { type: 'server', message: 'Invalid postcode for the selected country' })` inside the mutation's `onError` handler. This populates `errors.postcode` without resetting any other field values or re-triggering validation on unaffected fields. The form stays open and the error appears inline next to the postcode field.

---

## Retrieval Cues

1. What is the render performance difference between a fully controlled form and RHF's `register` pattern? When does it matter?
2. How does `z.infer` eliminate type/schema drift?
3. Name the three phases of a form submission lifecycle and the mechanism responsible for each.
4. Why does double-submission prevention require checking both `isSubmitting` and `mutationX.isPending`?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Controlled vs. RHF uncontrolled trade-off | Day 1 | Day 3 | Day 7 |
| `z.infer` — type derived from schema | Day 1 | Day 4 | Day 10 |
| Three-phase submission lifecycle | Day 2 | Day 5 | Day 14 |
| `setError` for server validation errors | Day 2 | Day 6 | Day 14 |
| Form state topology — why not a global store | Day 3 | Day 7 | Day 21 |

---

## Transfer Exercise

**Domain: Medical appointment booking system (not a SaaS product form)**

A patient books an appointment: selects a clinic (dropdown, fetched), a doctor (filtered by clinic selection), a date (calendar, must be a future date), and a reason for visit (textarea, max 300 chars). On submit, the API may reject the slot as already taken.

1. Write the Zod schema. The doctor field should only be valid if a clinic is selected — model this with `.refine()` or a discriminated union.
2. The doctor dropdown options depend on the selected clinic value. Does this require `watch`? Explain why or why not.
3. Design the mutation's error handling for a "slot already taken" rejection. Should this be a `root` error or a field error? Defend your choice.
4. The form is inside a multi-step wizard. Step 1 collects clinic + doctor; Step 2 collects date + reason. How does this change the state architecture? What owns the accumulated data between steps?

---

## Self-Guided Exercise

Find a form in a real codebase — ideally one with validation and a submission that hits an API. Audit it against this checklist:

1. Is the TypeScript type derived from the validation schema, or defined separately? If separately, do they match?
2. Is form state stored in a global store? If so, what would the code look like with RHF instead?
3. Does the mutation's error handler surface field-level server errors back into the form, or only show a toast?
4. Is the submit button correctly disabled during both the RHF validation phase and the mutation pending phase?

Write one concrete improvement for each gap you find, with the specific code change needed.
