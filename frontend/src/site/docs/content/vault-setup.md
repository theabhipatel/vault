Your vault holds the personal keys that let you read and write secure documents. You set it up once, with a vault password that never leaves your browser. This page covers what the vault is, how to choose a good password, and why the recovery key matters.

## What the vault is

Secure documents in Secure Vault are end-to-end encrypted. Your browser encrypts them before they're sent and decrypts them after they arrive, so the server only ever stores scrambled data.

To make that work, you need your own pair of keys:

- a **public key**, which teammates' browsers use to share project keys with you, and
- a **private key**, which only you can use to open what they share.

The vault is where your private key lives. The server stores it, but only in encrypted form. Your vault password unlocks it, and that happens in your browser. Nobody else can unlock it, including the people who run the server.

Everything else in Secure Vault works without a vault: workspaces, projects, members and normal documents. You only need it for [secure documents](/docs/secure-documents).

## Vault password vs login password

You have two passwords, and they do different jobs.

| | Login password | Vault password |
|---|---|---|
| What it does | Signs you in to your account | Unlocks your private key so you can decrypt secure documents |
| Who checks it | The server | Only your browser. It's never sent to the server |
| If you forget it | Reset it by email | It **can't** be reset by email. Use your [recovery key](/docs/recovery) |
| Encrypts anything? | No | Yes, indirectly (it protects your private key) |

Resetting or changing your login password never touches your vault. The setup screen sums it up: **It never leaves this device**, **It's separate from your login**, and **It can't be reset by email**.

> [!IMPORTANT]
> Use a vault password that's different from your login password. If they're the same, anyone who learns your login password can also open your secure documents.

## Choosing a vault password

The **Choose your vault password** form checks your password as you type:

- **At least 12 characters.** Shorter passwords show **Use at least 12 characters.**
- **Hard to guess.** A strength meter rates the password as **Very weak**, **Weak**, **Fair**, **Strong** or **Very strong**. You need at least **Fair** to continue. Weaker passwords show **This password is too easy to guess.** The meter also penalises passwords built from your name or email address.
- **Typed twice.** **Confirm vault password** must match exactly.

The form suggests that "A few random words work well". A passphrase of four or five unrelated words is long, strong and easier to remember than a jumble of symbols. A password manager works too.

This password is the main thing that protects your private key if someone ever copies the encrypted data, so pick a strong one. See [Cryptography](/docs/cryptography) for how it's hardened.

## What happens when you click Create my vault

When you click **Create my vault**, you'll see **Creating your keys…** for a few seconds while your browser does the following:

1. **Tunes password hashing to your device.** Your password is turned into an encryption key with Argon2id, a hashing method that's deliberately slow and memory-hungry, which makes guessing expensive. Your browser measures your device and picks settings that take about one second. It never goes below 64 MiB of memory and 3 passes, and it can use up to 256 MiB.
2. **Generates your keypair.** A new X25519 public/private key pair is created in your browser.
3. **Encrypts your private key twice.** One copy is encrypted with the key derived from your vault password. The other is encrypted with a newly generated recovery key.
4. **Uploads only safe material.** The server receives your public key, the two encrypted copies of your private key, and the hashing settings. It never receives your password, your private key or your recovery key.

Your vault is then ready and unlocked in this tab.

## Save your recovery key

The last step is **Save your recovery key**. The recovery key is your only way back in if you forget your vault password. It looks like 52 letters and digits, shown in groups of four:

```text
7K3M-QX9P-2HDT-...
```

It's shown **only once**. To save it:

1. Click **Copy** to copy it to your clipboard (the clipboard clears after 30 seconds), or **Download .txt** to save a small text file named `vault-recovery-key.txt`.
2. Store it somewhere safe that isn't this browser: a password manager, or a printed copy in a secure place.
3. Tick **I have saved my recovery key somewhere safe.**
4. Click **Finish**.

You can't close the dialog until you've confirmed you saved the key.

> [!WARNING]
> If you lose both your vault password and your recovery key, nobody can recover your private key, operators included. You'd have to [reset your vault](/docs/recovery), and any project where you were the only key holder becomes permanently unreadable.

If you lose the recovery key but still know your password, generate a new one from **Settings → Vault**. See [Password change, recovery and reset](/docs/recovery).

## Where to set it up

You can set up your vault from several places. They all open the same steps.

- **During onboarding.** After you name your first workspace, the second step, **Secure your vault**, offers to set it up. You can choose **Skip for now**.
- **The dashboard.** If you haven't set it up, the dashboard shows a **Set up your vault** prompt with a **Set up vault** button.
- **The top bar.** A **Set up vault** button sits in the top bar (between search and notifications) until you have a vault. A banner with a **Set up** button also appears at the top of the app. If you dismiss it, it comes back in your next session.
- **Settings → Vault.** Click **Set up your vault**.
- **A secure document or project.** Opening a secure document without a vault shows **Set up your vault to open this document** with a **Set up your vault** button.

Once your vault exists, teammates who hold project keys will share them with you automatically. See [Sharing secure access](/docs/sharing-access).

## Google sign-in users

If you sign in with Google, you don't have a login password, but you still need a vault password. Google never sees it and can't unlock your vault. The setup steps are exactly the same.

## Next steps

- Learn how [unlocking and auto-lock](/docs/unlocking) work.
- Create your first [secure document](/docs/secure-documents).
- Compare your [key fingerprint](/docs/sharing-access) with teammates.
