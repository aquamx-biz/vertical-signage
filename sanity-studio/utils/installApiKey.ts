/**
 * installApiKey — attaches the shared key to every Studio → handoff-API call.
 *
 * The backend (aquamx-handoff) now guards its internal routes in middleware.ts:
 * a caller must present `x-aquamx-key` OR arrive from an allow-listed Studio
 * origin. Origin alone already works from this Studio, so nothing breaks if the
 * key is unset — the key is the branch that also stops a plain `curl`.
 *
 * Why a fetch wrapper instead of editing every call site: ~27 files across
 * actions/, components/, tools/ and views/ each build their own fetch. Threading
 * a header through all of them guarantees the next one added forgets it. This
 * hook is scoped strictly to URLs on the handoff API base — every other request
 * (Sanity's own client, asset uploads, images) passes through untouched.
 *
 * HONEST LIMIT: this bundle is served publicly by Sanity, so the key ships to
 * anyone who downloads the JS. It raises the cost of abuse; it is not a secret.
 * Rotate it by changing SANITY_STUDIO_API_KEY here and STUDIO_API_KEY on Netlify.
 */

const API_BASE =
  process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

// The Studio also talks to the production alias for the same backend.
const API_HOSTS = [API_BASE, 'https://app.aquamx.biz']

const API_KEY = process.env.SANITY_STUDIO_API_KEY ?? ''

let installed = false

export function installApiKey(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function' || !API_KEY) return
  installed = true

  const original = window.fetch.bind(window)

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL     ? input.href
      : (input as Request).url

    if (!API_HOSTS.some(host => url.startsWith(host))) {
      return original(input as any, init)
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('x-aquamx-key', API_KEY)

    return original(input as any, { ...init, headers })
  }) as typeof window.fetch
}
