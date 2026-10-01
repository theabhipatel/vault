import { useRef } from "react"

import { DemoBanner } from "../components/demo-banner"
import { SiteFooter } from "../components/site-footer"
import { SiteHeader } from "../components/site-header"
import { EncryptionStory } from "./encryption-story"
import { Hero } from "./hero"
import { DocumentKinds, Faq, Features, FinalCta, Marquee, Security, SelfHost, ServerView } from "./sections"
import { useReveal } from "./use-reveal"

export function LandingPage() {
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref)
  return (
    <div ref={ref} className="overflow-x-clip">
      <DemoBanner />
      <SiteHeader />
      <main>
        <Hero />
        <Marquee />
        <EncryptionStory />
        <ServerView />
        <Features />
        <DocumentKinds />
        <Security />
        <SelfHost />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
