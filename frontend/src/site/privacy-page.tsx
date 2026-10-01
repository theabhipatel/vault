import { useRef } from "react"
import { Link } from "react-router"

import { SiteFooter } from "./components/site-footer"
import { SiteHeader } from "./components/site-header"
import { GITHUB_URL } from "./config"
import { DemoBanner } from "./components/demo-banner"
import { useReveal } from "./landing/use-reveal"

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "The public demo is for trying things out",
    body: (
      <>
        <p>
          The public demo runs the same code as a self-hosted Secure Vault. Anyone can create an account, so treat everything you put in it as
          temporary. Accounts and data may be deleted at any time without notice, for example when the demo is reset.
        </p>
        <p>
          <strong>Never store real credentials, customer data or anything confidential in the demo.</strong> For real use,{" "}
          <Link to="/docs/self-hosting">run Secure Vault on your own server</Link>.
        </p>
      </>
    ),
  },
  {
    title: "What is stored",
    body: (
      <ul>
        <li>Your name, email address and an Argon2id hash of your login password (or your Google account id if you sign in with Google).</li>
        <li>Workspaces, projects, memberships, roles, invitations and notifications.</li>
        <li>Normal documents in readable form, because the server needs to show them to everyone with access.</li>
        <li>
          Secure documents only as ciphertext, together with your public key, your private key encrypted by your vault password, and project keys
          sealed to each member. The server can't decrypt any of it.
        </li>
        <li>An audit log with the IP address and browser of each recorded action, and active sessions.</li>
      </ul>
    ),
  },
  {
    title: "What is never stored",
    body: (
      <ul>
        <li>Your vault password, your recovery key, your private key or any project key in readable form.</li>
        <li>The contents of secure documents.</li>
        <li>Analytics, advertising or tracking data. The site loads no third-party scripts, fonts or trackers.</li>
      </ul>
    ),
  },
  {
    title: "Cookies",
    body: (
      <p>
        Secure Vault uses a session cookie to keep you signed in and a cookie that protects forms against cross-site request forgery. Both are
        first-party and strictly necessary. Your theme and auto-lock preferences are kept in your browser's local storage.
      </p>
    ),
  },
  {
    title: "Email",
    body: (
      <p>
        The app sends email only for your account and your team: verification, password resets, invitations and security alerts. There is no
        newsletter.
      </p>
    ),
  },
  {
    title: "Self-hosted instances",
    body: (
      <p>
        When you self-host Secure Vault, you are the operator: your server holds your data, and your own policies apply. Nothing is sent to the
        authors of Secure Vault.
      </p>
    ),
  },
  {
    title: "Questions",
    body: (
      <p>
        Open an issue on{" "}
        <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener">
          GitHub
        </a>
        . Please don't post personal data there.
      </p>
    ),
  },
]

export function PrivacyPage() {
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref)
  return (
    <div ref={ref} className="flex min-h-dvh flex-col">
      <DemoBanner />
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-14 pb-24 sm:px-6 sm:pt-20">
        <p data-reveal className="text-brand font-mono text-xs font-semibold tracking-[0.18em] uppercase">
          Privacy
        </p>
        <h1 data-reveal className="mt-3 text-4xl font-semibold sm:text-5xl">
          Privacy and demo terms
        </h1>
        <p data-reveal className="text-muted-foreground font-reading mt-5 text-lg leading-relaxed">
          Short and plain: what Secure Vault keeps, what it can never see, and why real secrets belong on your own server.
        </p>
        <div className="docs-prose mt-12">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
