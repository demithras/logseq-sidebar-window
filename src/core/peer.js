// Is the OTHER window alive? Request / response, not "their timer ticked": a message handler runs in a hidden or
// covered window without throttling, a timer does not (once a second, after 5 minutes about once a minute).
//   hear()  : any message from the other window arrived (a pong, a ping, an ack...). It answers every probe sent before it.
//   tick()  : called from OUR timer. Sends nothing itself; it opens a probe (probeAt) and judges only a probe that has
//             been open for deadAfterMs while OUR timer was running normally. A long gap between our own ticks means
//             WE were throttled or asleep: no verdict, a fresh probe starts instead (L2).
// `legacy` (mutation check only): the verdict comes from the age of the other window's timer pings, as in 0.1.0.
export function createPeer({ now = Date.now, deadAfterMs = 2000, maxGapMs = 3000, lateMs = 1500, legacy = () => false } = {}) {
  const dead = typeof deadAfterMs === 'function' ? deadAfterMs : () => deadAfterMs
  let up = false, gone = false, heard = 0, probeAt = 0, lastTick = now()
  return {
    hear() { up = true; gone = false; heard = now(); probeAt = 0 },
    bye() { up = false; probeAt = 0; heard = 0 },
    forget() { up = false; probeAt = 0 },
    /** @returns {{gap:boolean}} gap = our own timer was late; nothing was concluded */
    tick() {
      const n = now()
      const gap = n - lastTick > maxGapMs
      const prev = lastTick
      lastTick = n
      if (legacy()) { if (heard && n - heard >= dead()) { up = false; gone = true } else if (!heard && up) up = false; return { gap: false } }
      if (gap) { probeAt = n; return { gap: true } }
      if (n - prev > lateMs) { if (!probeAt) probeAt = n; return { gap: false } } // our timer is late (a busy window): answers may still sit in the queue behind this tick, no verdict yet
      if (!probeAt) probeAt = n
      else if (n - probeAt >= dead()) { up = false; gone = true }
      return { gap: false }
    },
    alive: () => up,
    /** the other window answered nothing for the whole time allowed, judged by an unthrottled tick of ours */
    gone: () => gone,
    silentMs: () => (heard ? now() - heard : Infinity)
  }
}
