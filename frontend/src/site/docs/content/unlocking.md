Your vault starts out locked. Unlocking it decrypts your private key in the browser tab you're using, so you can read and write secure documents there. It locks again on its own, and your keys never stay around longer than they need to.

## When you need to unlock

You only need to unlock to work with secure documents. That means:

- opening, editing or creating a [secure document](/docs/secure-documents),
- viewing a secure document's version history,
- changing your vault password or generating a new recovery key,
- letting your browser share project keys with teammates or rotate keys in the background (see [Sharing secure access](/docs/sharing-access)).

Normal documents, projects, members and the audit log all work while the vault is locked.

## Unlocking your vault

You can open the unlock dialog from several places:

- the **Locked** button in the top bar,
- **Unlock vault** on a secure document you open while locked,
- **Unlock** in **Settings → Vault**, in the **New document** dialog, or on a project's **Key rotation pending** banner.

Then:

1. In **Unlock your vault**, type your **Vault password**.
2. Click **Unlock**. It shows **Unlocking…** for about a second while your browser runs the password hashing.
3. You'll see **Vault unlocked.**

If the password is wrong, you'll see **That vault password isn't right.** Each wrong attempt is recorded in the [audit log](/docs/audit-log). Five wrong attempts within an hour trigger an email and an in-app alert.

Forgot it? Click **Use your recovery key** in the dialog. See [Password change, recovery and reset](/docs/recovery).

> [!NOTE]
> Your vault password is checked by your browser, not the server. The server never receives it. A wrong password simply fails to decrypt your private key.

## The lock status button

The top bar always shows the state of your vault:

| Button | Meaning | Clicking it |
|---|---|---|
| **Set up vault** | You don't have a vault yet | Starts [vault setup](/docs/vault-setup) |
| **Locked** | You have a vault, but it's locked in this tab | Opens the unlock dialog |
| **Unlocked** | Your keys are decrypted in this tab | Opens a menu with **Lock now** and **Vault settings** |

The **Unlocked** menu also reminds you how long until it locks, for example "It locks after 15 minutes of inactivity." On narrow screens only the lock icon is shown.

## Auto-lock after inactivity

While unlocked, the vault locks itself after a period with no activity in that tab. Clicking, tapping, typing and scrolling all count as activity. Moving the mouse alone doesn't.

The default is 15 minutes. To change it:

1. Go to **Settings → Vault**.
2. Under **Lock automatically after**, choose **5**, **15**, **30** or **60 minutes of inactivity**.

The choice is saved in this browser, so set it again on other browsers or devices. When the vault locks this way you'll see **Your vault locked after inactivity.**

You can lock at any time with **Lock now**, from the top bar menu or from **Settings → Vault**.

## Other things that lock the vault

Your unlocked keys exist only in the tab's memory. They're never written to local storage, session storage, IndexedDB or cookies, and never sent to the server. So the vault also locks when:

- **you reload the page,**
- **you close the tab,**
- **you sign out.** Signing out locks the vault first, even if the sign-out request itself fails.

After a reload you'll need to unlock again. This is deliberate: nothing on disk can bring your keys back.

## Multiple tabs

Each tab has its own vault session. Unlocking in one tab doesn't unlock the others, and locking one doesn't lock the others. Each tab also runs its own inactivity timer. The **Unlocked** menu reminds you that "Your vault is unlocked in this tab."

If you work in several tabs, you'll unlock in each one where you open secure documents.

## What happens to decrypted content on lock

When the vault locks, for any reason:

- your private key is overwritten in memory, and cached project keys are dropped;
- decrypted document content and decrypted version history are removed from the app's cache;
- any open secure document switches to **This document is end-to-end encrypted**, with an **Unlock vault** button.

> [!WARNING]
> Unsaved edits in a secure document are discarded when the vault locks. Save before you step away, especially with a short auto-lock time. `Ctrl` + `S` (`Cmd` + `S` on macOS) saves the document.

Some things can't be wiped completely. Passwords and decrypted text are held as JavaScript strings, which the browser frees only when it gets around to it. See [Known limitations](/docs/limitations).

## Background work while unlocked

While your vault is unlocked, your browser checks every 60 seconds, and once right after unlocking, for key work it can do for your team:

- sharing project keys with teammates whose secure access is pending, and
- completing key rotations after someone lost access.

This is automatic. You'll see a short message such as "Shared project keys with 2 teammates." when it happens. See [Sharing secure access](/docs/sharing-access) and [Revocation and key rotation](/docs/key-rotation).
