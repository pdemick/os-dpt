import { useEffect } from "react"

// Cross-view action bus. The global command palette lives at the app shell
// level, but actions like "new editor" or "new connection" need to run inside
// a specific view's providers (WorksheetsProvider, AgentChatProvider, the
// Connections dialog state). The palette navigates to the target view and
// fires an intent; the view consumes it once mounted.
export type AppIntent = "new-editor" | "new-chat" | "new-connection"

type Handler = () => void

const listeners = new Map<AppIntent, Set<Handler>>()
// Intents emitted while no consumer is mounted (i.e. right before navigating
// to the target view) are queued so the consumer can drain them on mount.
const pending = new Map<AppIntent, number>()

export function emitAppIntent(intent: AppIntent): void {
  const set = listeners.get(intent)
  if (set && set.size > 0) {
    set.forEach((h) => h())
    return
  }
  pending.set(intent, (pending.get(intent) ?? 0) + 1)
}

/**
 * Subscribe a view to an intent. Pass a stable `handler` (e.g. via
 * `useCallback`) so it isn't re-subscribed every render. On mount the consumer
 * also drains any intent queued before it existed.
 */
export function useAppIntent(intent: AppIntent, handler: Handler): void {
  useEffect(() => {
    let set = listeners.get(intent)
    if (!set) {
      set = new Set()
      listeners.set(intent, set)
    }
    set.add(handler)

    const queued = pending.get(intent) ?? 0
    if (queued > 0) {
      pending.set(intent, 0)
      for (let i = 0; i < queued; i++) handler()
    }

    return () => {
      set!.delete(handler)
    }
  }, [intent, handler])
}
