import { useEffect, useRef } from "react"
import { Link } from "react-router"

import { LogoMark } from "@/components/brand"

import { APP_URL, GITHUB_URL, SIGNUP_URL } from "../config"
import { DevelopedBy } from "./developed-by"
import { GitHubIcon } from "./github-icon"

const COLUMNS: { title: string; links: { label: string; href: string; site?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How encryption works", href: "/#how-it-works" },
      { label: "Security", href: "/#security" },
      { label: "Self-host", href: "/#self-host" },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Quick start", href: "/docs/quick-start", site: true },
      { label: "Install and run", href: "/docs/self-hosting", site: true },
      { label: "Set up your vault", href: "/docs/vault-setup", site: true },
      { label: "Security model", href: "/docs/security-model", site: true },
    ],
  },
  {
    title: "Open source",
    links: [
      { label: "GitHub repository", href: GITHUB_URL },
      { label: "Report an issue", href: `${GITHUB_URL}/issues` },
      { label: "Privacy and demo terms", href: "/privacy", site: true },
      { label: "Open the app", href: APP_URL },
    ],
  },
]

/** The giant "SECURE VAULT" word mark: fits any width (SVG), with a spotlight that follows the pointer. */
function Logotype() {
  const wrapper = useRef<HTMLDivElement>(null)
  const ref = useRef<SVGSVGElement>(null)
  const spot = useRef<SVGRadialGradientElement>(null)

  // Observe the wrapper: a fully clipped element never counts as intersecting.
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-inview", "")
          io.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current
    const gradient = spot.current
    if (!svg || !gradient) return
    const rect = svg.getBoundingClientRect()
    gradient.setAttribute("cx", String((e.clientX - rect.left) / rect.width))
    gradient.setAttribute("cy", String((e.clientY - rect.top) / rect.height))
  }

  return (
    <div ref={wrapper}>
    <svg
      ref={ref}
      viewBox="0 0 1200 190"
      role="img"
      aria-label="Secure Vault"
      className="logotype-reveal block h-auto w-full select-none"
      onPointerMove={onPointerMove}
    >
      <defs>
        <linearGradient id="logotype-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--foreground)", stopOpacity: 0.95 }} />
          <stop offset="100%" style={{ stopColor: "var(--foreground)", stopOpacity: 0.06 }} />
        </linearGradient>
        <radialGradient ref={spot} id="logotype-spot" cx="0.5" cy="0.3" r="0.35">
          <stop offset="0%" style={{ stopColor: "var(--brand)", stopOpacity: 0.95 }} />
          <stop offset="55%" style={{ stopColor: "var(--secure)", stopOpacity: 0.45 }} />
          <stop offset="100%" style={{ stopColor: "var(--secure)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <text
        x="600"
        y="160"
        textAnchor="middle"
        textLength="1180"
        lengthAdjust="spacingAndGlyphs"
        fill="url(#logotype-fill)"
        className="font-heading"
        style={{ fontSize: 188, fontWeight: 800, letterSpacing: "-0.02em" }}
      >
        SECURE VAULT
      </text>
      <text
        x="600"
        y="160"
        textAnchor="middle"
        textLength="1180"
        lengthAdjust="spacingAndGlyphs"
        fill="url(#logotype-spot)"
        className="font-heading"
        style={{ fontSize: 188, fontWeight: 800, letterSpacing: "-0.02em", mixBlendMode: "screen" }}
        aria-hidden="true"
      >
        SECURE VAULT
      </text>
    </svg>
    </div>
  )
}

export function SiteFooter() {
  return (
    // Always dark: the `dark` class switches every design token inside the footer.
    <footer className="dark bg-background text-foreground relative overflow-hidden border-t">
      <div className="site-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_22%,transparent),transparent)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm space-y-5">
            <div className="flex items-center gap-3">
              <LogoMark className="size-10" />
              <span className="font-heading text-xl font-semibold">Secure Vault</span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              An open-source, self-hosted vault for your team's docs and secrets. Secrets are encrypted in the browser, so
              the server only ever holds ciphertext.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener"
                className="hover:border-foreground/30 bg-card inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors"
              >
                <GitHubIcon className="size-4" /> Star on GitHub
              </a>
              <a
                href={SIGNUP_URL}
                className="bg-brand text-brand-foreground inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-opacity hover:opacity-90"
              >
                Try it now
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="font-sans text-sm font-semibold">{col.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.site ? (
                        <Link to={link.href} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}
                          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 sm:mt-20">
          <Logotype />
        </div>

        <div className="flex flex-col-reverse items-start justify-between gap-6 border-t py-8 sm:flex-row sm:items-center">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} Secure Vault. Open source. Encrypted in your browser, stored as ciphertext.
          </p>
          <DevelopedBy />
        </div>
      </div>
    </footer>
  )
}
