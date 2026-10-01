Your vault password can't be reset by email, because the server never knows it. Instead you have three tools: change the password while you know it, recover with your recovery key if you forget it, and reset the vault as a last resort. All of them live in **Settings → Vault**.

## Which option do I need?

| Your situation | What to do | What you keep |
|---|---|---|
| You know your vault password and want a new one | **Change vault password** | Everything |
| Your recovery key is lost or may have been seen | **Generate a new recovery key** | Everything |
| You forgot your vault password but have your recovery key | **Use your recovery key** | Everything |
| You lost both | **Reset my vault…** | Your account and memberships, but not your keys |

Forgot your **login** password instead? That's a different thing, and you can reset it by email. See [Accounts](/docs/accounts).

## Change your vault password

Changing the password keeps your keypair. Only the wrapping around your private key changes, so nothing has to be re-shared with you.

1. Unlock your vault (see [Unlocking](/docs/unlocking)).
2. Go to **Settings → Vault** and click **Change vault password**.
3. Enter your **Current vault password**.
4. Enter and confirm the new **Vault password**. The same rules apply as at setup: at least 12 characters and a strength rating of at least **Fair**. See [Set up your vault](/docs/vault-setup).
5. Click **Change password**.

Your browser checks your current password first. If it's wrong, you'll see **Your current vault password isn't right.** It then re-tunes the password hashing to your device, picks a new random salt, and re-encrypts your private key under the new password.

Your recovery key keeps working. You'll get an email, **Your vault password was changed**.

## Generate a new recovery key

Do this if you've lost your recovery key, or think someone may have seen it. You need your vault unlocked.

1. Go to **Settings → Vault**.
2. Under **Recovery key**, click **Generate a new recovery key**.
3. Click **Generate new key**.
4. Save the new key: **Copy** or **Download .txt**, then tick **I have saved my recovery key somewhere safe.**
5. Click **Done**.

> [!IMPORTANT]
> The old recovery key stops working as soon as the new one is created. Replace every saved copy of the old key with the new one.

## Recover with your recovery key

If you forget your vault password but still have your recovery key, you can set a new password without losing anything. Your vault needs to be locked for this.

1. Open **Recover your vault**. Click **Use your recovery key** in the unlock dialog, or **Forgot it? Use your recovery key** in **Settings → Vault**.
2. Enter your **Recovery key** and click **Continue**. Case doesn't matter, and dashes and spaces are ignored.
3. Choose and confirm a new vault password, then click **Save new password**.
4. Save the **new** recovery key that's shown, tick the confirmation, and click **Done**.

Your keypair stays the same, so all your project access stays intact and your vault ends up unlocked. For safety, recovery always issues a new recovery key, and the old one stops working.

If the key is wrong, you'll see **That recovery key doesn't unlock this vault.** Wrong recovery keys count towards the same limit as wrong passwords: five in an hour triggers an alert (see [Audit log](/docs/audit-log)).

You'll get an email, **Your vault was recovered**.

## Reset your vault

A reset is for when you've lost **both** your vault password and your recovery key. It gives you a brand-new keypair. You keep your account, workspaces and project memberships, but you lose your old keys and every project key sealed to them.

### Before you reset

Try everything else first: check your password manager, printed copies, and the `vault-recovery-key.txt` download. A reset can permanently destroy data.

### The reset screen

1. Go to **Settings → Vault** and click **Reset my vault…** in the **Reset vault** card. You don't need to unlock first.
2. Read the impact summary in **Reset your vault?**:
   - If you're the **only** person holding the key for any project, you'll see **These will become permanently unreadable**. It lists each project, its workspace and how many secure documents it has.
   - Otherwise you'll see that teammates also hold your project keys, so nothing will be lost and those keys will be rotated.
3. Choose and confirm a new vault password.
4. Type `RESET` to confirm, then click **Reset vault**.
5. Save the new recovery key shown under **Your vault was reset**, tick the confirmation and click **Done**.

> [!WARNING]
> Projects where you were the only key holder become permanently unreadable after a reset. Nobody can recover them, operators included. Someone with the secure **Delete** permission can later clear those documents and start fresh. See [Revocation and key rotation](/docs/key-rotation).

### What happens after a reset

- **Your old sealed keys are discarded.** You're back to **Secure access pending** in every project that someone else still holds the key for.
- **Projects other people hold keys for get rotated.** Your old private key might be exposed, so the next key holder's browser re-encrypts everything under a new project key.
- **Teammates re-share automatically.** Key holders' browsers notice your new public key. Because it changed, each of them sees a [key change warning](/docs/sharing-access) first and is asked to compare your new fingerprint before sharing. Expect people to contact you, and read your fingerprint from **Settings → Vault** when they do.
- **Admins are told.** Every workspace you belong to records **Vault key changed** in its audit log, and its admins get a notification that you reset your vault.

## Emails you'll receive

Secure Vault sends a security email for these vault events. None of them contains key material.

| Event | Email subject |
|---|---|
| Vault password changed | **Your vault password was changed** |
| Recovered with recovery key | **Your vault was recovered** |
| Vault reset | **Your vault was reset** |
| Five wrong vault passwords or recovery keys within an hour | **Several wrong vault password attempts** |

Each one ends with the advice: "If this wasn't you, change your login password and sign out other sessions immediately." Generating a new recovery key doesn't send an email, but it's recorded in the audit log as **Regenerated recovery key**.
