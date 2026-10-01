import { ArrowRight, BookOpen, Check, Eye, FileLock2, FolderClosed, KeyRound, Lock, Server, ShieldCheck, Sparkles, Users } from "lucide-react"
import { Link } from "react-router"

import { LogoMark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { APP_URL, DEMO_MODE, SIGNUP_URL } from "../config"
import { useSignedIn } from "../site-root"

const ROWS = [
  { key: "DATABASE_URL", value: "postgres://app:Xk29!pq@db:5432/prod" },
  { key: "STRIPE_SECRET_KEY", value: "sk_live_51H8xQ2eZvKYlo2C9" },
  { key: "JWT_SIGNING_KEY", value: "7f3a9c1e5b2d8f4a6c0e" },
  { key: "SENTRY_DSN", value: "https://e3b0c442@o1.ingest.io/42" },
]

/** A hand-built preview of the app: a secure .env document, with one value revealing itself. */
function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[42rem]">
      <div className="bg-card glow-ring relative overflow-hidden rounded-2xl border">
        <div className="bg-surface flex items-center gap-2 border-b px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[oklch(0.68_0.18_25)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.8_0.14_80)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.72_0.15_150)]" />
          </span>
          <span className="bg-background text-muted-foreground mx-auto flex items-center gap-1.5 rounded-md border px-3 py-0.5 text-[11px]">
            <Lock className="size-3" /> vault.your-company.com
          </span>
        </div>
        <div className="grid grid-cols-[9.5rem_1fr] max-sm:grid-cols-1">
          <aside className="bg-sidebar hidden space-y-1 border-r p-3 text-xs sm:block">
            <div className="mb-3 flex items-center gap-2">
              <LogoMark className="size-6" />
              <span className="truncate font-semibold">Acme Inc.</span>
            </div>
            {["Dashboard", "Projects", "Members", "Audit log"].map((item, i) => (
              <div key={item} className={cn("rounded-md px-2 py-1.5", i === 1 ? "bg-sidebar-accent font-medium" : "text-muted-foreground")}>
                {item}
              </div>
            ))}
            <p className="text-muted-foreground px-2 pt-3 pb-1 text-[10px] font-medium tracking-wide uppercase">Projects</p>
            {["Payments API", "Mobile app", "Infra"].map((p, i) => (
              <div key={p} className={cn("flex items-center gap-1.5 rounded-md px-2 py-1.5", i === 0 ? "text-foreground" : "text-muted-foreground")}>
                <FolderClosed className="size-3" /> {p}
              </div>
            ))}
          </aside>
          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="bg-secure-soft text-secure flex size-9 items-center justify-center rounded-lg">
                <FileLock2 className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">production.env</p>
                <p className="text-muted-foreground text-[11px]">Payments API · v14</p>
              </div>
              <span className="bg-secure-soft text-secure ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                <ShieldCheck className="size-3" /> End-to-end encrypted
              </span>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border">
              {ROWS.map((row, i) => (
                <div key={row.key} className={cn("grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] items-center gap-2 px-3 py-2 font-mono text-[11px]", i > 0 && "border-t")}>
                  <span className="truncate font-medium">{row.key}</span>
                  <span className="relative block h-4 min-w-0">
                    {i === 1 ? (
                      <>
                        <span className="reveal-cycle-masked text-muted-foreground absolute inset-0 truncate tracking-[0.2em]">••••••••••••</span>
                        <span className="reveal-cycle-plain text-secure absolute inset-0 truncate">{row.value}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground absolute inset-0 truncate tracking-[0.2em]">••••••••••••</span>
                    )}
                  </span>
                  <Eye className="text-muted-foreground size-3.5" />
                </div>
              ))}
            </div>
            <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[11px]">
              <Check className="text-success size-3.5" /> Decrypted in this browser · auto-locks in 15 min
            </div>
          </div>
        </div>
      </div>

      {/* Floating callouts */}
      <div className="float-a bg-card absolute -top-5 -left-3 hidden items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg sm:flex lg:-left-12">
        <Server className="text-secure size-4" />
        <div>
          <p className="font-semibold">Server sees</p>
          <p className="text-muted-foreground font-mono text-[10px]">c2VhbGVk·8f1c…e9a2</p>
        </div>
      </div>
      <div className="float-b bg-card absolute -right-3 top-1/3 hidden items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg sm:flex lg:-right-14">
        <KeyRound className="text-brand size-4" />
        <div>
          <p className="font-semibold">Key shared</p>
          <p className="text-muted-foreground text-[10px]">with 3 teammates</p>
        </div>
      </div>
      <div className="float-c bg-card absolute -bottom-5 left-1/4 hidden items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg sm:flex">
        <Users className="text-info size-4" />
        <div>
          <p className="font-semibold">Role: Manager</p>
          <p className="text-muted-foreground text-[10px]">can view secure docs</p>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  const signedIn = useSignedIn()
  return (
    <section className="relative isolate overflow-hidden pt-10 pb-20 sm:pt-16 sm:pb-28">
      <div className="site-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[40rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_20%,transparent),transparent)]" aria-hidden="true" />
      <div className="pointer-events-none absolute top-40 -right-40 -z-10 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--secure)_13%,transparent),transparent)]" aria-hidden="true" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <a
            href={DEMO_MODE ? "#self-host" : "#how-it-works"}
            data-reveal
            className="bg-card/80 hover:border-brand/40 inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs font-medium shadow-xs transition-colors"
          >
            <span className="bg-brand text-brand-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
              <Sparkles className="size-3" /> {DEMO_MODE ? "Live demo" : "Open source"}
            </span>
            {DEMO_MODE ? (
              <>
                {/* Shorter on phones so the pill stays on one line. */}
                <span className="sm:hidden">Self-host it for real secrets</span>
                <span className="hidden sm:inline">Try it free here, self-host it for real secrets</span>
              </>
            ) : (
              "Self-hosted · end-to-end encrypted · free"
            )}
            <ArrowRight className="size-3 shrink-0" />
          </a>
          <h1 data-reveal style={{ "--d": 1 } as React.CSSProperties} className="mt-6 text-[2.6rem] leading-[1.04] font-semibold sm:text-6xl lg:text-7xl">
            Your team's secrets, <span className="text-gradient-brand">sealed before</span> they leave the browser.
          </h1>
          <p data-reveal style={{ "--d": 2 } as React.CSSProperties} className="text-muted-foreground mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg">
            Secure Vault keeps your team's docs and <code className="bg-muted rounded px-1.5 py-0.5 text-[0.9em]">.env</code> files in one place.
            Everyday docs stay simple. Secrets are encrypted on your device with keys the server never sees.
          </p>
          <div data-reveal style={{ "--d": 3 } as React.CSSProperties} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {signedIn ? (
              <Button size="lg" asChild>
                <a href={APP_URL}>
                  Open your workspace <ArrowRight />
                </a>
              </Button>
            ) : (
              <Button size="lg" asChild>
                <a href={SIGNUP_URL}>
                  {DEMO_MODE ? "Try the live demo" : "Create your account"} <ArrowRight />
                </a>
              </Button>
            )}
            <Button size="lg" variant="outline" asChild>
              <a href="#self-host">
                <Server /> Self-host it
              </a>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link to="/docs">
                <BookOpen /> Read the docs
              </Link>
            </Button>
          </div>
          <ul data-reveal style={{ "--d": 4 } as React.CSSProperties} className="text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            {["Argon2id", "X25519 sealed boxes", "AES-256-GCM", "Strict CSP + SRI", "Append-only audit log"].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="text-brand size-3.5" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div data-reveal="scale" style={{ "--d": 3 } as React.CSSProperties} className="mt-16 sm:mt-20">
          <ProductPreview />
        </div>
      </div>
    </section>
  )
}
