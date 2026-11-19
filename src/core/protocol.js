// Messages on the BroadcastChannel between window A (main) and window B (sidebar window). Pure.
export const CHANNEL = 'sw-link'
export const TYPES = ['ping', 'pong', 'bye', 'open', 'ack', 'nav', 'show', 'hello']

/** @returns {object|null} the message if it is well formed, else null */
export function parse(m) {
  if (!m || typeof m !== 'object' || !TYPES.includes(m.t)) return null
  if (m.t === 'open') return typeof m.id === 'string' && m.id && Number.isInteger(m.n) ? m : null
  if (m.t === 'ack') return Number.isInteger(m.n) ? m : null
  if (m.t === 'nav') return m.route && typeof m.route.name === 'string' && m.route.name ? m : null
  return m
}
export const open = (n, id, extra = {}) => ({ t: 'open', n, id: String(id), ...extra })
export const ack = (n) => ({ t: 'ack', n })
export const nav = (route) => ({ t: 'nav', route })
// ping = the timer heartbeat AND a probe (q: 1): the other window answers it at once with a pong from its message handler
export const ping = (role, now, id) => ({ t: 'ping', role, ts: now, q: 1, id })
export const pong = (role, id) => ({ t: 'pong', role, id })
export const bye = (role, id) => ({ t: 'bye', role, id })
/** Did this message come from the OTHER window? ping / pong / bye carry a role; the rest has a fixed direction (A -> B: open, show; B -> A: ack, nav, hello). */
export function fromOther(m, role) {
  if (m.t === 'ping' || m.t === 'pong' || m.t === 'bye') return m.role !== role
  if (m.t === 'open' || m.t === 'show') return role === 'B'
  return role === 'A'
}
