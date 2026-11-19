// Decisions about what is redirected. Pure.

/** A click in B's sidebar on something that navigates the main area natively. Shift-click stays native (another card in B). */
export function shouldRedirectClick({ hit, shift = false, button = 0 }) {
  if (!hit) return false
  if (shift) return false
  return button === 0
}

/** Entries of A's sidebar block list that are new compared with the previous snapshot (order kept, newest last). */
export function newSidebarEntries(prev, next) {
  const seen = new Set((prev || []).map(keyOf))
  return (next || []).filter((e) => !seen.has(keyOf(e)))
}
export const keyOf = (e) => JSON.stringify(e)

/** Where does a main -> sidebar open go? 'B' when B is alive and the redirect is not switched off, else 'A' (native). */
export function openTarget({ bAlive, disabled = false }) {
  return bAlive && !disabled ? 'B' : 'A'
}

/**
 * What did the user just open in A's right sidebar? `blocks` are the entries of Logseq's state `sidebar/blocks`
 * (`[repo, id, type]`, newest first). New keys count; so does a head entry that moved to the top (re-opening an open one).
 */
export function addedEntries(baseline, current) {
  const added = newSidebarEntries(baseline, current)
  const head = (current || [])[0]
  // Closing an item removes it from the list, and the next entry becomes the head. That is a removal, not a re-open: when the
  // current list is the baseline with some entries taken out (same order), nothing was opened. (e2e: the card of a search
  // result was closed in A after B acknowledged it, and the older entry below it was sent to B a second time.)
  if (!added.length && isSubsequence(current, baseline)) return added
  if (head && !added.some((e) => keyOf(e) === keyOf(head)) && keyOf(head) !== keyOf((baseline || [])[0])) added.unshift(head)
  return added
}

const isSubsequence = (sub, full) => { const f = (full || []).map(keyOf); let i = 0; for (const e of sub || []) { i = f.indexOf(keyOf(e), i); if (i < 0) return false; i++ } return true }

/** One sidebar entry -> what B must open. Entries that are not a block, a page or a plugin card (Contents, Help...) are left in A. */
export function entryToTarget(entry) {
  const [, id, type] = Array.isArray(entry) ? entry : []
  if (type === 'plugin' && typeof id === 'string' && id) return { kind: 'plugin', id }
  if ((type === 'block' || type === 'page') && Number.isInteger(id)) return { kind: 'dbid', id, type }
  if ((type === 'block' || type === 'page') && typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return { kind: 'uuid', id } // the keyboard shortcut stores the uuid itself
  return null
}

/** Route names a click or pushState in B may forward to A (never the home route B itself starts on). */
export const FORWARD_ROUTES = ['page', 'all-pages', 'whiteboards', 'whiteboard', 'graph', 'tag', 'all-journals', 'journals']
export const forwardable = (route) => !!route && FORWARD_ROUTES.includes(route.name)

/** ':thread-workspace/gtd' -> 'gtd'. Logseq's open_in_right_sidebar finds the plugin renderer by its local key and adds the plugin id itself. */
export const pluginLocalKey = (id) => { const m = String(id).match(/^:[^/]+\/(.+)$/); return m ? m[1] : String(id) }

/** ':thread-workspace/gtd' -> { pid: 'thread-workspace', key: 'gtd' }; null if it is not a plugin key. */
export const splitPluginId = (id) => { const m = String(id).match(/^:([^/]+)\/(.+)$/); return m ? { pid: m[1], key: m[2] } : null }
