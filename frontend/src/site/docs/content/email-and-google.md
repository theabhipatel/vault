Secure Vault sends email for sign-up, password resets, invitations and security alerts, so every deployment needs an SMTP server. Google sign-in is optional. This page covers how to set up both.

## How email works

When something needs an email, the API writes it to an outbox table in the database, in the same transaction as the action itself. A background worker in the API then delivers it over SMTP. If delivery fails, the worker retries with increasing delays, up to eight attempts. So a short mail-server outage delays emails but doesn't lose them.

The worker runs as long as `EMAIL_WORKER_ENABLED` is `true` (the default). Every email has a plain-text and an HTML version. Links in emails are built from `APP_URL`, so set that to your public address.

## Email in development: Mailpit

The development `docker-compose.yml` starts [Mailpit](https://mailpit.axllent.org), a local mail catcher. It accepts every message the app sends, whatever the recipient address, and shows it in a web inbox. Nothing is delivered to real mailboxes.

| What | Address |
|---|---|
| Mailpit web inbox | `http://localhost:29825` |
| Mailpit SMTP | `localhost:29025` |

The defaults in `backend/.env.example` already point at Mailpit, so you don't need to change anything:

```env
SMTP_HOST=localhost
SMTP_PORT=29025
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_STARTTLS=false
SMTP_TLS=false
MAIL_FROM=Vault <no-reply@vault.local>
```

Because Mailpit catches everything, you can invite made-up addresses like `alice@example.com` and open the invitation in Mailpit.

## Email in production: any SMTP server

Use any SMTP server: your own mail server, your company's relay, or a transactional email provider that offers SMTP. Your provider's documentation gives you the host, port, user name and password.

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=vault@example.com
SMTP_PASSWORD=replace-with-your-smtp-password
SMTP_STARTTLS=true
SMTP_TLS=false
MAIL_FROM=Secure Vault <vault@example.com>
```

### STARTTLS or TLS

Pick the one your server supports, and turn on only one of them:

| Mode | Settings | Typical port | How it connects |
|---|---|---|---|
| STARTTLS | `SMTP_STARTTLS=true`, `SMTP_TLS=false` | 587 | Connects in plain text, then upgrades to an encrypted connection. |
| Implicit TLS | `SMTP_TLS=true`, `SMTP_STARTTLS=false` | 465 | Encrypted from the first byte. |
| None | Both `false` | 25, or Mailpit's 29025 | No encryption. Only use this on a trusted local network or for development. |

### The sender address

`MAIL_FROM` is the sender of every email, written as `Name <address>`. Use an address on a domain your SMTP server is allowed to send for, and set up SPF, DKIM and DMARC for that domain, or many messages will land in spam. `APP_NAME` sets the name shown inside the emails.

> [!TIP]
> If emails don't arrive, check the API logs. Failed deliveries are retried and then logged as permanently failed. Also check the recipient's spam folder before you change anything.

## Which emails Secure Vault sends

### Account emails

| Subject | When |
|---|---|
| Verify your email address | After you sign up with email and password, and when you select **Resend the link**. The link expires after `EMAIL_VERIFICATION_TTL_HOURS` (48 by default). |
| Sign-up attempt for your account | When someone tries to sign up with an address that already has a verified account. It offers a password reset. This way the sign-up page never reveals whether an address is registered. |
| Reset your password | When you ask to reset your login password. The link works once and expires after `PASSWORD_RESET_TTL_MINUTES` (60 by default). It never touches your vault password. |
| *Inviter* invited you to *workspace* | When someone invites you to a workspace, and when they resend the invitation. New users get a **Create your account** link, existing users an **Open invitation** link. It expires after `INVITATION_TTL_DAYS` (7 by default). |

### Security alerts

These tell you about changes you might not have made. Each one links to your security settings.

| Subject | When |
|---|---|
| Your password was changed | Your login password was changed or reset. Your other sessions were signed out. |
| New sign-in to your account | You signed in from a device or browser that hasn't signed in to your account before. It includes the time, device and IP address. Your very first sign-in doesn't trigger it. |
| Your vault password was changed | Your vault password was changed. Your keys and access stay the same. |
| Your vault was recovered | Your recovery key was used to set a new vault password, and a new recovery key was issued. The old one no longer works. |
| Your vault was reset | A new vault keypair was created for your account and the old keys were discarded. |
| Several wrong vault password attempts | A wrong vault password or recovery key was entered 5 times within an hour while signed in to your account. You also get an in-app alert. |

Emails never contain document content, passwords or key material.

## Google sign-in

With Google sign-in on, the sign-in page shows **Continue with Google** and the sign-up page shows **Sign up with Google**. When it's off, the buttons are hidden.

### Set it up

1. In the [Google Cloud console](https://console.cloud.google.com/), select or create a project and set up the OAuth consent screen if you haven't already.
2. Go to **APIs & Services** → **Credentials** and create an **OAuth client ID**.
3. For the application type, choose **Web application**.
4. Under **Authorised redirect URIs**, add your `APP_URL` followed by `/api/auth/google/callback`:

   ```text
   https://vault.example.com/api/auth/google/callback
   ```

   For local development, use `http://localhost:29180/api/auth/google/callback`. You can add both to the same client.
5. Copy the client ID and secret into your settings and restart the API:

   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=replace-with-your-client-secret
   ```

Secure Vault asks Google only for your basic identity (`openid email profile`) and uses PKCE. The redirect URI must match `APP_URL` exactly, including `https` and any port. Otherwise Google rejects the sign-in.

### How Google accounts behave

- **One person, one account.** A Google account and an email account with the same verified address are the same Secure Vault account. Signing in with Google links them automatically. Google must have verified the address.
- **No login password.** People who sign up with Google don't have a login password. They can add one later from their security settings with **Email me a link to set one**.
- **The vault is still separate.** Google sign-in replaces only the login password. Google users still choose a vault password and save a recovery key to use secure documents. Google never sees either. See [Set up your vault](/docs/vault-setup).

> [!NOTE]
> If someone registered your address with a password but never verified it, signing in with Google takes over that account and removes the unverified password. This stops someone from creating an account in your name before you arrive.
