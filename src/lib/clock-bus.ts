// Lightweight bridge so the command palette / `B` key can toggle the clock without
// lifting useClock into a global provider (see docs/adr/0001). When already on the
// dashboard, fire the event (the dashboard listens). From another route, mark the
// intent and navigate — the dashboard consumes it on mount. Module state survives
// client navigations (same JS context), so no storage is needed.

export const CLOCK_TOGGLE_EVENT = 'archtime:clock-toggle'

let pending = false

export function fireClockToggle(): void {
  window.dispatchEvent(new CustomEvent(CLOCK_TOGGLE_EVENT))
}

export function setPendingClockToggle(): void {
  pending = true
}

export function consumePendingClockToggle(): boolean {
  const value = pending
  pending = false
  return value
}
