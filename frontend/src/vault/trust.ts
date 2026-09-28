/**
 * Public-key pinning (trust on first use).
 *
 * The browser remembers every public key it has sealed a project key to. If the server later
 * presents a different key for the same person (a vault reset, or a compromised server trying
 * to receive keys itself), nothing is sealed until the user explicitly confirms the change.
 * Public keys are not secret, so keeping them in localStorage is safe.
 */

export interface KeyHolder {
  user_id: string
  public_key: string
}

export interface KeyChange<T extends KeyHolder = KeyHolder> {
  recipient: T
  previous: string
}

function storageKey(myUserId: string): string {
  return `vault-known-keys:${myUserId}`
}

function read(myUserId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(myUserId))
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function write(myUserId: string, known: Record<string, string>): void {
  try {
    localStorage.setItem(storageKey(myUserId), JSON.stringify(known))
  } catch {
    // Without storage every key is "first seen"; warnings then rely on fingerprint checks.
  }
}

export function classifyRecipients<T extends KeyHolder>(myUserId: string, recipients: T[]): { trusted: T[]; changed: KeyChange<T>[] } {
  const known = read(myUserId)
  const trusted: T[] = []
  const changed: KeyChange<T>[] = []
  for (const r of recipients) {
    const previous = known[r.user_id]
    if (previous && previous !== r.public_key) changed.push({ recipient: r, previous })
    else trusted.push(r)
  }
  return { trusted, changed }
}

export function rememberKeys(myUserId: string, recipients: KeyHolder[]): void {
  const known = read(myUserId)
  for (const r of recipients) known[r.user_id] = r.public_key
  write(myUserId, known)
}

export function knownKeyFor(myUserId: string, userId: string): string | null {
  return read(myUserId)[userId] ?? null
}
