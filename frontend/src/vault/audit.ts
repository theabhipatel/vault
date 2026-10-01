/**
 * Reports vault events that only the browser can observe (wrong vault password, decrypting a
 * document, exporting plaintext) to the server's audit log.
 *
 * Reports never block or break the UI: failures are swallowed. They carry no secrets, only event
 * names, enums and counts. The server marks them `source: browser`.
 */
import { client } from "@/lib/api"
import type { Schemas } from "@/lib/api"

import { DecryptionError } from "./crypto"

type VaultEvent = Schemas["VaultEventIn"]
type DocumentEvent = Schemas["SecureDocumentEventIn"]
type UnlockMethod = NonNullable<VaultEvent["method"]>
type UnlockContext = NonNullable<VaultEvent["context"]>

// Consecutive wrong vault secrets in this tab; reset by a successful unlock.
let failedAttempts = 0
// Throttle for repeatable UI actions (revealing / copying values) per document.
const lastReported = new Map<string, number>()
const REPEAT_WINDOW_MS = 60_000

export async function reportVaultEvent(body: VaultEvent): Promise<void> {
  try {
    await client.POST("/api/vault/events", { body })
  } catch {
    // Best effort.
  }
}

export function reportDocumentEvent(workspaceId: string, documentId: string, body: DocumentEvent): void {
  if (body.event === "values_revealed" || body.event === "value_copied") {
    const key = `${documentId}:${body.event}`
    const now = Date.now()
    if (now - (lastReported.get(key) ?? 0) < REPEAT_WINDOW_MS) return
    lastReported.set(key, now)
  }
  void client
    .POST("/api/workspaces/{workspace_id}/documents/{document_id}/secure-events", {
      params: { path: { workspace_id: workspaceId, document_id: documentId } },
      body,
    })
    .catch(() => undefined)
}

/**
 * Runs an attempt to open the vault (unlock, recovery, or confirming the current password) and
 * reports the outcome. A wrong secret surfaces as DecryptionError; other errors aren't reported.
 */
export async function auditedUnlock<T>(
  method: UnlockMethod,
  context: UnlockContext,
  attempt: () => Promise<T>,
  { reportSuccess = true }: { reportSuccess?: boolean } = {},
): Promise<T> {
  try {
    const result = await attempt()
    if (reportSuccess) void reportVaultEvent({ event: "unlocked", method, attempt: failedAttempts + 1 })
    failedAttempts = 0
    return result
  } catch (e) {
    if (e instanceof DecryptionError) {
      failedAttempts += 1
      void reportVaultEvent({ event: "unlock_failed", method, context, attempt: failedAttempts })
    }
    throw e
  }
}

/** Runs a decryption of one document version and reports whether it succeeded. */
export async function auditedDecrypt(
  workspaceId: string,
  documentId: string,
  version: number,
  decrypt: () => Promise<string>,
): Promise<string> {
  try {
    const text = await decrypt()
    reportDocumentEvent(workspaceId, documentId, { event: "decrypted", version })
    return text
  } catch (e) {
    if (e instanceof DecryptionError) reportDocumentEvent(workspaceId, documentId, { event: "decrypt_failed", version })
    throw e
  }
}
