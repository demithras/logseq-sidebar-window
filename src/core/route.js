// Turn the hash route of Logseq (what a click in the sidebar window would have navigated to) into a push_state call for A.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s) => UUID.test(String(s || ''))

/** '#/page/Beta%20release' -> { name: 'page', params: { name: 'Beta release' } }; '#/' -> home; null if unknown. */
export function routeFromHash(hash) {
  const h = String(hash || '').replace(/^#/, '').split('?')[0]
  if (h === '' || h === '/') return { name: 'home', params: {} }
  const m = h.match(/^\/([^/]+)(?:\/(.*))?$/)
  if (!m) return null
  let rest = m[2]
  try { rest = rest == null ? rest : decodeURIComponent(rest) } catch { /* keep raw */ }
  if (m[1] === 'page') return rest ? { name: 'page', params: { name: rest } } : null
  return { name: m[1], params: {} }
}

/** The URL a pushState/replaceState call in B is about to show -> the route to forward, or null (not a route change). */
export function routeFromUrl(url) {
  const s = String(url == null ? '' : url)
  const i = s.indexOf('#')
  if (i < 0) return null
  return routeFromHash(s.slice(i))
}
