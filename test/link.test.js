import test from 'node:test'
import assert from 'node:assert/strict'
import { createDebug } from '../src/host/debug.js'

globalThis.top = { addEventListener() {}, removeEventListener() {} }
const { createLink } = await import('../src/host/link.js')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('link: a window whose timer is silent still answers a probe at once (message handler, no timer)', async () => {
  const dA = createDebug(); dA.disable('timer')
  const A = createLink({ role: 'A', onMessage() {}, debug: dA, ownId: 'idA' })
  const B = createLink({ role: 'B', onMessage() {}, debug: createDebug(), ownId: 'idB' })
  await wait(100)
  assert.equal(B.alive(), true, 'B heard A: A answered B\'s first ping with a pong although its own timer is off')
  assert.equal(B.peerId(), 'idA')
  A.destroy(); B.destroy()
})

test('link: a muted window (crash simulation) answers nothing; the answer switch silences only the answer', async () => {
  const dA = createDebug(); dA.disable('heartbeat')
  const A = createLink({ role: 'A', onMessage() {}, debug: dA, ownId: 'idA' })
  const B = createLink({ role: 'B', onMessage() {}, debug: createDebug(), ownId: 'idB' })
  await wait(100)
  assert.equal(B.alive(), false)
  A.destroy(); B.destroy()
})

test('link: legacy switch ("probe" off) ignores pongs, as in 0.1.0 only timer pings count', async () => {
  const dA = createDebug(); dA.disable('timer')
  const dB = createDebug(); dB.disable('probe')
  const A = createLink({ role: 'A', onMessage() {}, debug: dA, ownId: 'idA' })
  const B = createLink({ role: 'B', onMessage() {}, debug: dB, ownId: 'idB' })
  await wait(100)
  assert.equal(B.alive(), false)
  A.destroy(); B.destroy()
})
