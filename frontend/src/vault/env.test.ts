import { describe, expect, it } from "vitest"

import { duplicateKeys, parseEnv, serializeEnv } from "./env"
import type { EnvPair } from "./env"

const pairs = (text: string) =>
  parseEnv(text)
    .filter((r): r is EnvPair => r.kind === "pair")
    .map((r) => [r.key, r.value])

describe(".env parsing", () => {
  it("handles quotes, export, inline comments and escapes", () => {
    const text = [
      "# Database",
      "export DB_URL=postgres://u:p@localhost/db",
      'API_KEY="abc def # not a comment"',
      "SINGLE='literal $HOME \\n'",
      "PLAIN=value # trailing comment",
      'ESCAPED="line1\\nline2 \\"quoted\\""',
      "EMPTY=",
    ].join("\n")
    expect(pairs(text)).toEqual([
      ["DB_URL", "postgres://u:p@localhost/db"],
      ["API_KEY", "abc def # not a comment"],
      ["SINGLE", "literal $HOME \\n"],
      ["PLAIN", "value"],
      ["ESCAPED", 'line1\nline2 "quoted"'],
      ["EMPTY", ""],
    ])
    expect(parseEnv(text)[0]).toMatchObject({ kind: "comment", text: "Database" })
  })

  it("reads multi-line double-quoted values", () => {
    expect(pairs('CERT="-----BEGIN-----\nabc\n-----END-----"\nNEXT=1')).toEqual([
      ["CERT", "-----BEGIN-----\nabc\n-----END-----"],
      ["NEXT", "1"],
    ])
  })

  it("round-trips through serialisation", () => {
    const text = '# c\nA=1\nB="has space"\nC="multi\\nline"\nD="quote\\"s"\nE=\n'
    const rows = parseEnv(text)
    expect(pairs(serializeEnv(rows))).toEqual(pairs(text))
  })

  it("flags duplicate keys", () => {
    expect([...duplicateKeys(parseEnv("A=1\nB=2\nA=3"))]).toEqual(["A"])
  })
})
