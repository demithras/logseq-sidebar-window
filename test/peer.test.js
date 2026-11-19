import test from 'node:test'
import assert from 'node:assert/strict'
import { createPeer } from '../src/core/peer.js'
import * as P from '../src/core/protocol.js'

const clock = (t0 = 1000) => { const c = { t: t0, now: () => c.t, adv(ms) { c.t += ms } }; return c }
// run the own timer once a second for `sec` seconds; `onTick` may deliver messages (hear) before each tick
const run = (peer, c, sec, step = 1000, onTick = () => {}) => { for (let i = 0; i < sec; i++) { c.adv(step); onTick(i); peer.tick() } }

test('protocol: pong, probe flag, direction of messages', () => {
  assert.ok(P.parse(P.pong('A', 'x')))
  assert.equal(P.ping('A', 1, 'id').q, 1)
  assert.equal(P.fromOther(P.ping('B', 1, 'i'), 'A'), true)
  assert.equal(P.fromOther(P.ping('A', 1, 'i'), 'A'), false)
  assert.equal(P.fromOther(P.pong('A', 'i'), 'B'), true)
  assert.equal(P.fromOther({ t: 'open', n: 1, id: 'x' }, 'B'), true)
  assert.equal(P.fromOther({ t: 'ack', n: 1 }, 'A'), true)
  assert.equal(P.fromOther({ t: 'open', n: 1, id: 'x' }, 'A'), false)
})

test('peer: the other window answers every probe at once -> never gone, even when ITS timer fires once a minute', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 15000 })
  p.hear()
  // 10 minutes: our timer runs each second, the other timer is silent, but it answers each probe from its handler (a pong)
  run(p, c, 600, 1000, () => { p.hear() })
  assert.equal(p.alive(), true); assert.equal(p.gone(), false)
})

test('peer: nothing answers -> alive until the grace time, then gone', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 15000 })
  p.hear(); p.tick() // a probe is open
  run(p, c, 14); assert.equal(p.gone(), false); assert.equal(p.alive(), true)
  run(p, c, 3); assert.equal(p.gone(), true); assert.equal(p.alive(), false)
})

test('peer: A notices a crashed B within 2-3 s', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 2000 })
  p.hear(); p.tick()
  run(p, c, 1); assert.equal(p.alive(), true)
  run(p, c, 2); assert.equal(p.alive(), false)
})

test('peer: a long gap in OUR OWN timer gives no verdict; a fresh probe must go unanswered for the whole time', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 15000, maxGapMs: 3000 })
  p.hear(); p.tick()
  c.adv(60000); assert.deepEqual(p.tick(), { gap: true }) // we were throttled for a minute; no word from the other window yet
  assert.equal(p.gone(), false); assert.equal(p.alive(), true, 'no verdict from our own silence')
  c.adv(60000); assert.deepEqual(p.tick(), { gap: true }); assert.equal(p.gone(), false)
  run(p, c, 14); assert.equal(p.gone(), false, 'the fresh probe has been open for 14 s only')
  run(p, c, 2); assert.equal(p.gone(), true)
})

test('peer: a message that arrives after a gap answers the fresh probe', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 15000 })
  p.hear(); p.tick(); c.adv(120000); p.tick(); p.hear()
  run(p, c, 30, 1000, () => p.hear())
  assert.equal(p.gone(), false); assert.equal(p.alive(), true)
})

test('peer: bye is immediate for alive(); gone only after the grace time; recovery when the other window answers again', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 15000 })
  p.hear(); p.tick(); p.bye()
  assert.equal(p.alive(), false); assert.equal(p.gone(), false)
  run(p, c, 14); assert.equal(p.gone(), false)
  run(p, c, 3); assert.equal(p.gone(), true) // a false orphan
  p.hear(); assert.equal(p.gone(), false); assert.equal(p.alive(), true, 'recovery')
})

test('peer: forget() = not alive until it is heard again', () => {
  const c = clock(); const p = createPeer({ now: c.now })
  p.hear(); p.forget(); assert.equal(p.alive(), false); p.hear(); assert.equal(p.alive(), true)
})

test('peer legacy rule (mutation): a silent timer of the other window means gone, though it would answer probes', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 15000, legacy: () => true })
  p.hear()
  run(p, c, 20, 1000, () => {}) // only pongs would arrive; the legacy rule ignores them (link.js does not call hear for them)
  assert.equal(p.gone(), true)
})

test('peer: a late tick of ours (busy window, 1.5-3 s) gives no verdict; the queued answer is heard first', () => {
  const c = clock(); const p = createPeer({ now: c.now, deadAfterMs: 2500 })
  p.hear(); p.tick(); run(p, c, 1)
  c.adv(2400); p.tick() // late tick: the open probe is 3.4 s old, but no verdict
  assert.equal(p.alive(), true)
  p.hear() // the answer was in the queue
  run(p, c, 5, 1000, () => p.hear())
  assert.equal(p.alive(), true)
})
