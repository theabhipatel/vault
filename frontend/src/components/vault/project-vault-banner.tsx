import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Hourglass, KeyRound, RefreshCw, ShieldAlert, ShieldPlus } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { qk } from "@/hooks/api"
import { client, errorMessage, unwrap } from "@/lib/api"
import type { Project } from "@/lib/types"
import { getProjectVault } from "@/vault/protocol"
import { useVault } from "@/vault/vault-context"

/** Explains the user's secure-access situation in a project, with the one action that helps. */
export function ProjectVaultBanner({ workspaceId, project, canDeleteSecure }: { workspaceId: string; project: Project; canDeleteSecure: boolean }) {
  const vault = useVault()
  const queryClient = useQueryClient()
  const [abandoning, setAbandoning] = useState(false)
  const relevant = project.secure_document_count > 0
  const state = useQuery({
    queryKey: ["project-vault", workspaceId, project.id],
    queryFn: () => getProjectVault(workspaceId, project.id),
    enabled: relevant,
  })
  const abandon = useMutation({
    mutationFn: () =>
      unwrap(
        client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/vault/abandon", {
          params: { path: { workspace_id: workspaceId, project_id: project.id } },
        }),
      ),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["project-vault", workspaceId, project.id] })
      await queryClient.invalidateQueries({ queryKey: qk.documents(workspaceId, project.id) })
      await queryClient.invalidateQueries({ queryKey: qk.project(workspaceId, project.id) })
      toast.success(res.message)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (!relevant || !state.data) return null
  const s = state.data

  if (s.my_state === "no_vault") {
    return (
      <Alert variant="secure" className="mb-6">
        <ShieldPlus />
        <AlertTitle>Set up your vault to open this project's secure documents</AlertTitle>
        <AlertDescription>Once you have a vault, a teammate's browser will share the project key with you automatically.</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="secure" onClick={vault.openSetup}>
            Set up vault
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (s.my_state === "pending") {
    return (
      <Alert variant="secure" className="mb-6">
        <Hourglass />
        <AlertTitle>Secure access pending</AlertTitle>
        <AlertDescription>
          A teammate who holds this project's key will share it with you the next time their vault is unlocked. No action is
          needed; you'll get a notification.
        </AlertDescription>
      </Alert>
    )
  }
  if (s.my_state === "lost") {
    return (
      <Alert variant="destructive" className="mb-6">
        <ShieldAlert />
        <AlertTitle>This project's secure documents can't be decrypted</AlertTitle>
        <AlertDescription>
          Nobody holds the project key any more. The {project.secure_document_count} secure document
          {project.secure_document_count === 1 ? " is" : "s are"} permanently unreadable.
        </AlertDescription>
        {canDeleteSecure ? (
          <AlertAction>
            <Button size="sm" variant="destructive" onClick={() => setAbandoning(true)}>
              Clear and start over
            </Button>
          </AlertAction>
        ) : null}
        <ConfirmDialog
          open={abandoning}
          onOpenChange={setAbandoning}
          title="Delete the unreadable secure documents?"
          description="They can never be decrypted again. Deleting them lets this project start fresh with a new key."
          confirmLabel="Delete secure documents"
          destructive
          confirmText={project.name}
          onConfirm={() => abandon.mutateAsync()}
        />
      </Alert>
    )
  }
  if (s.my_state === "ready" && s.rotation_pending) {
    return (
      <Alert variant="brand" className="mb-6">
        <RefreshCw />
        <AlertTitle>Key rotation pending</AlertTitle>
        <AlertDescription>
          Someone lost access, so this project's key will be replaced and every secure document re-encrypted. It happens
          automatically while a key holder's vault is unlocked.
        </AlertDescription>
        <AlertAction>
          {vault.status === "unlocked" ? (
            <Button size="sm" variant="outline" onClick={() => void vault.syncNow()}>
              <RefreshCw /> Rotate now
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={vault.openUnlock}>
              <KeyRound /> Unlock
            </Button>
          )}
        </AlertAction>
      </Alert>
    )
  }
  return null
}
