/** The docs table of contents: metadata only (page content is loaded per page). */
import { BookOpen, KeyRound, Server, ShieldCheck, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface DocMeta {
  slug: string
  title: string
  description: string
  section: string
}

export interface DocSection {
  title: string
  icon: LucideIcon
  blurb: string
  pages: DocMeta[]
}

const section = (title: string, icon: LucideIcon, blurb: string, pages: Omit<DocMeta, "section">[]): DocSection => ({
  title,
  icon,
  blurb,
  pages: pages.map((p) => ({ ...p, section: title })),
})

export const DOC_SECTIONS: DocSection[] = [
  section("Getting started", BookOpen, "What Secure Vault is and how to try it in minutes.", [
    {
      slug: "introduction",
      title: "Introduction",
      description: "What Secure Vault is, who it is for, and how normal and end-to-end encrypted documents differ.",
    },
    {
      slug: "quick-start",
      title: "Quick start",
      description: "Create an account, a workspace, your vault and your first encrypted .env file in a few minutes.",
    },
    {
      slug: "core-concepts",
      title: "Core concepts",
      description: "Workspaces, roles, projects, documents, the vault and project keys, and how they fit together.",
    },
  ]),
  section("Self-hosting", Server, "Run Secure Vault on your own machine or server.", [
    {
      slug: "self-hosting",
      title: "Install and run locally",
      description: "Start Secure Vault on Linux, macOS or Windows with a single command.",
    },
    {
      slug: "production",
      title: "Production deployment",
      description: "Deploy with Docker Compose behind TLS, keep it updated and back it up.",
    },
    {
      slug: "configuration",
      title: "Configuration reference",
      description: "Every setting for the API and the web app, with defaults.",
    },
    {
      slug: "email-and-google",
      title: "Email and Google sign-in",
      description: "Send email through any SMTP server and enable Sign in with Google.",
    },
  ]),
  section("Using Secure Vault", Users, "Workspaces, teams, roles, projects and documents.", [
    {
      slug: "accounts",
      title: "Accounts and sign-in",
      description: "Sign up, verify your email, sign in, manage sessions and your profile.",
    },
    {
      slug: "workspaces",
      title: "Workspaces",
      description: "Create, switch, configure, transfer and delete workspaces.",
    },
    {
      slug: "members-and-invitations",
      title: "Members and invitations",
      description: "Invite teammates, accept invitations and manage who is in your workspace.",
    },
    {
      slug: "roles-and-permissions",
      title: "Roles and permissions",
      description: "Built-in and custom roles, every permission, and the hierarchy rules.",
    },
    {
      slug: "projects",
      title: "Projects",
      description: "Group documents and secrets into projects and choose who can access them.",
    },
    {
      slug: "documents",
      title: "Documents",
      description: "Write Markdown and text documents, view history, restore versions and search.",
    },
    {
      slug: "notifications",
      title: "Notifications and activity",
      description: "The notification centre, email alerts and the dashboard activity feed.",
    },
  ]),
  section("The vault", KeyRound, "End-to-end encryption: keys, secure documents and sharing.", [
    {
      slug: "vault-setup",
      title: "Set up your vault",
      description: "Choose a vault password, create your keys and save your recovery key.",
    },
    {
      slug: "unlocking",
      title: "Unlocking and auto-lock",
      description: "Unlock your vault, and how it locks itself to keep secrets safe.",
    },
    {
      slug: "secure-documents",
      title: "Secure documents",
      description: "Create end-to-end encrypted documents and manage .env files safely.",
    },
    {
      slug: "sharing-access",
      title: "Sharing secure access",
      description: "How project keys reach teammates, pending access and verifying fingerprints.",
    },
    {
      slug: "key-rotation",
      title: "Revocation and key rotation",
      description: "What happens when someone loses access, and how keys are rotated automatically.",
    },
    {
      slug: "recovery",
      title: "Password change, recovery and reset",
      description: "Change your vault password, use your recovery key, or reset your vault.",
    },
  ]),
  section("Security", ShieldCheck, "How Secure Vault protects your data, and its limits.", [
    {
      slug: "security-model",
      title: "Security model",
      description: "The threat model: what the server stores, what it never sees, and how it is protected.",
    },
    {
      slug: "cryptography",
      title: "Cryptography",
      description: "Algorithms, the key hierarchy and how every ciphertext is bound to its place.",
    },
    {
      slug: "audit-log",
      title: "Audit log",
      description: "Everything that is recorded, who can see it, filters, export and alerts.",
    },
    {
      slug: "limitations",
      title: "Known limitations",
      description: "An honest list of what end-to-end encryption in a browser can't protect against.",
    },
    {
      slug: "faq",
      title: "FAQ and troubleshooting",
      description: "Answers to common questions and fixes for common problems.",
    },
  ]),
]

export const ALL_DOCS: DocMeta[] = DOC_SECTIONS.flatMap((s) => s.pages)

export function findDoc(slug: string | undefined): DocMeta | undefined {
  return ALL_DOCS.find((d) => d.slug === slug)
}

export function neighbours(slug: string): { prev?: DocMeta; next?: DocMeta } {
  const i = ALL_DOCS.findIndex((d) => d.slug === slug)
  return { prev: i > 0 ? ALL_DOCS[i - 1] : undefined, next: i >= 0 ? ALL_DOCS[i + 1] : undefined }
}

/** Markdown sources, one lazily loaded chunk per page. */
const sources = import.meta.glob<string>("./content/*.md", { query: "?raw", import: "default" })

export async function loadDocSource(slug: string): Promise<string | null> {
  const load = sources[`./content/${slug}.md`]
  return load ? load() : null
}

export interface Heading {
  depth: 2 | 3
  text: string
  id: string
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

/** Plain text of a markdown heading line (links and emphasis stripped). */
export function headingText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim()
}

/** `##` and `###` headings, skipping fenced code blocks. Ids match the rendered heading ids. */
export function extractHeadings(source: string): Heading[] {
  const out: Heading[] = []
  const seen = new Map<string, number>()
  let fenced = false
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const text = headingText(m[2])
    out.push({ depth: m[1].length as 2 | 3, text, id: uniqueId(slugify(text), seen) })
  }
  return out
}

export function uniqueId(base: string, seen: Map<string, number>): string {
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n === 0 ? base : `${base}-${n}`
}
