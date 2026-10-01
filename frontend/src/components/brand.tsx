import { useId } from "react"

import { cn } from "@/lib/utils"

/** The Secure Vault mark: a sealed shield with an amber keyhole on a dark tile (same as /logo.svg). */
export function LogoMark({ className }: { className?: string }) {
  // Unique gradient ids per instance; useId is stable between the server render and hydration.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#173033" />
          <stop offset="1" stopColor="#0b1517" />
        </linearGradient>
        <linearGradient id={`${id}-sh`} x1="16" y1="10" x2="48" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5ee3cf" />
          <stop offset="1" stopColor="#1e9f8f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-bg)`} />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="#5ee3cf" strokeOpacity="0.24" strokeWidth="1.5" />
      <path d="M32 9.5 48.5 15.6v12.6c0 11.2-7 19.7-16.5 23.8-9.5-4.1-16.5-12.6-16.5-23.8V15.6z" fill={`url(#${id}-sh)`} />
      <path d="M32 9.5V52c9.5-4.1 16.5-12.6 16.5-23.8V15.6z" fill="#0b1517" fillOpacity=".22" />
      <circle cx="32" cy="27.6" r="5" fill="#0d1d1f" />
      <path d="M29.2 30h5.6l1.5 10h-8.6z" fill="#0d1d1f" />
      <circle cx="32" cy="27.6" r="1.9" fill="#ffc35c" />
    </svg>
  )
}

export function Logo({ className, name = "Secure Vault" }: { className?: string; name?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-heading text-lg font-semibold tracking-tight">{name}</span>
    </span>
  )
}
