import { useCallback, useEffect, useRef } from "react"

/** How close (px) to the bottom still counts as "at the bottom". */
const PIN_THRESHOLD = 40

/**
 * Keeps a scroll container pinned to its bottom as content grows — but only
 * while the user is already at (or near) the bottom. Scrolling up to read
 * earlier content releases the pin so streaming updates don't hijack the
 * scrollbar; scrolling back down re-engages it.
 *
 * Attach `ref` to the scrollable element and `onScroll` to its scroll event;
 * pass the value whose changes should trigger a follow (e.g. the transcript
 * items) as `dep`.
 */
export function useStickToBottom<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null)
  const pinned = useRef(true)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD
  }, [])

  useEffect(() => {
    const el = ref.current
    if (el && pinned.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [dep])

  return { ref, onScroll }
}
