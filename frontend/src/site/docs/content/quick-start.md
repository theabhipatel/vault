This guide takes you from a new account to a project with a normal document, an encrypted `.env` file and a teammate, in about five minutes. It works the same on the public demo and on your own copy of Secure Vault.

## Before you start

You need one of these:

- **The public demo**, for a quick look. Don't store real secrets there: it may be reset at any time.
- **A self-hosted copy.** For a local one, follow [Self-hosting](/docs/self-hosting) first. The web app then runs at `http://localhost:29180`, and every email it sends lands in Mailpit at `http://localhost:29825` instead of a real inbox.

## 1. Create your account

1. Open Secure Vault's home page and click **Get started** (on the public demo the button says **Try the demo**). This opens the sign-up page.
2. Fill in **Full name**, **Work email** and **Login password** (at least 8 characters).
3. Select **Create account**.

If the server has Google sign-in turned on, you can select **Sign up with Google** instead. You skip the next step, because Google has already verified your email address.

Your **login password** only signs you in. You choose a separate **vault password** for encryption in step 4.

## 2. Verify your email address

1. Open the email with the subject **Verify your email address**.
   - On a local self-hosted copy, open Mailpit at `http://localhost:29825`. Every email the app sends lands there, whatever the address.
2. Select **Verify email** in the message.

You're signed in and taken to setup. If the email doesn't arrive, select **Resend the link** on the **Check your email** page. The link expires after 48 hours by default.

## 3. Name your workspace

A workspace holds your team's projects, documents and secrets. You become its owner.

1. Enter a **Workspace name**, usually your company or team name. You can rename it later.
2. Select **Create workspace**.

## 4. Set up your vault and save your recovery key

Right after you create the workspace, Secure Vault asks you to set up your vault. Your vault holds the keys that encrypt secure documents. You can select **Skip for now**, but you need a vault before you can create or open a secure document.

1. Select **Choose a vault password**.
2. Enter a **Vault password** and repeat it in **Confirm vault password**. It must be at least 8 characters and hard to guess. Use something different from your login password.
3. Select **Create my vault**. Your browser spends a few seconds tuning password hashing to your device and generating your keypair.
4. On **Save your recovery key**, select **Copy** or **Download .txt** and store the key somewhere safe outside this browser, such as a password manager or a printed copy.
5. Tick **I have saved my recovery key somewhere safe.** and select **Finish**.

> [!IMPORTANT]
> The recovery key is shown only once. It's the only way back into your vault if you forget your vault password. Nobody can reset a vault password by email, and nobody, including the server operator, can recover it for you.

Your vault is now unlocked. It locks again after 15 minutes of inactivity (you can change this), when you sign out, and when you reload or close the tab. See [Unlocking your vault](/docs/unlocking).

## 5. Create a project

1. In the sidebar, select **Projects**.
2. Select **New project**.
3. Enter a **Name** (for example, `Payments API`) and, optionally, a **Description**.
4. Select **Create project**. You're added as a member automatically.

## 6. Create a normal document

1. In the project, select **New document**.
2. Choose **Normal document**.
3. Under **Format**, pick **Markdown** or **Plain text**.
4. Enter a **Name**, for example `Deployment runbook`, and select **Create document**.
5. Write your content and select **Save**, or press `Ctrl` + `S`. Each save creates a new version.

Normal documents are readable by the server. Use them for notes and runbooks, not secrets.

## 7. Create a secure .env document

1. In the same project, select **New document** again.
2. Choose **Secure document**.
   - If your vault is locked, select **Unlock** and enter your vault password. If you skipped vault setup, select **Set up vault** and complete step 4.
3. Under **Format**, pick **.env**.
4. Enter a **Name**, for example `production.env`, and select **Create secure document**.
5. Add variables with **Add variable**, or select **Import** to paste or choose an existing `.env` file.
6. Select **Save**. The content is encrypted in your browser before it's sent.

Because this is the project's first secure document, your browser also creates the project key and shares it with every member who is allowed to read secure documents and has a vault.

> [!TIP]
> Names aren't encrypted. Call the file `production.env`, never `stripe-key-sk_live_…`.

## 8. Invite a teammate

1. In the sidebar, select **Members**.
2. Select **Invite people**.
3. Enter their **Email address** and choose a **Role**. The default roles are Owner, Admin, Manager and Member.
4. Under **Projects**, pick the project you just created, so they can see it.
5. Select **Send invitation**.

Your teammate gets an email. A new user selects **Create your account** and signs up with that address. An existing user selects **Open invitation** and then **Accept**. On a local copy, the invitation lands in Mailpit too. To play the teammate yourself, open a private browser window so you get a separate session.

After they accept and set up their own vault, they see **Secure access pending** on the project until a key holder's browser shares the project key with them. That happens automatically, in the background, the next time anyone who holds the key has their vault unlocked. They get a notification when access arrives.

## What's next

- Learn how the pieces fit together in [Core concepts](/docs/core-concepts).
- Tune who can do what in [Roles and permissions](/docs/roles-and-permissions).
- Read how sharing works in [Sharing and access](/docs/sharing-access).
- Make sure you know what to do if you lose your vault password: [Recovery](/docs/recovery).
