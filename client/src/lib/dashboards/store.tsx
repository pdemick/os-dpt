import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import type { DashboardMeta } from "@shared/dashboards"

import { dashboardsApi } from "@/lib/dashboards/api"

const SELECTED_KEY = "os-dpt:dashboard"

// The dashboard list + selection live above the view because both the app
// sidebar (submenu under the Dashboards item) and the Dashboards view render
// from them.
type DashboardsStore = {
  metas: DashboardMeta[] | null
  selected: string | null
  select: (slug: string | null) => void
  refreshList: () => Promise<DashboardMeta[]>
  create: () => Promise<void>
  rename: (slug: string, name: string) => Promise<void>
  remove: (slug: string) => Promise<void>
}

const DashboardsContext = createContext<DashboardsStore | null>(null)

export function DashboardsProvider({ children }: { children: ReactNode }) {
  const [metas, setMetas] = useState<DashboardMeta[] | null>(null)
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_KEY),
  )

  const select = useCallback((slug: string | null) => {
    setSelected(slug)
    if (slug) localStorage.setItem(SELECTED_KEY, slug)
    else localStorage.removeItem(SELECTED_KEY)
  }, [])

  const refreshList = useCallback(async (): Promise<DashboardMeta[]> => {
    const list = await dashboardsApi.listDashboards().catch(() => [])
    setMetas(list)
    return list
  }, [])

  useEffect(() => {
    void refreshList().then((list) => {
      setSelected((cur) =>
        cur && list.some((d) => d.slug === cur) ? cur : (list[0]?.slug ?? null),
      )
    })
  }, [refreshList])

  const create = useCallback(async () => {
    try {
      const created = await dashboardsApi.createDashboard()
      await refreshList()
      select(created.slug)
    } catch (err) {
      toast.error("Couldn't create dashboard", {
        description: (err as Error).message,
      })
    }
  }, [refreshList, select])

  const rename = useCallback(
    async (slug: string, name: string) => {
      try {
        await dashboardsApi.renameDashboard(slug, name)
        await refreshList()
      } catch (err) {
        toast.error("Couldn't rename dashboard", {
          description: (err as Error).message,
        })
      }
    },
    [refreshList],
  )

  const remove = useCallback(
    async (slug: string) => {
      try {
        await dashboardsApi.deleteDashboard(slug)
        const list = await refreshList()
        setSelected((cur) => {
          if (cur !== slug) return cur
          const next = list[0]?.slug ?? null
          if (next) localStorage.setItem(SELECTED_KEY, next)
          else localStorage.removeItem(SELECTED_KEY)
          return next
        })
      } catch (err) {
        toast.error("Couldn't delete dashboard", {
          description: (err as Error).message,
        })
      }
    },
    [refreshList],
  )

  const store = useMemo(
    () => ({ metas, selected, select, refreshList, create, rename, remove }),
    [metas, selected, select, refreshList, create, rename, remove],
  )

  return (
    <DashboardsContext.Provider value={store}>
      {children}
    </DashboardsContext.Provider>
  )
}

export function useDashboards(): DashboardsStore {
  const store = useContext(DashboardsContext)
  if (!store)
    throw new Error("useDashboards must be used within DashboardsProvider")
  return store
}
