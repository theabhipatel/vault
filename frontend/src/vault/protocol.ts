/**
 * Vault operations that combine browser crypto with API calls. Everything here runs with the
 * vault unlocked; the server only ever receives ciphertext, sealed keys and public keys.
 */
import { ApiError, client, unwrap } from "@/lib/api"
import type { Schemas } from "@/lib/api"

import {
  decryptDocument,
  encryptDocument,
  generateProjectKey,
  importAesKey,
  sealProjectKey,
  wipe,
} from "./crypto"
import type { DocContext, Encrypted } from "./crypto"
import { vaultSession } from "./session"
import { classifyRecipients, rememberKeys } from "./trust"
import type { KeyChange } from "./trust"

export type ProjectVaultState = Schemas["ProjectVaultState"]
export type Recipient = Schemas["Recipient"]
export type PendingWork = Schemas["PendingWork"]
export type SecureDoc = Schemas["DocumentOut"]

export interface ProjectKeyChange extends KeyChange<Recipient> {
  workspaceId: string
  projectId: string
  projectName: string
}

export class VaultStateError extends Error {
  readonly state: ProjectVaultState["my_state"]
  constructor(state: ProjectVaultState["my_state"]) {
    super(
      {
        no_permission: "You don't have access to secure documents in this project.",
        no_vault: "Set up your vault first.",
        uninitialized: "This project has no key yet.",
        pending: "A teammate still needs to share this project's key with you.",
        lost: "Nobody holds this project's key any more.",
        ready: "",
      }[state],
    )
    this.name = "VaultStateError"
    this.state = state
  }
}

function me(): string {
  const id = vaultSession.userId
  if (!id) throw new Error("Unlock your vault first.")
  return id
}

export async function getProjectVault(workspaceId: string, projectId: string): Promise<ProjectVaultState> {
  return unwrap(
    client.GET("/api/workspaces/{workspace_id}/projects/{project_id}/vault", {
      params: { path: { workspace_id: workspaceId, project_id: projectId } },
    }),
  )
}

async function sealFor(recipients: Recipient[], raw: Uint8Array, projectId: string, keyVersion: number) {
  return Promise.all(
    recipients.map(async (r) => ({
      user_id: r.user_id,
      public_key: r.public_key,
      sealed_key: await sealProjectKey(raw, r.public_key, projectId, keyVersion),
    })),
  )
}

/** Split recipients into ones we may seal to now, and ones whose key changed (need consent). */
function trustedRecipients(recipients: Recipient[]): { trusted: Recipient[]; changed: KeyChange<Recipient>[] } {
  const myId = me()
  const mine = recipients.filter((r) => r.user_id === myId)
  const { trusted, changed } = classifyRecipients(myId, recipients.filter((r) => r.user_id !== myId))
  return { trusted: [...mine, ...trusted], changed }
}

/**
 * The project key for encrypting and decrypting. Creates the project's first key when there
 * is none yet (sealed for the creator and every teammate with secure access and a vault).
 */
export async function projectKeyFor(workspaceId: string, projectId: string): Promise<{ key: CryptoKey; keyVersion: number; changed: KeyChange<Recipient>[] }> {
  const state = await getProjectVault(workspaceId, projectId)
  if (state.my_state === "ready" && state.my_sealed_key && state.key_version) {
    const key = await vaultSession.projectKey(projectId, state.key_version, state.my_sealed_key)
    return { key, keyVersion: state.key_version, changed: [] }
  }
  if (state.my_state !== "uninitialized") throw new VaultStateError(state.my_state)

  const raw = generateProjectKey()
  try {
    const { trusted, changed } = trustedRecipients(state.recipients)
    const grants = await sealFor(trusted, raw, projectId, 1)
    try {
      await unwrap(
        client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/vault/init", {
          params: { path: { workspace_id: workspaceId, project_id: projectId } },
          body: { grants },
        }),
      )
    } catch (error) {
      // Someone else created the key at the same moment: use theirs.
      if (error instanceof ApiError && error.status === 409) return projectKeyFor(workspaceId, projectId)
      throw error
    }
    rememberKeys(me(), trusted)
    const key = await importAesKey(raw, { keepRaw: true })
    return { key, keyVersion: 1, changed }
  } finally {
    wipe(raw)
  }
}

export function docContext(workspaceId: string, doc: { id: string; project_id: string; format: string }, version: number, keyVersion: number): DocContext {
  return { workspaceId, projectId: doc.project_id, documentId: doc.id, version, keyVersion, format: doc.format }
}

export async function createSecureDocument(workspaceId: string, projectId: string, name: string, format: "text" | "markdown" | "env", content: string) {
  const { key, keyVersion, changed } = await projectKeyFor(workspaceId, projectId)
  const id = crypto.randomUUID()
  const enc = await encryptDocument(key, content, { workspaceId, projectId, documentId: id, version: 1, keyVersion, format })
  const doc = await unwrap(
    client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/secure-documents", {
      params: { path: { workspace_id: workspaceId, project_id: projectId } },
      body: { id, name, format, key_version: keyVersion, ciphertext: enc.ciphertext, nonce: enc.nonce },
    }),
  )
  return { doc, changed }
}

export async function openSecureDocument(workspaceId: string, doc: SecureDoc): Promise<string> {
  if (!doc.ciphertext || !doc.nonce || !doc.key_version) throw new Error("This document has no encrypted content.")
  const { key } = await projectKeyFor(workspaceId, doc.project_id)
  return decryptDocument(key, { ciphertext: doc.ciphertext, nonce: doc.nonce }, docContext(workspaceId, doc, doc.version, doc.key_version))
}

export async function openSecureVersion(workspaceId: string, doc: SecureDoc, version: Schemas["VersionOut"]): Promise<string> {
  if (!version.ciphertext || !version.nonce || !version.key_version) throw new Error("This version has no encrypted content.")
  const { key } = await projectKeyFor(workspaceId, doc.project_id)
  return decryptDocument(key, { ciphertext: version.ciphertext, nonce: version.nonce }, docContext(workspaceId, doc, version.version, version.key_version))
}

export async function saveSecureDocument(workspaceId: string, doc: SecureDoc, content: string, opts: { name?: string; restoredFrom?: number } = {}): Promise<SecureDoc> {
  const { key, keyVersion } = await projectKeyFor(workspaceId, doc.project_id)
  const nextVersion = doc.version + 1
  const enc = await encryptDocument(key, content, docContext(workspaceId, doc, nextVersion, keyVersion))
  return unwrap(
    client.PUT("/api/workspaces/{workspace_id}/documents/{document_id}/secure", {
      params: { path: { workspace_id: workspaceId, document_id: doc.id } },
      body: {
        expected_version: doc.version,
        name: opts.name,
        key_version: keyVersion,
        ciphertext: enc.ciphertext,
        nonce: enc.nonce,
        restored_from: opts.restoredFrom ?? null,
      },
    }),
  )
}

// ---- Rotation --------------------------------------------------------------------------------

export interface RotationInput {
  document_id: string
  version: number
  format: string
  key_version: number
  ciphertext: string
  nonce: string
}

/** Decrypt every item with the old key and re-encrypt it (fresh nonce, new AAD) with the new one. */
export async function reencryptAll(
  workspaceId: string,
  projectId: string,
  items: RotationInput[],
  oldKey: CryptoKey,
  newKey: CryptoKey,
  newVersion: number,
): Promise<{ document_id: string; version: number; ciphertext: string; nonce: string }[]> {
  const out = []
  for (const item of items) {
    const base = { workspaceId, projectId, documentId: item.document_id, version: item.version, format: item.format }
    const text = await decryptDocument(oldKey, item as Encrypted, { ...base, keyVersion: item.key_version })
    const enc = await encryptDocument(newKey, text, { ...base, keyVersion: newVersion })
    out.push({ document_id: item.document_id, version: item.version, ...enc })
  }
  return out
}

async function rotateProject(work: PendingWork): Promise<ProjectKeyChange[]> {
  const state = await getProjectVault(work.workspace_id, work.project_id)
  if (state.my_state !== "ready" || !state.my_sealed_key || !state.key_version) return []
  const fromVersion = state.key_version
  const oldKey = await vaultSession.projectKey(work.project_id, fromVersion, state.my_sealed_key)
  const material = await unwrap(
    client.GET("/api/workspaces/{workspace_id}/projects/{project_id}/vault/rotation-material", {
      params: { path: { workspace_id: work.workspace_id, project_id: work.project_id } },
    }),
  )
  const newVersion = fromVersion + 1
  const raw = generateProjectKey()
  try {
    const newKey = await importAesKey(raw, { keepRaw: true })
    const items = await reencryptAll(work.workspace_id, work.project_id, material.items, oldKey, newKey, newVersion)
    const { trusted, changed } = trustedRecipients(state.recipients)
    const grants = await sealFor(trusted, raw, work.project_id, newVersion)
    await unwrap(
      client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/vault/rotate", {
        params: { path: { workspace_id: work.workspace_id, project_id: work.project_id } },
        body: { from_version: fromVersion, grants, items },
      }),
    )
    rememberKeys(me(), trusted)
    vaultSession.forgetProject(work.project_id)
    return changed.map((c) => ({ ...c, workspaceId: work.workspace_id, projectId: work.project_id, projectName: work.project_name }))
  } finally {
    wipe(raw)
  }
}

async function grantProject(work: PendingWork, only?: Set<string>): Promise<{ granted: number; changed: ProjectKeyChange[] }> {
  const state = await getProjectVault(work.workspace_id, work.project_id)
  if (state.my_state !== "ready" || !state.my_sealed_key || !state.key_version) return { granted: 0, changed: [] }
  const keyVersion = state.key_version
  const missing = state.recipients.filter((r) => state.missing.includes(r.user_id) && (!only || only.has(r.user_id)))
  const { trusted, changed } = trustedRecipients(missing)
  if (trusted.length > 0) {
    const grants = await vaultSession.withRawProjectKey(work.project_id, keyVersion, state.my_sealed_key, (raw) =>
      sealFor(trusted, raw, work.project_id, keyVersion),
    )
    await unwrap(
      client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/vault/grants", {
        params: { path: { workspace_id: work.workspace_id, project_id: work.project_id } },
        body: { key_version: keyVersion, grants },
      }),
    )
    rememberKeys(me(), trusted)
  }
  return {
    granted: trusted.length,
    changed: changed.map((c) => ({ ...c, workspaceId: work.workspace_id, projectId: work.project_id, projectName: work.project_name })),
  }
}

export interface SyncResult {
  granted: number
  rotated: string[]
  keyChanges: ProjectKeyChange[]
  failures: string[]
}

/**
 * Complete everything this browser can: rotations first (so new members get the new key),
 * then pending grants. Runs automatically whenever the vault is unlocked.
 */
export async function runPendingWork(): Promise<SyncResult> {
  const result: SyncResult = { granted: 0, rotated: [], keyChanges: [], failures: [] }
  if (!vaultSession.isUnlocked) return result
  const work = await unwrap(client.GET("/api/vault/pending-work"))
  for (const item of work) {
    try {
      if (item.rotation_pending) {
        result.keyChanges.push(...(await rotateProject(item)))
        result.rotated.push(item.project_name)
      } else {
        const r = await grantProject(item)
        result.granted += r.granted
        result.keyChanges.push(...r.changed)
      }
    } catch (error) {
      // A concurrent change (409) simply gets retried on the next run.
      if (!(error instanceof ApiError && error.status === 409)) result.failures.push(item.project_name)
    }
  }
  return result
}

/** The user compared fingerprints and accepted a teammate's new key: share with them now. */
export async function trustAndGrant(change: ProjectKeyChange): Promise<void> {
  rememberKeys(me(), [change.recipient])
  await grantProject(
    {
      workspace_id: change.workspaceId,
      workspace_name: "",
      project_id: change.projectId,
      project_name: change.projectName,
      key_version: 0,
      rotation_pending: false,
      recipients: [change.recipient],
    },
    new Set([change.recipient.user_id]),
  )
}
