// Window B: the sidebar-only layout and the receiver of "open this" from A.
import * as P from '../core/protocol.js'
import { splitPluginId } from '../core/redirect.js'
import { LAYOUT_CSS, STYLE_KEY, NO_STYLE, privateIdsPresent } from './layout.js'
import { lockHeld } from './lock.js'

export function createSideSide({ host, link, L, onOrphan, onRecover = () => {}, note = () => {}, debug = { disabled: () => false } }) {
  const api = () => host.logseq.api
  let dead = false, orphaned = false, checking = false, pairedA = ''
  const showSidebar = async () => { try { await api().set_right_sidebar_visible(true) } catch (e) { console.warn('[sw] show', e) } }
  const focusWin = () => { try { host.focus() } catch { /* the OS decides */ } }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-/
  async function onOpen(m) {
    link.post(P.ack(m.n)) // acknowledged first: A closes its copy, we then open ours
    await showSidebar()
    try {
      let id = m.id
      if (m.kind === 'plugin') {
        // a plugin card: Logseq builds its key from the CALLING plugin, so the call is made by the owner's own SDK (same origin iframe)
        const sp = splitPluginId(id)
        const f = sp && host.document.getElementById(sp.pid + '_iframe')
        const sdk = f && f.contentWindow && f.contentWindow.logseq && f.contentWindow.logseq.Editor
        if (sdk) { await sdk.openInRightSidebar(sp.key); return }
        note('plugin card ' + id + ' has no running owner in this window')
        return
      }
      if (m.kind !== 'plugin' && !uuidRe.test(id)) { const p = await api().get_page(id); id = p && p.uuid || id }
      await api().open_in_right_sidebar(id)
    } catch (e) { console.warn('[sw] open', e) }
  }
  function onMessage(m) {
    if (m.t === 'open') { if (!debug.disabled('ack')) onOpen(m) } // 'ack' off = a window that stopped answering (e2e)
    else if (m.t === 'show') { showSidebar(); focusWin() }
  }
  // the sidebar of B is always visible: Logseq's `t r` or a close of the last item must not leave an empty window.
  // A is gone only when BOTH signals say so: (1) the link's verdict (a probe unanswered for the whole grace time, judged by an
  // unthrottled tick of this window, or a `bye` followed by the same silence) and (2) the Web Lock A holds is free (or locks are unavailable).
  // After a verdict, the SAME window A answering again puts this window back into the sidebar layout (a wrong verdict heals itself).
  const keep = setInterval(async () => {
    if (dead) return
    if (!orphaned) {
      try { if (api().get_state_from_store('ui/sidebar-open?') !== true) api().set_right_sidebar_visible(true) } catch { /* ignore */ }
      if (link.alive() && link.peerId()) pairedA = link.peerId()
      if (link.gone() && !checking) {
        checking = true
        const held = await lockHeld(host)
        checking = false
        if (dead || orphaned || !link.gone()) return
        if (held === true) { note('A does not answer but its lock is held: still waiting'); return }
        orphaned = true; onOrphan()
      }
    } else if (link.alive() && (!pairedA || link.peerId() === pairedA)) {
      orphaned = false; note('A answers again: back to the sidebar layout'); onRecover()
    }
  }, 1000)
  return {
    onMessage, showSidebar,
    layoutOk: () => privateIdsPresent(host.document),
    applyLayout() { L.provideStyle({ key: STYLE_KEY, style: LAYOUT_CSS }) },
    removeLayout() { L.provideStyle({ key: STYLE_KEY, style: NO_STYLE }) },
    isOrphaned: () => orphaned,
    destroy() { dead = true; clearInterval(keep); L.provideStyle({ key: STYLE_KEY, style: NO_STYLE }) }
  }
}
