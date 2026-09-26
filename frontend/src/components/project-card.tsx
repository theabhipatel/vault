import { Archive, FileText, Folder, Lock, Users } from "lucide-react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { relativeTime } from "@/lib/format"
import type { Project } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ProjectCard({ project, workspaceId }: { project: Project; workspaceId: string }) {
  const archived = Boolean(project.archived_at)
  return (
    <Link
      to={`/w/${workspaceId}/projects/${project.id}`}
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md",
        archived && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/15 transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
          <Folder className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{project.name}</h3>
            {archived ? (
              <Badge variant="secondary" className="shrink-0">
                <Archive /> Archived
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 line-clamp-2 min-h-10 text-sm leading-5">
            {project.description || "No description yet."}
          </p>
        </div>
      </div>
      <div className="text-muted-foreground mt-5 flex items-center gap-4 border-t pt-3.5 text-xs">
        <span className="inline-flex items-center gap-1.5" title="Documents">
          <FileText className="size-3.5" /> {project.document_count - project.secure_document_count}
        </span>
        <span className="inline-flex items-center gap-1.5 text-secure" title="Secure documents">
          <Lock className="size-3.5" /> {project.secure_document_count}
        </span>
        <span className="inline-flex items-center gap-1.5" title="Assigned members">
          <Users className="size-3.5" /> {project.member_count}
        </span>
        <span className="ml-auto truncate">{relativeTime(project.last_activity_at)}</span>
      </div>
    </Link>
  )
}
