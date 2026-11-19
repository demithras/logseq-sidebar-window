// One button in the top row of A's native right sidebar. The row is hidden while B lives (A's sidebar is closed then),
// so the button matters when B is not open: it opens B. Logseq has no API for this row: DOM injection, re-added on rebuild.
export const BTN_ID = 'sw-open-btn'
export function createButton({ host, onClick }) {
  const doc = () => host.document
  let observer = null, raf = 0, alive = true, retry = null
  const make = () => {
    const wrap = doc().createElement('div'); wrap.className = 'text-sm'; wrap.id = BTN_ID
    const b = doc().createElement('button'); b.className = 'button cp__right-sidebar-settings-btn'; b.textContent = 'Window'
    b.setAttribute('data-sw', 'open-button'); b.title = 'Open the sidebar in its own window (Sidebar Window)'
    b.addEventListener('click', () => { try { onClick() } catch (e) { console.warn('[sw] button', e) } })
    wrap.appendChild(b); return wrap
  }
  const ensure = () => {
    raf = 0
    if (!alive) return
    const bar = doc().querySelector('#right-sidebar .cp__right-sidebar-settings')
    if (!bar) return
    const have = bar.querySelector('#' + BTN_ID)
    if (!have) bar.insertBefore(make(), bar.firstChild)
  }
  const schedule = () => { if (!raf && alive) raf = host.requestAnimationFrame(ensure) }
  const observe = () => {
    const sb = doc().getElementById('right-sidebar')
    if (!sb) return false
    observer = new host.MutationObserver(schedule); observer.observe(sb, { childList: true, subtree: true }); schedule(); return true
  }
  doc().querySelectorAll('#' + BTN_ID).forEach((n) => n.remove())
  if (!observe()) { let n = 0; retry = setInterval(() => { if (observe() || ++n > 60) { clearInterval(retry); retry = null } }, 500) }
  return { destroy() { alive = false; if (observer) observer.disconnect(); if (retry) clearInterval(retry); if (raf) host.cancelAnimationFrame(raf); doc().querySelectorAll('#' + BTN_ID).forEach((n) => n.remove()) } }
}
