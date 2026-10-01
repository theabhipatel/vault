import { useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  Command,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  History,
  KeyRound,
  Laptop,
  Lock,
  MonitorSmartphone,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  Users,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { DEMO_MODE, GITHUB_URL, SIGNUP_URL } from "../config"
import { GitHubIcon } from "../components/github-icon"

const delay = (d: number) => ({ "--d": d }) as CSSProperties

export function SectionHeading({ eyebrow, title, children, center = true }: { eyebrow: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      <p data-reveal className="text-brand font-mono text-xs font-semibold tracking-[0.18em] uppercase">
        {eyebrow}
      </p>
      <h2 data-reveal style={delay(1)} className="mt-3 text-3xl leading-tight font-semibold sm:text-5xl">
        {title}
      </h2>
      {children ? (
        <p data-reveal style={delay(2)} className="text-muted-foreground mt-5 text-base leading-relaxed sm:text-lg">
          {children}
        </p>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------- */

const SECRET_KINDS = [
  "Database URLs",
  "API keys",
  "OAuth client secrets",
  "Signing keys",
  "SSH notes",
  "Webhook secrets",
  "Runbooks",
  "Onboarding guides",
  "Incident notes",
  "Architecture docs",
]

export function Marquee() {
  const items = [...SECRET_KINDS, ...SECRET_KINDS]
  return (
    <section aria-label="What teams keep in Secure Vault" className="marquee border-y py-5">
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <ul className="marquee-track flex w-max gap-3">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              aria-hidden={i >= SECRET_KINDS.length ? true : undefined}
              className="bg-card text-muted-foreground flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm whitespace-nowrap"
            >
              {i % 2 === 0 ? <Lock className="text-secure size-3.5" /> : <FileText className="text-brand size-3.5" />}
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------- */

const PLAIN = `# production.env
DATABASE_URL=postgres://app:Xk29!pq@db/prod
STRIPE_SECRET_KEY=sk_live_51H8xQ2eZvKYlo2C
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG
JWT_SIGNING_KEY=7f3a9c1e5b2d8f4a6c0e9b1d`
const CIPHER = `AQAAAJw3sR0tX2VuY3J5cHRlZF9ibG9iX3Yx
9f2c41ab0e77d3c95a1f6be2840dd1c37a9e2f
Kx8Qe+V2mT0oZ1pL4nR7sYb3/wJc6UdHfA9gNi
c2VhbGVkIGJ5IHlvdXIgYnJvd3NlciBvbmx5Lg
3b7e1fa49d02c86e5f1a7b9c0d4e8f2a6b1c5d`

/** Drag to compare what you see with what the server stores. */
export function ServerView() {
  const [split, setSplit] = useState(55)
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div>
            <SectionHeading eyebrow="Zero-knowledge storage" title="What you see. What the server stores." center={false}>
              Drag the handle. On the left is your <code className="bg-muted rounded px-1 text-[0.9em]">.env</code> file as it appears in
              your browser. On the right is everything the server, the database and its backups ever hold.
            </SectionHeading>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                ["Encrypted on your device", "Before anything is sent, with keys that only exist in your browser's memory."],
                ["Bound to its place", "Every ciphertext is tied to its document, version and project, so it can't be swapped or replayed."],
                ["Useless if stolen", "A leaked database or backup contains ciphertext and sealed keys, not secrets."],
              ].map(([title, body], i) => (
                <li key={title} data-reveal style={delay(i + 2)} className="flex gap-3">
                  <span className="bg-brand-soft text-brand mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                    <Check className="size-3.5" />
                  </span>
                  <span>
                    <strong className="font-semibold">{title}.</strong> <span className="text-muted-foreground">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div data-reveal="scale" className="relative">
            <div className="bg-card relative overflow-hidden rounded-2xl border shadow-lg" style={{ "--split": `${split}%` } as CSSProperties}>
              <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs font-medium">
                <span className="text-brand flex items-center gap-1.5">
                  <Laptop className="size-3.5" /> Your browser
                </span>
                <span className="text-secure flex items-center gap-1.5">
                  Server <Server className="size-3.5" />
                </span>
              </div>
              <div className="relative h-64 font-mono text-[11.5px] leading-7 sm:h-72 sm:text-[13px] sm:leading-8">
                <pre className="text-secure bg-surface absolute inset-0 overflow-hidden px-5 py-4 break-all whitespace-pre-wrap">{CIPHER}</pre>
                <pre
                  className="bg-card absolute inset-0 overflow-hidden px-5 py-4 break-all whitespace-pre-wrap"
                  style={{ clipPath: "inset(0 calc(100% - var(--split)) 0 0)" }}
                >
                  {PLAIN.split("\n").map((line) => (
                    <span key={line} className="block">
                      {line.startsWith("#") ? (
                        <span className="text-muted-foreground">{line}</span>
                      ) : (
                        <>
                          <span className="text-foreground font-semibold">{line.split("=")[0]}</span>
                          <span className="text-muted-foreground">=</span>
                          <span className="text-brand">{line.slice(line.indexOf("=") + 1)}</span>
                        </>
                      )}
                    </span>
                  ))}
                </pre>
                <div className="pointer-events-none absolute inset-y-0" style={{ left: "var(--split)" }} aria-hidden="true">
                  <div className="bg-brand absolute inset-y-0 -left-px w-0.5" />
                  <div className="bg-brand text-brand-foreground absolute top-1/2 -left-4 flex size-8 -translate-y-1/2 items-center justify-center rounded-full shadow-lg">
                    <Eye className="size-4" />
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  aria-label="Compare plaintext with ciphertext"
                  className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                />
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-center text-xs">Drag, or focus and use the arrow keys.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------- */

function BentoCard({
  icon: Icon,
  title,
  children,
  visual,
  className,
  tone = "brand",
  d = 0,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
  visual?: ReactNode
  className?: string
  tone?: "brand" | "secure" | "info"
  d?: number
}) {
  const toneClass = { brand: "bg-brand-soft text-brand", secure: "bg-secure-soft text-secure", info: "bg-info-soft text-info" }[tone]
  return (
    <div
      data-reveal
      style={delay(d)}
      className={cn(
        "group bg-card relative flex flex-col overflow-hidden rounded-2xl border p-6 shadow-xs transition-[border-color,box-shadow] duration-300 hover:shadow-lg",
        "hover:border-brand/35",
        className,
      )}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-xl", toneClass)}>
        <Icon className="size-5" />
      </span>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{children}</p>
      {visual ? <div className="mt-6 flex-1">{visual}</div> : null}
    </div>
  )
}

const MiniRow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("bg-background/70 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", className)}>{children}</div>
)

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="site-dots pointer-events-none absolute inset-x-0 top-0 h-72 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Everything in one place" title="A complete team vault, not just a password box.">
          Workspaces, roles, projects, docs and end-to-end encrypted secrets, with the admin tools a real team needs.
        </SectionHeading>

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <BentoCard
            icon={Lock}
            tone="secure"
            title="End-to-end encrypted secure documents"
            className="lg:col-span-4"
            visual={
              <div className="grid gap-2 sm:grid-cols-2">
                <MiniRow>
                  <span className="font-mono font-medium">STRIPE_SECRET_KEY</span>
                  <span className="text-muted-foreground ml-auto tracking-[0.2em]">••••••</span>
                  <EyeOff className="text-muted-foreground size-3.5" />
                </MiniRow>
                <MiniRow>
                  <span className="font-mono font-medium">DATABASE_URL</span>
                  <span className="text-muted-foreground ml-auto tracking-[0.2em]">••••••</span>
                  <Copy className="text-muted-foreground size-3.5" />
                </MiniRow>
                <MiniRow className="border-secure/30 sm:col-span-2">
                  <ClipboardCheck className="text-secure size-3.5" />
                  <span>Copied. The clipboard clears itself in 30 seconds.</span>
                </MiniRow>
              </div>
            }
          >
            A purpose-built <code className="bg-muted rounded px-1">.env</code> editor with masked values, one-click copy, import and export, plus
            encrypted Markdown and text. The server only ever stores ciphertext.
          </BentoCard>

          <BentoCard
            icon={Users}
            title="Roles with a real hierarchy"
            className="lg:col-span-2"
            d={1}
            visual={
              <div className="space-y-1.5">
                {[
                  ["Owner", "1000", "w-full"],
                  ["Admin", "900", "w-[88%]"],
                  ["Manager", "500", "w-[70%]"],
                  ["Member", "100", "w-[52%]"],
                ].map(([role, rank, width]) => (
                  <div key={role} className={cn("bg-brand-soft/70 flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs", width)}>
                    <span className="font-medium">{role}</span>
                    <span className="text-muted-foreground font-mono">{rank}</span>
                  </div>
                ))}
              </div>
            }
          >
            Owner, Admin, Manager and Member, plus custom roles ranked anywhere below you. Nobody can manage someone above them.
          </BentoCard>

          <BentoCard
            icon={RefreshCw}
            title="Automatic key sharing and rotation"
            className="lg:col-span-2"
            d={1}
            visual={
              <div className="flex items-center justify-between gap-2 text-xs">
                <MiniRow>
                  <KeyRound className="text-secure size-3.5" /> v3
                </MiniRow>
                <ArrowRight className="text-muted-foreground size-4" />
                <MiniRow className="border-brand/40">
                  <KeyRound className="text-brand size-3.5" /> v4
                </MiniRow>
                <span className="text-muted-foreground">re-encrypted</span>
              </div>
            }
          >
            Teammates get project keys from any unlocked key holder. Remove someone and the key rotates, re-encrypting every version.
          </BentoCard>

          <BentoCard
            icon={History}
            title="Docs with full version history"
            className="lg:col-span-2"
            d={2}
            visual={
              <div className="relative space-y-2 pl-4 text-xs">
                <span className="bg-border absolute top-1 bottom-1 left-1 w-px" />
                {["v14 · edited by Priya · now", "v13 · restored from v11", "v12 · edited by Sam · 2d"].map((v, i) => (
                  <div key={v} className="relative">
                    <span className={cn("absolute top-1 -left-[0.95rem] size-2 rounded-full", i === 0 ? "bg-brand" : "bg-muted-foreground/40")} />
                    <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>{v}</span>
                  </div>
                ))}
              </div>
            }
          >
            Markdown and plain text with live preview. Every save is a version you can view, compare and restore.
          </BentoCard>

          <BentoCard
            icon={ScrollText}
            title="Append-only audit log"
            className="lg:col-span-2"
            d={2}
            visual={
              <div className="space-y-1.5">
                <MiniRow>
                  <span className="font-medium">Decrypted prod.env</span>
                  <span className="bg-success-soft text-success ml-auto rounded px-1.5 py-0.5 text-[10px]">success</span>
                </MiniRow>
                <MiniRow>
                  <span className="font-medium">Wrong vault password</span>
                  <span className="bg-destructive/15 text-destructive ml-auto rounded px-1.5 py-0.5 text-[10px]">failure</span>
                </MiniRow>
              </div>
            }
          >
            Who did what, when, from where and with what result. Filter it, open any event for full details, export it to CSV. Nobody can edit it.
          </BentoCard>

          <BentoCard icon={FolderKanban} title="Workspaces and projects" className="lg:col-span-2" d={3}>
            Run several teams or clients from one account. Give each project its own members, and archive projects when they're done.
          </BentoCard>

          <BentoCard icon={Bell} title="Notifications and alerts" className="lg:col-span-2" d={3} tone="info">
            Invitations, access granted, key changes and security alerts in-app and by email, such as repeated wrong vault passwords.
          </BentoCard>

          <BentoCard icon={Command} title="Fast to use" className="lg:col-span-2" d={4}>
            Command palette (<kbd className="bg-muted rounded px-1 font-mono text-xs">Ctrl K</kbd>), search, light and dark themes and a responsive
            layout that works on your phone.
          </BentoCard>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------- */

export function DocumentKinds() {
  const rows: [string, ReactNode, ReactNode][] = [
    ["Who can read the content", "Anyone with access, and the server", "Only people holding the project key"],
    ["Encryption", "In transit (TLS) and access control", "End-to-end: AES-256-GCM in the browser"],
    ["Readable by the server", <Check key="a" className="text-success size-4" />, <X key="b" className="text-muted-foreground size-4" />],
    ["Version history", <Check key="c" className="text-success size-4" />, <Check key="d" className="text-success size-4" />],
    ["Best for", "Runbooks, guides, notes", "Credentials, keys, .env files"],
  ]
  return (
    <section className="py-24 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeading eyebrow="Two kinds of documents" title="Simple where it can be. Sealed where it must be.">
          Choose per document. Normal documents stay convenient for everyday writing. Secure documents are encrypted end to end, so only your team can read them.
        </SectionHeading>
        <div data-reveal className="bg-card mt-12 overflow-hidden rounded-2xl border shadow-sm">
          <div className="grid grid-cols-[1.1fr_1fr_1fr] border-b text-sm">
            <div className="p-4" />
            <div className="flex items-center gap-2 border-l p-4 font-semibold">
              <FileText className="text-brand size-4" /> Normal
            </div>
            <div className="bg-secure-soft/40 flex items-center gap-2 border-l p-4 font-semibold">
              <ShieldCheck className="text-secure size-4" /> Secure
            </div>
          </div>
          {rows.map(([label, normal, secure]) => (
            <div key={label} className="grid grid-cols-[1.1fr_1fr_1fr] border-b text-sm last:border-b-0">
              <div className="text-muted-foreground p-4">{label}</div>
              <div className="flex items-center border-l p-4">{normal}</div>
              <div className="bg-secure-soft/40 flex items-center border-l p-4">{secure}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------- */

const PRIMITIVES = [
  { name: "Argon2id", use: "Turns your vault password into a key. Tuned to about one second per guess on your device." },
  { name: "X25519", use: "Your personal keypair. Project keys are sealed to each member's public key." },
  { name: "AES-256-GCM", use: "Encrypts every secure document, bound to its document, version and project." },
  { name: "CSP + SRI", use: "Only our own scripts run, and each one is checked against a hash." },
]

export function Security() {
  return (
    <section id="security" className="bg-surface/60 relative scroll-mt-20 border-y py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Security by design" title="The server is never trusted with your secrets.">
          Not by policy: by construction. The server enforces who may store or receive which encrypted blob, but it can't open any of them.
        </SectionHeading>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <div data-reveal className="bg-card rounded-2xl border p-6 sm:p-8">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Server className="text-muted-foreground size-5" /> What the server stores
            </h3>
            <ul className="mt-5 space-y-3 text-sm">
              {["Ciphertext of every secure document version", "Project keys sealed to each member's public key", "Your private key, encrypted by your vault password", "Public keys, used to share project keys", "Names, membership and the audit trail"].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check className="text-success mt-0.5 size-4 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal style={delay(1)} className="bg-card rounded-2xl border p-6 sm:p-8">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <EyeOff className="text-secure size-5" /> What it never sees
            </h3>
            <ul className="mt-5 space-y-3 text-sm">
              {["Your vault password", "Your private key or recovery key", "Any project key", "The contents of any secure document", "Values you copy, reveal or export"].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <X className="text-destructive mt-0.5 size-4 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRIMITIVES.map((p, i) => (
            <div key={p.name} data-reveal style={delay(i)} className="bg-card hover:border-brand/40 rounded-2xl border p-5 transition-colors">
              <p className="font-mono text-sm font-semibold">{p.name}</p>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{p.use}</p>
            </div>
          ))}
        </div>

        <div data-reveal className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Button variant="outline" asChild>
            <Link to="/docs/security-model">
              <ShieldCheck /> Read the security model
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/docs/limitations">
              Known limitations, stated honestly <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------- */

const INSTALL_TABS = [
  {
    id: "unix",
    label: "Linux & macOS",
    icon: Terminal,
    lines: ["git clone https://github.com/theabhipatel/vault.git", "cd vault", "./scripts/dev.sh"],
    note: "Needs Docker, uv and Node 20.19+. Open http://localhost:29180 when it's ready.",
  },
  {
    id: "windows",
    label: "Windows",
    icon: MonitorSmartphone,
    lines: ["git clone https://github.com/theabhipatel/vault.git", "cd vault", "scripts\\dev.cmd"],
    note: "Works in PowerShell or Command Prompt with Docker Desktop. With WSL, use the Linux steps.",
  },
  {
    id: "prod",
    label: "Production (Docker)",
    icon: Server,
    lines: ["cp backend/.env.example .env.prod   # set APP_URL, SECRET_KEY, SMTP_*, POSTGRES_PASSWORD", "docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"],
    note: "Runs Postgres, the API and nginx with a strict CSP. Put TLS in front of port 29080.",
  },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
    </button>
  )
}

export function SelfHost() {
  const [tab, setTab] = useState(INSTALL_TABS[0].id)
  const active = INSTALL_TABS.find((t) => t.id === tab) ?? INSTALL_TABS[0]
  return (
    <section id="self-host" className="relative scroll-mt-20 overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute top-1/2 -left-40 h-[34rem] w-[34rem] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_14%,transparent),transparent)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <SectionHeading eyebrow="Self-hosted" title="Your server. Your keys. Your rules." center={false}>
              {DEMO_MODE
                ? "This site is a public demo for exploring. For real secrets, run the exact same Secure Vault on your own machine or server. It takes one command."
                : "Secure Vault runs on your own machine or server. The same code powers the public demo, and it takes one command to start."}
            </SectionHeading>
            <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
              {[
                "Identical to the demo: same code, same features",
                "Your database, your backups, your network",
                "No third-party scripts, trackers or CDNs",
                "Postgres + Docker, nothing exotic",
              ].map((item, i) => (
                <li key={item} data-reveal style={delay(i + 2)} className="flex gap-2.5">
                  <Check className="text-brand mt-0.5 size-4 shrink-0" /> {item}
                </li>
              ))}
            </ul>
            {DEMO_MODE ? (
              <div data-reveal className="border-secure/30 bg-secure-soft/50 mt-8 flex gap-3 rounded-xl border p-4 text-sm">
                <TriangleAlert className="text-secure mt-0.5 size-4 shrink-0" />
                <p>
                  <strong className="font-semibold">The demo is for trying things out.</strong> Anyone can sign up, and the data may be reset at any
                  time. Never put real credentials in it.
                </p>
              </div>
            ) : null}
          </div>

          <div data-reveal="scale" className="bg-card overflow-hidden rounded-2xl border shadow-xl">
            <div className="flex flex-wrap items-center gap-1 border-b p-2" role="tablist" aria-label="Install instructions">
              {INSTALL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === tab}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                    t.id === tab ? "bg-brand-soft text-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <t.icon className="size-3.5" /> {t.label}
                </button>
              ))}
            </div>
            <div className="bg-surface/70 relative p-4 sm:p-5" role="tabpanel">
              <div className="absolute top-3 right-3">
                <CopyButton text={active.lines.join("\n")} />
              </div>
              <pre className="overflow-x-auto pr-16 font-mono text-[12.5px] leading-7 sm:text-[13.5px]">
                {active.lines.map((line) => (
                  <span key={line} className="block whitespace-pre">
                    <span className="text-brand select-none">$ </span>
                    {line}
                  </span>
                ))}
              </pre>
            </div>
            <div className="text-muted-foreground flex items-start gap-2 border-t px-4 py-3 text-xs sm:px-5">
              <BookOpen className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {active.note}{" "}
                <Link to={tab === "prod" ? "/docs/production" : "/docs/self-hosting"} className="text-brand font-medium underline-offset-2 hover:underline">
                  Full guide
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------- */

const FAQS = [
  {
    q: "Can the people running the server read my secrets?",
    a: "No. Secure documents are encrypted in your browser before they're sent, and the keys never leave your team's devices. Server operators see ciphertext, sealed keys and metadata such as document names.",
  },
  {
    q: "What happens if I forget my vault password?",
    a: "Use the recovery key you saved during setup to choose a new password. If you've lost both, you can reset your vault: teammates' browsers re-share project keys with you automatically, but projects only you could open become unreadable.",
  },
  {
    q: "Is the demo the same as the self-hosted version?",
    a: "Yes, it runs the same code. The demo is public and may be reset at any time, so use it to explore and self-host for anything real.",
  },
  {
    q: "Do admins automatically get access to every secret?",
    a: "Roles decide who is allowed to access secure documents, but the actual key has to be shared by a teammate who holds it. This happens automatically and in the background, without anyone ever handing a password around.",
  },
  {
    q: "What does it cost?",
    a: "Secure Vault is open source and free to self-host. You only pay for whatever server you run it on.",
  },
  {
    q: "What if someone leaves the team?",
    a: "Remove them and the project key rotates: a key holder's browser re-encrypts every version with a fresh key, so their old key opens nothing new.",
  },
]

export function Faq() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />
        <div className="mt-12 space-y-3">
          {FAQS.map((item, i) => (
            <details key={item.q} data-reveal style={delay(i)} className="group bg-card open:border-brand/35 rounded-xl border px-5 transition-colors [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
                {item.q}
                <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="text-muted-foreground pb-5 text-sm leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
        <p data-reveal className="text-muted-foreground mt-8 text-center text-sm">
          More in the{" "}
          <Link to="/docs/faq" className="text-brand font-medium hover:underline">
            FAQ and troubleshooting guide
          </Link>
          .
        </p>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------- */

export function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6 sm:pb-32">
      <div data-reveal="scale" className="bg-card relative mx-auto max-w-6xl overflow-hidden rounded-3xl border px-6 py-16 text-center shadow-xl sm:px-12 sm:py-20">
        <div className="site-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_28%,transparent),transparent)]" aria-hidden="true" />
        <div className="relative">
          <span className="bg-brand text-brand-foreground mx-auto flex size-14 items-center justify-center rounded-2xl shadow-lg">
            <Lock className="size-6" />
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold sm:text-5xl">Stop pasting secrets into chat.</h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base sm:text-lg">
            Give your team one place for docs and credentials, where the secrets stay encrypted end to end.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <a href={SIGNUP_URL}>
                {DEMO_MODE ? "Try the live demo" : "Get started"} <ArrowRight />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={GITHUB_URL} target="_blank" rel="noopener">
                <GitHubIcon className="size-4" /> Star on GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
