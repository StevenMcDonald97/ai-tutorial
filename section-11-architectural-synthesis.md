# Section 11 — `architectural-synthesis`
# Architectural Prescription: Auditing, Designing & Communicating React Architecture

---

## Why This Matters

Every preceding section built a specific competency. This section is where those competencies become a consulting skill. An architect who can reason about fiber scheduling, design a state topology, and select a library stack still needs to do three things that matter to a client: audit what exists, prescribe what should exist, and communicate why — in terms the client acts on. This section formalises those three skills.

---

## Learning Objectives

1. **11.1** Conduct a structured architectural audit of a React codebase and produce a prioritised list of liabilities with remediation recommendations.
2. **11.2** Design a complete architectural blueprint (state topology, component model, async boundary map, library stack, testing strategy) for a new SMB SaaS feature from a product requirements brief.
3. **11.3** Justify architectural decisions in terms of business trade-offs for a non-technical SaaS stakeholder audience.
4. **11.4** Evaluate two competing architectural proposals for the same SaaS context and produce a written recommendation with explicit, defensible criteria.

---

## Key Terms & Definitions

**Architectural audit** — A structured review of an existing codebase identifying architectural liabilities: patterns that increase maintenance cost, introduce bugs, or block future feature development.

**Architectural liability** — A specific, demonstrable problem in the current architecture: a pattern that causes real costs (bugs, slow development, performance issues), not just a style preference.

**Architectural blueprint** — A pre-implementation design document covering state topology, component model, async boundary placement, library selections, and testing strategy for a feature or system.

**Remediation priority** — The ranking of liabilities by: severity of impact × cost to fix × risk of not fixing. Not all liabilities are worth fixing immediately.

**Business trade-off** — An architectural decision expressed in terms a non-technical stakeholder can act on: time-to-market, maintenance cost, team scalability, reliability, and risk — not implementation details.

**Technical debt** — Architectural decisions that were expedient at the time but accumulate interest: each subsequent change costs more because of them.

---

## Lecture Content

### Part 1: The Structured Codebase Audit

An audit without structure produces an opinion. A structured audit produces a prioritised remediation plan.

**The audit framework — six lenses:**

**Lens 1: Rendering model**
- Are there unnecessary re-render cascades? (Section 1)
- Is `memo`/`useMemo`/`useCallback` applied speculatively or evidently?
- Are there side effects in render functions?

**Lens 2: Async boundary design**
- Are Suspense and Error Boundaries used, and at what granularity? (Section 2)
- Are loading/error states scattered as inline booleans instead?
- Are there waterfall data fetches where parallel would be correct?

**Lens 3: TypeScript contract quality**
- Is `any` used? Where? (Section 3)
- Are state shapes modelled as discriminated unions or as flag combinations?
- Are domain IDs distinguishable at the type level?

**Lens 4: State topology**
- Is server state stored in a global client store? (Section 5)
- Is Context used as a state manager rather than a DI mechanism?
- Is there prop drilling that indicates misplaced state ownership?
- Is derived state stored and manually synchronised?

**Lens 5: Component design**
- Are components monolithic, mixing data fetching, business logic, and rendering?
- Are there headless hook opportunities where behavior and presentation are coupled?
- Are Portals used correctly for modals and overlays? (Section 6)

**Lens 6: Performance and testing**
- Are heavy dependencies code-split? (Section 10)
- Does the test suite verify behavior or implementation details? (Section 9)
- Is there bundle analysis in the CI pipeline?

**Producing the audit output:**

For each liability found, document:

```
LIABILITY: [name]
Lens: [which of the six]
Evidence: [specific file/component/pattern]
Impact: [what it causes — bugs, performance, slow development]
Remediation: [specific change required]
Priority: High / Medium / Low
Effort: [rough estimate — hours / days / sprint]
```

**Prioritisation criteria:**

- **High:** causes user-facing bugs or performance issues; blocks new feature development.
- **Medium:** increases maintenance cost; creates technical debt that compounds.
- **Low:** violates best practice but has no current measurable impact.

Fix High first, always. Medium in planned sprints. Low only if the fix is incidental to other work.

---

### Part 2: The Architectural Blueprint

When starting a new feature or greenfield project, produce a blueprint before writing code. A blueprint takes 2–4 hours and prevents weeks of rework.

**Blueprint sections:**

**1. State topology map**

List every state the feature requires. Classify and assign ownership using the Section 5 framework.

```
State             | Kind          | Owner / Mechanism
------------------|---------------|---------------------------
Subscription data | Server cache  | TanStack Query
Current user      | Global client | Zustand
Plan limits       | Derived       | useMemo from subscription
Upgrade modal     | Ephemeral     | useState (local)
Upgrade form      | Form          | React Hook Form + Zod
```

**2. Async boundary map**

Draw the Suspense and Error Boundary placement. Answer: which regions load independently? Which failure should not crash adjacent regions?

```
<FeatureErrorBoundary>           ← catches render errors in whole feature
  <Suspense fallback={skeleton}> ← loading: subscription data
    <SubscriptionPanel>
      <FeatureErrorBoundary>     ← invoice list failure isolated
        <Suspense fallback={...}>
          <InvoiceHistory />
        </Suspense>
      </FeatureErrorBoundary>
    </SubscriptionPanel>
  </Suspense>
</FeatureErrorBoundary>
```

**3. Component model**

Identify which components are purely presentational, which are containers (logic + hooks), which use compound or headless patterns, and which require Portals.

**4. TypeScript contract decisions**

List any discriminated unions needed (async state shapes), branded types (domain IDs), and generic components or hooks.

**5. Library selections**

Explicit per-feature decisions: which global store, which query hooks, which form library. State the reason for each selection relative to the feature's characteristics.

**6. Testing strategy**

Per feature: which integration tests cover the happy path, which cover the critical error path, and which pure functions warrant unit tests.

---

### Part 3: Communicating Architecture to Non-Technical Stakeholders

The most technically correct architectural decision fails if the client can't evaluate it. SMB SaaS clients make staffing, timeline, and scope decisions that architectural choices directly constrain.

**The translation principle:** Every architectural decision has a business consequence. Express it in that language.

| Architectural decision | Business translation |
|---|---|
| Server state in TanStack Query vs. Redux | "This approach means users always see fresh data automatically, without us writing custom refresh logic. It reduces the bug surface for stale data issues by roughly 60% of the cases we'd otherwise handle manually." |
| Route-level code splitting | "The app will load 40% faster on first visit. Users who only use the dashboard never download the code for the reports module." |
| Zod schema as single source of truth | "Validation rules are defined once and enforced at both the form and the API. When the rules change, we update one file — not three. This is the most common source of 'the form says it's valid but the API rejects it' bugs, and this eliminates it structurally." |
| Testing with RTL + MSW | "Our tests verify that the app works the way users use it, not that the internal wiring matches our expectations. This means tests survive refactoring — we can improve the code without breaking the safety net." |

**What not to say:** "We're using a discriminated union state model because it eliminates impossible states at the type level." That is technically precise and communicatively useless.

**The three-part business framing:**

1. **What decision was made** (one sentence, no jargon).
2. **What risk or cost it prevents** (specific, quantifiable if possible).
3. **What the alternative would have cost** (makes the trade-off visible).

---

### Part 4: Evaluating Competing Proposals

SMB SaaS clients and internal teams frequently present competing architectural approaches. Producing a defensible recommendation requires explicit criteria — not instinct.

**The evaluation framework:**

```
Criterion                  | Weight | Proposal A | Proposal B
---------------------------|--------|------------|------------
Correctness for this domain|  High  |            |
Team maintainability       |  High  |            |
Time-to-first-delivery     |  Med   |            |
Long-term extensibility    |  Med   |            |
Bundle size / performance  |  Low   |            |
Reversibility if wrong     |  Med   |            |
```

Weights are context-dependent. For an SMB SaaS with a 4-person team and an 18-month runway, maintainability outweighs sophistication. For a series-B product with a 20-person engineering org, extensibility and team scalability increase in weight.

**Producing the recommendation:**

1. State the winning proposal and the primary criterion it wins on.
2. Acknowledge what it trades away.
3. State the condition under which the losing proposal would be correct.
4. Recommend a review trigger: "If X happens, we revisit this decision."

Example: "Proposal A (Zustand + TanStack Query) is recommended. It wins on team maintainability and time-to-delivery for a team of four with no existing RTK experience. It trades away RTK's middleware pipeline and time-travel debugging — neither of which is required by the current feature set. If the product adds an audit log requirement or an event-sourced data model, RTK becomes the correct choice and migration is achievable in 1–2 sprints."

---

## Worked Example: Full Audit + Blueprint for a SaaS Billing Feature

### Part A: Audit of the Existing Billing Module

**Given:** A billing module written 18 months ago. No RTL tests. Billing data stored in Redux with manual loading flags. A single Error Boundary at the app root. All form state in Redux. `any` used for API response types.

**Audit output:**

```
LIABILITY: Server state in Redux
Lens: State topology
Evidence: billingSlice.ts — manual loading/error/stale flags, no background refetch
Impact: Users see stale invoices; manual invalidation logic is a recurring bug source
Remediation: Migrate to TanStack Query; remove billingSlice entirely
Priority: High
Effort: 3 days

LIABILITY: Single root Error Boundary
Lens: Async boundary design
Evidence: App.tsx — one <ErrorBoundary> wrapping all routes
Impact: Any render error in billing crashes the entire application
Remediation: Add feature-scoped Error Boundaries per billing region
Priority: High
Effort: 0.5 days

LIABILITY: Form state in Redux
Lens: State topology
Evidence: paymentFormSlice.ts — field values, validation, submission state in store
Impact: 340 lines of slice code replaceable with React Hook Form; form bugs from manual validation
Remediation: Migrate to RHF + Zod; delete paymentFormSlice
Priority: Medium
Effort: 2 days

LIABILITY: `any` on API response types
Lens: TypeScript contract quality
Evidence: billingApi.ts — fetchInvoices(): Promise<any>
Impact: Type errors in invoice data reach production silently
Remediation: Add Zod schema for invoice API response; derive TypeScript types
Priority: Medium
Effort: 1 day

LIABILITY: No behavioral tests
Lens: Testing
Evidence: billing/__tests__ — 2 snapshot tests only
Impact: Refactors break silently; billing regressions reach production
Remediation: Add RTL + MSW integration tests for: invoice list load, payment flow, error states
Priority: High
Effort: 3 days
```

**Prioritised remediation plan:**
1. Error Boundaries (0.5 days — immediate, high safety impact).
2. TanStack Query migration (3 days — eliminates the stale data bug class).
3. RTL + MSW tests (3 days — establishes safety net before further changes).
4. RHF + Zod migration (2 days — best done after tests are in place).
5. API type schemas (1 day — can be done incrementally).

### Part B: Blueprint for the New Billing Feature (Usage-Based Pricing)

**Product requirements:** Show current usage vs. plan limits. Allow plan upgrade via a modal form. Show invoice history. Send email notification on upgrade.

**State topology:**

```
State                  | Kind          | Mechanism
-----------------------|---------------|---------------------------
Usage + plan data      | Server cache  | TanStack Query (staleTime: 60s)
Invoice history        | Server cache  | TanStack Query (paginated)
Upgrade modal open     | Ephemeral     | useState (local to parent)
Upgrade form           | Form          | React Hook Form + Zod
Selected plan          | Form field    | RHF field (within form state)
Usage percentage       | Derived       | useMemo from usage/plan data
```

**Async boundary map:**

```
<FeatureErrorBoundary fallback={<BillingError />}>
  <Suspense fallback={<UsageSkeleton />}>
    <UsagePanel />              ← usage + plan data
  </Suspense>

  <FeatureErrorBoundary fallback={<InvoiceError />}>
    <Suspense fallback={<InvoiceSkeleton />}>
      <InvoiceHistory />        ← independent data region
    </Suspense>
  </FeatureErrorBoundary>
</FeatureErrorBoundary>

{upgradeModalOpen && (
  <Portal>
    <UpgradeModal onClose={...} />   ← Portal: escapes stacking context
  </Portal>
)}
```

**TypeScript contracts:**

```tsx
// Discriminated union for async state (if not using Suspense)
type UsageState =
  | { status: 'loading' }
  | { status: 'success'; usage: UsageData; plan: PlanData }
  | { status: 'error'; error: Error };

// Branded IDs
type PlanId    = string & { __brand: 'PlanId' };
type InvoiceId = string & { __brand: 'InvoiceId' };

// Zod schema as single source of truth for upgrade form
const upgradeSchema = z.object({
  planId:        z.string().min(1),
  billingPeriod: z.enum(['monthly', 'annual']),
  couponCode:    z.string().optional(),
});
type UpgradeFormData = z.infer<typeof upgradeSchema>;
```

**Testing strategy:**
- Integration: usage panel loads and displays correct percentage; upgrade form submits and invalidates cache; error boundary shows on API failure.
- Unit: `useMemo` usage percentage calculation (pure); Zod schema validation for edge cases.
- E2E: full upgrade flow (revenue-critical path).

---

## Common Errors

> ⚠️ **Error 1: Auditing style, not architecture**
> "This component is too long" is a style opinion, not an architectural liability. An architectural liability has a measurable impact: a bug class it creates, a performance cost, a feature it blocks. If you can't state the impact, it's not an audit finding.

> ⚠️ **Error 2: Prescribing the most sophisticated architecture regardless of context**
> RTK + Sagas + normalized entity adapters is a defensible architecture for a 50-person engineering org with complex event-sourcing requirements. For a 4-person SMB SaaS team, it's a carrying cost with no payoff. The best architecture is the one the team can maintain given their constraints.

> ⚠️ **Error 3: Blueprint without a state topology**
> Starting a blueprint with component design before resolving state ownership repeats the most common React architectural mistake: designing a component hierarchy and then discovering it doesn't support the required data flow. State topology always comes first.

> ⚠️ **Error 4: Communicating architecture in implementation terms**
> "We're using a proxy-based immutability library with structural sharing" communicates nothing to a product owner. "This approach means we can safely undo and redo changes, and the performance cost of updating large data sets is roughly 10× lower than our previous approach" is actionable.

> ⚠️ **Error 5: No review trigger in architectural recommendations**
> Every architectural decision is correct under some set of assumptions. State the assumptions explicitly and define the condition that would invalidate them. This prevents decisions from hardening into religion as the product evolves.

---

## Practical Activity

**Exercise: Full Blueprint from a Product Brief**

**Brief:**

> "We're building a 'Team Workload' feature for our project management SaaS. It shows: a grid of team members with their assigned tasks and current capacity (server data, updates when tasks are reassigned), a drag-and-drop interface to reassign tasks between team members, a filter bar (by project, by date range), an 'overloaded' warning banner that appears when any team member exceeds 100% capacity, and a settings panel where managers can set each member's maximum weekly hours."

Produce a complete architectural blueprint:

1. State topology map — classify every implied state.
2. Async boundary map — draw the Suspense/Error Boundary placement.
3. Component model — identify which components are presentational, which are containers, which patterns apply (compound? headless? portal?).
4. TypeScript contracts — identify discriminated unions, branded types, and generic hooks needed.
5. Library selections — with explicit justification for each choice.
6. Testing strategy — three integration tests you would write first.

---

## Quiz

**Multiple Choice**

**Q1.** During an audit, you find that `useEffect` is used to keep a `filteredUsers` state variable in sync with `users` and `filterQuery` state. What category of architectural liability is this?

A) Async boundary design — useEffect is the wrong mechanism for data fetching.
B) State topology — `filteredUsers` is derived state being stored and manually synchronised, creating a synchronisation bug risk.
C) Component design — the filtering logic should be in a custom hook.
D) TypeScript contracts — the types are not correctly constraining the filter output.

**Answer: B.** Derived state that is stored and synchronised via `useEffect` is a state topology liability. The correct pattern is `useMemo` — compute `filteredUsers` inline, never store it separately.

---

**Q2.** A client asks: "Why can't we just add more `useEffect` hooks to keep everything in sync instead of restructuring the state?" What is the correct architectural response?

A) `useEffect` has poor performance characteristics compared to `useMemo`.
B) `useEffect` synchronisation creates chains of reactive updates that are hard to reason about, easy to get wrong (infinite loops, missed deps), and hide the underlying problem — derived state being stored. The correct fix eliminates the synchronisation need entirely.
C) `useEffect` is deprecated in React 19 and should be avoided.
D) More `useEffect` hooks will work correctly as long as dependency arrays are complete.

**Answer: B.** The architectural argument against `useEffect` synchronisation is not performance — it's correctness and maintainability. Chains of reactive effects are the React equivalent of spaghetti state. The correct fix is treating derived state as computation, not storage.

---

**Short Answer**

**Q3.** A non-technical client asks why you're recommending TanStack Query over "just storing the data in Redux like we've always done." Write a 3-sentence business-language explanation.

*Model answer:* "With the current approach, the app can show data that's hours old unless users manually refresh — which we've seen cause support tickets when team members see different numbers. TanStack Query handles this automatically: it refreshes data in the background on a configurable schedule and whenever the user returns to a tab. It also removes roughly 200 lines of loading and error management code our team maintains today, which reduces the surface area for bugs in those flows."

---

**Q4.** You're evaluating two proposals for state management on a new feature. Proposal A is Zustand. Proposal B is Redux Toolkit. The team has no RTK experience, the feature is a simple notification center, and the timeline is 6 weeks. Write a one-paragraph recommendation using the evaluation framework.

*Model answer:* "Proposal A (Zustand) is recommended. The notification center has simple state — a queue of notifications, add/dismiss actions — with no middleware requirements, no audit log, and no cross-feature event sourcing. On these criteria, Zustand wins on maintainability, time-to-delivery, and team ramp-up. The trade-off is no time-travel debugging and a less enforced action discipline — neither of which this feature requires. If the product later needs an audit trail of notification events or the team scales to the point where stricter action conventions become valuable, migrating this store to RTK is a contained, 1-day effort. The recommendation should be revisited if those conditions arise."

---

## Retrieval Cues

1. Name the six audit lenses and the primary question each asks.
2. What are the three components of a business-language architectural justification?
3. What is a "review trigger" in an architectural recommendation, and why is it required?
4. Why does the blueprint's state topology come before component design?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Six audit lenses | Day 1 | Day 3 | Day 7 |
| Liability documentation format | Day 1 | Day 4 | Day 10 |
| Blueprint sections and order | Day 2 | Day 5 | Day 14 |
| Business translation framework | Day 2 | Day 6 | Day 14 |
| Evaluation framework + review trigger | Day 3 | Day 7 | Day 21 |

---

## Transfer Exercise

**Domain: Legal case management system (not a SaaS product)**

A law firm is migrating from a legacy desktop application to a React web app. The existing system has:
- All case data fetched on app load and stored in a single global object (no server cache layer).
- Every component re-renders whenever any case data changes.
- No TypeScript — plain JavaScript throughout.
- Form state for case notes managed in a global Redux store.
- No tests.

1. Apply the six audit lenses. Produce at least one finding per lens, with impact and remediation.
2. Prioritise the findings. The firm's most urgent pain point is: "Lawyers sometimes see case data that's been updated by a colleague but looks stale in their browser." Which liability is directly responsible, and why does it rank highest?
3. The managing partner asks: "Our developers say we need to 'refactor the state management' — can you explain what that means and why it matters for us?" Write a 4-sentence business-language response.
4. Propose a phased remediation plan over three sprints, given a 3-person team. Which liabilities do you address in each sprint, and why in that order?

---

## Self-Guided Exercise

**The capstone exercise for the course:**

Identify a real React codebase — a client project, an open-source application with meaningful complexity, or a significant personal project. Apply the full audit + blueprint workflow:

**Part 1: Audit (2 hours)**
Run all six lenses against the codebase. Produce a written audit with at least 5 findings, each with evidence, impact, remediation, and priority. Prioritise them. Identify the one liability that, if fixed, would deliver the most value to the team in the next 90 days.

**Part 2: Blueprint (2 hours)**
Choose one significant feature that hasn't been built yet (or one that should be rebuilt). Produce a complete blueprint: state topology, async boundary map, component model, TypeScript contracts, library selections, and testing strategy. The blueprint should be specific enough that another developer could implement the feature from it.

**Part 3: Stakeholder communication (1 hour)**
Take the top three findings from your audit. Write a one-page summary addressed to a non-technical product owner. For each finding: what it is (one plain sentence), what it costs the business (specific), and what fixing it provides (specific). No implementation jargon.

This is the deliverable you would produce for an SMB SaaS client engagement. Treat it as a professional artifact.
