import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

const SAFE_PROTOCOL = /^(https?:|mailto:|#|\/)/i

/**
 * Renders untrusted markdown safely: raw HTML is never rendered (react-markdown default),
 * links are restricted to safe protocols and open without leaking the referrer.
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("prose-vault", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (SAFE_PROTOCOL.test(url.trim()) ? url : "")}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          // External images would leak views to third parties and break the CSP; show links instead.
          img: ({ src, alt }) => (
            <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noopener noreferrer nofollow">
              {alt || "image"}
            </a>
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  )
}
