// Is the other window alive? A heartbeat (ping every second) with a time-to-live, an explicit `bye`,
// and an outbox that notices a message nobody acknowledged. Pure: the clock is injected.
export function createLiveness({ now = Date.now, ttlMs = 2500 } = {}) {
  let last = 0
  return {
    ping() { last = now() },
    bye() { last = 0 },
    alive() { return last > 0 && now() - last < ttlMs },
    forget() { last = 0 }
  }
}

/** Messages that need an `ack`. send() returns the number to put in the message; sweep() lists the ones that timed out. */
export function createOutbox({ now = Date.now, timeoutMs = 500 } = {}) {
  let n = 0
  const pending = new Map()
  return {
    send(payload) { const k = ++n; pending.set(k, { payload, at: now() }); return k },
    ack(k) { const v = pending.get(k); pending.delete(k); return v ? v.payload : null },
    sweep() {
      const out = []
      for (const [k, v] of pending) if (now() - v.at >= timeoutMs) { out.push({ n: k, payload: v.payload }); pending.delete(k) }
      return out
    },
    size: () => pending.size
  }
}
