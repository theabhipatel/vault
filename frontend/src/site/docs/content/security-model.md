Secure Vault is built so that the server is never trusted with your secrets. This page explains what that protects against, what the server can and can't see, the other defences around it, and where the limits are.

## The goal

**An attacker who fully compromises the server gets nothing readable.** That covers the server machine, the database, the backend code, backups and every stored encrypted blob. With all of that, they still can't decrypt a single secure document.

That's possible because all secure-document cryptography happens in your browser. The server stores and serves opaque data and enforces who may receive it, but it never holds anything that can decrypt it.

### What's in scope

- **Secure documents** are end-to-end encrypted. This page is about them.
- **Normal documents** are deliberately **out of scope**. They're protected by access control, but the server can read them, which keeps them simple and searchable. The app says so on every normal document: "Normal document: protected by access control, but readable by the server."

Keep passwords, keys and tokens in [secure documents](/docs/secure-documents).

### The threat model in brief

| Attacker | Outcome |
|---|---|
| Steals a database dump or backup | Gets only ciphertext, sealed keys, public keys and encrypted private keys. Nothing readable without a vault password or recovery key |
| Reads or modifies the database | Can't decrypt. Swapped or edited ciphertext fails its integrity check in the browser |
| Hands out a fake public key to intercept project keys | Blocked by key pinning and a loud warning; caught by fingerprint comparison |
| Takes over the **live** server and changes the JavaScript it serves | **Not fully prevented.** See [Known limitations](/docs/limitations) |

## What the server stores vs never sees

For secure documents, this is everything the server stores:

| Stored | What it is | Useful to an attacker? |
|---|---|---|
| Your public key | X25519, in the clear. Public keys aren't secret | No |
| Your private key, encrypted twice | AES-256-GCM, once under a key derived from your vault password and once under your recovery key | Only with your vault password (hardened with Argon2id) or your 256-bit recovery key |
| Password hashing salt and settings | Argon2id parameters, per user | No |
| Sealed project keys | One copy per member, sealed to their public key | Only with that member's private key |
| Document ciphertext | AES-256-GCM with a fresh nonce, bound to its location | Only with the project key |

The server **never** sees:

- your vault password or recovery key,
- your private key in usable form,
- any project key,
- any plaintext secret.

What the server **can** see is metadata: document and project names, formats and sizes, who accessed what and when, and membership. Metadata is not encrypted, so never put a secret in a document or project name.

## Protections around the cryptography

Encryption only helps if the code doing it is the code you expect. Secure Vault adds several layers around it.

### Front-end integrity

- **Strict Content Security Policy.** Scripts load only from the app's own origin. There are no inline scripts and no `eval`. The one exception, `wasm-unsafe-eval`, lets the cryptography library's WebAssembly compile.
- **Subresource Integrity.** Every script, stylesheet and module preload in the page carries a sha384 hash. The browser refuses any file that doesn't match.
- **Same origin only.** The app and its API are served from one origin, so cookies stay first-party and cross-origin requests stay closed.
- **No third-party code.** No third-party scripts, fonts or CDNs. Fonts are bundled.
- **Other headers.** Framing is blocked (`frame-ancestors 'none'`), and `nosniff`, `no-referrer`, COOP and HSTS are set.

### Accounts and the API

- **CSRF protection.** Every request that changes something needs a double-submit token and passes an Origin check.
- **Cookies.** Sessions are random 256-bit tokens in `HttpOnly`, `SameSite=Lax` cookies, with `Secure` and the `__Host-` prefix over HTTPS. The server stores them hashed. They expire, and you can revoke them per device.
- **Login passwords** are hashed with Argon2id on the server. Your login password never touches encryption. Changing or resetting it signs out your other sessions.
- **Rate limits.** Sign-in and other sensitive endpoints are rate limited per IP. Each email address is locked out after 5 failed sign-ins in 15 minutes, and that behaves the same whether or not the address exists.
- **Server-side permissions.** Every permission and hierarchy rule is checked on every request, using the identity from your session, never from request data.

### Inside the browser

- Keys stay in memory only and are never written to browser storage. See [Unlocking](/docs/unlocking).
- Every ciphertext is bound to where it belongs, so a server can't swap or replay blobs undetected. See [Cryptography](/docs/cryptography).
- The browser recomputes your public key from the decrypted private key on every unlock and checks it matches the stored one.

## Trust and verification

A compromised server's best trick is to give your teammates a public key it controls, so they seal project keys to it. Secure Vault counters this in three ways:

1. **Fingerprints.** Every user has a fingerprint, computed in the browser from their public key. Compare it with teammates over a channel the server doesn't control.
2. **Pinning.** Your browser remembers the public keys it has shared with. If one changes, nothing is shared until you see the old and new fingerprints and confirm.
3. **Transparency.** Every key change is written to the audit log of each workspace the person belongs to, and that workspace's admins are notified.

See [Sharing secure access](/docs/sharing-access) for how to verify.

The [audit log](/docs/audit-log) adds accountability. It's append-only at the database level and never contains content, passwords or key material.

## Honest limitations

No browser-based end-to-end encryption is perfect. The most important limits:

- **A live server compromise can serve modified JavaScript** that captures your vault password the next time you unlock. Stored data stays safe, but future secrets don't.
- **Pinning is per browser.** On a fresh browser the first key you see is trusted.
- **Metadata isn't encrypted.** Names, sizes, access times and membership are visible to the server.
- **JavaScript can't fully wipe memory.** Decrypted text lingers until the browser frees it.
- **Browser-reported audit events are best effort.** A modified client can skip them.

> [!IMPORTANT]
> Read [Known limitations](/docs/limitations) before trusting Secure Vault with high-value secrets. It explains each limit and what you can do about it.

For the algorithms and key hierarchy, see [Cryptography](/docs/cryptography).
