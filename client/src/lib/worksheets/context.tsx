import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import type {
  CursorPos,
  QueryResponse,
  Session,
  SQLNamespace,
  TabState,
  WorksheetMeta,
} from "@shared/types"
import { api } from "./api"
import {
  WorksheetsContext,
  type FileState,
  type TabRuntime,
  type WorksheetsContextValue,
} from "./context-object"

const EMPTY_SESSION: Session = { openTabs: [], activeSlug: null, resultsPaneSize: null }

function normalizeTab(t: Partial<TabState> & { slug: string }): TabState {
  return {
    slug: t.slug,
    cursor: t.cursor ?? { line: 0, ch: 0 },
    scrollTop: t.scrollTop ?? 0,
    connectionId: t.connectionId ?? null,
    connectionExplicit: t.connectionExplicit ?? false,
  }
}

function normalizeSession(s: Session): Session {
  return {
    openTabs: (s.openTabs ?? []).map(normalizeTab),
    activeSlug: s.activeSlug ?? null,
    resultsPaneSize: s.resultsPaneSize ?? null,
  }
}

export function WorksheetsProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<Record<string, FileState>>({})
  const [list, setList] = useState<WorksheetMeta[]>([])
  const [session, setSession] = useState<Session>(EMPTY_SESSION)
  const [staticSchema, setStaticSchema] = useState<SQLNamespace>({})
  const [schemasByConn, setSchemasByConn] = useState<Record<string, SQLNamespace>>({})
  const [runtimes, setRuntimes] = useState<Record<string, TabRuntime>>({})
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
      const normalized = normalizeSession(sess)
      setSession(normalized)
      setStaticSchema(sch)

      const slugs = normalized.openTabs.map((t) => t.slug)
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
      const liveTabs = normalized.openTabs.filter((t) => next[t.slug])
      if (liveTabs.length !== normalized.openTabs.length) {
        const activeSlug =
          normalized.activeSlug && next[normalized.activeSlug]
            ? normalized.activeSlug
            : (liveTabs[0]?.slug ?? null)
        setSession((s) => ({ ...s, openTabs: liveTabs, activeSlug }))
      }

      // Preload per-connection schemas for any tabs already bound.
      const connIds = new Set<string>()
      for (const t of liveTabs) if (t.connectionId) connIds.add(t.connectionId)
      if (connIds.size > 0) {
        const loaded = await Promise.all(
          [...connIds].map(async (id) => [id, await api.getConnectionSchema(id)] as const),
        )
        if (!cancelled) {
          setSchemasByConn((prev) => {
            const next: Record<string, SQLNamespace> = { ...prev }
            for (const [id, ns] of loaded) next[id] = ns
            return next
          })
        }
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

  const setHistoryWarning = useCallback(
    (slug: string, warning: FileState["historyWarning"]) => {
      setFiles((f) => {
        const cur = f[slug]
        if (!cur || cur.historyWarning === warning) return f
        return { ...f, [slug]: { ...cur, historyWarning: warning } }
      })
    },
    [],
  )

  // Debounced per-slug draft writers
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const queueDraftWrite = useCallback(
    (slug: string, content: string) => {
      const existing = draftTimers.current[slug]
      if (existing) clearTimeout(existing)
      draftTimers.current[slug] = setTimeout(() => {
        void api.putDraft(slug, content).then((skip) => setHistoryWarning(slug, skip))
      }, 400)
    },
    [setHistoryWarning],
  )
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

  const ensureConnectionSchema = useCallback(async (id: string) => {
    const ns = await api.getConnectionSchema(id)
    setSchemasByConn((prev) => ({ ...prev, [id]: ns }))
    return ns
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
          : [
              ...s.openTabs,
              { slug, cursor: { line: 0, ch: 0 }, scrollTop: 0, connectionId: null },
            ]
        return { ...s, openTabs, activeSlug: slug }
      })
    },
    [files],
  )

  const closeTab = useCallback(
    (slug: string) => {
      cancelDraftTimer(slug)
      setSession((s) => {
        const openTabs = s.openTabs.filter((t) => t.slug !== slug)
        const activeSlug =
          s.activeSlug === slug ? (openTabs[openTabs.length - 1]?.slug ?? null) : s.activeSlug
        return { ...s, openTabs, activeSlug }
      })
      setFiles((f) => {
        const { [slug]: _drop, ...rest } = f
        void _drop
        return rest
      })
      setRuntimes((r) => {
        const { [slug]: _drop, ...rest } = r
        void _drop
        return rest
      })
    },
    [cancelDraftTimer],
  )

  const setActive = useCallback((slug: string | null) => {
    setSession((s) => ({ ...s, activeSlug: slug }))
  }, [])

  const setTabConnection = useCallback(
    (slug: string, connectionId: string | null, opts?: { explicit?: boolean }) => {
      const explicit = opts?.explicit ?? true
      setSession((s) => {
        const idx = s.openTabs.findIndex((t) => t.slug === slug)
        if (idx === -1) return s
        const prev = s.openTabs[idx]
        const nextExplicit = explicit || (prev.connectionExplicit ?? false)
        if (prev.connectionId === connectionId && (prev.connectionExplicit ?? false) === nextExplicit) {
          return s
        }
        const openTabs = [...s.openTabs]
        openTabs[idx] = { ...prev, connectionId, connectionExplicit: nextExplicit }
        return { ...s, openTabs }
      })
      if (connectionId && !schemasByConn[connectionId]) {
        void ensureConnectionSchema(connectionId)
      }
    },
    [ensureConnectionSchema, schemasByConn],
  )

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
        openTabs[idx] = { ...prev, cursor, scrollTop }
        return { ...s, openTabs }
      })
    },
    [],
  )

  const filesRef = useRef(files)
  filesRef.current = files

  const save = useCallback(async (slug: string) => {
    const cur = filesRef.current[slug]
    if (!cur) return
    const content = cur.buffer
    const { historySkipped, ...meta } = await api.saveWorksheet(slug, content)
    await api.deleteDraft(slug)
    setFiles((f) => {
      const c = f[slug]
      if (!c) return f
      return {
        ...f,
        [slug]: {
          ...c,
          content,
          draftOnDisk: null,
          lastSavedAt: Date.now(),
          meta,
          historyWarning: historySkipped,
        },
      }
    })
    setList((l) => {
      const others = l.filter((m) => m.slug !== slug)
      return [meta, ...others]
    })
  }, [])

  const clearHistoryWarning = useCallback(
    (slug: string) => setHistoryWarning(slug, null),
    [setHistoryWarning],
  )

  const createWorksheet = useCallback(
    async (name?: string) => {
      const meta = await api.createWorksheet(name)
      setList((l) => [meta, ...l.filter((m) => m.slug !== meta.slug)])
      await openTab(meta.slug)
      return meta.slug
    },
    [openTab],
  )

  const applyMeta = useCallback((slug: string, meta: WorksheetMeta) => {
    setFiles((f) => {
      const cur = f[slug]
      if (!cur) return f
      return { ...f, [slug]: { ...cur, meta } }
    })
    setList((l) => {
      const idx = l.findIndex((m) => m.slug === slug)
      if (idx === -1) return l
      const next = [...l]
      next[idx] = meta
      return next
    })
  }, [])

  const renameWorksheet = useCallback(
    async (slug: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const meta = await api.renameWorksheet(slug, trimmed)
      applyMeta(slug, meta)
    },
    [applyMeta],
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

  const applyReverted = useCallback((slug: string, content: string) => {
    cancelDraftTimer(slug)
    setFiles((f) => {
      const cur = f[slug]
      if (!cur) return f
      return {
        ...f,
        [slug]: { ...cur, content, buffer: content, draftOnDisk: null, lastSavedAt: Date.now() },
      }
    })
  }, [cancelDraftTimer])

  const activeConnectionId = useMemo(() => {
    const slug = session.activeSlug
    if (!slug) return null
    return session.openTabs.find((t) => t.slug === slug)?.connectionId ?? null
  }, [session.activeSlug, session.openTabs])

  const refreshSchema = useCallback(async () => {
    if (activeConnectionId) {
      const ns = await api.refreshConnectionSchema(activeConnectionId)
      setSchemasByConn((prev) => ({ ...prev, [activeConnectionId]: ns }))
    } else {
      setStaticSchema(await api.getSchema())
    }
  }, [activeConnectionId])

  const autoNameAttempted = useRef<Set<string>>(new Set())

  const maybeAutoName = useCallback(
    async (slug: string) => {
      if (autoNameAttempted.current.has(slug)) return
      const cur = filesRef.current[slug]
      if (!cur) return
      if (cur.meta.name !== cur.meta.slug) return
      const sql = cur.buffer.trim()
      if (!sql) return
      autoNameAttempted.current.add(slug)
      try {
        const res = await api.autoNameWorksheet(slug, cur.buffer)
        if (!res.skipped) {
          applyMeta(slug, {
            slug,
            name: res.name,
            updatedAt: filesRef.current[slug]?.meta.updatedAt ?? new Date().toISOString(),
          })
        }
      } catch {
        // best-effort — leave the flag set so we don't hammer on repeated runs this session
      }
    },
    [applyMeta],
  )

  const executeActive = useCallback(
    async (sql: string) => {
      const slug = sessionRef.current.activeSlug
      if (!slug) return
      const tab = sessionRef.current.openTabs.find((t) => t.slug === slug)
      const connectionId = tab?.connectionId
      if (!connectionId) {
        setRuntimes((r) => ({
          ...r,
          [slug]: {
            running: false,
            lastResult: { ok: false, error: "Pick a connection first." },
          },
        }))
        return
      }
      setRuntimes((r) => ({
        ...r,
        [slug]: { running: true, lastResult: r[slug]?.lastResult ?? null },
      }))
      let result: QueryResponse
      try {
        result = await api.runQuery(connectionId, sql)
      } catch (err) {
        result = { ok: false, error: (err as Error).message }
      }
      setRuntimes((r) => ({ ...r, [slug]: { running: false, lastResult: result } }))
      if (result.ok) void maybeAutoName(slug)
    },
    [maybeAutoName],
  )

  const clearResult = useCallback((slug: string) => {
    setRuntimes((r) => ({ ...r, [slug]: { running: false, lastResult: null } }))
  }, [])

  const setResultsPaneSize = useCallback((size: number | null) => {
    setSession((s) => (s.resultsPaneSize === size ? s : { ...s, resultsPaneSize: size }))
  }, [])

  const dirty = useCallback(
    (slug: string) => {
      const cur = files[slug]
      return !!cur && cur.buffer !== cur.content
    },
    [files],
  )

  const schema = useMemo<SQLNamespace>(() => {
    if (activeConnectionId) {
      return schemasByConn[activeConnectionId] ?? {}
    }
    return staticSchema
  }, [activeConnectionId, schemasByConn, staticSchema])

  const value = useMemo<WorksheetsContextValue>(
    () => ({
      files,
      list,
      session,
      schema,
      runtimes,
      loading,
      openTab,
      closeTab,
      setActive,
      setTabConnection,
      updateBuffer,
      updateCursor,
      save,
      createWorksheet,
      deleteWorksheet,
      renameWorksheet,
      refreshList,
      refreshSchema,
      applyReverted,
      clearHistoryWarning,
      executeActive,
      clearResult,
      setResultsPaneSize,
      dirty,
    }),
    [
      files,
      list,
      session,
      schema,
      runtimes,
      loading,
      openTab,
      closeTab,
      setActive,
      setTabConnection,
      updateBuffer,
      updateCursor,
      save,
      createWorksheet,
      deleteWorksheet,
      renameWorksheet,
      refreshList,
      refreshSchema,
      applyReverted,
      clearHistoryWarning,
      executeActive,
      clearResult,
      setResultsPaneSize,
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
    historyWarning: null,
  }
}
