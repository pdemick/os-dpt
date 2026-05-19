// Tiny window-event bridge so detached UI (command palette, future slash
// menu) can ask the active CodeMirror editor to insert text at the cursor.
// The CodeMirrorEditor component subscribes; emitters fire `insert` events.
//
// Going through a global event keeps the editor decoupled from siblings
// without threading refs through every provider.

const INSERT_EVENT = "dpt:editor:insert"

export interface InsertDetail {
  text: string
}

export function emitInsertAtCursor(text: string): void {
  window.dispatchEvent(new CustomEvent<InsertDetail>(INSERT_EVENT, { detail: { text } }))
}

export function onInsertAtCursor(handler: (text: string) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<InsertDetail>).detail
    if (detail && typeof detail.text === "string") handler(detail.text)
  }
  window.addEventListener(INSERT_EVENT, listener)
  return () => window.removeEventListener(INSERT_EVENT, listener)
}
