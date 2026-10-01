When someone loses secure access to a project, Secure Vault cuts them off at once and then replaces the project's key. The replacement happens automatically in a key holder's browser. This page explains when it happens, what it does, and what to do in the rare case nobody holds a key any more.

## Why rotation is needed

Removing someone's access on the server is immediate, but it isn't enough on its own. While they had access, their browser could decrypt the project key. If they kept a copy, they could read any ciphertext they got hold of later.

Rotation closes that gap. The project gets a brand-new key, every secure document is re-encrypted with it, and the departed person never receives the new key.

## When access is removed

Secure access ends, and the revocation flow starts, when someone:

- is **removed from the workspace** or leaves it,
- has their **role changed** to one without the secure **View** permission, or has that permission removed from their role,
- is **removed from the project**, or loses **Access all projects** and isn't assigned to it,
- **resets their vault**. Their old private key might be exposed, so it's treated like a revocation.

## What happens immediately

On the server, right away:

1. The server stops serving that person anything from the project's secure documents.
2. Their sealed copies of the project key are deleted.
3. The [audit log](/docs/audit-log) records **Secure access revoked**, noting whether they held the key.
4. If they ever held the key, the project is marked **rotation pending**, and **Scheduled key rotation** is recorded.

If the person was entitled but never received the key, there's nothing to rotate. Their access is simply gone.

## How rotation completes

The server can't rotate the key itself, because it never has the key. Instead, the next key holder whose vault is unlocked does it in the background. Their browser checks on unlock and every 60 seconds.

While rotation is pending, people with access see a **Key rotation pending** banner on the project. If your vault is unlocked, you can click **Rotate now** to run it straight away. Otherwise click **Unlock**.

When it finishes, the key holder sees "Rotated the encryption key for" the project, and the audit log records **Rotated project key**.

## What rotation does

The key holder's browser:

1. Generates a new random project key with the next **key version** number (version 2 replaces version 1, and so on).
2. Downloads the ciphertext of **every secure document and every stored version** in the project.
3. Decrypts each one with the old key and re-encrypts it with the new key. Each gets a fresh nonce and is bound to the new key version.
4. Seals the new key for every remaining member with secure access and a vault, including itself.
5. Sends everything to the server in **one request**.

The server applies it in **one database transaction**, and only if two things hold:

- the project's key version hasn't changed since the browser started, and
- the set of documents and versions submitted matches exactly what's stored.

If anything changed in the meantime, for example someone saved a new version, the server rejects the whole request and the browser tries again on its next run. A rotation is never half-applied, so a project can't end up partly encrypted with the old key and partly with the new one.

After a successful rotation, the old sealed copies are deleted. Only copies of the new key version remain.

> [!NOTE]
> Rotation re-encrypts old versions too, not just the latest. Version history stays readable for everyone who still has access, and none of it is readable with the old key.

### Key changes during rotation

If a remaining member's public key has changed since this browser last shared with them, they're left out of the new key. The key holder sees the [key change warning](/docs/sharing-access) and decides whether to share after comparing fingerprints. The person stays pending until then.

## When nobody holds the key: lost keys

A project's key is **lost** when no one with access still holds a copy. This can happen when:

- the only key holder resets their vault (the reset screen warns them first; see [Recovery](/docs/recovery)), or
- the only key holder is removed, or loses secure access.

Encrypted data can't be recovered without the key. Not by teammates, not by admins, not by the server operators. When a vault reset causes the loss, the audit log records **Project key lost** for that project.

What people see:

- on the project: **This project's secure documents can't be decrypted**, with a count of unreadable documents;
- on each secure document: **This document can't be decrypted**.

### Clearing unreadable documents

To start the project fresh, someone with the secure **Delete** permission can clear the unreadable documents:

1. Open the project and click **Clear and start over** on the banner.
2. Read **Delete the unreadable secure documents?**
3. Type the project name to confirm, then click **Delete secure documents**.

All secure documents in the project and their history are deleted, and the project's key is cleared. The next secure document created there gets a new key. Normal documents aren't affected. The audit log records **Cleared unreadable secure documents** with the number deleted.

> [!TIP]
> Keep at least two people with secure access in every important project, and make sure each has saved their recovery key. Then no single lost password can make a project unreadable.

## Limits

The whole rotation is sent as one request. The rotation endpoint accepts up to 256 MB, which covers the base64-encoded ciphertext of every version of every secure document in the project. Very large projects, with hundreds of megabytes of secure history, can hit this limit. A single rotation also handles at most 100,000 document versions.

Rotation runs in the key holder's browser, so on a large project it takes a moment and needs that tab to stay open until it finishes. See [Known limitations](/docs/limitations).
