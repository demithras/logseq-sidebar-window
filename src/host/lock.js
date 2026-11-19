// Web Lock held by every main window (role A) for its whole life. The OS / browser releases it when the window or the
// plugin dies, with no timer involved. Window B reads it as a second, independent "A is really gone" signal.
export const LOCK_NAME = 'sw-a-alive'
export function holdLock(host, name = LOCK_NAME) {
  try {
    const locks = host.navigator && host.navigator.locks
    if (!locks) return () => {}
    const ac = new AbortController()
    let release = null
    locks.request(name, { signal: ac.signal }, () => new Promise((r) => { release = r })).catch(() => {})
    return () => { try { release && release() } catch { /* ignore */ } try { ac.abort() } catch { /* ignore */ } }
  } catch { return () => {} }
}
/** @returns {Promise<boolean|null>} true = some window holds it, false = nobody, null = locks unavailable here */
export async function lockHeld(host, name = LOCK_NAME) {
  try {
    const locks = host.navigator && host.navigator.locks
    if (!locks || !locks.query) return null
    const q = await locks.query()
    return (q.held || []).some((l) => l.name === name)
  } catch { return null }
}
