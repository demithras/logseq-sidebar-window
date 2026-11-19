import '@logseq/libs'
import { decideRole, TOKEN_KEY, ROLE_KEY, WINID_KEY } from './core/role.js'
import * as P from './core/protocol.js'
import { forwardable } from './core/redirect.js'
import { openNewWindow, doActionOf } from './host/openwin.js'
import { createLink } from './host/link.js'
import { createDebug } from './host/debug.js'
import { createMainSide } from './host/mainSide.js'
import { createSideSide } from './host/sideSide.js'
import { installSideMain } from './host/sideMain.js'
import { createButton } from './host/button.js'
import { holdLock } from './host/lock.js'

const VERSION = '0.1.1'
const readJson = (s, k) => { try { return JSON.parse(s.getItem(k)) } catch { return null } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const host = top
  // a reload or a second load must not stack listeners, patches or timers: the old instance goes first
  try { if (host.__sidebarWindow && host.__sidebarWindow.destroy) host.__sidebarWindow.destroy() } catch (e) { console.warn('[sw] previous instance', e) }
  let ownId = host.sessionStorage.getItem(WINID_KEY)
  if (!ownId) { ownId = Math.random().toString(36).slice(2) + Date.now().toString(36); host.sessionStorage.setItem(WINID_KEY, ownId) }
  const guess = decideRole({ ownId, token: readJson(host.localStorage, TOKEN_KEY), sessionRole: host.sessionStorage.getItem(ROLE_KEY), now: Date.now() })
  const debug = createDebug()
  const parts = []
  const S = { role: guess, version: VERSION, debug, config: { orphanGraceMs: 15000, waitForAMs: 6000 }, log: [], ownId }
  host.__sidebarWindow = S
  const note = (m) => { S.log.push([Date.now(), m]); if (S.log.length > 300) S.log.shift() }
  let main2side = null, side = null, link = null, button = null, releaseLock = null, undoClicks = null
  note('boot guess ' + guess)

  const onMessage = (m) => {
    if (m.t !== 'ping' && m.t !== 'pong') note(S.role + ' recv ' + m.t)
    if (S.role === 'A') {
      if (m.t === 'ack') main2side && main2side.onAck(m)
      else if (m.t === 'nav' && forwardable(m.route)) logseq.App.pushState(m.route.name, m.route.params || {})
      else if (m.t === 'hello') link.probe()
    } else if (side) side.onMessage(m)
  }
  const grace = () => S.config.orphanGraceMs
  link = createLink({ role: guess, onMessage, debug, ownId, deadAfterMs: guess === 'B' ? grace : 2500 })
  S.link = link
  S.destroy = () => {
    try { main2side && main2side.destroy() } catch { /* ignore */ }
    try { side && side.destroy() } catch { /* ignore */ }
    try { button && button.destroy() } catch { /* ignore */ }
    parts.forEach((u) => { try { u() } catch { /* ignore */ } })
    try { link.destroy() } catch { /* ignore */ }
    try { releaseLock && releaseLock() } catch { /* ignore */ }
    if (S.role === 'B') { try { host.__swSidebarWindow = false } catch { /* ignore */ } }
    try { delete host.__sidebarWindow } catch { /* ignore */ }
  }
  logseq.beforeunload && logseq.beforeunload(async () => { S.destroy() })

  if (guess === 'B') {
    // Not a sidebar window until window A answers: a lone window after a restart (stale token or role) must stay a normal window.
    host.__swSidebarWindow = 'pending'
    link.post({ t: 'hello' })
    const t0 = Date.now()
    while (!link.alive() && Date.now() - t0 < S.config.waitForAMs) { await sleep(200); if (Date.now() - t0 > 1500 && Math.floor((Date.now() - t0) / 1000) % 2 === 0) link.post({ t: 'hello' }) }
    host.localStorage.removeItem(TOKEN_KEY)
    if (!link.alive()) {
      note('no window A answered: this is a normal window')
      host.__swSidebarWindow = false
      try { host.sessionStorage.removeItem(ROLE_KEY) } catch { /* ignore */ }
      S.role = 'A'; link.destroy(); link = createLink({ role: 'A', onMessage, debug, ownId, deadAfterMs: 2500 }); S.link = link
    }
  }

  if (S.role === 'B') {
    const enterSidebar = (install = true) => {
      host.sessionStorage.setItem(ROLE_KEY, 'B')
      host.__swSidebarWindow = true
      if (side.layoutOk()) side.applyLayout()
      if (install && !undoClicks) undoClicks = installSideMain({ host, send: (m) => link.post(m), debug })
    }
    const restoreNormal = (why) => {
      note('restore normal layout: ' + why)
      host.__swSidebarWindow = false
      try { host.sessionStorage.removeItem(ROLE_KEY) } catch { /* ignore */ }
      side.removeLayout()
      if (undoClicks) { undoClicks(); undoClicks = null }
    }
    S.restoreNormal = restoreNormal
    side = createSideSide({ host, link, L: logseq, debug, note, onOrphan: () => restoreNormal('A is gone'), onRecover: () => { enterSidebar(); side.showSidebar() } })
    if (!side.layoutOk()) logseq.UI.showMsg('Sidebar Window: Logseq layout not recognised, window left as it is', 'warning')
    enterSidebar(false)
    await side.showSidebar()
    enterSidebar() // the click / pushState guards go in after the sidebar is shown, as in 0.1.0
    parts.push(() => { if (undoClicks) { undoClicks(); undoClicks = null } })
  } else {
    releaseLock = holdLock(host)
    S.releaseLock = () => { try { releaseLock && releaseLock() } catch { /* ignore */ } } // e2e: simulate a window whose lock is gone
    main2side = createMainSide({ host, link, L: logseq, debug })
    link.post({ t: 'hello' })
    S.open = async () => {
      if (link.alive()) { link.post({ t: 'show' }); return { ok: true, already: true } }
      if (S.opening) return { ok: true, already: true }
      if (!doActionOf(host)) { logseq.UI.showMsg('Sidebar Window: Logseq has no window helper in this version', 'warning'); return { ok: false, reason: 'no helper' } }
      S.opening = true
      try {
        const g = await logseq.App.getCurrentGraph()
        const r = await openNewWindow({ host, graph: g && g.name, from: ownId })
        if (!r.ok) { logseq.UI.showMsg('Sidebar Window: ' + r.reason, 'warning'); return r }
        for (let i = 0; i < 60 && !link.alive(); i++) await sleep(250)
        if (!link.alive()) { logseq.UI.showMsg('Sidebar Window: the window did not appear', 'warning'); return { ok: false, reason: 'timeout' } }
        return { ok: true }
      } finally { S.opening = false }
    }
    logseq.App.registerCommandPalette({ key: 'sw-open', label: 'Sidebar Window: Open' }, () => { S.open() })
    button = createButton({ host, onClick: () => { S.open() } })
  }
}
logseq.ready(main).catch(console.error)
