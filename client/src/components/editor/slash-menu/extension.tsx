import { Prec } from "@codemirror/state"
import {
  EditorView,
  ViewPlugin,
  keymap,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view"
import { createRoot, type Root } from "react-dom/client"

import type { SQLNamespace } from "@shared/types"

import { flattenSchema } from "@/lib/schema/flatten"
import { statementAtCursor } from "@/lib/sql/statement-at-cursor"

import {
  aliasForTable,
  detectMenuContext,
  generateAlias,
  isAtAnchorPosition,
  isInFromOrJoinContext,
  parseFromRefs,
  resolveAliasOrTable,
  takenAliases,
  type MenuContext,
} from "./aliasing"
import { entryLeaf, resolveInsert, type MenuEntry } from "./entries"
import { SlashMenu } from "./SlashMenu"
import { SQL_EXTRAS } from "./sql-extras"
import {
  menuField,
  readFilter,
  setMenuState,
  type MenuState,
} from "./state"

function buildEntries(schema: SQLNamespace): MenuEntry[] {
  const schemaEntries: MenuEntry[] = flattenSchema(schema).map((e) => ({
    kind: e.kind,
    label: e.qualified,
    insert: e.qualified,
    detail: e.kind,
    table: e.table,
  }))
  return [...schemaEntries, ...SQL_EXTRAS]
}

// Pre-filter entries by SQL position:
//   table-context      → only tables
//   expression-context → everything except tables (you almost never want
//                        a bare table reference outside FROM/JOIN)
function entriesForContext(
  entries: MenuEntry[],
  context: MenuContext,
): MenuEntry[] {
  if (context === "table") return entries.filter((e) => e.kind === "table")
  return entries.filter((e) => e.kind !== "table")
}

// When the menu is in qualifier mode (`alias.` triggered), surface only
// the columns of the resolved table and present them as bare leaf names
// so the row reads "email" rather than "public.fork_users.email".
function qualifiedColumnEntries(
  entries: MenuEntry[],
  table: string,
): MenuEntry[] {
  const target = table.toLowerCase()
  const out: MenuEntry[] = []
  for (const e of entries) {
    if (e.kind !== "column") continue
    if ((e.table ?? "").toLowerCase() !== target) continue
    const leaf = e.label.split(".").pop() ?? e.label
    out.push({
      kind: "column",
      label: leaf,
      insert: leaf,
      detail: e.table,
      table: e.table,
    })
  }
  return out
}

// Rank tiers, best first:
//   exact     — leaf equals filter (e.g. "in" → IN operator)
//   prefix    — leaf starts with filter
//   leafHit   — leaf contains filter
//   labelHit  — label contains filter (catches things like "user_id" via "id")
// Ties within a tier preserve insertion order so layout stays stable
// across keystrokes.
function filterEntries(pool: MenuEntry[], filter: string): MenuEntry[] {
  if (filter === "") return pool
  const q = filter.toLowerCase()
  const exact: MenuEntry[] = []
  const prefix: MenuEntry[] = []
  const leafHit: MenuEntry[] = []
  const labelHit: MenuEntry[] = []
  for (const e of pool) {
    const leaf = entryLeaf(e).toLowerCase()
    const label = e.label.toLowerCase()
    if (leaf === q) {
      exact.push(e)
      continue
    }
    if (leaf.startsWith(q)) {
      prefix.push(e)
      continue
    }
    if (leaf.includes(q)) {
      leafHit.push(e)
      continue
    }
    if (label.includes(q)) {
      labelHit.push(e)
    }
  }
  return [...exact, ...prefix, ...leafHit, ...labelHit]
}

/**
 * Resolve the active pool of entries for the menu, accounting for both
 * SQL position (table vs expression) and qualifier mode (the user typed
 * `<alias>.` so we should show only that table's columns).
 *
 * Returns the qualifier table if we entered qualifier mode, otherwise
 * `null` — callers use this to skip alias rewriting on accept.
 */
function entriesForMenu(
  entries: MenuEntry[],
  view: EditorView,
  menu: MenuState,
): { pool: MenuEntry[]; qualifier: string | null } {
  const qualifier = resolveQualifier(view, menu)
  if (qualifier) {
    return { pool: qualifiedColumnEntries(entries, qualifier), qualifier }
  }
  const ctx = contextFor(view, menu)
  return { pool: entriesForContext(entries, ctx), qualifier: null }
}

function contextFor(view: EditorView, menu: MenuState): MenuContext {
  const doc = view.state.doc.toString()
  const stmt = statementAtCursor(doc, menu.startPos)
  const stmtStart = stmt?.from ?? 0
  return detectMenuContext(doc.slice(stmtStart, menu.startPos))
}

/**
 * If the doc immediately before `menu.startPos` is `<ident>.`, and
 * `<ident>` resolves to an alias or table in the current statement's
 * FROM/JOIN, return the qualified table. Otherwise `null`.
 */
function resolveQualifier(view: EditorView, menu: MenuState): string | null {
  if (menu.hasSlash) return null
  if (menu.startPos === 0) return null
  const doc = view.state.doc.toString()
  if (doc[menu.startPos - 1] !== ".") return null
  let identStart = menu.startPos - 1
  while (identStart > 0 && /\w/.test(doc[identStart - 1])) identStart -= 1
  const identEnd = menu.startPos - 1
  if (identStart === identEnd) return null
  const ident = doc.slice(identStart, identEnd)
  const stmt = statementAtCursor(doc, menu.startPos)
  if (!stmt) return null
  return resolveAliasOrTable(parseFromRefs(stmt.sql), ident)
}

function pick(
  view: EditorView,
  entry: MenuEntry,
  menu: MenuState,
  qualifier: string | null,
) {
  const { text, cursorOffset } = resolveAccept(view, entry, menu, qualifier)
  view.dispatch({
    changes: {
      from: menu.startPos,
      to: view.state.selection.main.head,
      insert: text,
    },
    selection: { anchor: menu.startPos + cursorOffset },
    effects: setMenuState.of(null),
  })
  view.focus()
}

// Decide what to actually insert. Four cases:
//   1. Qualifier mode (`alias.` triggered) → entry.insert is already a
//      bare leaf; insert as-is (no alias rewriting — alias is in doc).
//   2. Table in FROM/JOIN position → "public.users u" (alias appended).
//   3. Column whose parent table has an alias in scope → "u.email".
//   4. Everything else → the entry's own insert template (with `$|`).
function resolveAccept(
  view: EditorView,
  entry: MenuEntry,
  menu: MenuState,
  qualifier: string | null,
): { text: string; cursorOffset: number } {
  if (qualifier) return resolveInsert(entry.insert)

  const doc = view.state.doc.toString()
  const stmt = statementAtCursor(doc, menu.startPos)
  if (stmt) {
    const refs = parseFromRefs(stmt.sql)

    if (entry.kind === "table") {
      const beforeStart = doc.slice(stmt.from, menu.startPos)
      if (isInFromOrJoinContext(beforeStart)) {
        const taken = takenAliases(refs)
        const alias = generateAlias(entry.label, taken)
        const text = `${entry.label} ${alias}`
        return { text, cursorOffset: text.length }
      }
    }

    if (entry.kind === "column" && entry.table) {
      const alias = aliasForTable(refs, entry.table)
      if (alias) {
        const leaf = entry.label.split(".").pop() ?? entry.label
        const text = `${alias}.${leaf}`
        return { text, cursorOffset: text.length }
      }
    }
  }
  return resolveInsert(entry.insert)
}

const WORD = /\w/

function findWordStart(view: EditorView, head: number): number {
  let pos = head
  while (pos > 0 && WORD.test(view.state.doc.sliceString(pos - 1, pos))) {
    pos -= 1
  }
  return pos
}

export function slashMenuExtension(schema: SQLNamespace) {
  const entries = buildEntries(schema)

  const menuKeymap = Prec.highest(
    keymap.of([
      {
        key: "/",
        run: (view) => {
          // Atomic: insert the slash AND mark the menu open in one
          // transaction so the StateField sees both at once. Without
          // this, an `update` between the insert and the effect could
          // close the menu immediately.
          const head = view.state.selection.main.head
          const before =
            head > 0 ? view.state.doc.sliceString(head - 1, head) : ""
          if (before !== "" && !/[\s(]/.test(before)) return false
          if (entries.length === 0) return false
          view.dispatch({
            changes: { from: head, insert: "/" },
            selection: { anchor: head + 1 },
            effects: setMenuState.of({
              startPos: head,
              hasSlash: true,
              selectedIndex: 0,
            }),
          })
          return true
        },
      },
      {
        key: "ArrowDown",
        run: (view) => moveSelection(view, entries, 1),
      },
      {
        key: "ArrowUp",
        run: (view) => moveSelection(view, entries, -1),
      },
      {
        key: "Enter",
        run: (view) => {
          const menu = view.state.field(menuField)
          if (!menu) return false
          const { pool, qualifier } = entriesForMenu(entries, view, menu)
          const matches = filterEntries(pool, readFilter(view, menu))
          const choice = matches[menu.selectedIndex] ?? matches[0]
          if (!choice) {
            view.dispatch({ effects: setMenuState.of(null) })
            return true
          }
          pick(view, choice, menu, qualifier)
          return true
        },
      },
      {
        key: "Tab",
        run: (view) => {
          // Tab also accepts — same as Enter — but only when the menu owns
          // the keystroke. Otherwise pass through so indent / snippet
          // behaviour is unaffected.
          const menu = view.state.field(menuField)
          if (!menu) return false
          const { pool, qualifier } = entriesForMenu(entries, view, menu)
          const matches = filterEntries(pool, readFilter(view, menu))
          const choice = matches[menu.selectedIndex] ?? matches[0]
          if (!choice) return false
          pick(view, choice, menu, qualifier)
          return true
        },
      },
      {
        key: "Escape",
        run: (view) => {
          if (!view.state.field(menuField)) return false
          view.dispatch({ effects: setMenuState.of(null) })
          return true
        },
      },
    ]),
  )

  // Auto-trigger: open the menu in two situations when it's currently
  // closed, both restricted to `input.type` so paste/cut/programmatic
  // edits don't pop the menu open:
  //
  // 1. The user just typed the *first* character of a new identifier
  //    (head - wordStart === 1) → anchor there and let further keystrokes
  //    filter. Restricting to the first character keeps the menu from
  //    popping open when the user is editing an existing identifier
  //    mid-word (e.g. clicking into `user_id` and typing).
  // 2. The user typed a "trigger" char (space, comma, paren) right after
  //    an anchor keyword (FROM, JOIN, WHERE, …) → anchor at the cursor
  //    with no filter, so the menu opens immediately at "select * from |".
  const autoTrigger = EditorView.updateListener.of((u) => {
    if (!u.docChanged) return
    if (!u.transactions.some((tr) => tr.isUserEvent("input.type"))) return
    if (u.state.field(menuField)) return
    if (entries.length === 0) return
    const sel = u.state.selection.main
    if (!sel.empty) return
    const head = sel.head

    const wordStart = findWordStart(u.view, head)
    const startedNewWord = head - wordStart === 1
    let nextStart: number | null = null

    if (startedNewWord) {
      nextStart = wordStart
    } else if (head > 0) {
      const docStr = u.state.doc.toString()
      const lastChar = docStr[head - 1]
      if (/[\s,(]/.test(lastChar)) {
        const lookback = docStr.slice(Math.max(0, head - 80), head)
        if (isAtAnchorPosition(lookback)) nextStart = head
      } else if (lastChar === ".") {
        // `<alias>.` — qualifier mode. Only open if the identifier just
        // before the dot resolves to a FROM/JOIN ref in the current
        // statement, otherwise we'd pop the menu open after every
        // unrelated dot.
        let identEnd = head - 1
        let identStart = identEnd
        while (identStart > 0 && /\w/.test(docStr[identStart - 1])) {
          identStart -= 1
        }
        if (identStart < identEnd) {
          const ident = docStr.slice(identStart, identEnd)
          const stmt = statementAtCursor(docStr, head)
          if (stmt) {
            const refs = parseFromRefs(stmt.sql)
            if (resolveAliasOrTable(refs, ident)) nextStart = head
          }
        }
      }
    }
    if (nextStart === null) return

    // Dispatching from inside an updateListener must be deferred; CM will
    // ignore a direct dispatch and warn.
    const start = nextStart
    queueMicrotask(() => {
      if (u.view.state.field(menuField)) return
      const liveHead = u.view.state.selection.main.head
      // Re-validate: word-char triggers must still be inside a word;
      // anchor triggers must still be at the cursor head.
      const liveWordStart = findWordStart(u.view, liveHead)
      const liveInWord = liveWordStart < liveHead
      const liveStart = liveInWord ? liveWordStart : liveHead
      if (liveStart !== start) return
      u.view.dispatch({
        effects: setMenuState.of({
          startPos: liveStart,
          hasSlash: false,
          selectedIndex: 0,
        }),
      })
    })
  })

  const viewPlugin = ViewPlugin.fromClass(
    class implements PluginValue {
      container: HTMLDivElement
      root: Root
      view: EditorView
      pendingRender = false
      destroyed = false
      onScroll = () => this.scheduleRender()
      onResize = () => this.scheduleRender()

      constructor(view: EditorView) {
        this.view = view
        this.container = document.createElement("div")
        this.container.style.position = "fixed"
        this.container.style.zIndex = "50"
        this.container.style.display = "none"
        document.body.appendChild(this.container)
        this.root = createRoot(this.container)
        view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true })
        window.addEventListener("resize", this.onResize)
        this.scheduleRender()
      }

      update(update: ViewUpdate) {
        const before = update.startState.field(menuField)
        const after = update.state.field(menuField)
        if (before === after && !update.docChanged && !update.viewportChanged) return
        this.scheduleRender()
      }

      // CodeMirror disallows layout reads (`coordsAtPos`) inside `update`.
      // Queue the actual render into a measure callback so it runs after the
      // current transaction finishes, with the view in a safe state.
      scheduleRender() {
        if (this.pendingRender || this.destroyed) return
        this.pendingRender = true
        // queueMicrotask drains after the current transaction commits, so
        // `coordsAtPos` is safe to call (no "Reading the editor layout
        // isn't allowed during an update"). requestMeasure would also
        // work but its callbacks are only flushed during CM's layout
        // cycle, which doesn't fire for fully programmatic dispatches.
        queueMicrotask(() => {
          this.pendingRender = false
          if (this.destroyed) return
          const menu = this.view.state.field(menuField)
          if (!menu) {
            this.draw(null)
            return
          }
          const coords = this.view.coordsAtPos(menu.startPos)
          this.draw(coords)
        })
      }

      draw(coords: { left: number; bottom: number } | null) {
        const menu = this.view.state.field(menuField)
        if (!menu || !coords) {
          this.container.style.display = "none"
          this.root.render(null)
          return
        }
        const filter = readFilter(this.view, menu)
        const { pool, qualifier } = entriesForMenu(entries, this.view, menu)
        const matches = filterEntries(pool, filter)
        const selectedIndex = matches.length
          ? Math.min(menu.selectedIndex, matches.length - 1)
          : 0
        this.container.style.display = "block"
        // coordsAtPos returns viewport coords, so fixed-position lines up
        // without subtracting the editor rect.
        this.container.style.left = `${coords.left}px`
        this.container.style.top = `${coords.bottom + 2}px`
        this.root.render(
          <SlashMenu
            entries={matches}
            selectedIndex={selectedIndex}
            onPick={(entry) => pick(this.view, entry, menu, qualifier)}
            onHover={(index) => {
              // Bail if nothing actually changes — otherwise React's
              // commit -> CM dispatch -> ViewPlugin render -> React commit
              // can re-fire onMouseEnter on the same element and loop.
              const live = this.view.state.field(menuField)
              if (!live || live.selectedIndex === index) return
              this.view.dispatch({
                effects: setMenuState.of({ ...live, selectedIndex: index }),
              })
            }}
          />,
        )
      }

      destroy() {
        // Mark destroyed first so any in-flight measure callback bails
        // before touching the unmounted React root.
        this.destroyed = true
        this.view.scrollDOM.removeEventListener("scroll", this.onScroll)
        window.removeEventListener("resize", this.onResize)
        // React forbids synchronous root.unmount() during a parent commit
        // (e.g. when this ViewPlugin is being torn down because the parent
        // <CodeMirrorEditor> is unmounting). Defer to the next microtask so
        // the unmount happens after the in-flight commit settles.
        const root = this.root
        const container = this.container
        queueMicrotask(() => {
          root.unmount()
          container.remove()
        })
      }
    },
  )

  return [menuField, menuKeymap, autoTrigger, viewPlugin]
}

function moveSelection(
  view: EditorView,
  entries: MenuEntry[],
  delta: number,
): boolean {
  const menu = view.state.field(menuField)
  if (!menu) return false
  const { pool } = entriesForMenu(entries, view, menu)
  const matches = filterEntries(pool, readFilter(view, menu))
  if (matches.length === 0) return true
  const next =
    (((menu.selectedIndex + delta) % matches.length) + matches.length) %
    matches.length
  view.dispatch({
    effects: setMenuState.of({ ...menu, selectedIndex: next }),
  })
  return true
}
