/** Public site settings. All are build-time values, so the pre-rendered HTML and the browser agree. */

export const SITE_NAME = "Secure Vault"
export const GITHUB_URL = "https://github.com/theabhipatel/vault"
export const GITHUB_DOCS_EDIT_URL = `${GITHUB_URL}/edit/master/frontend/src/site/docs/content`

/** The author, credited in the meta tags and structured data of every public page. */
export const AUTHOR = {
  name: "TheAbhiPatel",
  alternateNames: ["Abhi Patel", "Abhishek Patel", "theabhipatel"],
  url: "https://www.theabhipatel.com/",
  github: "https://github.com/theabhipatel",
} as const

/** Absolute public origin (e.g. https://securevault.example.com). Used for canonical and Open Graph URLs. */
export const SITE_URL = String(import.meta.env.VITE_SITE_URL ?? "").replace(/\/+$/, "")

/** The public demo deployment shows "try it, then self-host" notices. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true"

/** Where the app lives (a full page load: the app is a separate bundle). */
export const APP_URL = "/app"
export const SIGNUP_URL = "/signup"
export const LOGIN_URL = "/login"
