---
id: rule-react-no-effects
c3-seal: 221b4e32b4e4bba729ab93ff9642c0fc9e1b9d47a7f9d034e78a809cfd686ea3
title: react-no-effects
type: rule
goal: Keep React components declarative by treating Effects as a last-resort escape hatch for external-system synchronization only, and by giving Tinkaria a concrete replacement path for each common Effect misuse.
---

## Goal

Keep React components declarative by treating Effects as a last-resort escape hatch for external-system synchronization only, and by giving Tinkaria a concrete replacement path for each common Effect misuse.

## Rule

In client React code, do not use `useEffect` or `useLayoutEffect` for derived data, cascading state updates, prop-to-state resets, or user-event workflows.

Use this replacement matrix instead:

- render-time derivation for values computable from current props/state
- `useMemo` only for measured expensive pure calculations
- keyed remounts for identity resets
- event handlers for user-caused workflows
- Zustand for shared client/app UI state and local workflow state machines
- `useSyncExternalStore` or a dedicated adapter hook for external subscriptions
- explicit fetch helpers for pull-based remote server state unless TanStack Query is deliberately adopted later
Effects are allowed only when synchronizing with an external system outside React and the matrix above cannot express the behavior.

## Golden Example

```tsx
function ProfileName({ firstName, lastName }: { firstName: string; lastName: string }) {
  const fullName = `${firstName} ${lastName}`
  return <span>{fullName}</span>
}

function ChatRoute({ chatId }: { chatId: string }) {
  return <ChatComposer key={chatId} chatId={chatId} />
}

function SendButton({ send }: { send: (message: string) => Promise<void> }) {
  const [message, setMessage] = useState("")

  async function handleSubmit() {
    await send(message)
    setMessage("")
  }

  return <button onClick={handleSubmit}>Send</button>
}

function useSocketStatus(socket: TinkariaTransport) {
  return useSyncExternalStore(socket.onStatus, socket.getStatus, socket.getStatus)
}
```

Repo-specific interpretation:

- Zustand is the default home for shared browser-side state that outlives one component or coordinates multiple components.
- `useSyncExternalStore` is preferred when adapting sockets, media queries, browser APIs, or other external emitters.
- TanStack Query is not a generic state manager. If adopted later, it owns pull-based HTTP-style server state, not NATS push state or local UI state.
- Boundary-only synchronization may still justify an Effect in a dedicated adapter hook/component for browser subscriptions, imperative widgets, layout measurement that CSS cannot express, or imperative subsystem lifecycles such as xterm.js.
Every allowed Effect must answer:

1. What external system is being synchronized?
2. Why can this not be expressed during render, by a key, in an event handler, in Zustand, or via a subscription API?
3. What cleanup restores symmetry on unmount or dependency change?

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| useEffect(() => setFiltered(getFiltered(items, query)), [items, query]) | derive during render or use measured useMemo | Mirrors derived data into state and forces an extra render pass |
| useEffect(() => setDraft(""), [chatId]) | remount stateful subtree with key={chatId} | Resets after commit instead of making identity explicit |
| useEffect(() => { if (shouldSubmit) post(payload) }, [shouldSubmit, payload]) | call post(payload) in submit handler | Event logic belongs to the event that caused it |
| chained Effects that update the next state variable | calculate next state in one event handler, reducer, or Zustand action | Creates fragile cascading renders and temporal coupling |
| component-local Effect subscriptions for shared app state | useSyncExternalStore, Zustand selectors, or one adapter hook | Reimplements store wiring and hides ownership |
| using TanStack Query for local dialog state, socket push state, or composer drafts | component state, Zustand, or useSyncExternalStore | Query libraries solve remote server-state caching, not local UI orchestration |

## Scope

Applies to all browser React modules under `src/client/**/*.ts` and `src/client/**/*.tsx`, including hooks. Tinkaria already uses Zustand and does not ship TanStack Query. Until that changes, pull-based remote server state should stay in explicit fetch helpers or be introduced alongside a deliberate Query adoption decision.

## Override

An override is allowed only for true external-system synchronization. Keep it in the smallest possible adapter hook or boundary component, document the external system in a short comment above the Effect, and prefer `useLayoutEffect` only when DOM measurement or pre-paint mutation is strictly required. If the code is responding to a user action, deriving data from existing state/props, repairing local state after render, or modeling browser-side workflow state, the override is invalid.
