export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "worksheet"
}

export function dedupeSlug(slug: string, existing: Set<string>): string {
  if (!existing.has(slug)) return slug
  let n = 2
  while (existing.has(`${slug}-${n}`)) n++
  return `${slug}-${n}`
}
