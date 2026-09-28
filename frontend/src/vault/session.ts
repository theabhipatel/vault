/**
 * The unlocked vault lives only here, in JavaScript memory.
 *
 * - The private key is a byte array that is overwritten on lock.
 * - Project keys are imported as non-extractable WebCrypto keys; raw bytes exist only
 *   momentarily when a key has to be re-sealed for a teammate.
 * - Nothing is ever written to localStorage, sessionStorage, IndexedDB or cookies, sent to
 *   the server, or logged. A reload or closed tab therefore locks the vault.
 */
import { importAesKey, openProjectKey, toB64, wipe } from "./crypto"
import type { Keypair } from "./crypto"

type Listener = () => void

class VaultSession {
  private keypair: Keypair | null = null
  private owner: string | null = null
  private projectKeys = new Map<string, CryptoKey>()
  private listeners = new Set<Listener>()
  private version = 0

  get isUnlocked(): boolean {
    return this.keypair !== null
  }

  get userId(): string | null {
    return this.owner
  }

  get publicKey(): string | null {
    return this.keypair ? toB64(this.keypair.publicKey) : null
  }

  /** A counter that changes on lock/unlock (for useSyncExternalStore). */
  snapshot = (): number => this.version

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.version += 1
    for (const l of this.listeners) l()
  }

  unlock(userId: string, keypair: Keypair): void {
    this.lock({ silent: true })
    this.owner = userId
    this.keypair = keypair
    this.emit()
  }

  lock({ silent = false } = {}): void {
    if (this.keypair) wipe(this.keypair.privateKey)
    this.keypair = null
    this.owner = null
    this.projectKeys.clear()
    if (!silent) this.emit()
  }

  /** Borrow the keypair for re-wrapping (password change, recovery key). Never store it. */
  requireKeypair(): Keypair {
    if (!this.keypair) throw new VaultLockedError()
    return this.keypair
  }

  /** Non-extractable AES key for a project key version, unsealed on first use and cached. */
  async projectKey(projectId: string, keyVersion: number, sealed: string): Promise<CryptoKey> {
    const cacheKey = `${projectId}:${keyVersion}`
    const cached = this.projectKeys.get(cacheKey)
    if (cached) return cached
    const raw = await openProjectKey(sealed, this.requireKeypair(), projectId, keyVersion)
    const key = await importAesKey(raw) // wipes `raw`
    this.projectKeys.set(cacheKey, key)
    return key
  }

  /** Unseal the raw key bytes for the duration of `fn` (to re-seal them for someone else). */
  async withRawProjectKey<T>(projectId: string, keyVersion: number, sealed: string, fn: (raw: Uint8Array) => Promise<T>): Promise<T> {
    const raw = await openProjectKey(sealed, this.requireKeypair(), projectId, keyVersion)
    try {
      return await fn(raw)
    } finally {
      wipe(raw)
    }
  }

  forgetProject(projectId: string): void {
    for (const key of this.projectKeys.keys()) {
      if (key.startsWith(`${projectId}:`)) this.projectKeys.delete(key)
    }
  }
}

export class VaultLockedError extends Error {
  constructor() {
    super("Unlock your vault first.")
    this.name = "VaultLockedError"
  }
}

export const vaultSession = new VaultSession()
