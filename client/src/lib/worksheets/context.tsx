import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import type { Session, SQLNamespace, WorksheetMeta } from "@shared/types"
import { api } from "./api"
import {
  WorksheetsContext,
  type FileState,
  type WorksheetsContextValue,
} from "./context-object"

const EMPTY_SESSION: Session = { openTabs: [], activeSlug: null }

export function WorksheetsProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<Record<string, FileState>>({})
  const [list, setList] = useState<WorksheetMeta[]>([])
  const [session, setSession] = useState<Session>(EMPTY_SESSION)
  const [schema, setSchema] = useState<SQLNamespace>({})
  const [loading, setLoading] = useState(true)

  // Bootstrap: load list, session, schema; hydrate each open tab.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [wsList, sess, sch] = await Promise.all([
        api.listWorksheets(),
        api.getSession(),
        api.getSchema(),
      ])
      if (cancelled) return
      setList(wsList)
      setSession(sess)
      setSchema(sch)

      const slugs = sess.openTabs.map((t) => t.slug)
      const hydrated = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const p = await api.getWorksheet(slug)
            return [slug, fileFromPayload(p)] as const
          } catch {
            return null
          }
        }),
      )
      if (cancelled) return
      const next: Record<string, FileState> = {}
      for (const entry of hydrated) if (entry) next[entry[0]] = entry[1]
      setFiles(next)

      // Drop any tabs that failed to load (file deleted out-of-band)
      const liveTabs = sess.openTabs.filter((t) => next[t.slug])
      if (liveTabs.length !== sess.openTabs.length) {
        const activeSlug = sess.activeSlug && next[sess.activeSlug] ? sess.activeSlug : (liveTabs[0]?.slug ?? null)
        setSession({ openTabs: liveTabs, activeSlug })
      }

      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced persistence of session
  const sessionRef = useRef(session)
  sessionRef.current = session
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueSessionWrite = useCallback(() => {
    if (sessionTimer.current) clearTimeout(sessionTimer.current)
    sessionTimer.current = setTimeout(() => {
      void api.putSession(sessionRef.current)
    }, 600)
  }, [])
  useEffect(() => {
    if (loading) return
    queueSessionWrite()
  }, [session, loading, queueSessionWrite])

  // Debounced per-slug draft writers
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const queueDraftWrite = useCallback((slug: string, content: string) => {
    const existing = draftTimers.current[slug]
    if (existing) clearTimeout(existing)
    draftTimers.current[slug] = setTimeout(() => {
      void api.putDraft(slug, content)
    }, 400)
  }, [])
  const cancelDraftTimer = useCallback((slug: string) => {
    const t = draftTimers.current[slug]
    if (t) {
      clearTimeout(t)
      delete draftTimers.current[slug]
    }
  }, [])

  const refreshList = useCallback(async () => {
    setList(await api.listWorksheets())
  }, [])

  const refreshSchema = useCallback(async () => {
    setSchema(await api.getSchema())
  }, [])

  const openTab = useCallback(
    async (slug: string) => {
      if (!files[slug]) {
        const payload = await api.getWorksheet(slug)
        setFiles((f) => ({ ...f, [slug]: fileFromPayload(payload) }))
      }
      setSession((s) => {
        const exists = s.openTabs.some((t) => t.slug === slug)
        const openTabs = exists
          ? s.openTabs
          : [...s.openTabs, { slug, cursor: { line: 0, ch: 0 }, scrollTop: 0 }]
        return { openTabs, activeSlug: slug }
      })
    },
    [files],
  )

  const closeTab = useCallback((slug: string) => {
    cancelDraftTimer(slug)
    setSession((s) => {
      const openTabs = s.openTabs.filter((t) => t.slug !== slug)
      const activeSlug =
        s.activeSlug === slug ? (openTabs[openTabs.length - 1]?.slug ?? null) : s.activeSlug
      return { openTabs, activeSlug }
    })
    setFiles((f) => {
      const { [slug]: _drop, ...rest } = f
      void _drop
      return rest
    })
  }, [cancelDraftTimer])

  const setActive = useCallback((slug: string | null) => {
    setSession((s) => ({ ...s, activeSlug: slug }))
  }, [])

  const updateBuffer = useCallback(
    (slug: string, content: string) => {
      setFiles((f) => {
        const cur = f[slug]
        if (!cur || cur.buffer === content) return f
        return { ...f, [slug]: { ...cur, buffer: content } }
      })
      queueDraftWrite(slug, content)
    },
    [queueDraftWrite],
  )

  const updateCursor = useCallback(
    (slug: string, cursor: CursorPos, scrollTop: number) => {
      setSession((s) => {
        const idx = s.openTabs.findIndex((t) => t.slug === slug)
        if (idx === -1) return s
        const prev = s.openTabs[idx]
        if (
          prev.cursor.line === cursor.line &&
          prev.cursor.ch === cursor.ch &&
          prev.scrollTop === scrollTop
        ) {
          return s
        }
        const openTabs = [...s.openTabs]
        openTabs[idx] = { slug, cursor, scrollTop }
        return { ...s, openTabs }
      })
    },
    [],
  )

  const save = useCallback(async (slug: string) => {
    const cur = filesRef.current[slug]
    if (!cur) return
    const content = cur.buffer
    const meta = await api.saveWorksheet(slug, content)
    await api.deleteDraft(slug)
    setFiles((f) => {
      const c = f[slug]
      if (!c) return f
      return { ...f, [slug]: { ...c, content, draftOnDisk: null, lastSavedAt: Date.now(), meta } }
    })
    setList((l) => {
      const others = l.filter((m) => m.slug !== slug)
      return [meta, ...others]
    })
  }, [])

  const restoreDraft = useCallback((slug: string) => {
    setFiles((f) => {
      const cur = f[slug]
      if (!cur || cur.draftOnDisk == null) return f
      return { ...f, [slug]: { ...cur, buffer: cur.draftOnDisk } }
    })
  }, [])

  const discardDraft = useCallback(async (slug: string) => {
    await api.deleteDraft(slug)
    setFiles((f) => {
      const cur = f[slug]
      if (!cur) return f
      return { ...f, [slug]: { ...cur, buffer: cur.content, draftOnDisk: null } }
    })
  }, [])

  const createWorksheet = useCallback(
    async (name: string) => {
      const meta = await api.createWorksheet(name)
      setList((l) => [meta, ...l.filter((m) => m.slug !== meta.slug)])
      await openTab(meta.slug)
      return meta.slug
    },
    [openTab],
  )

  const deleteWorksheet = useCallback(
    async (slug: string) => {
      cancelDraftTimer(slug)
      await api.deleteWorksheet(slug)
      setList((l) => l.filter((m) => m.slug !== slug))
      closeTab(slug)
    },
    [closeTab, cancelDraftTimer],
  )

  const filesRef = useRef(files)
  filesRef.current = files

  const dirty = useCallback(
    (slug: string) => {
      const cur = files[slug]
      return !!cur && cur.buffer !== cur.content
    },
    [files],
  )

  const value = useMemo<WorksheetsContextValue>(
    () => ({
      files,
      list,
      session,
      schema,
      loading,
      openTab,
      closeTab,
      setActive,
      updateBuffer,
      updateCursor,
      save,
      restoreDraft,
      discardDraft,
      createWorksheet,
      deleteWorksheet,
      refreshList,
      refreshSchema,
      dirty,
    }),
    [
      files,
      list,
      session,
      schema,
      loading,
      openTab,
      closeTab,
      setActive,
      updateBuffer,
      updateCursor,
      save,
      restoreDraft,
      discardDraft,
      createWorksheet,
      deleteWorksheet,
      refreshList,
      refreshSchema,
      dirty,
    ],
  )

  return <WorksheetsContext.Provider value={value}>{children}</WorksheetsContext.Provider>
}

function fileFromPayload(p: { meta: WorksheetMeta; content: string; draftContent: string | null }): FileState {
  return {
    meta: p.meta,
    content: p.content,
    buffer: p.draftContent ?? p.content,
    draftOnDisk: p.draftContent,
    lastSavedAt: 0,
  }
}

