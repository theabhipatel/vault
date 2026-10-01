Secure Vault is a self-hosted team vault. Your team keeps notes, runbooks and secrets in one place, organised into workspaces and projects, and the most sensitive documents are end-to-end encrypted in the browser so the server can never read them.

## What Secure Vault does

Secure Vault gives every team a **workspace**. Inside a workspace you create **projects**, and inside projects you keep **documents**. People join a workspace by invitation, and their **role** decides what they can see and do.

Documents come in two kinds:

- **Normal documents** hold plain text or Markdown. Access control protects them, and the server can read them.
- **Secure documents** hold plain text, Markdown or `.env` files. Your browser encrypts them before they leave your device. The server only ever stores ciphertext, sealed keys and public keys. It never sees your vault password, your private key, a project key or a plaintext secret.

You pick the kind when you create a document, and you can't change it later.

## Who it's for

Secure Vault is for teams that want to keep shared knowledge and shared secrets together, on infrastructure they control:

- engineering teams sharing `.env` files, API keys and credentials across environments;
- operations teams keeping runbooks next to the passwords those runbooks need;
- small companies that want one self-hosted place for internal docs, with an audit trail.

You run it yourself with Docker, PostgreSQL and any SMTP mail server. There is no third-party service in the loop.

## Normal vs secure documents

| | Normal document | Secure document |
|---|---|---|
| Formats | Markdown, plain text | `.env`, Markdown, plain text |
| Protected by | Access control (roles and project membership) | End-to-end encryption in the browser, plus access control |
| Can the server read the content? | Yes | No, it only stores ciphertext |
| Needs a vault | No | Yes, you set up and unlock your vault to read or write |
| Who can open it | Anyone whose role can view documents in that project | Anyone whose role can view secure documents in that project and who holds a copy of the project key |
| Version history | Yes | Yes, every version is encrypted |
| Good for | Notes, runbooks, onboarding guides, architecture docs | API keys, credentials, `.env` files, anything you'd never paste into chat |
| If you forget your vault password | Not affected | You need your recovery key to get back in |

Document and project **names** are never encrypted, for either kind. Don't put a secret in a name.

> [!NOTE]
> End-to-end encryption protects what the server stores, even if the server, its database or its backups are fully compromised. It has limits, too: someone who controls the live server could serve modified JavaScript. Read [Limitations](/docs/limitations) before you rely on it.

## Try the demo or host your own

There are two ways to use Secure Vault.

**The public demo** lets you try the product in your browser without installing anything. Use it to click around, create a workspace and see how secure documents behave.

> [!WARNING]
> The demo is for evaluation only. It may be reset at any time, and you don't control the server it runs on. Never store real secrets or real company data there.

**Self-hosting** is how you use Secure Vault for real. The source code is at [github.com/theabhipatel/vault](https://github.com/theabhipatel/vault). You can run it on your laptop in a few minutes with one script, then deploy it to your own server with Docker Compose when you're ready.

| | Public demo | Self-hosted |
|---|---|---|
| Setup | None | Docker, uv and Node.js for development; Docker for production |
| Your data | May be deleted at any time | Stays in your own PostgreSQL database |
| Real secrets | Never | Yes |
| Email | Handled by the demo | Your own SMTP server or provider |
| Google sign-in | Depends on the demo | Optional, with your own OAuth client |

## Where to go next

- **Try it quickly:** follow the [Quick start](/docs/quick-start) to go from sign-up to your first secure `.env` file.
- **Learn the vocabulary:** [Core concepts](/docs/core-concepts) explains workspaces, roles, the vault, project keys and grants.
- **Run it yourself:** [Self-hosting](/docs/self-hosting) covers local setup on Linux, macOS and Windows. [Production](/docs/production) covers deploying it on a server.
- **Configure it:** see the [Configuration reference](/docs/configuration) and [Email and Google sign-in](/docs/email-and-google).
- **Understand the security:** read the [Security model](/docs/security-model), [Cryptography](/docs/cryptography) and [Limitations](/docs/limitations).
