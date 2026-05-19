// Tracks shas the server itself just wrote, so the fs.watch callback can
// recognize the echo of our own writes and skip recording them as "external".
const TTL_MS = 5_000
const recent = new Map<string, Set<string>>()

export function noteRecentWrite(slug: string, sha: string): void {
  let set = recent.get(slug)
  if (!set) {
    set = new Set()
    recent.set(slug, set)
  }
  set.add(sha)
  const t = setTimeout(() => {
    const s = recent.get(slug)
    if (!s) return
    s.delete(sha)
    if (s.size === 0) recent.delete(slug)
  }, TTL_MS)
  t.unref?.()
}

export function isRecentWrite(slug: string, sha: string): boolean {
  return recent.get(slug)?.has(sha) ?? false
}
