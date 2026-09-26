import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, Lock, ShieldCheck, TriangleAlert } from "lucide-react"
import { useNavigate } from "react-router"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { qk } from "@/hooks/api"
import { client, errorMessage, unwrap } from "@/lib/api"
import type { DocFormat, DocKind } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  projectId: string
  canCreateNormal: boolean
  canCreateSecure: boolean
  /** Secure documents need the user's vault; until then the option shows a locked state. */
  vaultReady: boolean
}

const FORMATS: Record<DocKind, { value: DocFormat; label: string }[]> = {
  normal: [
    { value: "markdown", label: "Markdown" },
    { value: "text", label: "Plain text" },
  ],
  secure: [
    { value: "env", label: ".env" },
    { value: "markdown", label: "Markdown" },
    { value: "text", label: "Plain text" },
  ],
}

export function NewDocumentDialog({ open, onOpenChange, workspaceId, projectId, canCreateNormal, canCreateSecure, vaultReady }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<DocKind>(canCreateNormal ? "normal" : "secure")
  const [format, setFormat] = useState<DocFormat>("markdown")
  const [name, setName] = useState("")

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/documents", {
          params: { path: { workspace_id: workspaceId, project_id: projectId } },
          body: { name: name.trim(), kind, format, content: "" },
        }),
      ),
    onSuccess: async (doc) => {
      await queryClient.invalidateQueries({ queryKey: qk.documents(workspaceId, projectId) })
      await queryClient.invalidateQueries({ queryKey: qk.projects(workspaceId) })
      onOpenChange(false)
      setName("")
      navigate(`/w/${workspaceId}/projects/${projectId}/docs/${doc.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const chooseKind = (next: DocKind) => {
    setKind(next)
    if (!FORMATS[next].some((f) => f.value === format)) setFormat(FORMATS[next][0].value)
  }

  const secureBlocked = kind === "secure" && (!vaultReady || !canCreateSecure)
  const valid = name.trim().length > 0 && !secureBlocked

  const option = (value: DocKind, title: string, body: string, Icon: typeof Eye, disabled: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === value}
      disabled={disabled}
      onClick={() => chooseKind(value)}
      className={cn(
        "flex flex-1 flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
        kind === value
          ? value === "secure"
            ? "border-secure ring-3 ring-secure/20"
            : "border-brand ring-3 ring-brand/20"
          : "hover:border-foreground/20",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg",
          value === "secure" ? "bg-secure-soft text-secure" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="font-semibold">{title}</span>
      <span className="text-muted-foreground text-xs leading-relaxed">{body}</span>
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) create.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>Choose how this document is protected. This can't be changed later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-5">
            <div role="radiogroup" aria-label="Document type" className="flex flex-col gap-3 sm:flex-row">
              {option("normal", "Normal document", "Protected by access control. The server can read it, so it's searchable and simple.", Eye, !canCreateNormal)}
              {option("secure", "Secure document", "End-to-end encrypted in your browser. The server can never read it.", ShieldCheck, !canCreateSecure)}
            </div>

            {kind === "secure" && !vaultReady ? (
              <Alert variant="secure">
                <Lock />
                <AlertDescription>
                  Secure documents are encrypted with keys from your personal vault. Set up your vault first, then come back
                  to create secure documents.
                </AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel>Format</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={format}
                onValueChange={(v) => {
                  if (v) setFormat(v as DocFormat)
                }}
                className="justify-start"
              >
                {FORMATS[kind].map((f) => (
                  <ToggleGroupItem key={f.value} value={f.value} className="px-4">
                    {f.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="doc-name">Name</FieldLabel>
              <Input
                id="doc-name"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                placeholder={format === "env" ? "e.g. production.env" : "e.g. Deployment runbook"}
                autoFocus
              />
              {kind === "secure" ? (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  Names are not encrypted. Never put a secret in a document's name.
                </p>
              ) : null}
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={kind === "secure" ? "secure" : "default"} disabled={!valid || create.isPending}>
              {create.isPending ? <Spinner /> : kind === "secure" ? <Lock /> : null}
              Create {kind === "secure" ? "secure " : ""}document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
