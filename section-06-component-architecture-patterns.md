# Section 6 — `component-architecture-patterns`
# Component Architecture: Composition Models, Design Patterns & Accessibility

---

## Why This Matters

Component design is where architectural intent becomes code. The same feature can be built as a monolithic component, a compound component, a headless component, or an HOC-wrapped component — and each choice has a different maintenance cost, testability profile, and accessibility story. Knowing which pattern fits which constraint, and being able to defend that choice, is what separates a React architect from a React developer.

---

## Learning Objectives

1. **6.1** Implement a compound component pattern for a UI widget requiring flexible internal composition.
2. **6.2** Build a headless component separating behavior from visual presentation, and explain its testability and accessibility advantages.
3. **6.3** Evaluate a component design and select the most appropriate pattern, defending it against alternatives.
4. **6.4** Refactor a monolithic component into a container/logic + presentational split using custom hooks.
5. **6.5** Implement a React Portal for a modal or toast, explaining why placement matters for stacking context and focus management.
6. **6.6** Design a custom hook as a complete behavioral contract and write a `renderHook` test for it.

---

## Key Terms & Definitions

**Compound component** — A set of components that share implicit state via Context, designed to be composed by the consumer. `<Select>` + `<Select.Option>` is the canonical example. The consumer controls layout; the parent controls state.

**Headless component** — A component (or hook) that provides behavior and state with no opinions about rendering. The consumer owns all markup and styles. Radix UI and Headless UI are library examples.

**Higher-order component (HOC)** — A function that takes a component and returns a new component with additional behavior injected. `withAuth(Dashboard)` is a HOC.

**Render prop** — A pattern where a component receives a function as a prop and calls it to produce its output, giving the consumer control over rendering. Largely superseded by hooks, but still valid for certain cross-cutting concerns.

**Container/presentational split** — Separating a component's data-fetching and logic (container) from its pure rendering (presentational). In modern React, the container is usually a custom hook rather than a wrapper component.

**Portal** — A React feature that renders a component's output into a different DOM node than its parent. Used for modals, tooltips, and toasts that must escape CSS stacking contexts.

**Stacking context** — A CSS concept where a positioned element creates an isolated rendering layer. `overflow: hidden`, `transform`, `opacity < 1`, and `z-index` on positioned elements all create new stacking contexts, which can clip or obscure absolutely positioned children like modals.

**Behavioral contract** — The public interface of a custom hook: what it accepts, what it returns, and what lifecycle guarantees it makes — independent of its implementation.

---

## Lecture Content

### Part 1: Compound Components — Flexible Composition

The compound component pattern solves a specific problem: a widget with multiple internal parts where consumers need layout flexibility, but the parts need to share state.

**The naive approach** passes everything as props:

```tsx
// ❌ Inflexible — consumer can't reorder or add content between items
<Tabs
  tabs={['Overview', 'Settings', 'Billing']}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  content={tabContent}
/>
```

**The compound component approach** shares state via Context:

```tsx
// ✅ Consumer controls layout; Tabs controls state
<Tabs defaultTab="overview">
  <Tabs.List>
    <Tabs.Tab id="overview">Overview</Tabs.Tab>
    <Tabs.Tab id="settings">Settings</Tabs.Tab>
    {canSeeBilling && <Tabs.Tab id="billing">Billing</Tabs.Tab>}
  </Tabs.List>
  <Tabs.Panel id="overview"><OverviewContent /></Tabs.Panel>
  <Tabs.Panel id="settings"><SettingsContent /></Tabs.Panel>
  {canSeeBilling && <Tabs.Panel id="billing"><BillingContent /></Tabs.Panel>}
</Tabs>
```

**Implementation — the key pieces:**

```tsx
type TabsContextValue = {
  activeTab: string;
  setActiveTab: (id: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within <Tabs>');
  return ctx;
}

function Tabs({ defaultTab, children }: { defaultTab: string; children: ReactNode }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
}

function TabsTab({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab, setActiveTab } = useTabs();
  return (
    <button
      role="tab"
      aria-selected={activeTab === id}
      onClick={() => setActiveTab(id)}
    >
      {children}
    </button>
  );
}

Tabs.Tab   = TabsTab;
Tabs.List  = TabsList;
Tabs.Panel = TabsPanel;
```

**Accessibility note:** Compound components are where ARIA roles naturally attach. `role="tab"`, `role="tablist"`, `role="tabpanel"`, and `aria-selected` belong at the compound component level — the consumer shouldn't need to wire these up manually. Encapsulating ARIA into the compound structure is a key accessibility architecture advantage.

**When to use it:** When a widget has multiple coordinated sub-parts and consumers need layout flexibility. Tabs, Accordions, Dropdowns, Menus, and multi-step forms are canonical use cases.

**When not to use it:** When consumers don't actually need layout control. If the internal layout is always the same, props are simpler and less indirection.

---

### Part 2: Headless Components — Behavior Without Presentation

A headless component provides behavior, state, and accessibility — zero markup, zero styles. The consumer owns the entire visual layer.

**Why it matters architecturally:**

1. **Testability** — behavior is testable without rendering any specific UI. Tests don't break when styling changes.
2. **Accessibility** — ARIA attributes, keyboard handlers, and focus management live in the headless layer, shared across every visual implementation.
3. **Design flexibility** — the same behavior can be applied to a button-group tab bar, a dropdown tab bar, or a mobile swipe interface.

**Hook-based headless pattern:**

```tsx
function useDisclosure(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return {
    isOpen,
    open:   () => setIsOpen(true),
    close:  () => setIsOpen(false),
    toggle: () => setIsOpen(o => !o),
    // Pre-built prop getters — consumers spread these onto their elements
    getTriggerProps: () => ({
      onClick: () => setIsOpen(o => !o),
      'aria-expanded': isOpen,
    }),
    getContentProps: () => ({
      hidden: !isOpen,
      role: 'region' as const,
    }),
  };
}

// Consumer owns all markup and styling
function CustomAccordion({ title, children }: AccordionProps) {
  const { getTriggerProps, getContentProps } = useDisclosure();
  return (
    <div className="my-accordion-style">
      <button className="my-trigger-style" {...getTriggerProps()}>{title}</button>
      <div className="my-content-style" {...getContentProps()}>{children}</div>
    </div>
  );
}
```

**Prop getter pattern:** Returning pre-built prop objects (`getTriggerProps`, `getMenuProps`) is the headless hook convention. It encapsulates ARIA attributes and event handlers; consumers spread them onto whatever element they choose. This is the pattern used by Downshift, Headless UI, and Radix.

---

### Part 3: HOCs and Render Props — When They Still Apply

Hooks replaced many HOC and render prop use cases, but not all.

**HOCs still make sense for:**
- **Cross-cutting injection** at the route or page level: `withAuth`, `withErrorBoundary`, `withAnalytics`.
- **Third-party library integration** that provides a component wrapper API.
- **Legacy codebase compatibility** where the HOC is an established pattern and refactoring to hooks would be a large, risky change.

```tsx
function withAuth<P extends object>(Component: ComponentType<P>) {
  return function AuthGuard(props: P) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) return <LoadingScreen />;
    if (!isAuthenticated) return <Navigate to="/login" />;
    return <Component {...props} />;
  };
}

const ProtectedDashboard = withAuth(Dashboard);
```

**The HOC warning:** HOCs obscure the component tree in DevTools and can create prop collision bugs when multiple HOCs wrap the same component. Prefer hooks for anything that doesn't require wrapping the entire render output.

**Render props still make sense for:**
- Exposing render control to the consumer when a hook's return value isn't enough.
- Virtualization libraries (like TanStack Virtual) that control how a list is rendered.

```tsx
<VirtualList
  items={rows}
  renderItem={(item, style) => (
    <div style={style}><RowComponent data={item} /></div>
  )}
/>
```

---

### Part 4: Container/Presentational Split with Custom Hooks

The original container/presentational pattern used wrapper components. In modern React, the container is a custom hook.

```tsx
// ❌ Old pattern — wrapper component as container
function UserProfileContainer({ userId }: { userId: UserId }) {
  const { data, isLoading } = useUser(userId);
  const permissions = usePermissions();
  if (isLoading) return <Skeleton />;
  return <UserProfilePresentation user={data} permissions={permissions} />;
}

// ✅ Modern pattern — custom hook as container
function useUserProfileData(userId: UserId) {
  const user        = useUser(userId);        // suspense-compatible
  const permissions = usePermissions();
  return { user, permissions };
}

// Component is purely presentational — fully testable with props alone
function UserProfile({ userId }: { userId: UserId }) {
  const { user, permissions } = useUserProfileData(userId);
  return (
    <div>
      <UserAvatar user={user} />
      {permissions.canEdit && <EditButton />}
    </div>
  );
}
```

**The testability advantage:** `UserProfile` can now be tested as a pure presentational component by passing props directly — no need to mock API calls. `useUserProfileData` can be tested with `renderHook`. The split creates two independently testable units.

---

### Part 5: Portals — Escaping the DOM Hierarchy

React Portals render a component's output into a different DOM node, while keeping it in the React component tree (so Context, events, and error boundaries all work normally).

**Why portals are necessary:**

A modal rendered inside a `<div>` with `overflow: hidden` or `transform` applied will be clipped or incorrectly positioned regardless of its `z-index`. The CSS stacking context created by that parent cannot be escaped by CSS alone — only by physically placing the DOM node outside the hierarchy.

```tsx
function Modal({ children, onClose }: ModalProps) {
  // Renders into document.body — outside any stacking context
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        // Focus management: trap focus inside modal
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
```

**Accessibility requirements for modals (non-negotiable):**
- `role="dialog"` and `aria-modal="true"` on the dialog container.
- `aria-labelledby` pointing to the modal's heading.
- **Focus trap** — keyboard focus must stay inside the modal while it's open.
- **Focus restoration** — when the modal closes, focus returns to the element that triggered it.
- **Escape key** closes the modal.

These requirements belong at the Portal/Modal component level — consumers shouldn't have to implement them manually.

---

### Part 6: Custom Hook as Behavioral Contract

Section 4 introduced the hook contract concept. Here it's applied concretely: designing a hook with a stable public interface, then verifying it with `renderHook`.

```tsx
// Contract: manages a multi-step form's step progression
function useMultiStepForm(totalSteps: number) {
  const [currentStep, setCurrentStep] = useState(0);

  return {
    currentStep,
    totalSteps,
    isFirstStep: currentStep === 0,
    isLastStep:  currentStep === totalSteps - 1,
    next:  () => setCurrentStep(s => Math.min(s + 1, totalSteps - 1)),
    back:  () => setCurrentStep(s => Math.max(s - 1, 0)),
    goTo:  (step: number) => setCurrentStep(Math.max(0, Math.min(step, totalSteps - 1))),
    reset: () => setCurrentStep(0),
  };
}
```

**`renderHook` test — tests the contract, not the implementation:**

```tsx
import { renderHook, act } from '@testing-library/react';

describe('useMultiStepForm', () => {
  it('starts at step 0', () => {
    const { result } = renderHook(() => useMultiStepForm(3));
    expect(result.current.currentStep).toBe(0);
    expect(result.current.isFirstStep).toBe(true);
  });

  it('advances to next step', () => {
    const { result } = renderHook(() => useMultiStepForm(3));
    act(() => result.current.next());
    expect(result.current.currentStep).toBe(1);
  });

  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useMultiStepForm(3));
    act(() => { result.current.next(); result.current.next(); result.current.next(); });
    expect(result.current.currentStep).toBe(2); // capped at totalSteps - 1
    expect(result.current.isLastStep).toBe(true);
  });
});
```

The tests make no assumptions about how `currentStep` is stored internally. If you replace `useState` with `useReducer`, all tests still pass — the contract is stable.

---

## Worked Example: Pattern Selection for a Command Palette

**Feature requirement:** A command palette (⌘K menu) that:
- Can be opened from anywhere in the app
- Shows a searchable list of actions
- Keyboard-navigable (↑↓ to move, Enter to execute, Escape to close)
- Visually customizable per product area

**Step 1: Identify the constraints.**
- Open state is global (triggered from anywhere) → not a compound component concern.
- Keyboard navigation + ARIA + search filtering = complex behavior → headless hook candidate.
- Visual customization required → headless separates behavior from rendering.
- Must escape stacking contexts → Portal.

**Step 2: Select patterns.**

```
useCommandPalette()    → headless hook (behavior, keyboard nav, search, ARIA props)
<CommandPalettePortal> → Portal (escapes stacking context)
Compound components    → CommandPalette.Input, CommandPalette.List, CommandPalette.Item
                         (layout flexibility for consumers)
Global open state      → Zustand (cross-cutting, triggered from anywhere)
```

**Step 3: Sketch the architecture.**

```tsx
function useCommandPalette(commands: Command[]) {
  const [query, setQuery]       = useState('');
  const [activeIndex, setIndex] = useState(0);

  const filtered = useMemo(
    () => commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query]
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex(i => Math.min(i + 1, filtered.length - 1));
    if (e.key === 'ArrowUp')   setIndex(i => Math.max(i - 1, 0));
    if (e.key === 'Enter')     filtered[activeIndex]?.execute();
  };

  return {
    query, setQuery, filtered, activeIndex,
    getInputProps:   () => ({ value: query, onChange: (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), onKeyDown: handleKeyDown }),
    getItemProps:    (index: number) => ({ 'aria-selected': index === activeIndex, onClick: () => filtered[index]?.execute() }),
    getListboxProps: () => ({ role: 'listbox' as const }),
  };
}
```

**Conclusion:** Each pattern is selected for a concrete reason. The headless hook owns the hard parts (keyboard nav, ARIA, filtering). The Portal owns the DOM placement. Compound components own layout flexibility. Global store owns cross-cutting open state.

---

## Common Errors

> ⚠️ **Error 1: Compound components without Context error guards**
> If `<Tabs.Tab>` can be rendered outside `<Tabs>`, it will silently receive `undefined` context and fail in a confusing way. Always throw a descriptive error in the consuming hook: `if (!ctx) throw new Error('<Tabs.Tab> must be used within <Tabs>')`.

> ⚠️ **Error 2: Headless hooks that leak internal state**
> Returning raw `setActiveIndex` from a headless hook gives consumers the power to put it in invalid states. Return prop getters and named action functions only — never raw setters.

> ⚠️ **Error 3: Portals without focus management**
> A modal that doesn't trap focus lets keyboard users tab out of it into background content — a critical accessibility failure. This is not optional: WCAG 2.1 criterion 2.1.2 (No Keyboard Trap) and the ARIA modal pattern both require focus containment.

> ⚠️ **Error 4: HOC stacking**
> `withAuth(withAnalytics(withErrorBoundary(Dashboard)))` creates a deeply nested component tree, makes DevTools debugging painful, and can cause prop collisions. Prefer a single HOC that composes the concerns, or replace with hooks where possible.

> ⚠️ **Error 5: Premature abstraction into compound components**
> If a widget's internal layout never changes, a compound component adds indirection with no flexibility benefit. The rule: abstract when you have two concrete use cases with genuinely different layout requirements, not speculatively.

---

## Practical Activity

**Exercise: Pattern Identification and Refactor**

Given this monolithic component:

```tsx
function UserDropdown({ userId }: { userId: UserId }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const user = useUser(userId);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const items = [
    { label: 'Profile',   action: () => navigate('/profile') },
    { label: 'Settings',  action: () => navigate('/settings') },
    { label: 'Log out',   action: logout },
  ];

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <img src={user.avatarUrl} alt={user.name} />
      </button>
      {open && (
        <ul role="menu">
          {items.map((item, i) => (
            <li
              key={item.label}
              role="menuitem"
              aria-selected={i === activeIndex}
              onClick={item.action}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

1. Extract the behavior (open state, active index, keyboard nav, ARIA props) into a `useDropdown` headless hook with prop getters.
2. Extract the data fetching (`useUser`, `useAuth`, `useNavigate`) into a `useUserDropdownData` hook.
3. Rewrite `UserDropdown` as a presentational component that composes both hooks.
4. Write two `renderHook` tests for `useDropdown`: one for initial state, one for keyboard navigation.

---

## Quiz

**Multiple Choice**

**Q1.** A `<Menu>` compound component's `<Menu.Item>` is accidentally rendered outside any `<Menu>` parent. What is the correct defensive behavior?

A) Render with default props silently.
B) Return `null` to avoid a crash.
C) Throw a descriptive error identifying that `<Menu.Item>` requires a `<Menu>` ancestor.
D) Log a console warning and render with fallback styles.

**Answer: C.** An explicit error with a clear message is always preferable to silent failure. The error should appear in development immediately, preventing the misuse from shipping.

---

**Q2.** Which of these is a correct reason to use a React Portal?

A) To share state between two sibling components without prop drilling.
B) To render a modal outside of a parent element that has `overflow: hidden` applied.
C) To lazy-load a component only when it's first needed.
D) To prevent a component from re-rendering when its parent re-renders.

**Answer: B.** Portals render a component's DOM output into a different node, escaping the CSS stacking context of the ancestor tree. `overflow: hidden` and `transform` on ancestors create stacking contexts that clip or misposition absolutely positioned children.

---

**Short Answer**

**Q3.** What is the difference between a headless component and a presentational component? Why is the distinction architecturally important?

*Model answer:* A presentational component has no behavior — it receives props and renders markup. A headless component has no markup — it owns behavior, state, and accessibility logic, and returns prop getters or render props for the consumer to apply to their own elements. The distinction matters because headless components allow the same behavior to be applied to completely different visual implementations, and allow behavior to be tested independently of any visual rendering.

---

**Q4.** Why should a headless hook return prop getter functions (e.g., `getMenuProps()`) rather than raw state values and setters?

*Model answer:* Prop getters bundle related attributes (event handlers, ARIA attributes, role) into a single spread — the consumer doesn't need to know which attributes are required or how they interact. Raw setters expose internal state management to the consumer, enabling them to create invalid states the hook doesn't account for. Prop getters enforce the behavioral contract while keeping the implementation encapsulated.

---

## Retrieval Cues

1. What problem does the compound component pattern solve that props alone cannot?
2. Name three accessibility requirements that belong at the Portal/Modal component level, not the consumer level.
3. What is the modern equivalent of the container component in the hooks era?
4. When does the HOC pattern still make sense over a custom hook?

---

## Spaced Repetition Schedule

| Item | Review 1 | Review 2 | Review 3 |
|------|----------|----------|----------|
| Compound component: Context + error guard pattern | Day 1 | Day 3 | Day 7 |
| Headless hook: prop getter pattern | Day 1 | Day 4 | Day 10 |
| Portal: stacking context and when it's necessary | Day 2 | Day 5 | Day 14 |
| HOC: remaining valid use cases | Day 2 | Day 6 | Day 14 |
| Hook contract: `renderHook` test structure | Day 3 | Day 7 | Day 21 |
| Pattern selection criteria | Day 3 | Day 8 | Day 21 |

---

## Transfer Exercise

**Domain: Data visualization dashboard for a logistics company (not a SaaS product UI)**

A logistics analytics tool needs:
- A chart type selector (bar, line, scatter) that can appear as a radio button group on desktop and a bottom sheet on mobile — same behavior, different presentation.
- A "drill-down" overlay that shows detail data when a chart segment is clicked — must escape the chart's SVG/canvas stacking context.
- A filter panel with nested region → country → city selectors that share selection state.

1. For the chart type selector: which pattern best fits the "same behavior, different presentation" requirement? Sketch the hook's public interface.
2. For the drill-down overlay: why is a Portal required here specifically? What would go wrong without one?
3. For the filter panel: is this a compound component use case, a Context use case, or both? Draw the component tree and mark where state lives.
4. For any of the three: write a `renderHook` test outline that verifies the behavioral contract without depending on visual implementation.

---

## Self-Guided Exercise

Find a UI component in a codebase you work with that mixes behavior and presentation in a single component — a dropdown, a modal trigger, a multi-select, or similar. Refactor it:

1. Extract all behavior (open/close state, keyboard navigation, ARIA attributes) into a headless hook with prop getters.
2. Reduce the component itself to a pure presentational layer that spreads the prop getters.
3. Write at least two `renderHook` tests for the headless hook covering: initial state, and one user interaction (open, select, close).
4. Verify that changing the visual markup of the component requires zero changes to the hook and zero changes to the tests.

Note any ARIA attributes or keyboard handlers you discover are missing in the original implementation.
