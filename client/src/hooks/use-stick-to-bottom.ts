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
 * items) as `dep`. `resetKey` identifies the conversation being shown (e.g.
 * the session id): when it changes the pin re-engages and the container jumps
 * to the bottom, so a scroll position left in one chat doesn't leak into the
 * next.
 */
export function useStickToBottom<T extends HTMLElement>(dep: unknown, resetKey?: unknown) {
  const ref = useRef<T>(null)
  const pinned = useRef(true)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD
  }, [])

  useEffect(() => {
    pinned.current = true
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [resetKey])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // A container short enough not to scroll can never fire the scroll event
    // that re-engages the pin — re-pin it here so growth resumes following.
    if (el.scrollHeight <= el.clientHeight) pinned.current = true
    if (pinned.current) el.scrollTop = el.scrollHeight
  }, [dep])

  return { ref, onScroll }
}
