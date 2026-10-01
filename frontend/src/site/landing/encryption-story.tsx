import { useEffect, useRef } from "react"
import { ArrowDown, ArrowRight, Check, Database, EyeOff, FileLock2, KeyRound, Laptop, Lock, Mail, ShieldCheck, Smartphone } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * "How end-to-end encryption works", told by scrolling. The section is tall; its inner stage is
 * sticky, and scroll progress drives six steps.
 *
 * Performance: one passive scroll listener, at most one requestAnimationFrame per frame and only
 * while the section is on screen. Each frame only writes a few CSS variables, one data attribute
 * and (during the cipher steps) three short text nodes. Everything else is CSS transitions on
 * opacity and transform, which run on the compositor even on low-end phones.
 */

const STEPS = [
  {
    title: "You write a secret",
    body: "It starts on your device. You type a .env file into a secure document. Right now it exists only in your browser's memory.",
  },
  {
    title: "Your vault password unlocks your keys",
    body: "Argon2id stretches your vault password into a key that unlocks your private key. The password itself never leaves this tab.",
  },
  {
    title: "Encrypted before it leaves",
    body: "The document is encrypted with the project's AES-256-GCM key, bound to this exact document and version so it can't be swapped or replayed.",
  },
  {
    title: "The server stores only noise",
    body: "Only ciphertext reaches the server. With full database access, or after a breach, it reads as random bytes.",
  },
  {
    title: "Keys are sealed for each teammate",
    body: "The project key is sealed to your teammate's public key (X25519). Only their private key can open it; the server just passes the envelope along.",
  },
  {
    title: "Decrypted only on their device",
    body: "Your teammate's browser opens the envelope and decrypts locally. Same secret on two devices, and never readable on the server.",
  },
]

const LINES = ["DB_URL=postgres://u:pw@db/prod", "STRIPE_KEY=sk_live_51H8xQ2eZvK", "JWT_SECRET=7f3a9c1e5b2d8f4a6c"]
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

// Deterministic pseudo-random numbers, so the ciphertext is stable from frame to frame.
function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}
const cipherOf = (text: string, seed: number) =>
  Array.from(text, (_, i) => ALPHABET[Math.floor(hash(seed * 1000 + i) * ALPHABET.length)]).join("")
const CIPHER = LINES.map((line, i) => cipherOf(line, i + 1))

/** `amount` 0 → plain text, 1 → ciphertext. Characters flip left-to-right with a little jitter. */
function scramble(plain: string, cipher: string, amount: number, frame: number, seed: number): string {
  if (amount <= 0) return plain
  if (amount >= 1) return cipher
  let out = ""
  for (let i = 0; i < plain.length; i++) {
    const at = (i / plain.length) * 0.72 + hash(seed * 7919 + i) * 0.2
    if (amount >= at + 0.08) out += cipher[i]
    else if (amount >= at) out += ALPHABET[Math.floor(hash(frame * 31 + i + seed) * ALPHABET.length)]
    else out += plain[i]
  }
  return out
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (t: number) => t * t * (3 - 2 * t)

function CodeLines({ refs, className }: { refs: React.RefObject<(HTMLSpanElement | null)[]>; className?: string }) {
  return (
    <div className={cn("bg-background/60 rounded-lg border p-2.5 font-mono text-[10.5px] leading-[1.7] sm:text-xs lg:p-3 lg:text-[12.5px]", className)}>
      {LINES.map((line, i) => (
        <div key={line} className="flex min-w-0 gap-2 whitespace-pre">
          <span className="text-muted-foreground/60 select-none">{i + 1}</span>
          <span
            ref={(el) => {
              refs.current[i] = el
            }}
            className="truncate"
          >
            {line}
          </span>
        </div>
      ))}
    </div>
  )
}

function PanelHeader({ icon: Icon, title, note }: { icon: typeof Laptop; title: string; note: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
        <Icon className="size-3.5" />
      </span>
      <span className="text-[13px] font-semibold">{title}</span>
      <span className="text-muted-foreground ml-auto truncate text-[11px]">{note}</span>
    </div>
  )
}

/** The track between two panels; the moving piece is positioned with --t (0 → 1) and --len. */
function Connector({ varName, children, className }: { varName: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("connector relative flex shrink-0 items-center justify-center", className)} data-connector={varName}>
      <div className="bg-border absolute h-px w-full lg:h-px max-lg:h-full max-lg:w-px" />
      <div className="absolute inset-0 [mask-image:linear-gradient(90deg,transparent,black_20%,black_80%,transparent)] max-lg:[mask-image:linear-gradient(180deg,transparent,black_20%,black_80%,transparent)]">
        <div className="from-brand/0 via-brand/50 to-brand/0 absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-gradient-to-r max-lg:top-0 max-lg:left-1/2 max-lg:h-full max-lg:w-px max-lg:-translate-x-1/2 max-lg:translate-y-0 max-lg:bg-gradient-to-b" />
      </div>
      <div
        className="mover absolute top-1/2 left-0 max-lg:top-0 max-lg:left-1/2"
        style={{
          transform: `translate3d(calc(var(--${varName}-x, 0) * 1px), calc(var(--${varName}-y, 0) * 1px), 0)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function EncryptionStory() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const mineRefs = useRef<(HTMLSpanElement | null)[]>([])
  const theirRefs = useRef<(HTMLSpanElement | null)[]>([])
  const serverRef = useRef<HTMLSpanElement>(null)
  const typedRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    if (!section || !stage) return
    const captions = Array.from(section.querySelectorAll<HTMLElement>("[data-caption]"))
    const dots = Array.from(section.querySelectorAll<HTMLElement>("[data-dot]"))
    const panels = Array.from(section.querySelectorAll<HTMLElement>("[data-panel]"))
    const connectors = Array.from(section.querySelectorAll<HTMLElement>("[data-connector]"))
    let lengths: Record<string, { x: number; y: number }> = {}
    let raf = 0
    let visible = false
    let frame = 0
    let lastP = -1
    let lastStep = -1
    const texts = new Map<HTMLElement, string>()

    const setText = (el: HTMLElement | null | undefined, value: string) => {
      if (el && texts.get(el) !== value) {
        texts.set(el, value)
        el.textContent = value
      }
    }

    // Short screens: scale the scene down so all three panels always fit.
    const fit = () => {
      const box = fitRef.current
      const scene = sceneRef.current
      if (!box || !scene) return
      scene.style.transform = ""
      const scale = Math.min(1, box.clientHeight / scene.offsetHeight, box.clientWidth / scene.offsetWidth)
      scene.style.transform = scale < 1 ? `scale(${Math.max(scale, 0.55)})` : ""
    }

    const measure = () => {
      fit()
      lengths = {}
      for (const c of connectors) {
        const mover = c.querySelector<HTMLElement>(".mover")
        // Matches the lg breakpoint where the panels sit side by side.
        const horizontal = window.matchMedia("(min-width: 1024px)").matches
        const name = c.dataset.connector ?? ""
        const size = mover ? (horizontal ? mover.offsetWidth : mover.offsetHeight) : 0
        lengths[name] = horizontal ? { x: Math.max(c.offsetWidth - size, 0), y: 0 } : { x: 0, y: Math.max(c.offsetHeight - size, 0) }
        if (mover) mover.style.marginTop = horizontal ? `${-mover.offsetHeight / 2}px` : "0"
        if (mover) mover.style.marginLeft = horizontal ? "0" : `${-mover.offsetWidth / 2}px`
      }
      lastP = -1
    }

    const apply = (p: number) => {
      const scaled = p * STEPS.length
      const step = Math.min(STEPS.length - 1, Math.floor(scaled))
      // Each step finishes its motion at 70% of its scroll range, then holds.
      const local = (i: number) => ease(clamp01((scaled - i) / 0.7))
      frame++

      stage.style.setProperty("--progress", String(p))
      if (step !== lastStep) {
        lastStep = step
        section.dataset.step = String(step)
        stage.dataset.step = String(step)
        captions.forEach((c, i) => c.toggleAttribute("data-active", i === step))
        dots.forEach((d, i) => d.toggleAttribute("data-done", i <= step))
        const active = step <= 2 ? 0 : step === 3 ? 1 : step === 4 ? 1 : 2
        panels.forEach((panel, i) => {
          panel.toggleAttribute("data-active", i === active && step !== 2)
          panel.toggleAttribute("data-secure", i === 0 && step === 2)
        })
      }

      // 1 · typing the secret
      const total = LINES.join("").length
      let typed = Math.round(local(0) * total)
      LINES.forEach((line, i) => {
        const shown = line.slice(0, Math.max(0, typed))
        typed -= line.length
        const encrypted = scramble(line, CIPHER[i], local(2), frame, i + 1)
        setText(mineRefs.current[i], local(2) > 0 ? encrypted : shown)
      })
      // 2 · password dots and the Argon2id ring
      setText(typedRef.current, "•".repeat(Math.round(local(1) * 8)))
      stage.style.setProperty("--spin", `${local(1) * 540}deg`)
      // 4 · ciphertext travels to the server and lands in the database
      const toServer = local(3)
      const a = lengths.wire1 ?? { x: 0, y: 0 }
      stage.style.setProperty("--wire1-x", String(a.x * toServer))
      stage.style.setProperty("--wire1-y", String(a.y * toServer))
      stage.style.setProperty("--packet-on", toServer > 0 && toServer < 1 ? "1" : "0")
      setText(serverRef.current, toServer >= 1 ? CIPHER[0].slice(0, 22) : toServer > 0.6 ? scramble("····················", CIPHER[0].slice(0, 22), (toServer - 0.6) / 0.4, frame, 9) : "····················")
      // 5 · the sealed key travels to the teammate
      const toTeammate = local(4)
      const b = lengths.wire2 ?? { x: 0, y: 0 }
      stage.style.setProperty("--wire2-x", String(b.x * toTeammate))
      stage.style.setProperty("--wire2-y", String(b.y * toTeammate))
      stage.style.setProperty("--envelope-on", toTeammate > 0 && toTeammate < 1 ? "1" : "0")
      // 6 · the teammate decrypts
      const decrypt = local(5)
      LINES.forEach((line, i) => {
        setText(theirRefs.current[i], step < 4 ? "" : scramble(line, CIPHER[i], 1 - decrypt, frame, i + 11))
      })
    }

    const update = () => {
      raf = 0
      const rect = section.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      const p = total > 0 ? clamp01(-rect.top / total) : 0
      // Keep animating while characters are mid-flip, otherwise skip identical frames.
      if (Math.abs(p - lastP) < 0.0002) return
      lastP = p
      apply(p)
    }
    const schedule = () => {
      if (!raf && visible) raf = requestAnimationFrame(update)
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) schedule()
    })
    io.observe(section)
    const onResize = () => {
      measure()
      schedule()
    }
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    measure()
    apply(0)
    lastStep = -1
    update()
    return () => {
      io.disconnect()
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const skip = () => {
    const section = sectionRef.current
    if (section) window.scrollTo({ top: section.offsetTop + section.offsetHeight - window.innerHeight * 0.4 })
  }

  return (
    <section id="how-it-works" ref={sectionRef} className="story relative h-[560vh]" data-step="0" aria-label="How end-to-end encryption works">
      <div ref={stageRef} className="story sticky top-0 flex h-dvh flex-col overflow-hidden" data-step="0">
        <div className="site-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" aria-hidden="true" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_13%,transparent),transparent)]" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 pt-[4.75rem] pb-4 sm:px-6 sm:pt-24 lg:pb-10">
          {/* Heading, step indicator and captions */}
          <div className="flex items-center gap-3">
            <span className="bg-brand-soft text-brand inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
              <ShieldCheck className="size-3.5" /> How end-to-end encryption works
            </span>
            <button type="button" onClick={skip} className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs font-medium">
              Skip <ArrowDown className="size-3.5" />
            </button>
          </div>
          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {STEPS.map((s) => (
              <span key={s.title} data-dot className="bg-border relative h-1 flex-1 overflow-hidden rounded-full">
                <span className="bg-brand absolute inset-0 origin-left scale-x-0 rounded-full transition-transform duration-500 [[data-done]>&]:scale-x-100" />
              </span>
            ))}
          </div>
          <div className="relative mt-4 min-h-[7.25rem] sm:mt-6 sm:min-h-[7rem]">
            {STEPS.map((s, i) => (
              <div key={s.title} data-caption {...(i === 0 ? { "data-active": "" } : {})} className="story-caption absolute inset-0">
                <p className="text-brand font-mono text-xs font-semibold tracking-wider">
                  STEP {i + 1} / {STEPS.length}
                </p>
                <h3 className="mt-1.5 text-lg font-semibold sm:text-3xl lg:text-4xl">{s.title}</h3>
                <p className="text-muted-foreground mt-1.5 max-w-2xl text-[13.5px] leading-relaxed sm:text-base">{s.body}</p>
              </div>
            ))}
          </div>

          {/* The stage: your browser → server → teammate */}
          <div ref={fitRef} className="relative mt-2 flex min-h-0 flex-1 items-start justify-center lg:mt-6 lg:items-center">
          <div ref={sceneRef} className="flex w-full origin-top flex-col items-stretch lg:flex-row">
            {/* Your browser */}
            <div data-panel className="story-panel bg-card relative w-full rounded-2xl border p-3 shadow-md sm:p-4 lg:w-[31%] lg:p-5" data-active="">
              <PanelHeader icon={Laptop} title="Your browser" note="plaintext lives here" />
              <CodeLines refs={mineRefs} />
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                <span data-show-from="1" className="bg-muted inline-flex h-7 min-w-[4.5rem] items-center gap-1.5 rounded-md border px-2 font-mono sm:min-w-[5.75rem]">
                  <Lock className="size-3 shrink-0" />
                  <span ref={typedRef} className="truncate tracking-tight" />
                </span>
                <ArrowRight data-show-from="1" className="text-muted-foreground size-3.5 shrink-0" />
                <span data-show-from="1" className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 font-medium">
                  <span className="border-brand/30 border-t-brand inline-block size-3.5 rounded-full border-2" style={{ transform: "rotate(var(--spin, 0deg))" }} />
                  Argon2id
                </span>
                <ArrowRight data-show-from="1" className="text-muted-foreground size-3.5 shrink-0" />
                <span data-show-from="2" className="bg-secure-soft text-secure inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-semibold">
                  <KeyRound className="size-3.5" />
                  <span className="hidden sm:inline">AES-256-GCM</span>
                  <span className="sm:hidden">AES-256</span>
                </span>
              </div>
            </div>

            <Connector varName="wire1" className="h-8 w-full lg:h-auto lg:w-auto lg:min-w-16 lg:flex-1">
              <span
                className="bg-secure text-secure-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] font-semibold whitespace-nowrap shadow-md transition-opacity duration-200"
                style={{ opacity: "var(--packet-on, 0)" }}
              >
                <Lock className="size-3" /> 9f2c…
              </span>
            </Connector>

            {/* Server */}
            <div data-panel className="story-panel bg-card relative w-full rounded-2xl border p-3 shadow-md sm:p-4 lg:w-[25%] lg:p-5">
              <PanelHeader icon={Database} title="Server" note="Postgres" />
              <div className="space-y-1.5 font-mono text-[10.5px] sm:text-xs">
                <div className="bg-background/60 flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <FileLock2 className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="text-muted-foreground shrink-0">prod.env</span>
                  <span ref={serverRef} className="text-secure truncate">
                    ····················
                  </span>
                </div>
                <div data-show-from="4" className="bg-background/60 flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <Mail className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="text-muted-foreground shrink-0">key → Priya</span>
                  <span className="text-secure truncate">sealed·x25519</span>
                </div>
              </div>
              <div data-show-from="3" className="text-muted-foreground mt-2.5 flex items-center gap-1.5 text-[11px] sm:text-xs">
                <EyeOff className="size-3.5" /> The server can't read any of this
              </div>
            </div>

            <Connector varName="wire2" className="h-8 w-full lg:h-auto lg:w-auto lg:min-w-16 lg:flex-1">
              <span
                className="bg-brand text-brand-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold whitespace-nowrap shadow-md transition-opacity duration-200"
                style={{ opacity: "var(--envelope-on, 0)" }}
              >
                <Mail className="size-3" /> sealed key
              </span>
            </Connector>

            {/* Teammate */}
            <div data-panel className="story-panel bg-card relative w-full rounded-2xl border p-3 shadow-md sm:p-4 lg:w-[31%] lg:p-5">
              <PanelHeader icon={Smartphone} title="Priya's browser" note="teammate" />
              <div className="relative">
                <CodeLines refs={theirRefs} className="min-h-[4.6rem] sm:min-h-[5.2rem]" />
                <div className="story-waiting text-muted-foreground absolute inset-0 flex items-center justify-center text-xs transition-opacity duration-300 [.story[data-step='4']_&]:opacity-0 [.story[data-step='5']_&]:opacity-0">
                  Waiting for access…
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                <span data-show-from="4" className="bg-brand-soft text-brand inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-semibold">
                  <KeyRound className="size-3.5" /> Opened with her private key
                </span>
                <span data-show-from="5" className="bg-success-soft text-success inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-semibold">
                  <Check className="size-3.5" /> Decrypted locally
                </span>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
  )
}
