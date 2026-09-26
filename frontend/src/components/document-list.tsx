import { ChevronRight } from "lucide-react"
import { Link } from "react-router"

import { DocIcon, FORMAT_LABEL, KindBadge } from "@/components/doc-badges"
import { relativeTime } from "@/lib/format"
import type { DocumentSummary } from "@/lib/types"

export function DocumentRow({
  doc,
  workspaceId,
  showProject = false,
}: {
  doc: DocumentSummary
  workspaceId: string
  showProject?: boolean
}) {
  return (
    <Link
      to={`/w/${workspaceId}/projects/${doc.project_id}/docs/${doc.id}`}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/70"
    >
      <DocIcon kind={doc.kind} format={doc.format} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{doc.name}</p>
          {doc.kind === "secure" ? <KindBadge kind="secure" className="hidden sm:inline-flex" /> : null}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {showProject ? `${doc.project_name} · ` : ""}
          {FORMAT_LABEL[doc.format]} · edited {relativeTime(doc.updated_at)}
          {doc.updated_by ? ` by ${doc.updated_by.name}` : ""}
        </p>
      </div>
      <ChevronRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}
