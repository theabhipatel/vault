/**
 * Vault cryptography. Runs only in the browser (and in tests under Node's WebCrypto).
 *
 *   vault password ──Argon2id──► KEK ──AES-256-GCM──► X25519 private key (stored encrypted)
 *   recovery key (256 bit) ──────────AES-256-GCM──► the same private key (second copy)
 *   project key (256 bit, versioned) ──sealed box──► one copy per member (their public key)
 *   project key ──AES-256-GCM (+AAD: where it belongs)──► every secure document version
 *
 * Only the algorithms required by the spec are used: libsodium (Argon2id, X25519 sealed boxes)
 * and WebCrypto (AES-256-GCM). Randomness comes from crypto.getRandomValues / libsodium's CSPRNG.
 */
import sodium from "libsodium-wrappers-sumo"

export const KDF_ALGORITHM = "argon2id13" as const
const MIB = 1024 * 1024
/** Requirement floor (and what the server enforces): 64 MiB, 3 iterations. */
export const MIN_KDF = { ops: 3, mem: 64 * MIB } as const
const AAD_PREFIX = "vault:v1"

export interface KdfParams {
  algorithm: typeof KDF_ALGORITHM
  salt: string
  ops: number
  mem: number
}

export interface Keypair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

/** The encrypted keypair as stored on the server. */
export interface StoredVault {
  public_key: string
  kdf: KdfParams
  encrypted_private_key: string
  private_key_nonce: string
  recovery_encrypted_private_key: string
  recovery_nonce: string
}

export interface Encrypted {
  ciphertext: string
  nonce: string
}

/** Thrown when authenticated decryption fails: wrong key, wrong password or tampered data. */
export class DecryptionError extends Error {
  constructor(message = "Decryption failed") {
    super(message)
    this.name = "DecryptionError"
  }
}

let ready: Promise<typeof sodium> | null = null
export function getSodium(): Promise<typeof sodium> {
  ready ??= sodium.ready.then(() => sodium)
  return ready
}

// ---- Encoding --------------------------------------------------------------------------------

export function toB64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function fromB64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Overwrite secret bytes once they're no longer needed. */
export function wipe(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const b of buffers) b?.fill(0)
}

/** WebCrypto wants an ArrayBuffer-backed view; copy into a fresh one. */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  return copy
}

// ---- Key derivation --------------------------------------------------------------------------

/** Argon2id → 32 bytes. Call via the worker in the UI (it blocks for ~1 s by design). */
export async function deriveKeyBytes(password: string, params: KdfParams): Promise<Uint8Array> {
  if (params.algorithm !== KDF_ALGORITHM) throw new Error("Unsupported KDF")
  if (params.ops < MIN_KDF.ops || params.mem < MIN_KDF.mem) throw new Error("KDF parameters too weak")
  const s = await getSodium()
  return s.crypto_pwhash(32, password, fromB64(params.salt), params.ops, params.mem, s.crypto_pwhash_ALG_ARGON2ID13)
}

export function newKdfParams(ops: number = MIN_KDF.ops, mem: number = MIN_KDF.mem): KdfParams {
  return { algorithm: KDF_ALGORITHM, salt: toB64(randomBytes(16)), ops, mem }
}

/** Import raw key bytes as a non-extractable AES-256-GCM key, then wipe the bytes. */
export async function importAesKey(raw: Uint8Array, { keepRaw = false } = {}): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("AES-256 keys are 32 bytes")
  const key = await crypto.subtle.importKey("raw", buf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
  if (!keepRaw) wipe(raw)
  return key
}

// ---- AES-256-GCM -----------------------------------------------------------------------------

export async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<Encrypted> {
  // A fresh random 96-bit nonce for every single encryption.
  const nonce = randomBytes(12)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: buf(nonce), additionalData: buf(encoder.encode(aad)), tagLength: 128 },
    key,
    buf(plaintext),
  )
  return { ciphertext: toB64(new Uint8Array(ciphertext)), nonce: toB64(nonce) }
}

export async function aesDecrypt(key: CryptoKey, data: Encrypted, aad: string): Promise<Uint8Array> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf(fromB64(data.nonce)), additionalData: buf(encoder.encode(aad)), tagLength: 128 },
      key,
      buf(fromB64(data.ciphertext)),
    )
    return new Uint8Array(plain)
  } catch {
    throw new DecryptionError()
  }
}

// ---- Additional authenticated data -----------------------------------------------------------
// Binding every ciphertext to where it belongs stops a malicious server from swapping or
// replaying ciphertexts between users, documents, versions or key versions undetected.

export function privateKeyAad(userId: string, publicKey: string, purpose: "password" | "recovery"): string {
  return `${AAD_PREFIX}|private-key|${purpose}|user:${userId}|pk:${publicKey}`
}

export interface DocContext {
  workspaceId: string
  projectId: string
  documentId: string
  version: number
  keyVersion: number
  format: string
}

export function documentAad(c: DocContext): string {
  return [
    AAD_PREFIX,
    "document",
    `ws:${c.workspaceId}`,
    `project:${c.projectId}`,
    `doc:${c.documentId}`,
    `ver:${c.version}`,
    `key:${c.keyVersion}`,
    `format:${c.format}`,
  ].join("|")
}

// ---- User keypair ----------------------------------------------------------------------------

export async function generateKeypair(): Promise<Keypair> {
  const s = await getSodium()
  const kp = s.crypto_box_keypair()
  return { publicKey: kp.publicKey, privateKey: kp.privateKey }
}

/** Recompute the public key from a decrypted private key (detects a mismatched blob). */
export async function publicKeyOf(privateKey: Uint8Array): Promise<Uint8Array> {
  const s = await getSodium()
  return s.crypto_scalarmult_base(privateKey)
}

async function wrapPrivateKey(key: CryptoKey, kp: Keypair, userId: string, purpose: "password" | "recovery"): Promise<Encrypted> {
  return aesEncrypt(key, kp.privateKey, privateKeyAad(userId, toB64(kp.publicKey), purpose))
}

async function unwrapPrivateKey(key: CryptoKey, data: Encrypted, userId: string, publicKey: string, purpose: "password" | "recovery"): Promise<Keypair> {
  const privateKey = await aesDecrypt(key, data, privateKeyAad(userId, publicKey, purpose))
  const derived = await publicKeyOf(privateKey)
  if (toB64(derived) !== publicKey) {
    wipe(privateKey)
    throw new DecryptionError("The stored public key doesn't match the private key")
  }
  return { publicKey: derived, privateKey }
}

// ---- Recovery key ----------------------------------------------------------------------------
// 256 random bits, shown once as 52 Crockford base32 characters in groups of four.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export function encodeRecoveryKey(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31]
  return out.match(/.{1,4}/g)?.join("-") ?? out
}

export function decodeRecoveryKey(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0")
  if (clean.length !== 52) throw new DecryptionError("A recovery key has 52 characters")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = CROCKFORD.indexOf(ch)
    if (idx < 0) throw new DecryptionError("That doesn't look like a recovery key")
    value = ((value << 5) | idx) & 0xffff
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  if (out.length !== 32) throw new DecryptionError("That doesn't look like a recovery key")
  return new Uint8Array(out)
}

// ---- Vault lifecycle -------------------------------------------------------------------------

export type DeriveFn = (password: string, params: KdfParams) => Promise<Uint8Array>

export interface NewVault {
  stored: StoredVault
  keypair: Keypair
  recoveryKey: string
}

/** Vault setup (and reset): new keypair, wrapped by the password and by a new recovery key. */
export async function createVault(userId: string, password: string, params: KdfParams, derive: DeriveFn = deriveKeyBytes): Promise<NewVault> {
  const keypair = await generateKeypair()
  const kek = await importAesKey(await derive(password, params))
  const byPassword = await wrapPrivateKey(kek, keypair, userId, "password")
  const recoveryBytes = randomBytes(32)
  const recoveryKey = encodeRecoveryKey(recoveryBytes)
  const byRecovery = await wrapPrivateKey(await importAesKey(recoveryBytes), keypair, userId, "recovery")
  return {
    keypair,
    recoveryKey,
    stored: {
      public_key: toB64(keypair.publicKey),
      kdf: params,
      encrypted_private_key: byPassword.ciphertext,
      private_key_nonce: byPassword.nonce,
      recovery_encrypted_private_key: byRecovery.ciphertext,
      recovery_nonce: byRecovery.nonce,
    },
  }
}

export async function unlockWithPassword(stored: StoredVault, userId: string, password: string, derive: DeriveFn = deriveKeyBytes): Promise<Keypair> {
  const kek = await importAesKey(await derive(password, stored.kdf))
  return unwrapPrivateKey(
    kek,
    { ciphertext: stored.encrypted_private_key, nonce: stored.private_key_nonce },
    userId,
    stored.public_key,
    "password",
  )
}

export async function unlockWithRecoveryKey(stored: StoredVault, userId: string, recoveryKey: string): Promise<Keypair> {
  const key = await importAesKey(decodeRecoveryKey(recoveryKey))
  return unwrapPrivateKey(
    key,
    { ciphertext: stored.recovery_encrypted_private_key, nonce: stored.recovery_nonce },
    userId,
    stored.public_key,
    "recovery",
  )
}

/** Change password: the *same* private key under a new salt and password (nothing to re-share). */
export async function rewrapWithPassword(keypair: Keypair, userId: string, password: string, params: KdfParams, derive: DeriveFn = deriveKeyBytes) {
  const kek = await importAesKey(await derive(password, params))
  const wrapped = await wrapPrivateKey(kek, keypair, userId, "password")
  return {
    public_key: toB64(keypair.publicKey),
    kdf: params,
    encrypted_private_key: wrapped.ciphertext,
    private_key_nonce: wrapped.nonce,
  }
}

/** A new recovery key for the same private key; the old one stops working once saved. */
export async function rewrapWithNewRecoveryKey(keypair: Keypair, userId: string) {
  const recoveryBytes = randomBytes(32)
  const recoveryKey = encodeRecoveryKey(recoveryBytes)
  const wrapped = await wrapPrivateKey(await importAesKey(recoveryBytes), keypair, userId, "recovery")
  return {
    recoveryKey,
    payload: {
      public_key: toB64(keypair.publicKey),
      recovery_encrypted_private_key: wrapped.ciphertext,
      recovery_nonce: wrapped.nonce,
    },
  }
}

// ---- Project keys (sealed boxes) -------------------------------------------------------------
// Sealed payload = 0x01 || 32-byte key || first 16 bytes of SHA-256(binding). The binding names
// the project and key version, so a sealed key can't be presented as another project's key.

async function binding(projectId: string, keyVersion: number): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", buf(encoder.encode(`${AAD_PREFIX}|project-key|${projectId}|${keyVersion}`)))
  return new Uint8Array(digest).slice(0, 16)
}

export function generateProjectKey(): Uint8Array {
  return randomBytes(32)
}

export async function sealProjectKey(projectKey: Uint8Array, recipientPublicKey: string, projectId: string, keyVersion: number): Promise<string> {
  const s = await getSodium()
  const payload = new Uint8Array(1 + 32 + 16)
  payload[0] = 1
  payload.set(projectKey, 1)
  payload.set(await binding(projectId, keyVersion), 33)
  const sealed = s.crypto_box_seal(payload, fromB64(recipientPublicKey))
  wipe(payload)
  return toB64(sealed)
}

/** Returns the raw project key bytes; callers must wipe or import (and wipe) them promptly. */
export async function openProjectKey(sealed: string, keypair: Keypair, projectId: string, keyVersion: number): Promise<Uint8Array> {
  const s = await getSodium()
  let payload: Uint8Array
  try {
    payload = s.crypto_box_seal_open(fromB64(sealed), keypair.publicKey, keypair.privateKey)
  } catch {
    throw new DecryptionError("This project key wasn't sealed to your current key")
  }
  const expected = await binding(projectId, keyVersion)
  const ok = payload.length === 49 && payload[0] === 1 && expected.every((b, i) => payload[33 + i] === b)
  if (!ok) {
    wipe(payload)
    throw new DecryptionError("This sealed key belongs to a different project or version")
  }
  const key = payload.slice(1, 33)
  wipe(payload)
  return key
}

// ---- Documents -------------------------------------------------------------------------------

export async function encryptDocument(projectKey: CryptoKey, text: string, ctx: DocContext): Promise<Encrypted> {
  const plain = encoder.encode(text)
  const result = await aesEncrypt(projectKey, plain, documentAad(ctx))
  wipe(plain)
  return result
}

export async function decryptDocument(projectKey: CryptoKey, data: Encrypted, ctx: DocContext): Promise<string> {
  const plain = await aesDecrypt(projectKey, data, documentAad(ctx))
  const text = decoder.decode(plain)
  wipe(plain)
  return text
}

// ---- Fingerprints ----------------------------------------------------------------------------

/** Short human-comparable fingerprint: first 128 bits of SHA-256(public key), grouped. */
export async function fingerprint(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buf(fromB64(publicKey))))
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()
  return hex.match(/.{4}/g)?.join(" ") ?? hex
}

export const KDF_MIB = MIB
