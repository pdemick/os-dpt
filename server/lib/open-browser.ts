import { spawn } from "node:child_process"

// Open a URL in the user's default browser, cross-platform, with no extra
// dependency. Best-effort: if the opener can't be spawned we resolve false so
// the caller can fall back to just printing the URL.
export function openBrowser(url: string): Promise<boolean> {
  const platform = process.platform
  const [cmd, args] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]

  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true })
      child.on("error", () => resolve(false))
      child.unref()
      // Spawn errors surface async; give it a tick before assuming success.
      setTimeout(() => resolve(true), 0)
    } catch {
      resolve(false)
    }
  })
}
