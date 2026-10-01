No security design is perfect, and browser-based end-to-end encryption has some limits that can't be engineered away. This page lists them honestly, along with what you can do about each one. Read it before you trust Secure Vault with high-value secrets.

## Summary

| Limitation | Risk | What you can do |
|---|---|---|
| Live server compromise can serve modified JavaScript | Future secrets can be captured | Protect the server; distribute the frontend through a channel the server can't alter |
| Key pinning is per browser | A fake key can slip through on a fresh browser | Compare fingerprints out of band |
| Metadata isn't encrypted | Names, sizes, access patterns and membership are visible | Keep secrets out of names |
| JavaScript can't guarantee memory hygiene | Decrypted text lingers in memory for a while | Lock when done; keep devices secure |
| CSP allows inline styles | Slightly larger attack surface for injected styling | Nothing needed for scripts, which stay strict |
| Rotation is one request | Very large projects can hit the 256 MB cap | Split large projects |
| Clipboard clearing is best effort | Copied secrets can outlive 30 seconds | Paste promptly; clear manually |
| Browser-reported audit events are best effort | A modified client can hide unlocks and guesses | Use a strong vault password |
| Demo instances may be reset | Data can disappear | Never store real secrets on a demo |

## A live server compromise can still steal future secrets

**What it means.** Stored data stays safe even if an attacker gets the whole server and database. But an attacker who controls the **live** server can change the JavaScript it sends to browsers. Modified code could capture your vault password, or decrypted content, the next time you unlock.

This applies to every end-to-end encrypted app that runs in a web page. The page's code comes from the server, so you have to trust the server to send the right code.

**What reduces it.** A strict Content Security Policy, same-origin-only assets and Subresource Integrity hashes block injected third-party scripts and tampered CDN files. They can't help if the attacker replaces the main HTML page itself, because that page carries the hashes.

**What you can do:**

- Treat the server as high-value infrastructure: patch it, restrict access, and monitor it. See [Production](/docs/production).
- If your organisation needs more, distribute the frontend through a channel the server can't alter, such as a signed browser extension or desktop app.

## Key pinning is per browser

**What it means.** Your browser remembers teammates' public keys and warns you if one changes. But that memory lives in one browser. On a new browser, a new device or after clearing site data, the first key you see is trusted without a warning.

**What you can do.** Compare fingerprints with teammates over a channel the server doesn't control, such as in person or on a call. That's the real defence. Redo it when you start using a new browser for anything sensitive. See [Sharing secure access](/docs/sharing-access).

## Metadata isn't encrypted

**What it means.** The server can see:

- document and project names, formats and sizes;
- who accessed what, and when;
- workspace and project membership.

**What you can do.** Never put a secret in a document or project name. The app warns about this when you create a secure document. If even the existence of a project is sensitive, give it a neutral name.

## JavaScript can't guarantee memory hygiene

**What it means.** Keys are held as byte arrays that are overwritten on lock, and as non-extractable WebCrypto keys. But passwords and decrypted text are JavaScript strings, which can't be overwritten. They disappear only when the browser's garbage collector frees them.

**What you can do.** Lock your vault when you're done (**Lock now**), keep auto-lock short, close tabs you no longer need, and keep your device itself secure. Malware on your device can read secrets as you view them, whatever the app does. See [Unlocking](/docs/unlocking).

## The CSP allows inline styles

**What it means.** The Content Security Policy permits inline styles (`style-src 'unsafe-inline'`), because the UI library injects small `<style>` elements. Scripts are still strictly limited to the app's own files.

**What you can do.** Nothing in day-to-day use. This doesn't allow injected scripts.

## Rotation is a single request

**What it means.** [Key rotation](/docs/key-rotation) re-encrypts every secure document and every stored version in one request, so it can be applied atomically. That request is capped at 256 MB. Projects with hundreds of megabytes of secure history can exceed it, and their rotation will fail.

**What you can do.** Keep secure documents to what needs encryption, and split very large collections across several projects.

## Clipboard clearing is best effort

**What it means.** When you copy a secret, Secure Vault tries to clear the clipboard after 30 seconds. Browsers only allow this in some situations, often only while the tab has focus. Clipboard history tools and clipboard sync can also keep their own copies.

**What you can do.** Paste promptly, then copy something harmless to overwrite the clipboard. Turn off clipboard history or sync on machines where you handle secrets.

## Browser-reported audit events are best effort

**What it means.** Wrong vault passwords, unlocks and decryptions happen only on the user's device, so the server can't verify them. A modified client can skip reporting them. Someone who copied an encrypted key blob can guess passwords offline and never report anything. See [Audit log](/docs/audit-log).

**What you can do.** Rely on a strong, unique vault password, because Argon2id makes each guess slow and expensive. Treat browser-reported events as a useful signal for everyday mistakes and misuse, not as proof.

## Downloads and exports are plaintext

**What it means.** **Download** and **Export .env** save an unencrypted copy to your disk. From then on, Secure Vault can't protect it.

**What you can do.** Download only when you have to, and delete the file afterwards. Keep it out of synced folders and backups.

## Demo instances may be reset

**What it means.** A public demo or trial instance of Secure Vault may be wiped at any time, without notice.

**What you can do.** Never store real secrets on a demo. [Self-host](/docs/self-hosting) Secure Vault for real use.

## See also

- [Security model](/docs/security-model) for what the design protects against.
- [Cryptography](/docs/cryptography) for the algorithms and key hierarchy.
- The source code on [GitHub](https://github.com/theabhipatel/vault), if you'd like to review it yourself.
