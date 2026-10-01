Secure documents are end-to-end encrypted. Your browser encrypts them before saving and decrypts them after loading, so the server only ever stores ciphertext. Use them for passwords, API keys, `.env` files and anything else the server shouldn't be able to read.

## Before you start

To work with secure documents you need:

- a [vault](/docs/vault-setup), unlocked in your current tab (see [Unlocking](/docs/unlocking));
- access to the project;
- a role with the right **Secure documents** permissions (see [Roles and permissions](/docs/roles-and-permissions)):

| Permission | Lets you |
|---|---|
| **View** | Decrypt and read secure documents. This is what gives you a copy of the project key |
| **Create and edit** | Create secure documents and save new versions |
| **Delete** | Delete secure documents, and clear unreadable ones in a project whose key was lost |

The default **Owner**, **Admin** and **Manager** roles have all three. The default **Member** role has **View** and **Create and edit**.

## Creating a secure document

1. Open a project and click **New document**.
2. Choose **Secure document**. If your vault is locked, the dialog offers **Unlock** (or **Set up vault** if you don't have one).
3. Under **Format**, pick **.env**, **Markdown** or **Plain text**.
4. Enter a **Name**, for example `production.env`.
5. Click **Create secure document**.

The type can't be changed later: a normal document can't become secure, and a secure one can't become normal.

If this is the project's first secure document, your browser also creates the project's encryption key. It then shares that key with every teammate who has secure access and a vault. See [Sharing secure access](/docs/sharing-access).

> [!WARNING]
> Names are not encrypted. The server can see document and project names, so never put a secret in a name. Call it `stripe-keys.env`, not `sk_live_...`.

## The .env editor

`.env` documents open in a key/value editor built for secrets.

### Variables and Raw views

Switch between two views at the top of the editor:

- **Variables** shows a table with one row per variable, plus comment rows. Values are masked by default.
- **Raw** shows the file as plain text, with every value visible. Switching to **Raw** counts as revealing all values in the audit log.

The toolbar shows how many variables the file has.

### Working with values

In the **Variables** view, each row has:

- **Reveal** / **Hide** (the eye icon) to show or mask one value.
- **Copy (clears in 30s)** to copy the value. You'll see a message such as "Copied DATABASE_URL. The clipboard clears in 30 seconds." Clearing is best effort: some browsers don't let a page clear the clipboard, especially if the tab isn't focused.
- A delete button, while editing.

**Reveal all** shows every value at once. Click **Hide all** to mask them again.

To add a row, click **Add variable**. The editor turns spaces in a key into underscores and flags keys that aren't valid variable names, with the hint "Letters, digits and _ only; can't start with a digit."

### Import and export

- **Import** opens **Import a .env file**. Paste the contents or click **Choose file**. Then choose **Merge (update matching keys)** or **Replace everything**, and click **Import**. The file is parsed and encrypted in your browser.
- **Export .env** downloads the current contents as a `.env` file.

### Duplicate keys

If the same key appears more than once, a warning lists the duplicates and notes that "Most loaders use the last value." The duplicate keys are highlighted in the table.

## Markdown and plain text

Secure **Markdown** and **Plain text** documents use the same editor as normal documents. Markdown renders as formatted text in **View** mode. On wider screens there's also an **Edit with live preview** option. Spell check is turned off for secure documents.

## Viewing, editing and saving

Documents open in **View** mode. If you can edit, switch to **Edit** with the toggle at the top. A new, empty document opens straight into **Edit**. In **View** mode, a `.env` document still lets you reveal and copy values, but not change them.

To save, click **Save** or press `Ctrl` + `S` (`Cmd` + `S` on macOS). Each save encrypts the content in your browser and creates a new version. You'll see "Saved as version 4, encrypted." The banner above every secure document reminds you: "End-to-end encrypted. Decrypted only in this browser; the server stores ciphertext."

If someone else saved a newer version first, you'll see **Someone else saved a newer version**. Copy anything you need, then click **Load latest**.

If your vault locks with unsaved edits, those edits are lost. See [Unlocking](/docs/unlocking).

## Version history

Click **History** to open **Version history**. Every save is kept, encrypted. Pick a version to preview it: your browser fetches its ciphertext and decrypts it locally. `.env` previews show keys but keep values masked.

To roll back, select an older version and click **Restore v3** (with that version's number). Restoring decrypts the old version and saves it as a new version, so nothing is lost. Decrypted history is dropped as soon as you close the panel.

## Downloading

Open the **More actions** menu (the three dots) and choose **Download**. For `.env` documents, **Export .env** does the same.

A download is a plaintext copy. It's no longer encrypted once it's on your disk, and the app tells you so: "Downloaded. This copy is no longer encrypted." Delete it when you're done, and keep it out of shared folders and backups.

## When you can't open a document

| What you see | What it means |
|---|---|
| **Set up your vault to open this document** | You don't have a vault yet |
| **This document is end-to-end encrypted** | Your vault is locked. Click **Unlock vault** |
| **Secure access pending** | You're entitled, but no teammate has shared the project key with you yet. See [Sharing secure access](/docs/sharing-access) |
| **No secure access** | Your role doesn't include secure documents in this project |
| **This document can't be decrypted** | Nobody holds the project key any more. See [Key rotation](/docs/key-rotation) |
| **Couldn't decrypt this document** | The encrypted data failed its integrity check. It may have been tampered with. Admins are alerted |

## Size limit

Each version of a secure document can hold roughly 1 MB of text.

## What's audited

Secure documents leave a detailed trail in the [audit log](/docs/audit-log), but never their content.

- **Recorded by the server:** creating, fetching (current and old versions), saving, renaming, restoring and deleting, plus refused access attempts (recorded as "denied").
- **Reported by your browser:** successful decryption, integrity-check failures, downloads, copied values and revealed values. Copy and reveal reports carry only counts, never key names or values. Each kind is reported at most once a minute per document.
