import type { ReactNode } from "react"
import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react"
import { Link } from "react-router"

import { Logo } from "@/components/brand"

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Encrypted in your browser",
    body: "Secure documents are sealed before they leave your device. The server only ever stores ciphertext.",
  },
  {
    icon: KeyRound,
    title: "Keys only your team holds",
    body: "Each project has its own key, shared person-to-person. Access removed means keys rotated.",
  },
  {
    icon: Fingerprint,
    title: "Verifiable teammates",
    body: "Key fingerprints let you confirm who you are sharing with, out of band.",
  },
]

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden border-r bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-vault-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="bg-vault-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_20%,black,transparent_70%)]" aria-hidden="true" />
        <Link to="/" className="relative w-fit rounded-lg">
          <Logo />
        </Link>
        <div className="relative max-w-md space-y-10">
          <h2 className="text-[2.1rem] leading-[1.15] font-semibold">
            Your team's secrets,{" "}
            <span className="text-brand">sealed end to end.</span>
          </h2>
          <ul className="space-y-6">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-brand shadow-sm ring-1 ring-border">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground relative text-xs">
          Self-hosted. Open about its security model and its limits.
        </p>
      </aside>
      <main className="relative flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden">
          <Link to="/" className="inline-flex rounded-lg">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </main>
    </div>
  )
}

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-7 space-y-2">
      <h1 className="text-[1.65rem] font-semibold">{title}</h1>
      {description ? <p className="text-muted-foreground text-sm leading-relaxed">{description}</p> : null}
    </div>
  )
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

/** Only allow same-site relative redirect targets. */
export function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value
  return "/"
}
