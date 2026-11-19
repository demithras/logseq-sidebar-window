// Window B -> window A: every native action in B's sidebar that would navigate the main area navigates A instead.
// (1) capture-phase pointer/mouse/click on bullets, page links, block refs, tags, breadcrumbs, card titles;
// (2) a net under it: history.pushState/replaceState in B (search results, plugins) forwarded to A.
import * as P from '../core/protocol.js'
import { shouldRedirectClick, forwardable } from '../core/redirect.js'
import { routeFromUrl, isUuid } from '../core/route.js'

const LINK_SEL = 'a.page-ref, a.tag, a.block-ref, .breadcrumb a, a[href*="#/page/"], .sidebar-item-header .initial-color a, .sidebar-item-header a[href]'

/** What did the click hit? { id } for a block uuid or a page name, or null. Pure enough to test with a fake element. */
export function hitOf(el) {
  if (!el || !el.closest) return null
  if (el.closest('.item-actions, textarea, input')) return null
  const bu = el.closest('.bullet-container')
  if (bu) { const b = bu.closest('.ls-block'); const id = b && b.getAttribute('blockid'); return id ? { id } : null }
  const a = el.closest(LINK_SEL)
  if (a) {
    const raw = a.getAttribute('data-uuid') || a.getAttribute('data-ref') || (a.getAttribute('href') || '').replace(/.*#\/page\//, '').replace(/\?.*/, '')
    let name = raw
    try { name = decodeURIComponent(raw || '') } catch { /* raw */ }
    // only a page link may fall back to its text; a breadcrumb or header segment without an id is left to Logseq, and the
    // history.pushState net below sends the route it pushes to A
    if (!name && a.matches && a.matches('a.page-ref, a.tag')) name = (a.textContent || '').replace(/[[\]#]/g, '').trim()
    return name ? { id: name } : null
  }
  return null
}

export function installSideMain({ host, send, debug, graceMs = 4000 }) {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation() }
  const inSidebar = (e) => !!(e.target && e.target.closest && e.target.closest('#right-sidebar'))
  const go = (id) => send(P.nav({ name: 'page', params: { name: id } }))
  const down = (e) => { if (debug.disabled('side2main') || !inSidebar(e)) return; if (shouldRedirectClick({ hit: hitOf(e.target), shift: e.shiftKey, button: e.button })) stop(e) }
  const click = (e) => { if (debug.disabled('side2main') || !inSidebar(e)) return; const hit = hitOf(e.target); if (!shouldRedirectClick({ hit, shift: e.shiftKey, button: e.button })) return; stop(e); go(hit.id) }
  const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup']
  for (const ev of events) host.addEventListener(ev, down, true)
  host.addEventListener('click', click, true)

  // the net: route changes that are not clicks on our selectors
  const h = host.history
  const patch = (name) => {
    const cur = h[name]
    const base = cur.__swOrig || cur // a patch left by an earlier instance is unwrapped, never stacked
    const hadOwn = Object.prototype.hasOwnProperty.call(h, name)
    const fn = function (state, title, url) {
      const route = routeFromUrl(url)
      if (!debug.disabled('side2main') && Date.now() > t0 + graceMs && route && forwardable(route)) {
        send(P.nav(route.name === 'page' ? { name: 'page', params: { name: route.params.name } } : route))
        return undefined // B stays on its own route
      }
      return base.apply(this, arguments)
    }
    fn.__swOrig = base
    h[name] = fn
    return () => { if (h[name] === fn) { if (cur.__swOrig || hadOwn) h[name] = base; else delete h[name] } }
  }
  const t0 = Date.now()
  const undo = [patch('pushState'), patch('replaceState')]
  return () => {
    for (const ev of events) host.removeEventListener(ev, down, true)
    host.removeEventListener('click', click, true)
    undo.forEach((u) => u())
  }
}
export { isUuid }
