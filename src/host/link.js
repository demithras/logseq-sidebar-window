// BroadcastChannel to the other window, with the heartbeat and the probe / response liveness (core/peer.js).
// Same origin for both windows, so no main-process IPC is needed.
import { CHANNEL, parse, ping, pong, bye, fromOther } from '../core/protocol.js'
import { createPeer } from '../core/peer.js'

export function createLink({ role, onMessage, now = Date.now, debug = { disabled: () => false }, ownId = '', deadAfterMs = 2500 }) {
  const ch = new BroadcastChannel(CHANNEL)
  const peer = createPeer({ now, deadAfterMs, legacy: () => debug.disabled('probe') })
  const timers = []
  let closed = false, peerId = ''
  const post = (m) => { if (closed) return; try { ch.postMessage(m) } catch (e) { console.warn('[sw] post', e) } }
  // switches (e2e): 'heartbeat' off = a crashed window (no pings, no pongs, no bye); 'timer' off = a throttled window
  // (its timer is silent, its message handler still answers); 'answer' off = it hears but never answers
  const muted = () => debug.disabled('heartbeat')
  ch.onmessage = (e) => {
    const m = parse(e.data)
    if (!m) return
    if (fromOther(m, role)) {
      if (m.t === 'bye') peer.bye()
      else if (!debug.disabled('probe') || m.t === 'ping') peer.hear() // 'probe' off = the 0.1.0 rule: only the other timer's pings count
      if ((m.t === 'ping' || m.t === 'pong') && m.id) peerId = m.id
      if (m.t === 'ping' && m.q && !muted() && !debug.disabled('answer')) post(pong(role, ownId)) // the answer comes from the handler, not from a timer
    }
    try { onMessage(m) } catch (err) { console.warn('[sw] message', err) }
  }
  const beat = () => { if (!muted()) post(ping(role, now(), ownId)) }
  timers.push(setInterval(() => { if (debug.disabled('timer')) return; peer.tick(); beat() }, 1000))
  beat()
  const onHide = () => { if (!muted()) post(bye(role, ownId)) } // a muted heartbeat simulates a crash: no bye either
  top.addEventListener('pagehide', onHide)
  top.addEventListener('beforeunload', onHide)
  return {
    post, probe: beat, alive: () => peer.alive(), gone: () => peer.gone(), forget: () => peer.forget(), peerId: () => peerId,
    destroy() {
      post(bye(role, ownId))
      timers.forEach(clearInterval)
      top.removeEventListener('pagehide', onHide)
      top.removeEventListener('beforeunload', onHide)
      closed = true
      ch.close()
    }
  }
}
