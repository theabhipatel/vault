/** Per-page titles and meta tags, rendered into the pre-built HTML and kept in sync in the browser. */
import { ALL_DOCS, findDoc } from "./docs/catalog"
import { SITE_NAME, SITE_URL } from "./config"

export interface PageMeta {
  title: string
  description: string
  path: string
  type: "website" | "article"
}

const HOME_DESCRIPTION =
  "Secure Vault is an open-source, self-hosted team vault. Keep docs and .env secrets in one place, with secrets end-to-end encrypted in the browser so the server never sees them."

export function pageMeta(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === "/") {
    return { title: `${SITE_NAME} | End-to-end encrypted secrets and docs for teams`, description: HOME_DESCRIPTION, path, type: "website" }
  }
  if (path === "/docs") {
    return {
      title: `Documentation | ${SITE_NAME}`,
      description: "Learn how to self-host Secure Vault, manage workspaces and roles, and keep secrets end-to-end encrypted.",
      path,
      type: "website",
    }
  }
  if (path.startsWith("/docs/")) {
    const doc = findDoc(path.slice("/docs/".length))
    if (doc) return { title: `${doc.title} | ${SITE_NAME} docs`, description: doc.description, path, type: "article" }
  }
  if (path === "/privacy") {
    return {
      title: `Privacy and demo terms | ${SITE_NAME}`,
      description: "What the public Secure Vault demo stores, how long, and why real secrets belong on your own server.",
      path,
      type: "website",
    }
  }
  return { title: `Page not found | ${SITE_NAME}`, description: HOME_DESCRIPTION, path, type: "website" }
}

/** Every page that is pre-rendered to static HTML at build time. */
export const PRERENDER_PATHS = ["/", "/docs", ...ALL_DOCS.map((d) => `/docs/${d.slug}`), "/privacy"]

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** The <head> tags for a page (static HTML; no inline scripts, which the CSP forbids). */
export function renderHead(meta: PageMeta): string {
  const url = SITE_URL ? `${SITE_URL}${meta.path === "/" ? "/" : meta.path}` : ""
  const image = SITE_URL ? `${SITE_URL}/og-image.png` : ""
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<meta name="theme-color" content="#121719" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ]
  if (url) {
    tags.push(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`)
  }
  if (image) {
    tags.push(`<meta property="og:image" content="${image}" />`, `<meta name="twitter:image" content="${image}" />`)
  }
  return tags.join("\n    ")
}

/** Structured data for search engines (a JSON data block, not an executable script). */
export function structuredData(meta: PageMeta): string {
  const data =
    meta.path === "/"
      ? {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: SITE_NAME,
          applicationCategory: "SecurityApplication",
          operatingSystem: "Web, Linux, macOS, Windows (self-hosted)",
          description: meta.description,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          ...(SITE_URL ? { url: `${SITE_URL}/` } : {}),
        }
      : {
          "@context": "https://schema.org",
          "@type": meta.type === "article" ? "TechArticle" : "WebPage",
          headline: meta.title,
          description: meta.description,
          ...(SITE_URL ? { url: `${SITE_URL}${meta.path}` } : {}),
        }
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

export function sitemapXml(): string | null {
  if (!SITE_URL) return null
  const urls = PRERENDER_PATHS.map((p) => `  <url><loc>${SITE_URL}${p === "/" ? "/" : p}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
}

export function robotsTxt(): string {
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /app",
    "Disallow: /w/",
    "Disallow: /settings",
    "Disallow: /onboarding",
  ]
  if (SITE_URL) lines.push("", `Sitemap: ${SITE_URL}/sitemap.xml`)
  return lines.join("\n") + "\n"
}
