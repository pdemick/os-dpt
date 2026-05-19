import { useEffect, useState } from "react"

export function useResolvedTheme(): "dark" | "light" {
  const get = () => (document.documentElement.classList.contains("dark") ? "dark" : "light")
  const [theme, setTheme] = useState<"dark" | "light">(get)
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(get()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return theme
}
