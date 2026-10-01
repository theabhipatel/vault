import { TriangleAlert } from "lucide-react"

import { DEMO_MODE } from "../config"

export function DemoBanner() {
  if (!DEMO_MODE) return null
  return (
    <div className="bg-secure-soft text-foreground border-secure/25 relative z-[60] border-b">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs sm:text-sm">
        <TriangleAlert className="text-secure size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Public demo.</strong> Anyone can sign up and data may be wiped at any time. Don't store real
          secrets here.{" "}
          <a href="/#self-host" className="text-secure font-semibold underline underline-offset-2">
            Self-host for real use
          </a>
        </p>
      </div>
    </div>
  )
}
