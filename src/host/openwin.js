// Open the second native Logseq window through Logseq's private IPC helper (`top.apis.doAction`, transit JSON).
// Every private call is guarded: a missing or throwing helper gives a plain message and leaves window A untouched.
import { TOKEN_KEY } from '../core/role.js'

export const doActionOf = (t) => (t && t.apis && typeof t.apis.doAction === 'function' ? t.apis.doAction.bind(t.apis) : null)
export const openAction = (graph) => JSON.stringify(['~:openNewWindow', String(graph)])

/** @returns {Promise<{ok:boolean, reason?:string}>} */
export async function openNewWindow({ host, graph, from, now = Date.now }) {
  const act = doActionOf(host)
  if (!act) return { ok: false, reason: 'Logseq has no window helper (apis.doAction) in this version' }
  if (!graph) return { ok: false, reason: 'no graph is open' }
  try { host.localStorage.setItem(TOKEN_KEY, JSON.stringify({ ts: now(), from })) } catch (e) { return { ok: false, reason: 'cannot write the window token: ' + e.message } }
  try { await act(openAction(graph)) } catch (e) { try { host.localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } return { ok: false, reason: 'opening the window failed: ' + (e && e.message || e) } }
  return { ok: true }
}
