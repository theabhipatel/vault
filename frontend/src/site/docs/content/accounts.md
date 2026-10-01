Your account is you: a name, an email address, an optional photo and the ways you sign in. This page covers creating an account, signing in, recovering a forgotten login password and managing everything under **Account settings**.

## Login password vs vault password

Secure Vault has two separate passwords. Keep them different.

| | Login password | Vault password |
|---|---|---|
| What it does | Signs you in to your account | Unlocks your vault keys in the browser, so you can read and write secure documents |
| Who checks it | The server | Only your browser. The server never sees it |
| Encrypts anything? | No | Yes, it protects your private key |
| Forgot it? | Reset it by email | Use your recovery key. It **can't** be reset by email |
| Where to change it | **Account settings** → **Security** | **Account settings** → **Vault** |

This page is about the login password. For the vault password, see [Vault setup](/docs/vault-setup), [Unlocking](/docs/unlocking) and [Recovery](/docs/recovery).

## Create an account

1. Open the sign-up page and fill in **Full name**, **Work email** and **Login password** (at least 10 characters, and not your email address). A strength meter shows how strong the password is.
2. Select **Create account**.
3. On the **Check your email** page, open the verification email and select **Verify email**. The link expires after 48 hours.
4. The link signs you in and takes you to onboarding, where you name your first workspace. See [Workspaces](/docs/workspaces).

If the email doesn't arrive, select **Resend the link** (available once a minute). If you're running Secure Vault locally, every email lands in Mailpit instead of a real inbox. See [Email and Google sign-in](/docs/email-and-google).

The page always says that a message is on its way, whether or not the address already has an account. That stops strangers from using sign-up to discover who has an account. If the address is already registered, its owner gets an email titled "Sign-up attempt for your account" with a link to reset the password instead.

### Sign up with Google

If the server operator has configured Google sign-in, the sign-up page shows **Sign up with Google** and the sign-in page shows **Continue with Google**. Your Google account must have a verified email address.

- If no account uses that address, a new verified account is created.
- If an account with that address already exists, Google is linked to it. You can then sign in either way.

When the buttons aren't shown, Google sign-in isn't configured on this server.

## Sign in

1. Enter your **Email** and **Password**.
2. Select **Sign in**.

If you haven't verified your email yet, you see **Verify your email first** with a **Send a new link** button.

### Lockouts and rate limits

To slow down password guessing, the server limits attempts. These are the default limits, and your operator can change them (see [Configuration](/docs/configuration)):

| Action | Default limit |
|---|---|
| Failed sign-ins for one email address | 5 per 15 minutes, then sign-in for that address is paused until the window ends |
| Sign-in attempts from one IP address | 30 per 15 minutes |
| Sign-up, resend verification and forgot-password emails | 5 per address per 30 minutes |
| Changing your login password | 10 attempts per 15 minutes |

When you hit a limit you see "Too many attempts. Please try again in about N minutes." Resetting your password by email clears the sign-in lockout for your address.

### How long you stay signed in

A session lasts up to 30 days, and ends earlier if you don't use it for 7 days. Your operator can change both values. Sign out at any time from the account menu (your avatar in the top bar) with **Sign out**. Signing out also locks your vault.

## Forgot your login password

1. On the sign-in page, select **Forgot password?**.
2. Enter your email and select **Send reset link**.
3. Open the email and select **Choose a new password**. The link works once and expires after 60 minutes.
4. Enter a **New login password**, confirm it, and select **Set new password**.

Resetting signs out **all** your sessions, and you get an email confirming the change. Then sign in with the new password.

> [!IMPORTANT]
> This resets your login password only. Your vault password can never be reset by email. If you've forgotten that one, use your recovery key. See [Recovery](/docs/recovery).

## Account settings

Open **Account settings** from the account menu (**Profile** or **Security & sessions**) or from the command palette (`Ctrl` + `K`, then **Account settings**). These settings apply across every workspace. The sections are **Profile**, **Appearance**, **Security**, **Vault** and **Account**.

### Profile

- **Upload photo** sets your avatar: PNG, JPEG, GIF or WebP, up to 1 MB. **Remove** deletes it.
- **Name** is how teammates see you. Change it and select **Save profile**.
- **Email** is shown but can't be changed. Badges show whether it's **Verified** and whether **Google sign-in linked** is on.

### Appearance

Choose **Light**, **Dark** or **System** (follows your device). The choice is saved to your account and follows you to other devices. You can also switch from the account menu under **Theme**, or from the command palette.

### Security

**Login password.** Enter your **Current password**, a **New password** and **Confirm new password**, then select **Change password**. Your other devices are signed out, this one stays signed in, and you get an email about the change.

If you only sign in with Google, you don't have a login password. Select **Email me a link to set one** to get a link that lets you choose one. This is optional.

**Active sessions.** Every device signed in to your account, with its browser, IP address, when it was last active and when it signed in. Your current device is marked **This device**.

- **Sign out** next to a session signs out that device. Signing out your own session takes you back to the sign-in page.
- **Sign out all other devices** signs out everything except this device, after you confirm with **Sign out others**.

**Recent security activity.** Your recent sign-ins and account changes, including failed attempts, with the device and IP address of each.

**New sign-in emails.** When your account signs in from a browser it hasn't successfully signed in from before, you get a "New sign-in to your account" email with the time, device and IP address. If it wasn't you, change your password and sign out your other sessions.

### Vault

Your vault status, key fingerprint, auto-lock time, vault password and recovery key. See [Vault setup](/docs/vault-setup) and [Unlocking](/docs/unlocking).

## Delete your account

1. Go to **Account settings** → **Account** and select **Delete my account**.
2. Type your email address to confirm, and enter **Your password** if your account has one.
3. Select **Delete account**.

> [!WARNING]
> Deleting your account can't be undone. You're removed from every workspace, and secure documents that only you could read become unreadable forever.

What happens:

- **Workspaces you own with no other members** are deleted along with your account, including all their projects and documents.
- **Workspaces you own with other members** block deletion. The error names them. Transfer ownership (see [Workspaces](/docs/workspaces)) or remove the other members first.
- **Workspaces you belong to** lose you as a member. In projects where you held a copy of the project key, the key is rotated so your old copy stops working for new changes. See [Key rotation](/docs/key-rotation).
