/**
 * Crypto flows, run against the real libraries (libsodium + WebCrypto) exactly as the browser
 * uses them. Each "user" below only ever sees what the server would store for them, so the
 * sharing tests are genuinely one browser encrypting and another decrypting.
 */
import { beforeAll, describe, expect, it } from "vitest"

import {
  DecryptionError,
  MIN_KDF,
  createVault,
  decodeRecoveryKey,
  decryptDocument,
  encodeRecoveryKey,
  encryptDocument,
  fingerprint,
  generateProjectKey,
  getSodium,
  importAesKey,
  newKdfParams,
  openProjectKey,
  rewrapWithNewRecoveryKey,
  rewrapWithPassword,
  sealProjectKey,
  toB64,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from "./crypto"
import type { DocContext, Keypair, StoredVault } from "./crypto"
import { reencryptAll } from "./protocol"

const WS = "11111111-1111-4111-8111-111111111111"
const PROJECT = "22222222-2222-4222-8222-222222222222"
const OTHER_PROJECT = "33333333-3333-4333-8333-333333333333"

/** What a user's browser holds after unlocking: only derived from server-stored blobs. */
interface Browser {
  userId: string
  stored: StoredVault
  keypair: Keypair
  recoveryKey: string
}

async function newUser(userId: string, password: string): Promise<Browser> {
  const v = await createVault(userId, password, newKdfParams(MIN_KDF.ops, MIN_KDF.mem))
  // A fresh "browser": forget the in-memory keypair and unlock from the stored blobs only.
  const keypair = await unlockWithPassword(v.stored, userId, password)
  return { userId, stored: v.stored, keypair, recoveryKey: v.recoveryKey }
}

function ctx(documentId: string, version: number, keyVersion: number, projectId = PROJECT): DocContext {
  return { workspaceId: WS, projectId, documentId, version, keyVersion, format: "env" }
}

let alice: Browser
let bob: Browser

beforeAll(async () => {
  await getSodium()
  alice = await newUser("aaaaaaaa-0000-4000-8000-000000000001", "alice correct horse battery")
  bob = await newUser("bbbbbbbb-0000-4000-8000-000000000002", "bob tr0ub4dor & 3 staples")
})

describe("vault setup and unlock", () => {
  it("stores only public material and ciphertext", () => {
    expect(alice.stored.kdf.algorithm).toBe("argon2id13")
    expect(alice.stored.kdf.ops).toBeGreaterThanOrEqual(3)
    expect(alice.stored.kdf.mem).toBeGreaterThanOrEqual(64 * 1024 * 1024)
    expect(atob(alice.stored.kdf.salt)).toHaveLength(16)
    const blob = JSON.stringify(alice.stored)
    expect(blob).not.toContain(toB64(alice.keypair.privateKey))
    expect(blob).not.toContain("alice correct horse")
  })

  it("unlocks with the right password and rejects a wrong one", async () => {
    const again = await unlockWithPassword(alice.stored, alice.userId, "alice correct horse battery")
    expect(toB64(again.publicKey)).toBe(alice.stored.public_key)
    await expect(unlockWithPassword(alice.stored, alice.userId, "wrong password here")).rejects.toBeInstanceOf(DecryptionError)
  })

  it("binds the encrypted private key to its owner (no swapping between users)", async () => {
    await expect(unlockWithPassword(alice.stored, bob.userId, "alice correct horse battery")).rejects.toBeInstanceOf(DecryptionError)
    const franken: StoredVault = { ...alice.stored, public_key: bob.stored.public_key }
    await expect(unlockWithPassword(franken, alice.userId, "alice correct horse battery")).rejects.toBeInstanceOf(DecryptionError)
  })

  it("rejects KDF parameters below the required minimum", async () => {
    await expect(createVault("u", "some long password", newKdfParams(2, MIN_KDF.mem))).rejects.toThrow()
  })
})

describe("recovery key and password change", () => {
  it("round-trips the recovery key format", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const text = encodeRecoveryKey(bytes)
    expect(text).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/)
    expect(decodeRecoveryKey(text)).toEqual(bytes)
    // Forgiving input: lowercase, spaces, ambiguous letters.
    expect(decodeRecoveryKey(text.toLowerCase().replace(/-/g, " "))).toEqual(bytes)
  })

  it("recovers the same keypair with the recovery key", async () => {
    const kp = await unlockWithRecoveryKey(alice.stored, alice.userId, alice.recoveryKey)
    expect(toB64(kp.publicKey)).toBe(alice.stored.public_key)
    await expect(unlockWithRecoveryKey(alice.stored, alice.userId, bob.recoveryKey)).rejects.toBeInstanceOf(DecryptionError)
  })

  it("changes the password without changing the keypair", async () => {
    const payload = await rewrapWithPassword(alice.keypair, alice.userId, "a brand new vault passphrase", newKdfParams())
    const updated: StoredVault = { ...alice.stored, ...payload }
    expect(updated.kdf.salt).not.toBe(alice.stored.kdf.salt)
    const kp = await unlockWithPassword(updated, alice.userId, "a brand new vault passphrase")
    expect(toB64(kp.publicKey)).toBe(alice.stored.public_key)
    await expect(unlockWithPassword(updated, alice.userId, "alice correct horse battery")).rejects.toBeInstanceOf(DecryptionError)
  })

  it("forgot password + recovery key: new password and new recovery key; old key stops working", async () => {
    const kp = await unlockWithRecoveryKey(alice.stored, alice.userId, alice.recoveryKey)
    const pw = await rewrapWithPassword(kp, alice.userId, "recovered vault password!", newKdfParams())
    const rec = await rewrapWithNewRecoveryKey(kp, alice.userId)
    const updated: StoredVault = { ...alice.stored, ...pw, ...rec.payload }
    expect(toB64((await unlockWithPassword(updated, alice.userId, "recovered vault password!")).publicKey)).toBe(alice.stored.public_key)
    expect(toB64((await unlockWithRecoveryKey(updated, alice.userId, rec.recoveryKey)).publicKey)).toBe(alice.stored.public_key)
    await expect(unlockWithRecoveryKey(updated, alice.userId, alice.recoveryKey)).rejects.toBeInstanceOf(DecryptionError)
  })
})

describe("sharing between users", () => {
  it("Alice encrypts, Bob decrypts with the project key sealed to him", async () => {
    const raw = generateProjectKey()
    const forBob = await sealProjectKey(raw, bob.stored.public_key, PROJECT, 1)
    const aliceKey = await importAesKey(raw.slice())
    const secret = "STRIPE_KEY=sk_live_123\nDB_URL=postgres://u:p@h/db\n"
    const enc = await encryptDocument(aliceKey, secret, ctx("doc-1", 1, 1))
    expect(enc.ciphertext).not.toContain("sk_live")

    // Bob's browser: unlock from stored blobs, unseal, decrypt.
    const bobKeypair = await unlockWithPassword(bob.stored, bob.userId, "bob tr0ub4dor & 3 staples")
    const bobRaw = await openProjectKey(forBob, bobKeypair, PROJECT, 1)
    const bobKey = await importAesKey(bobRaw)
    expect(await decryptDocument(bobKey, enc, ctx("doc-1", 1, 1))).toBe(secret)
    expect(bobRaw.every((b) => b === 0)).toBe(true) // raw key bytes were wiped after import
  })

  it("a sealed key only opens for its recipient, project and key version", async () => {
    const raw = generateProjectKey()
    const forBob = await sealProjectKey(raw, bob.stored.public_key, PROJECT, 1)
    await expect(openProjectKey(forBob, alice.keypair, PROJECT, 1)).rejects.toBeInstanceOf(DecryptionError)
    await expect(openProjectKey(forBob, bob.keypair, OTHER_PROJECT, 1)).rejects.toBeInstanceOf(DecryptionError)
    await expect(openProjectKey(forBob, bob.keypair, PROJECT, 2)).rejects.toBeInstanceOf(DecryptionError)
  })

  it("ciphertexts can't be swapped or replayed between documents, versions or projects", async () => {
    const key = await importAesKey(generateProjectKey())
    const enc = await encryptDocument(key, "v1 content", ctx("doc-1", 1, 1))
    await expect(decryptDocument(key, enc, ctx("doc-2", 1, 1))).rejects.toBeInstanceOf(DecryptionError)
    await expect(decryptDocument(key, enc, ctx("doc-1", 2, 1))).rejects.toBeInstanceOf(DecryptionError)
    await expect(decryptDocument(key, enc, ctx("doc-1", 1, 2))).rejects.toBeInstanceOf(DecryptionError)
    await expect(decryptDocument(key, enc, ctx("doc-1", 1, 1, OTHER_PROJECT))).rejects.toBeInstanceOf(DecryptionError)
    const tampered = { ...enc, ciphertext: toB64(Uint8Array.from(atob(enc.ciphertext), (c, i) => (i === 0 ? c.charCodeAt(0) ^ 1 : c.charCodeAt(0)))) }
    await expect(decryptDocument(key, tampered, ctx("doc-1", 1, 1))).rejects.toBeInstanceOf(DecryptionError)
  })

  it("uses a fresh nonce for every encryption", async () => {
    const key = await importAesKey(generateProjectKey())
    const a = await encryptDocument(key, "same", ctx("doc-1", 1, 1))
    const b = await encryptDocument(key, "same", ctx("doc-1", 1, 1))
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
})

describe("revocation and rotation", () => {
  it("re-encrypts every version with a new key that the removed user never receives", async () => {
    const oldRaw = generateProjectKey()
    const bobsCopy = await sealProjectKey(oldRaw, bob.stored.public_key, PROJECT, 1)
    const oldKey = await importAesKey(oldRaw.slice())
    const items = await Promise.all(
      [1, 2, 3].map(async (version) => ({
        document_id: "doc-9",
        version,
        format: "env",
        key_version: 1,
        ...(await encryptDocument(oldKey, `SECRET=v${version}`, ctx("doc-9", version, 1))),
      })),
    )

    // Alice's browser rotates: new key v2, sealed only to Alice (Bob was removed).
    const newRaw = generateProjectKey()
    const newKey = await importAesKey(newRaw.slice())
    const rotated = await reencryptAll(WS, PROJECT, items, oldKey, newKey, 2)
    const aliceCopy = await sealProjectKey(newRaw, alice.stored.public_key, PROJECT, 2)

    const aliceKey = await importAesKey(await openProjectKey(aliceCopy, alice.keypair, PROJECT, 2))
    for (const [i, item] of rotated.entries()) {
      expect(await decryptDocument(aliceKey, item, ctx("doc-9", i + 1, 2))).toBe(`SECRET=v${i + 1}`)
      expect(item.nonce).not.toBe(items[i].nonce)
    }
    // Bob still has the old key in memory: it opens nothing that was rotated.
    const bobOld = await importAesKey(await openProjectKey(bobsCopy, bob.keypair, PROJECT, 1))
    await expect(decryptDocument(bobOld, rotated[0], ctx("doc-9", 1, 2))).rejects.toBeInstanceOf(DecryptionError)
    await expect(decryptDocument(bobOld, rotated[0], ctx("doc-9", 1, 1))).rejects.toBeInstanceOf(DecryptionError)
    await expect(openProjectKey(aliceCopy, bob.keypair, PROJECT, 2)).rejects.toBeInstanceOf(DecryptionError)
  })

  it("after a vault reset, keys sealed to the old keypair are useless", async () => {
    const raw = generateProjectKey()
    const sealedToOld = await sealProjectKey(raw, bob.stored.public_key, PROJECT, 1)
    const reset = await newUser(bob.userId, "bob's brand new vault password")
    expect(reset.stored.public_key).not.toBe(bob.stored.public_key)
    await expect(openProjectKey(sealedToOld, reset.keypair, PROJECT, 1)).rejects.toBeInstanceOf(DecryptionError)
    // Re-granted to the new key, access works again.
    const regranted = await sealProjectKey(raw, reset.stored.public_key, PROJECT, 1)
    expect(await openProjectKey(regranted, reset.keypair, PROJECT, 1)).toEqual(raw)
  })
})

describe("fingerprints", () => {
  it("are short, stable and differ between keys", async () => {
    const a = await fingerprint(alice.stored.public_key)
    expect(a).toMatch(/^([0-9A-F]{4} ){7}[0-9A-F]{4}$/)
    expect(await fingerprint(alice.stored.public_key)).toBe(a)
    expect(await fingerprint(bob.stored.public_key)).not.toBe(a)
  })
})
