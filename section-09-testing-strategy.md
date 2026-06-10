# Section 9 — `testing-strategy`
# Testing Architecture: Strategy, Tooling & Contract Verification

---

## Why This Matters

A test suite is an architectural artifact. It encodes assumptions about what behavior matters, what can change safely, and where the system is most likely to break. A poorly designed test suite is worse than no tests: it breaks on correct refactors, misses real regressions, and erodes the team's trust in testing itself. The goal is not coverage — it is a suite that catches regressions, survives refactoring, and costs proportionally less to maintain than the value it provides.

---

## Learning Objectives

1. **9.1** Design a three-layer testing strategy (unit, integration, E2E) appropriate for a given SaaS front end's risk profile.
2. **9.2** Write React Testing Library integration tests verifying component behavior from a user interaction perspective.
3. **9.3** Configure Mock Service Worker (MSW) to intercept API calls in tests and explain why it is superior to mocking `fetch` or Axios directly.
4. **9.4** Write Jest unit tests for pure reducer functions and `renderHook` tests for custom hooks.
5. **9.5** Evaluate an existing test suite and identify brittle, redundant, or low-value tests.

---

## Key Terms & Definitions

**Testing trophy** — A testing shape (popularized by Kent C. Dodds) that prioritizes integration tests over unit tests for UI code, with a small layer of E2E and a thin base of unit tests for pure logic.

**React Testing Library (RTL)** — A testing utility that renders components into a real DOM (via jsdom) and provides queries that mirror how users find elements: by role, label, text, and placeholder — not by CSS class or component name.

**Mock Service Worker (MSW)** — A library that intercepts HTTP requests at the service worker or Node.js level, returning mock responses. Tests run against the real fetch/Axios code — only the network is mocked.

**`renderHook`** — An RTL utility that mounts a hook in a minimal wrapper component, allowing you to call and test hooks in isolation without building a full component.

**`userEvent`** — RTL's companion library for simulating user interactions (typing, clicking, tabbing) more accurately than `fireEvent`. Dispatches realistic browser events in sequence.

**Contract test** — A test that verifies a module's public interface rather than its implementation. Survives internal refactoring; breaks only when the contract changes.

**Snapshot test** — A test that serializes a component's rendered output and compares it to a stored snapshot. High false-positive rate; low regression-catching value for behavioral testing.

---

## Lecture Content

### Part 1: Testing Strategy — The Three-Layer Model

No testing strategy fits every project. The right distribution depends on the application's risk profile: where failures are most likely, most costly, and hardest to detect manually.

**The three layers:**

```
E2E (Playwright / Cypress)
  → Full browser, real network or MSW
  → Tests: critical user journeys (signup, checkout, core workflow)
  → Count: small (10–30). Slow, expensive to maintain.

Integration (Jest + RTL + MSW)
  → Real DOM, mocked network
  → Tests: feature behavior from user perspective
  → Count: majority of the suite. The highest value-to-cost ratio.

Unit (Jest)
  → Isolated functions, no rendering
  → Tests: pure reducers, utility functions, Zod schemas, hooks
  → Count: targeted. Only where logic is complex enough to warrant isolation.
```

**Calibrating by risk profile:**

| App characteristic | Implication |
|---|---|
| Complex data transformations | More unit tests for transformation logic |
| Many user-facing workflows | More integration tests per workflow |
| Revenue-critical flows (checkout, billing) | E2E coverage mandatory |
| Rapidly changing UI | Fewer snapshot tests; more behavioral integration tests |
| Shared component library | Unit + integration tests per component contract |

**The mistake to avoid:** Inverting the pyramid — many unit tests for implementation details, few integration tests for actual behavior. This produces a suite that's expensive to maintain and doesn't catch the bugs that matter: broken user workflows.

---

### Part 2: Integration Tests with React Testing Library

RTL's design philosophy: **test what the user sees and does, not what the component does internally.**

```tsx
// src/features/invoices/__tests__/InvoiceList.test.tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoiceList } from '../InvoiceList';
import { server } from '../../../mocks/server'; // MSW server
import { http, HttpResponse } from 'msw';

describe('InvoiceList', () => {
  it('displays invoices fetched from the API', async () => {
    render(<InvoiceList />, { wrapper: AppProviders });

    // Assert loading state appears
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

    // Assert data appears after fetch resolves
    const items = await screen.findAllByRole('row', { name: /invoice/i });
    expect(items).toHaveLength(3); // matches MSW handler response
  });

  it('filters invoices when user selects a status filter', async () => {
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper: AppProviders });

    await screen.findAllByRole('row'); // wait for initial load

    await user.click(screen.getByRole('button', { name: /filter/i }));
    await user.click(screen.getByRole('option', { name: /paid/i }));

    const rows = await screen.findAllByRole('row', { name: /invoice/i });
    rows.forEach(row => {
      expect(within(row).getByText(/paid/i)).toBeInTheDocument();
    });
  });

  it('shows an error state when the API fails', async () => {
    // Override default handler for this test only
    server.use(
      http.get('/api/invoices', () => HttpResponse.error())
    );

    render(<InvoiceList />, { wrapper: AppProviders });

    await screen.findByRole('alert');
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

**RTL query priority** — use in this order:

1. `getByRole` — most accessible, mirrors screen reader behavior.
2. `getByLabelText` — for form fields.
3. `getByText` — for non-interactive content.
4. `getByTestId` — last resort only; couples tests to implementation.

**The `findBy` vs. `getBy` distinction:**

- `getBy*` — synchronous; throws immediately if not found. Use for elements that should already be present.
- `findBy*` — asynchronous; waits up to timeout for element to appear. Use for elements that appear after async operations.

---

### Part 3: Mock Service Worker — Network Interception

MSW intercepts HTTP at the network level — your application code makes real `fetch` or Axios calls; MSW intercepts them before they leave the process. This means:

- No mocking of `fetch`, `axios`, or any HTTP client.
- The same handlers work in both Jest (Node.js) and the browser (development, Storybook).
- Request validation is implicit — if the component calls the wrong endpoint, the handler doesn't match and the test fails.

**Setup:**

```tsx
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/invoices', () =>
    HttpResponse.json([
      { id: 'inv_1', amount: 1200, status: 'paid',    client: 'Acme Corp' },
      { id: 'inv_2', amount:  800, status: 'pending',  client: 'Globex' },
      { id: 'inv_3', amount: 2400, status: 'overdue',  client: 'Initech' },
    ])
  ),

  http.post('/api/invoices', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 'inv_new', ...body }, { status: 201 });
  }),
];

// mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);

// jest.setup.ts
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers()); // prevent handler leakage between tests
afterAll(() => server.close());
```

**Why MSW is architecturally superior to mocking `fetch`:**

Mocking `fetch` couples the test to the HTTP client implementation. If you swap Axios for `fetch`, the mock breaks even though the behavior didn't change. MSW mocks the network contract — the URL and response shape — which is the actual boundary between your app and the server. Tests that use MSW survive HTTP client refactors and test the actual request/response cycle your users experience.

---

### Part 4: Unit Tests — Reducers and `renderHook`

Unit tests are the right tool for pure logic: reducers, utility functions, Zod schema validation, and hook contracts.

**Testing a pure reducer:**

```tsx
// store/invoiceSlice.test.ts
import { invoiceReducer, invoiceUpdated } from './invoiceSlice';

describe('invoiceReducer', () => {
  const initialState = {
    items: [
      { id: 'inv_1', status: 'pending', amount: 1200 },
      { id: 'inv_2', status: 'paid',    amount: 800  },
    ],
    status: 'succeeded' as const,
    error: null,
  };

  it('updates a single invoice without mutating others', () => {
    const updated = { id: 'inv_1', status: 'paid', amount: 1200 };
    const nextState = invoiceReducer(initialState, invoiceUpdated(updated));

    expect(nextState.items[0].status).toBe('paid');
    expect(nextState.items[1]).toBe(initialState.items[1]); // same reference — structural sharing
    expect(nextState.items).not.toBe(initialState.items);   // new array — immutable
  });
});
```

**Testing a custom hook with `renderHook`:**

```tsx
// hooks/useMultiStepForm.test.ts
import { renderHook, act } from '@testing-library/react';
import { useMultiStepForm } from './useMultiStepForm';

describe('useMultiStepForm', () => {
  it('initialises at step 0', () => {
    const { result } = renderHook(() => useMultiStepForm(4));
    expect(result.current.currentStep).toBe(0);
    expect(result.current.isFirstStep).toBe(true);
    expect(result.current.isLastStep).toBe(false);
  });

  it('clamps next() at the final step', () => {
    const { result } = renderHook(() => useMultiStepForm(2));
    act(() => { result.current.next(); result.current.next(); result.current.next(); });
    expect(result.current.currentStep).toBe(1); // not 2 or 3
    expect(result.current.isLastStep).toBe(true);
  });

  it('resets to step 0', () => {
    const { result } = renderHook(() => useMultiStepForm(4));
    act(() => { result.current.next(); result.current.next(); });
    act(() => result.current.reset());
    expect(result.current.currentStep).toBe(0);
  });
});
```

**The value/cost calibration:**

Unit tests for pure functions are high-value and low-maintenance — pure functions don't have side effects, rendering, or network calls to mock. Unit tests for components (rendering a component in isolation with all dependencies mocked) are low-value and high-maintenance — they test implementation details and break on refactors. Prefer integration tests for components; reserve unit tests for pure logic.

---

### Part 5: Evaluating an Existing Test Suite

When auditing a test suite, apply these four questions to each test:

**1. Does it test behavior or implementation?**
A test that asserts on class names, internal state values, or component method calls is testing implementation. When the implementation changes (even correctly), these tests fail. Tests should assert on what the user sees or what the public interface returns.

```tsx
// ❌ Tests implementation — breaks on any refactor
expect(wrapper.state('isOpen')).toBe(true);
expect(component.find('.dropdown-menu')).toHaveLength(1);

// ✅ Tests behavior — survives refactoring
expect(screen.getByRole('listbox')).toBeVisible();
```

**2. Does it verify behavior that could actually regress?**
A test that asserts `<Button />` renders a `<button>` element is not catching a realistic regression. Tests should cover behavior that has broken before, or behavior that would break silently (no type error, no console error) if someone changed it.

**3. Would it catch the bug it's supposedly preventing?**
Many snapshot tests catch zero regressions in practice — a developer updates the snapshot without reading the diff, and the test "passes." If the failure mode of the test is "developer clicks 'update snapshots,'" the test provides no safety.

**4. What is its false-positive rate?**
A brittle test fails on changes that don't break behavior. Brittle tests are worse than no tests — they train developers to ignore test failures as noise, masking real regressions when they appear.

**Patterns that signal a low-value test suite:**
- Snapshot tests as the majority of component tests.
- Tests that mock every dependency, leaving nothing real being tested.
- 90%+ coverage with zero confidence that the app works.
- Tests that fail whenever a component is refactored, even when behavior is preserved.

---

## Worked Example: Auditing a Test File

**Given test:**

```tsx
it('renders the InvoiceCard component', () => {
  const invoice = { id: 'inv_1', amount: 1200, status: 'paid', client: 'Acme' };
  const { container } = render(<InvoiceCard invoice={invoice} />);
  expect(container).toMatchSnapshot();
});

it('calls onEdit when edit button is clicked', () => {
  const onEdit = jest.fn();
  const { getByTestId } = render(<InvoiceCard invoice={invoice} onEdit={onEdit} />);
  fireEvent.click(getByTestId('edit-button'));
  expect(onEdit).toHaveBeenCalledTimes(1);
});
```

**Audit findings:**

| Test | Problem | Fix |
|---|---|---|
| Snapshot test | Breaks on any visual change; developers auto-update without reading diff | Replace with behavioral assertions: amount displayed, status badge visible |
| `getByTestId` | Couples test to implementation attribute, not user-visible element | Replace with `getByRole('button', { name: /edit/i })` |
| `fireEvent.click` | Doesn't simulate realistic user interaction (no pointer events, focus) | Replace with `userEvent.click` |
| `onEdit` called once | Only tests that handler fires — not what it's called with | Add `expect(onEdit).toHaveBeenCalledWith(invoice.id)` |

**Rewritten:**

```tsx
it('displays invoice details and triggers edit with correct id', async () => {
  const user    = userEvent.setup();
  const onEdit  = jest.fn();
  const invoice = { id: 'inv_1', amount: 1200, status: 'paid', client: 'Acme Corp' };

  render(<InvoiceCard invoice={invoice} onEdit={onEdit} />);

  expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  expect(screen.getByText('$1,200.00')).toBeInTheDocument();
  expect(screen.getByText(/paid/i)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /edit/i }));
  expect(onEdit).toHaveBeenCalledWith('inv_1');
});
```

---

## Common Errors

> ⚠️ **Error 1: Mocking `fetch` or Axios directly**
> This couples tests to the HTTP client implementation and doesn't test the actual request/response cycle. Use MSW to mock the network boundary instead.

> ⚠️ **Error 2: Snapshot tests as a substitute for behavioral tests**
> Snapshots catch HTML structure changes, not behavioral regressions. A changed class name or wrapper div fails a snapshot; a broken click handler doesn't. Use snapshots only for stable, intentional UI contracts — not as a default.

> ⚠️ **Error 3: Testing a component by querying internal state**
> `component.instance().state` or Enzyme-style internal access couples tests to implementation. RTL's philosophy is deliberate: if you can't find an element the way a user would, the accessibility may itself be the problem.

> ⚠️ **Error 4: Not resetting MSW handlers between tests**
> Handler overrides added in one test bleed into subsequent tests unless `server.resetHandlers()` is called in `afterEach`. This causes order-dependent test failures that are very hard to diagnose.

> ⚠️ **Error 5: Using `getBy` for async content**
> `getByText('Loading...')` throws immediately if the element isn't already in the DOM. For content that appears after async operations, use `findByText` — it waits up to the configured timeout.

---

## Practical Activity

**Exercise: Write Three Tests for a Feature**

Given a `<ProjectList>` component that:
- Fetches projects from `GET /api/projects`
- Displays a loading skeleton while fetching
- Renders a list of project cards when data arrives
- Shows an error message with a retry button when the request fails
- Allows filtering by project status via a dropdown

Write the following tests using RTL + MSW:

1. An integration test verifying the happy path: data loads and renders correctly.
2. An integration test verifying the error path: API failure shows error UI with a retry button that re-fetches.
3. An integration test verifying filter behavior: selecting a status filter updates the displayed list.

For each test: use `userEvent` for interactions, `findBy` for async assertions, and `getByRole` as the primary query strategy.

---

## Quiz

**Multiple Choice**

**Q1.** A test uses `screen.getByTestId('submit-btn')` to find a button. A developer refactors the button from `<button>` to a custom `<IconButton>` component and removes the `data-testid`. The test breaks. What does this indicate?

A) The test is correctly catching a regression — the button's behavior changed.
B) The test is brittle — it's coupled to an implementation detail rather than user-observable behavior.
C) `getByTestId` is unreliable and should never be used.
D) Custom components should always include `data-testid` for testability.

**Answer: B.** The button's behavior (submitting the form) didn't change — only its implementation did. A test using `getByRole('button', { name: /submit/i })` would survive the refactor because it queries by user-visible attributes.

---

**Q2.** Why is `server.resetHandlers()` called in `afterEach` rather than `afterAll` in an MSW test setup?

A) `afterAll` doesn't support MSW's handler reset API.
B) Per-test handler overrides (via `server.use(...)`) must be cleared after each test to prevent them from affecting subsequent tests.
C) `resetHandlers` also clears the default handlers, so it must be called after each test to re-register them.
D) MSW requires handlers to be reset before each network request.

**Answer: B.** `server.use(...)` adds handlers that take precedence over defaults for that test. Without `resetHandlers()` in `afterEach`, that override persists into subsequent tests, causing order-dependent failures.

---

**Short Answer**

**Q3.** Explain why a test suite with 90% code coverage can still provide little confidence in application correctness.

*Model answer:* Coverage measures which lines of code are executed during tests — not whether the tests verify meaningful behavior. A suite of snapshot tests and trivial unit tests can execute 90% of the codebase while verifying nothing about whether user workflows succeed, whether API integration is correct, or whether error states are handled properly. Coverage is a floor (uncovered code definitely isn't tested) but not a ceiling — high coverage with low behavioral verification provides false confidence.

---

**Q4.** When is a unit test preferable to an integration test for React code?

*Model answer:* Unit tests are preferable for pure, isolated logic that has no rendering or side effects: reducer functions, Zod schema validation, data transformation utilities, and custom hook contracts (via `renderHook`). Integration tests are preferable for component behavior because they test how multiple pieces work together from the user's perspective. A unit test for a component requires mocking all dependencies, leaving so little real code under test that the value rarely justifies the maintenance cost.

---

## Retrieval Cues

1. What is the testing trophy shape, and why does it prioritise integration tests over unit tests for UI code?
2. What is the RTL query priority order, and why does `getByRole` rank first?
3. What is the architectural reason MSW is superior to mocking `fetch` directly?
4. Name three signals that indicate a low-value test suite.

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Testing trophy: layer distribution rationale | Day 1 | Day 3 | Day 7 |
| RTL query priority: role → label → text → testId | Day 1 | Day 4 | Day 10 |
| MSW setup: handlers, server, resetHandlers | Day 2 | Day 5 | Day 14 |
| `findBy` vs `getBy` — async vs synchronous | Day 2 | Day 6 | Day 14 |
| `renderHook`: testing hook contracts | Day 3 | Day 7 | Day 21 |
| Test audit: 4 questions for evaluating a test | Day 3 | Day 8 | Day 21 |

---

## Transfer Exercise

**Domain: E-learning platform (not a SaaS management tool)**

An e-learning platform has these features to test:
- A video player that tracks watch progress and marks a lesson complete when 90% watched.
- A quiz component that submits answers to an API, shows a score, and blocks retakes for 24 hours.
- A course enrollment flow: select a course, confirm payment, receive a confirmation email (mocked).

1. For each feature, decide: unit test, integration test, E2E test, or a combination? Justify each decision based on risk profile and the type of behavior being verified.
2. The quiz submission hits `POST /api/quiz-attempts`. Write the MSW handler and the test structure (not full implementation) for: (a) a successful submission showing the score, and (b) a "retake blocked" response showing the correct error UI.
3. The "mark lesson complete" logic is a pure function: `isComplete(watchedSeconds, totalSeconds) => watchedSeconds / totalSeconds >= 0.9`. Should this be a unit test or integration test? What would each look like?
4. The enrollment flow spans three steps and two API calls. What makes this an E2E candidate rather than an integration test? What would you accept as a minimum E2E coverage bar for a revenue-critical flow?

---

## Self-Guided Exercise

Pick one feature in a codebase you work with that has existing tests. Apply the four-question audit to each test in the file:

1. Does it test behavior or implementation?
2. Does it verify behavior that could realistically regress?
3. Would it catch the bug it's supposedly preventing?
4. What is its false-positive rate on correct refactors?

Identify the weakest two tests. Rewrite them using RTL + MSW + `userEvent`. Measure: did the rewrite require less mocking? Does the new test still pass after a superficial refactor (renaming a CSS class, extracting a subcomponent)?

Write a one-paragraph test strategy recommendation for the feature: what the current suite gets right, what the gaps are, and what two changes would most improve confidence.
