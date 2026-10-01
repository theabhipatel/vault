Normal documents are the everyday pages of a project: runbooks, notes, onboarding guides and how-tos, written in Markdown or plain text. This page covers creating, editing and managing them, and finding things with search.

## What "normal" means

A normal document is protected by **access control**: only people who can see the project, and whose role allows it, can open it. The server stores it readable, though. That keeps normal documents simple, but anyone who runs or breaks into the server can read them.

Every normal document reminds you of this with a note above the content.

> [!WARNING]
> Never put passwords, API keys, tokens or other secrets in a normal document. Use a [secure document](/docs/secure-documents) instead. Secure documents are end-to-end encrypted in your browser, and the server can never read them.

| | Normal document | Secure document |
|---|---|---|
| Readable by the server | Yes | No, ciphertext only |
| Formats | Markdown, Plain text | .env, Markdown, Plain text |
| Needs an unlocked vault | No | Yes |
| Version history | Yes | Yes, encrypted |

A document's type is chosen when you create it and can't be changed later.

## Create a document

You need Normal documents **Create and edit** permission, and the project must not be archived.

1. Open the project and select **New document**.
2. Choose **Normal document**.
3. Under **Format**, choose **Markdown** or **Plain text**.
4. Enter a **Name** (up to 200 characters).
5. Select **Create document**.

The new document opens in **Edit** mode, ready for you to type.

## View and edit

Existing documents open in **View** mode, so you can read them without changing anything by accident. If you can edit the document, a toggle next to the title switches modes:

- **View** shows the document. Markdown is rendered; plain text is shown as written.
- **Edit** shows the raw text for editing.
- **Edit with live preview** (Markdown only, on wider screens) shows the editor and the rendered result side by side.

If you can't edit the document, because of your role or because the project is archived, you see "You can view this document but not edit it." and there's no mode toggle.

Markdown supports GitHub-flavoured extras such as tables, task lists and strikethrough. For safety, raw HTML isn't rendered, links open in a new tab, and images appear as links instead of loading.

A document can hold up to 1,000,000 characters.

## Save your changes

Select **Save** or press `Ctrl` + `S` (`Cmd` + `S` on a Mac). Each save creates a new version, and a message confirms the version number. When there's nothing new to save, the button reads **Saved**.

### Unsaved changes

If you try to leave the page with unsaved edits, you're asked **Discard unsaved changes?**. Select **Discard and leave** to go anyway, or cancel to stay. Closing or reloading the tab triggers your browser's own warning.

### When someone else saved first

Two people can edit the same document at once. If a teammate saves before you do, your save is refused so you don't overwrite their work. You see **Someone else saved a newer version**.

1. Copy anything you want to keep from your version.
2. Select **Load latest** to load their version.
3. Re-apply your changes and save again.

## Rename a document

Click the document's name at the top of the page, type the new name, and save. Renaming creates a new version, just like editing the content.

## Version history

Every save is kept. Select **History** to open **Version history**.

- The list on the left shows each version with its author and time. The newest is marked **Current**, and restored versions say which version they came from.
- Select a version to preview its content on the right.

### Restore an older version

1. In **Version history**, select the version you want.
2. Select **Restore v*N***.
3. Confirm with **Restore**.

Restoring doesn't delete anything. It saves the old content and name as a **new** version, and your previous content stays in the history. You need permission to edit the document to restore.

## Download

Open the more actions menu (**⋯**) and select **Download**. Markdown documents download as `.md` files and plain-text documents as `.txt`. The file contains the content currently on screen, including unsaved edits.

## Delete a document

You need Normal documents **Delete** permission (Owner, Admin and Manager by default).

1. Open the more actions menu (**⋯**) and select **Delete document**.
2. Confirm with **Delete document**.

The document and its entire version history are deleted permanently.

## Search and the command palette

Select **Search…** in the top bar, or press `Ctrl` + `K` (`Cmd` + `K` on a Mac), to open the command palette.

- **Search** matches project and document **names** in the current workspace. It doesn't search inside document content. Results only include projects and documents you can see.
- **Go to** jumps to pages such as **Dashboard**, **Projects**, **Members**, **Workspace settings**, **Account settings** and **Notifications**. **Roles & permissions** and **Audit log** appear if your role allows them.
- **Actions** include **New project** (if you can create projects), theme switching and **Sign out**.

Use the arrow keys and `Enter` to pick a result, or `Esc` to close.

The dashboard's **Recently edited** list is another quick way back to documents you and your team have been working on. See [Workspaces](/docs/workspaces).
