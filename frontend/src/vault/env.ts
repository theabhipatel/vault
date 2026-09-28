/** Parsing and serialising `.env` files for the key/value editor. */

export interface EnvPair {
  kind: "pair"
  id: string
  key: string
  value: string
}

export interface EnvComment {
  kind: "comment"
  id: string
  text: string
}

export type EnvRow = EnvPair | EnvComment

let counter = 0
export function rowId(): string {
  counter += 1
  return `r${counter}-${Math.random().toString(36).slice(2, 8)}`
}

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/

function unquote(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('"')) {
    const end = findClosing(value, '"')
    const inner = end > 0 ? value.slice(1, end) : value.slice(1)
    return inner.replace(/\\([nrt"\\$])/g, (_, c: string) => ({ n: "\n", r: "\r", t: "\t" })[c] ?? c)
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1)
    return end > 0 ? value.slice(1, end) : value.slice(1)
  }
  // Unquoted: an inline comment starts at " #".
  const hash = value.search(/\s#/)
  return (hash >= 0 ? value.slice(0, hash) : value).trim()
}

function findClosing(value: string, quote: string): number {
  for (let i = 1; i < value.length; i++) {
    if (value[i] === "\\") {
      i++
      continue
    }
    if (value[i] === quote) return i
  }
  return -1
}

export function parseEnv(text: string): EnvRow[] {
  const rows: EnvRow[] = []
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (line.trim().startsWith("#")) {
      rows.push({ kind: "comment", id: rowId(), text: line.trim().replace(/^#\s?/, "") })
      continue
    }
    const match = LINE.exec(line)
    if (!match) {
      rows.push({ kind: "comment", id: rowId(), text: `(unparsed) ${line.trim()}` })
      continue
    }
    let raw = match[2]
    // Multi-line double-quoted values.
    if (raw.trim().startsWith('"') && findClosing(raw.trim(), '"') < 0) {
      while (i + 1 < lines.length) {
        i++
        raw += `\n${lines[i]}`
        if (findClosing(raw.trim(), '"') > 0) break
      }
      raw = raw.replace(/\n/g, "\\n")
    }
    rows.push({ kind: "pair", id: rowId(), key: match[1], value: unquote(raw) })
  }
  return rows
}

function quoteValue(value: string): string {
  if (value === "") return ""
  if (/^[A-Za-z0-9_./:@%+,=-]+$/.test(value)) return value
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\$/g, "\\$")
  return `"${escaped}"`
}

export function serializeEnv(rows: EnvRow[]): string {
  const lines = rows.map((row) =>
    row.kind === "comment" ? `# ${row.text}` : `${row.key.trim()}=${quoteValue(row.value)}`,
  )
  return lines.length ? `${lines.join("\n")}\n` : ""
}

/** Keys that appear more than once (the last one wins in most loaders). */
export function duplicateKeys(rows: EnvRow[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const row of rows) {
    if (row.kind !== "pair" || !row.key.trim()) continue
    const key = row.key.trim()
    if (seen.has(key)) dupes.add(key)
    seen.add(key)
  }
  return dupes
}

export function isValidKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key.trim())
}
