import { useRef, useState } from "react"
import { Check, Copy, Download, Eye, EyeOff, FileUp, Plus, Table2, TextCursorInput, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { copyText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import { duplicateKeys, isValidKey, parseEnv, rowId, serializeEnv } from "@/vault/env"
import type { EnvPair, EnvRow } from "@/vault/env"

interface Props {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  fileName: string
  /** Called when plaintext values are exposed: shown, copied or exported (for the audit log). */
  onAudit?: (event: "values_revealed" | "value_copied" | "downloaded", count?: number) => void
}

/** Key/value editor for secure .env documents. Values are masked by default. */
export function EnvEditor({ value, onChange, readOnly = false, fileName, onAudit }: Props) {
  const [rows, setRows] = useState<EnvRow[]>(() => parseEnv(value))
  const [mode, setMode] = useState<"table" | "raw">("table")
  const [raw, setRaw] = useState(value)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const dupes = duplicateKeys(rows)

  const commit = (next: EnvRow[]) => {
    setRows(next)
    const text = serializeEnv(next)
    setRaw(text)
    onChange(text)
  }
  const update = (id: string, patch: Partial<EnvPair>) =>
    commit(rows.map((r) => (r.id === id && r.kind === "pair" ? { ...r, ...patch } : r)))
  const remove = (id: string) => commit(rows.filter((r) => r.id !== id))
  const add = () => commit([...rows, { kind: "pair", id: rowId(), key: "", value: "" }])
  const toggleReveal = (id: string) => {
    if (!revealed.has(id)) onAudit?.("values_revealed", 1)
    setRevealed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleRevealAll = () => {
    if (revealed.size > 0) return setRevealed(new Set())
    const pairs = rows.filter((r) => r.kind === "pair").length
    if (pairs > 0) onAudit?.("values_revealed", pairs)
    setRevealed(new Set(rows.map((r) => r.id)))
  }

  const copy = async (row: EnvPair) => {
    try {
      await copyText(row.value, { secret: true })
      onAudit?.("value_copied")
      setCopied(row.id)
      toast.success(`Copied ${row.key || "value"}. The clipboard clears in 30 seconds.`)
      window.setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 1500)
    } catch {
      toast.error("Your browser blocked clipboard access.")
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([serializeEnv(rows)], { type: "text/plain" }))
    const a = document.createElement("a")
    a.href = url
    a.download = fileName.endsWith(".env") || fileName.startsWith(".env") ? fileName : `${fileName}.env`
    a.click()
    URL.revokeObjectURL(url)
    onAudit?.("downloaded")
    toast("Downloaded. Remember this file is now unencrypted on your disk.")
  }

  const switchMode = (next: "table" | "raw") => {
    if (next === "table") setRows(parseEnv(raw))
    else {
      setRaw(serializeEnv(rows))
      // Raw text shows every value unmasked.
      const pairs = rows.filter((r) => r.kind === "pair").length
      if (pairs > 0) onAudit?.("values_revealed", pairs)
    }
    setMode(next)
  }

  const pairCount = rows.filter((r) => r.kind === "pair").length

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && switchMode(v as "table" | "raw")}>
          <ToggleGroupItem value="table" aria-label="Table view">
            <Table2 /> <span className="hidden sm:inline">Variables</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="raw" aria-label="Raw text view">
            <TextCursorInput /> <span className="hidden sm:inline">Raw</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-muted-foreground text-xs">{pairCount} variable{pairCount === 1 ? "" : "s"}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {mode === "table" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleRevealAll}
            >
              {revealed.size > 0 ? <EyeOff /> : <Eye />} {revealed.size > 0 ? "Hide all" : "Reveal all"}
            </Button>
          ) : null}
          {!readOnly ? (
            <Button variant="ghost" size="sm" onClick={() => setImporting(true)}>
              <FileUp /> Import
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={download}>
            <Download /> Export .env
          </Button>
        </div>
      </div>

      {dupes.size > 0 ? (
        <Alert variant="warning" className="m-3 mb-0 py-2">
          <TriangleAlert />
          <AlertDescription className="text-xs">
            Duplicate keys: <span className="font-mono font-semibold">{[...dupes].join(", ")}</span>. Most loaders use the last
            value.
          </AlertDescription>
        </Alert>
      ) : null}

      {mode === "raw" ? (
        <Textarea
          aria-label=".env contents"
          value={raw}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => {
            setRaw(e.target.value)
            const parsed = parseEnv(e.target.value)
            setRows(parsed)
            onChange(e.target.value)
          }}
          className="min-h-[55vh] flex-1 resize-none rounded-none border-0 bg-transparent p-4 font-mono text-[0.88rem] leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      ) : (
        <div className="flex-1 space-y-1.5 p-3">
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No variables yet. Add one, or import an existing .env file.
            </p>
          ) : null}
          {rows.map((row) =>
            row.kind === "comment" ? (
              <div key={row.id} className="flex items-center gap-2">
                <span className="text-muted-foreground w-5 text-center font-mono text-sm">#</span>
                <Input
                  aria-label="Comment"
                  value={row.text}
                  readOnly={readOnly}
                  onChange={(e) => commit(rows.map((r) => (r.id === row.id && r.kind === "comment" ? { ...r, text: e.target.value } : r)))}
                  className="text-muted-foreground h-8 border-transparent bg-transparent font-mono text-xs italic shadow-none"
                />
                {!readOnly ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Remove comment" onClick={() => remove(row.id)}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ) : (
              <div key={row.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                <div>
                  <Input
                    aria-label="Key"
                    value={row.key}
                    readOnly={readOnly}
                    placeholder="KEY"
                    spellCheck={false}
                    aria-invalid={dupes.has(row.key.trim()) || (row.key !== "" && !isValidKey(row.key))}
                    onChange={(e) => update(row.id, { key: e.target.value.replace(/\s/g, "_") })}
                    className="font-mono text-[0.82rem] font-medium"
                  />
                  {row.key !== "" && !isValidKey(row.key) ? (
                    <p className="text-destructive mt-1 text-[0.7rem]">Letters, digits and _ only; can't start with a digit.</p>
                  ) : null}
                </div>
                <Input
                  aria-label={`Value of ${row.key || "variable"}`}
                  type={revealed.has(row.id) ? "text" : "password"}
                  value={row.value}
                  readOnly={readOnly}
                  placeholder="value"
                  spellCheck={false}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(e) => update(row.id, { value: e.target.value })}
                  className={cn("font-mono text-[0.82rem]", !revealed.has(row.id) && "tracking-widest")}
                />
                <div className="flex">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={revealed.has(row.id) ? "Hide value" : "Reveal value"} onClick={() => toggleReveal(row.id)}>
                        {revealed.has(row.id) ? <EyeOff /> : <Eye />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{revealed.has(row.id) ? "Hide" : "Reveal"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Copy value" disabled={!row.value} onClick={() => void copy(row)}>
                        {copied === row.id ? <Check className="text-success" /> : <Copy />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy (clears in 30s)</TooltipContent>
                  </Tooltip>
                  {!readOnly ? (
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${row.key || "variable"}`} onClick={() => remove(row.id)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {!readOnly ? (
            <Button variant="outline" size="sm" className="mt-2" onClick={add}>
              <Plus /> Add variable
            </Button>
          ) : null}
        </div>
      )}
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImport={(text, replace) => {
          const incoming = parseEnv(text)
          if (replace) {
            commit(incoming)
          } else {
            const merged = [...rows]
            for (const row of incoming) {
              const existing = row.kind === "pair" ? merged.findIndex((r) => r.kind === "pair" && r.key === row.key) : -1
              if (existing >= 0) merged[existing] = { ...row, id: merged[existing].id }
              else merged.push(row)
            }
            commit(merged)
          }
          toast.success(`Imported ${incoming.filter((r) => r.kind === "pair").length} variables.`)
        }}
      />
    </div>
  )
}

function ImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; onImport: (text: string, replace: boolean) => void }) {
  const [text, setText] = useState("")
  const [replace, setReplace] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a .env file</DialogTitle>
          <DialogDescription>Paste its contents or choose a file. It's parsed and encrypted here in your browser.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <input
            ref={fileInput}
            type="file"
            accept=".env,text/plain,*/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void file.text().then(setText)
              e.target.value = ""
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <FileUp /> Choose file
          </Button>
          <Textarea rows={8} className="font-mono text-xs" placeholder={"API_KEY=...\nDATABASE_URL=..."} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <ToggleGroup type="single" variant="outline" size="sm" value={replace ? "replace" : "merge"} onValueChange={(v) => v && setReplace(v === "replace")} className="justify-start">
            <ToggleGroupItem value="merge" className="px-3">Merge (update matching keys)</ToggleGroupItem>
            <ToggleGroupItem value="replace" className="px-3">Replace everything</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secure"
            disabled={!text.trim()}
            onClick={() => {
              onImport(text, replace)
              setText("")
              onOpenChange(false)
            }}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
