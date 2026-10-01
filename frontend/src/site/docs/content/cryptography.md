This page describes exactly how Secure Vault encrypts secure documents: which algorithms it uses, how the keys fit together, and where they live. Each section starts in plain language and then gives the technical detail.

## Principles

- **Everything happens in the browser.** Encryption, decryption, key generation and password hashing all run on your device. The server only stores and serves opaque data.
- **Standard, well-reviewed building blocks.** libsodium and the browser's built-in WebCrypto. No custom cryptographic primitives, only the combinations described here.
- **Nothing readable on the server.** See [Security model](/docs/security-model) for what's stored.

## Algorithms

| Purpose | Algorithm | Library |
|---|---|---|
| Vault password → key-encryption key | **Argon2id**, 16-byte random salt, 32-byte output. At least 64 MiB and 3 passes, calibrated per device to about 1 second | libsodium.js (sumo build), in a Web Worker |
| Your personal keypair | **X25519** | libsodium `crypto_box_keypair` |
| Sharing a project key | **Sealed box** (`crypto_box_seal`) to the recipient's public key | libsodium |
| Encrypting your private key and all secure content | **AES-256-GCM**, random 96-bit nonce per encryption, 128-bit tag | WebCrypto |
| Fingerprints and key binding | **SHA-256** | WebCrypto |
| Randomness | `crypto.getRandomValues` and libsodium's CSPRNG | Browser |
| Login passwords (server side, unrelated to encryption) | Argon2id | argon2-cffi |

### Argon2id calibration

Argon2id is deliberately slow and memory-hungry, so each password guess is expensive. When you set or change your vault password, your browser tunes it to your device:

1. It starts at the floor of 64 MiB and 3 passes.
2. It doubles the memory, up to 256 MiB, while one run is still well under the target time.
3. If it's still under about 0.8 seconds, it raises the number of passes, up to 10, to approach 1 second.

The chosen settings are stored with your vault. The server rejects anything below 64 MiB or 3 passes. Hashing runs in a Web Worker so the page stays responsive.

## Key hierarchy

There are three layers of keys:

1. **Your vault password** protects **your private key**.
2. **Your private key** opens **project keys** that teammates sealed to you.
3. **Project keys** encrypt **secure documents**.

```text
vault password ──Argon2id(salt, params)──► KEK ──AES-256-GCM──► X25519 private key   (stored encrypted)
recovery key (256 bit) ─────────────────────AES-256-GCM──► same private key         (second copy)

project key vN (256 bit, random) ──sealed box──► one copy per member with secure access
project key vN ──AES-256-GCM + AAD──► every secure document version in the project
```

### Your keypair

When you [set up your vault](/docs/vault-setup), your browser generates an X25519 keypair. The private key is encrypted twice with AES-256-GCM:

- with a **key-encryption key (KEK)** derived from your vault password through Argon2id, and
- with your **recovery key**: 256 random bits, shown as 52 Crockford base32 characters in groups of four.

Both encrypted copies are stored on the server. Changing your password re-wraps the same private key under a new salt. Recovery re-wraps it under a new password and a new recovery key. Only a [vault reset](/docs/recovery) creates a new keypair.

### Project keys

Each project has a random 256-bit AES key. Your browser seals one copy to each member's public key with a libsodium sealed box. Only that member's private key can open it. See [Sharing secure access](/docs/sharing-access).

### Documents

Each version of a secure document is encrypted with the project key using AES-256-GCM and a fresh random 96-bit nonce. Every save produces a new ciphertext and a new nonce.

## Binding: what AAD prevents

AES-GCM lets you attach **additional authenticated data (AAD)**: a label that isn't encrypted but is covered by the integrity check. Decryption fails if the label doesn't match.

Secure Vault labels every ciphertext with where it belongs. A malicious server therefore can't move or replay blobs undetected. For example, it can't:

- swap one document's ciphertext into another document,
- relabel an old version's ciphertext as a newer version,
- move a document between projects or workspaces,
- present ciphertext under the wrong key version or format,
- hand you someone else's encrypted private key.

The labels:

```text
private key:  vault:v1|private-key|<password|recovery>|user:<id>|pk:<public key>
documents:    vault:v1|document|ws:<id>|project:<id>|doc:<id>|ver:<n>|key:<key version>|format:<fmt>
```

Sealed boxes have no AAD, so the sealed payload carries a binding instead. After the 32-byte key it includes the first 16 bytes of `SHA-256("vault:v1|project-key|<project>|<version>")`. Your browser checks this when opening it, so a sealed key can't be passed off as another project's key or version.

On unlock, your browser also recomputes your public key from the decrypted private key and checks it matches the stored public key.

When a document fails its check, the app shows **Couldn't decrypt this document**, the failure is reported to the [audit log](/docs/audit-log), and workspace admins are alerted.

## Key versions and rotation

Project keys are versioned: 1, 2, 3 and so on. The key version is part of every document's AAD.

When someone with a copy of the key loses access, the project is rotated. A key holder's browser generates version N+1, decrypts every secure document and every stored version, re-encrypts each with the new key (fresh nonce, new AAD), and seals the new key for the remaining members. The server applies it atomically, in one transaction, or not at all. Old sealed copies are then deleted. See [Revocation and key rotation](/docs/key-rotation).

## Where keys live

> [!NOTE]
> Unlocked keys exist only in the memory of the browser tab you unlocked. They're never written to localStorage, sessionStorage, IndexedDB or cookies, never sent to the server, and never logged.

- **Your private key** is held as a byte array and overwritten with zeros when the vault locks.
- **Project keys** are imported as **non-extractable** WebCrypto keys. Page code can use them to encrypt and decrypt but can't read their raw bytes back. The raw bytes exist only briefly while being sealed for a teammate, and are wiped straight afterwards.
- **Argon2id output** is transferred out of the Web Worker rather than copied, so no stray copy stays behind.
- **Decrypted content** is removed from the app's cache when the vault locks.

Reloading or closing the tab therefore locks the vault. See [Unlocking](/docs/unlocking).

The only vault-related things kept in browser storage are not secret: the public keys you've pinned, and your auto-lock preference.

## Fingerprints

A fingerprint is the first 128 bits of the SHA-256 hash of a public key, shown as 32 hexadecimal characters in groups of four. Browsers compute fingerprints themselves and never trust one supplied by the server.

## Randomness

All keys, salts, nonces and recovery keys come from the browser's cryptographically secure random number generator: `crypto.getRandomValues`, or libsodium's CSPRNG.
