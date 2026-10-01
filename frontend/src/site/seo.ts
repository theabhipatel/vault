/** Per-page titles and meta tags, rendered into the pre-built HTML and kept in sync in the browser. */
import { ALL_DOCS, findDoc } from "./docs/catalog"
import { AUTHOR, GITHUB_URL, SITE_NAME, SITE_URL } from "./config"

export interface PageMeta {
  title: string
  description: string
  path: string
  type: "website" | "article"
  /** Page-specific search keywords, added to the site-wide ones. */
  keywords?: string[]
  /** Docs pages: the docs section, for breadcrumbs and article:section. */
  section?: string
}

const HOME_DESCRIPTION =
  "Secure Vault is an open-source, self-hosted team vault by TheAbhiPatel. Keep docs and .env secrets in one place, with secrets end-to-end encrypted in the browser so the server never sees them."

/** Keywords on every public page, including the author's name. */
const SITE_KEYWORDS = [
  SITE_NAME,
  "TheAbhiPatel",
  "theabhipatel",
  "Abhi Patel",
  "end-to-end encryption",
  "E2EE",
  "secrets management",
  ".env manager",
  "environment variables",
  "team vault",
  "self-hosted",
  "open source",
  "zero-knowledge",
]

const OG_IMAGE_ALT = `${SITE_NAME}: end-to-end encrypted secrets and docs for teams, by TheAbhiPatel`

export function pageMeta(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === "/") {
    return {
      title: `${SITE_NAME} | End-to-end encrypted secrets and docs for teams`,
      description: HOME_DESCRIPTION,
      path,
      type: "website",
      keywords: ["secure .env sharing", "encrypted team documents", "self-hosted secrets manager"],
    }
  }
  if (path === "/docs") {
    return {
      title: `Documentation | ${SITE_NAME}`,
      description:
        "Secure Vault documentation by TheAbhiPatel: self-host it, manage workspaces and roles, and keep secrets end-to-end encrypted.",
      path,
      type: "website",
      keywords: ["Secure Vault docs", "documentation", "self-hosting guide"],
    }
  }
  if (path.startsWith("/docs/")) {
    const doc = findDoc(path.slice("/docs/".length))
    if (doc) {
      return {
        title: `${doc.title} | ${SITE_NAME} docs`,
        description: doc.description,
        path,
        type: "article",
        keywords: [doc.title, doc.section, "Secure Vault docs"],
        section: doc.section,
      }
    }
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
  const robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="keywords" content="${escapeHtml(pageKeywords(meta))}" />`,
    // Authorship: TheAbhiPatel built Secure Vault.
    `<meta name="author" content="${AUTHOR.name}" />`,
    `<meta name="creator" content="${AUTHOR.name}" />`,
    `<meta name="publisher" content="${AUTHOR.name}" />`,
    `<link rel="author" href="${AUTHOR.url}" />`,
    `<meta name="application-name" content="${SITE_NAME}" />`,
    `<meta name="apple-mobile-web-app-title" content="${SITE_NAME}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta name="googlebot" content="${robots}" />`,
    `<meta name="theme-color" content="#121719" />`,
    // Open Graph (Facebook, LinkedIn, Slack, WhatsApp, Discord, ...)
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    // X / Twitter
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ]
  if (meta.type === "article") {
    tags.push(`<meta property="article:author" content="${AUTHOR.url}" />`)
    if (meta.section) tags.push(`<meta property="article:section" content="${escapeHtml(meta.section)}" />`)
  }
  if (url) {
    tags.push(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`)
  }
  if (image) {
    tags.push(
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:type" content="image/png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />`,
      `<meta name="twitter:image" content="${image}" />`,
      `<meta name="twitter:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />`,
    )
  }
  return tags.join("\n    ")
}

export function pageKeywords(meta: PageMeta): string {
  return [...new Set([...(meta.keywords ?? []), ...SITE_KEYWORDS])].join(", ")
}

const absolute = (path: string) => `${SITE_URL}${path}`

/** TheAbhiPatel, referenced as author, creator and publisher by every page's structured data. */
const PERSON = {
  "@type": "Person",
  "@id": absolute("/#author"),
  name: AUTHOR.name,
  alternateName: [...AUTHOR.alternateNames],
  url: AUTHOR.url,
  sameAs: [AUTHOR.github, AUTHOR.url],
}
const PERSON_REF = { "@id": PERSON["@id"] }

const WEBSITE = {
  "@type": "WebSite",
  "@id": absolute("/#website"),
  name: SITE_NAME,
  url: absolute("/"),
  description: HOME_DESCRIPTION,
  inLanguage: "en",
  creator: PERSON_REF,
  publisher: PERSON_REF,
}

/** Structured data for search engines (a JSON data block, not an executable script). */
export function structuredData(meta: PageMeta): string {
  const graph: object[] = [PERSON, WEBSITE]
  if (meta.path === "/") {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": absolute("/#software"),
      name: SITE_NAME,
      applicationCategory: "SecurityApplication",
      operatingSystem: "Web, Linux, macOS, Windows (self-hosted)",
      description: meta.description,
      url: absolute("/"),
      ...(SITE_URL ? { image: absolute("/og-image.png") } : {}),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: PERSON_REF,
      creator: PERSON_REF,
      publisher: PERSON_REF,
      sameAs: [GITHUB_URL],
      keywords: pageKeywords(meta),
    })
  } else {
    graph.push({
      "@type": meta.type === "article" ? "TechArticle" : "WebPage",
      headline: meta.title,
      name: meta.title,
      description: meta.description,
      url: absolute(meta.path),
      inLanguage: "en",
      isPartOf: { "@id": WEBSITE["@id"] },
      author: PERSON_REF,
      publisher: PERSON_REF,
      keywords: pageKeywords(meta),
      ...(meta.section ? { articleSection: meta.section } : {}),
    })
    if (meta.path.startsWith("/docs")) {
      const crumbs = [
        { name: SITE_NAME, path: "/" },
        { name: "Docs", path: "/docs" },
        ...(meta.path === "/docs" ? [] : [{ name: meta.title.split(" | ")[0], path: meta.path }]),
      ]
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(c.path) })),
      })
    }
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")
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
