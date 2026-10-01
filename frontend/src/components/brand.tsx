import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[calc(var(--radius)*0.75)] bg-brand text-brand-foreground shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        <path
          d="M12 2.8 5.3 5.4v5.5c0 4.2 2.9 7.8 6.7 9 3.8-1.2 6.7-4.8 6.7-9V5.4L12 2.8Z"
          fill="currentColor"
          fillOpacity=".16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10.6" r="2" fill="currentColor" />
        <path d="M12 12.4v3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
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
