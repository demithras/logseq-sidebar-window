// Window A: while B is alive, everything that opens in A's right sidebar opens in B instead.
// ONE interception point: Logseq's own sidebar state (`sidebar/blocks`, readable through the public get_state_from_store).
// Every native way (shift-click, context menu, search result, shortcuts, the SDK, a plugin card, `t r`) changes that state.
// A's sidebar is hidden by CSS while B lives, so nothing flashes; each new entry is sent to B and, once B acknowledges,
// the item is closed in A. No ack within 500 ms = B is dead: the sidebar is shown again and the card stays in A.
import * as P from '../core/protocol.js'
import { NO_STYLE } from './layout.js'
import { createOutbox } from '../core/liveness.js'
import { addedEntries, entryToTarget, openTarget } from '../core/redirect.js'

export const HIDE_KEY = 'sw-a-hide'
export const HIDE_CSS = '#right-sidebar { display: none !important; }'
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function createMainSide({ host, link, L, debug, pollMs = 150, now = Date.now }) {
  const api = () => host.logseq.api
  const outbox = createOutbox({ now, timeoutMs: 500 })
  let baseline = null, hidden = false, busy = false, dead = false, settle = null
  const read = () => { try { return JSON.parse(JSON.stringify(api().get_state_from_store('sidebar/blocks') || [])) } catch { return null } }
  const isOpen = () => { try { return api().get_state_from_store('ui/sidebar-open?') === true } catch { return false } }
  const setHidden = (on) => { if (hidden === on) return; hidden = on; L.provideStyle({ key: HIDE_KEY, style: on ? HIDE_CSS : NO_STYLE }) }
  const closeInA = (idx) => {
    const it = [...host.document.querySelectorAll('#right-sidebar .sidebar-item')][idx]
    if (!it) return false
    const bs = it.querySelectorAll('.item-actions button:not([data-testid="sidebar-item-more"])')
    const b = bs[bs.length - 1]
    if (!b) return false
    b.click(); return true
  }
  async function toMessage(entry) {
    const t = entryToTarget(entry)
    if (!t) return null
    if (t.kind === 'plugin') return { id: t.id, extra: { kind: 'plugin' } }
    if (t.kind === 'uuid') return { id: t.id }
    const b = await api().get_block(t.id)
    return b && b.uuid ? { id: b.uuid } : null
  }

  async function tick() {
    if (busy || dead) return
    busy = true
    try {
      const alive = link.alive() && openTarget({ bAlive: true, disabled: debug.disabled('main2side') }) === 'B'
      if (!alive) { setHidden(false); baseline = null; return }
      let cur = read()
      if (!cur) return
      if (baseline == null) { // B just appeared: A's sidebar goes away (hidden by CSS), its items stay in the state for later
        setHidden(true); await new Promise((r) => setTimeout(r, 150)) // the style must be in place before the sidebar opens
        // the state of a closed sidebar may not hold its saved items yet: open it once (invisible) so the baseline is complete
        if (!isOpen()) { await L.App.setRightSidebarVisible(true) }
        // wait until the restored list stops changing (two equal reads in a row)
        let prev = null, n = 0
        for (; n < 12; n++) { await new Promise((r) => setTimeout(r, 150)); const now_ = JSON.stringify(read()); if (now_ === prev) break; prev = now_ }
        baseline = read() || cur
        await L.App.setRightSidebarVisible(false)
        return
      }
      setHidden(true)
      if (outbox.size()) return // waiting for B's ack; the open sidebar of A is ours until then
      const added = addedEntries(baseline, cur)
      const opened = isOpen()
      baseline = cur
      if (!added.length && !opened) return
      let sent = 0
      for (const e of added) {
        const m = await toMessage(e).catch(() => null)
        if (!m) continue
        link.post(P.open(outbox.send({ entry: e, id: m.id }), m.id, m.extra || {})); sent++
      }
      if (!sent) { link.post({ t: 'show' }); if (opened) await L.App.setRightSidebarVisible(false) } // `t r`, the toggle button, or an entry B has no use for
      // with entries sent, A's (hidden) sidebar stays open until B acknowledged: its items can only be closed while they are rendered
    } catch (e) { console.warn('[sw] main2side', e) } finally { busy = false }
  }
  // B acknowledged: close the item in A (state index = DOM index)
  function onAck(m) {
    const was = outbox.ack(m.n)
    if (!was) return
    const idx = (read() || []).findIndex((e) => same(e, was.entry))
    if (idx >= 0) closeInA(idx)
    clearTimeout(settle)
    settle = setTimeout(async () => { baseline = read() || baseline; if (isOpen() && !outbox.size()) { await L.App.setRightSidebarVisible(false); baseline = read() || baseline } }, 200)
  }
  function sweep() {
    if (!outbox.sweep().length) return
    // nobody answered: B is gone. The card stays where it is and A's sidebar comes back with it.
    link.forget(); setHidden(false); baseline = null
    L.App.setRightSidebarVisible(true).catch(() => {})
    L.UI.showMsg('The sidebar window did not answer: the card opened here', 'warning')
  }
  const timer = setInterval(() => { tick(); sweep() }, pollMs)
  return { onAck, destroy() { dead = true; clearInterval(timer); clearTimeout(settle); setHidden(false) } }
}
