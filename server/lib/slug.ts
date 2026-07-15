/** `fallback` covers names that slugify to nothing (e.g. all symbols). */
export function slugify(name: string, fallback = "worksheet"): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || fallback
}

export function dedupeSlug(slug: string, existing: Set<string>): string {
  if (!existing.has(slug)) return slug
  let n = 2
  while (existing.has(`${slug}-${n}`)) n++
  return `${slug}-${n}`
}
