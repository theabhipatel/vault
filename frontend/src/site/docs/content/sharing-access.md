Every project with secure documents has its own encryption key. Teammates' browsers share that key with each other automatically, so you rarely do anything by hand. This page explains how sharing works, what "pending" means, and how fingerprints protect you from a server that tries to cheat.

## Project keys in plain terms

Each project has one **project key**. It's a random 256-bit key that encrypts every secure document in that project.

The server never sees the project key itself. Instead, it stores one **sealed copy** per person with secure access. Each copy is locked to that person's public key, so only their private key can open it.

Your browser creates the project key when someone creates the project's first secure document. It seals a copy for the creator and for every teammate who has secure access and a vault.

## How access is granted

Someone gains secure access when they join the workspace, get a role with secure permissions, or are added to a project. The server can't give them the key, because it doesn't have it. Instead:

1. The server works out who is **entitled** to the key but doesn't have a copy yet. These are pending grants.
2. Any teammate who already holds the key does the sharing. Whenever their vault is unlocked, their browser checks for pending grants right away and then every 60 seconds.
3. Their browser seals the project key to the new person's public key and uploads the sealed copy. Nobody has to click anything. The key holder sees a short message such as "Shared project keys with 1 teammate."
4. The new person gets a notification, **Secure access granted to** the project, and can open its secure documents.

The server checks every sealed copy before storing it. It only accepts copies for people who are currently entitled, sealed to their current public key.

## Prerequisites for a teammate

For someone to receive a project key, all three must be true:

- **They have set up a vault.** Without one there's no public key to seal to. They'll see **Set up your vault to open this project's secure documents**. Until they do, the members list shows their vault as **Not set up**.
- **They can see the project.** Either they're assigned to it, or their role has **Access all projects**.
- **Their role has the secure View permission.** The **Secure documents → View** permission is what grants a copy of the project key. See [Roles and permissions](/docs/roles-and-permissions).

## The "pending" state

If you're entitled but nobody has shared the key with you yet, you're **pending**. You'll see this in a few places:

- a project banner: **Secure access pending**,
- the same message on any secure document you open,
- a dashboard notice, such as **Secure access pending in 2 projects**,
- **Access pending** next to your name in the members list.

**What to do:** usually nothing. Access arrives the next time any key holder's vault is unlocked, and you'll get a notification.

If it's taking a while, ask a teammate who already has access to unlock their vault. Keeping the app open with the vault unlocked is enough. They don't need to open the project.

If nobody holds the key any more, you won't see "pending" at all. You'll see that the documents can't be decrypted. See [Revocation and key rotation](/docs/key-rotation).

## Fingerprints

A malicious server could try to hand out a **fake public key** for you, so that teammates seal project keys to the attacker instead. Fingerprints let you catch this.

Your **fingerprint** is a short summary of your public key: the first 128 bits of its SHA-256 hash, shown as 32 characters in groups of four, like this:

```text
3F9A 01C2 7DE4 B8A0 55F1 C9D3 2E7B 6A04
```

Your browser computes fingerprints itself from the public key. It never trusts a fingerprint supplied by the server.

Where to find them:

- **Your own:** **Settings → Vault**, under **Your key fingerprint**.
- **Teammates':** the **Key fingerprint** column in the members list (shown on wide screens).

### Verifying a fingerprint

1. Contact the teammate over a channel the server doesn't control: in person, on a call, or through a messenger you trust.
2. Ask them to read their fingerprint from **Settings → Vault**.
3. Compare it with the one in the members list. Every character must match.

Do this once for each teammate, and again whenever their key changes.

## Key change warnings

Your browser remembers each public key it has sealed a project key to. This is called trust on first use, or "pinning". The pinned keys are kept in this browser's local storage. Public keys aren't secret, so that's safe.

If the server later presents a **different** public key for someone, your browser won't share with them automatically. Instead you'll see a warning, titled with their name, such as **Alex's key has changed**. It shows the **Previous fingerprint** and the **New fingerprint**, and lists the affected projects.

A key change is normal when someone [resets their vault](/docs/recovery). It's also exactly what an attacker in control of the server would do.

1. Contact the person directly and ask them to read their new fingerprint from **Settings → Vault**.
2. If it matches exactly, click **Fingerprint matches, share**. Your browser pins the new key and shares the project keys.
3. If it doesn't match, or you can't reach them, click **Don't share now**. They stay pending, and nothing is sent.

> [!WARNING]
> Never click **Fingerprint matches, share** without actually comparing. If the new key belongs to an attacker, sharing gives them every secret in those projects.

Pinning is per browser. On a new browser or device, the first key you see is trusted without a warning. Comparing fingerprints out of band is the real defence. See [Known limitations](/docs/limitations).

## What admins see

Workspace owners and admins can follow sharing through:

- **The members list.** Each member's vault status is **Ready**, **Access pending** or **Not set up**, next to their **Key fingerprint**.
- **Notifications.** When a member resets their vault, admins in each workspace that member belongs to are notified: "Their public key changed. Compare the new fingerprint with them before trusting it."
- **The [audit log](/docs/audit-log).** It records **Created project key**, **Shared project key**, **Vault key changed**, **Secure access revoked** and the rotation events.

Admins can't share keys themselves unless they also hold the key. They don't need to: any key holder's browser does it automatically.
