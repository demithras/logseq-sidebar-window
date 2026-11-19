import test from 'node:test'
import assert from 'node:assert/strict'
import * as P from '../src/core/protocol.js'
import { createLiveness, createOutbox } from '../src/core/liveness.js'
import { decideRole, TOKEN_TTL_MS } from '../src/core/role.js'
import { routeFromHash, routeFromUrl } from '../src/core/route.js'
import { splitPluginId, pluginLocalKey, shouldRedirectClick, newSidebarEntries, addedEntries, entryToTarget, openTarget, forwardable } from '../src/core/redirect.js'

test('protocol: well formed messages pass, malformed ones are dropped', () => {
  assert.ok(P.parse(P.open(1, 'abc')))
  assert.ok(P.parse(P.ack(3)))
  assert.ok(P.parse(P.nav({ name: 'page', params: { name: 'x' } })))
  assert.ok(P.parse(P.ping('A', 1)) && P.parse(P.bye('B')) && P.parse({ t: 'show' }) && P.parse({ t: 'hello' }))
  for (const bad of [null, undefined, 5, {}, { t: 'zzz' }, { t: 'open', id: 'x' }, { t: 'open', n: 1 }, { t: 'open', n: 1, id: '' }, { t: 'ack' }, { t: 'nav' }, { t: 'nav', route: {} }]) assert.equal(P.parse(bad), null)
})

test('liveness: ttl, bye, forget', () => {
  let t = 1000
  const l = createLiveness({ now: () => t, ttlMs: 2500 })
  assert.equal(l.alive(), false)
  l.ping(); assert.equal(l.alive(), true)
  t += 2400; assert.equal(l.alive(), true)
  t += 200; assert.equal(l.alive(), false, 'no ping for 2.6 s = dead')
  l.ping(); l.bye(); assert.equal(l.alive(), false)
  l.ping(); l.forget(); assert.equal(l.alive(), false)
})

test('outbox: an acknowledged message is not swept, an unacknowledged one is after the timeout', () => {
  let t = 0
  const o = createOutbox({ now: () => t, timeoutMs: 500 })
  const a = o.send({ id: 'a' }), b = o.send({ id: 'b' })
  assert.notEqual(a, b)
  t = 300; assert.deepEqual(o.sweep(), [])
  assert.deepEqual(o.ack(a), { id: 'a' })
  assert.equal(o.ack(a), null, 'second ack does nothing')
  t = 600
  assert.deepEqual(o.sweep().map((x) => x.payload.id), ['b'])
  assert.equal(o.size(), 0)
})

test('role: B only with a fresh token from ANOTHER window, or a session role', () => {
  const now = 100000
  const tok = (age, from = 'A1') => ({ ts: now - age, from })
  assert.equal(decideRole({ ownId: 'B1', token: tok(500), sessionRole: null, now }), 'B')
  assert.equal(decideRole({ ownId: 'A1', token: tok(500), sessionRole: null, now }), 'A', 'the window that wrote the token stays A')
  assert.equal(decideRole({ ownId: 'B1', token: tok(TOKEN_TTL_MS + 1), sessionRole: null, now }), 'A', 'stale token: a restart never makes a sidebar window')
  assert.equal(decideRole({ ownId: 'B1', token: null, sessionRole: null, now }), 'A')
  assert.equal(decideRole({ ownId: 'B1', token: { ts: 'x', from: 'A1' }, sessionRole: null, now }), 'A')
  assert.equal(decideRole({ ownId: 'B1', token: { ts: now + 5000, from: 'A1' }, sessionRole: null, now }), 'A', 'token from the future')
  assert.equal(decideRole({ ownId: 'B1', token: null, sessionRole: 'B', now }), 'B', 'reload of the sidebar window')
})

test('route: hash and url to push_state arguments', () => {
  assert.deepEqual(routeFromHash('#/page/Beta%20release?x=1'), { name: 'page', params: { name: 'Beta release' } })
  assert.deepEqual(routeFromHash('#/page/6afc12a3-e2c8-46f3-86fc-8d336edb5910'), { name: 'page', params: { name: '6afc12a3-e2c8-46f3-86fc-8d336edb5910' } })
  assert.deepEqual(routeFromHash('#/all-pages'), { name: 'all-pages', params: {} })
  assert.deepEqual(routeFromHash('#/'), { name: 'home', params: {} })
  assert.equal(routeFromHash('#/page/'), null)
  assert.deepEqual(routeFromUrl('/index.html#/page/A%2FB'), { name: 'page', params: { name: 'A/B' } })
  assert.equal(routeFromUrl('/index.html'), null)
  assert.equal(routeFromUrl(undefined), null)
})

test('redirect: which clicks leave B, which stay', () => {
  assert.equal(shouldRedirectClick({ hit: { id: 'x' } }), true)
  assert.equal(shouldRedirectClick({ hit: { id: 'x' }, shift: true }), false, 'shift-click stays native: another card in B')
  assert.equal(shouldRedirectClick({ hit: null }), false, 'text click = edit in place')
  assert.equal(shouldRedirectClick({ hit: { id: 'x' }, button: 2 }), false, 'right click = native context menu')
  assert.equal(forwardable({ name: 'page' }), true)
  assert.equal(forwardable({ name: 'home' }), false, 'B must never push its own home route to A')
  assert.equal(forwardable(null), false)
})

test('redirect: what is new in A\'s sidebar state', () => {
  const e = (id, type = 'block') => ['g', id, type]
  const base = [e(1), e(2, 'page'), ['g', 'contents', 'contents']]
  assert.deepEqual(newSidebarEntries(base, [e(3), ...base]), [e(3)])
  assert.deepEqual(addedEntries(base, [e(3), ...base]), [e(3)])
  assert.deepEqual(addedEntries(base, base), [])
  assert.deepEqual(addedEntries(base, [e(2, 'page'), e(1), ['g', 'contents', 'contents']]), [e(2, 'page')], 're-opening an open one moves it to the top: counts')
  assert.deepEqual(addedEntries(base, [e(1), e(2, 'page')]), [], 'a removal is not an open')
  assert.deepEqual(addedEntries(null, null), [])
  // closing the newest item in A (after B acknowledged it) exposes the older head: a removal, never a second delivery
  assert.deepEqual(addedEntries([e(3, 'page'), e(1)], [e(1)]), [], 'the head item removed: the next one is not "moved to the top"')
  assert.deepEqual(addedEntries([e(3), e(2), e(1)], [e(2), e(1)]), [], 'removal of the top of three')
  assert.deepEqual(addedEntries([e(3), e(2), e(1)], [e(1)]), [], 'removal of two at once')
  assert.deepEqual(addedEntries([e(3), e(2), e(1)], []), [], 'all removed')
  assert.deepEqual(addedEntries([e(3), e(2), e(1)], [e(1), e(2)]), [e(1)], 'a reorder is still a re-open of the head')
  assert.deepEqual(addedEntries([e(2), e(1)], [e(4), e(1)]), [e(4)], 'one removed and one new in the same tick: the new one is delivered')
  // each item reaches B exactly once and in the order the user opened them: replay open, open, ack-close, open, ack-close
  { let base = [], sent = []
    const step = (cur) => { sent.push(...addedEntries(base, cur).map((x) => x[1])); base = cur }
    step([e(1)]); step([e(2), e(1)]); step([e(1)]) /* 2 closed in A */; step([e(3), e(1)]); step([e(1)]); step([])
    assert.deepEqual(sent, [1, 2, 3], 'delivered once each, in opening order') }
  assert.deepEqual(entryToTarget(e(7)), { kind: 'dbid', id: 7, type: 'block' })
  assert.deepEqual(entryToTarget(e(8, 'page')), { kind: 'dbid', id: 8, type: 'page' })
  assert.deepEqual(entryToTarget(['g', ':thread-workspace/gtd', 'plugin']), { kind: 'plugin', id: ':thread-workspace/gtd' })
  assert.deepEqual(entryToTarget(['g', '6afc175c-8e90-4925-a2f7-83369fbf9ad0', 'block']), { kind: 'uuid', id: '6afc175c-8e90-4925-a2f7-83369fbf9ad0' }, 'shortcut entries hold the uuid')
  assert.equal(entryToTarget(['g', 'contents', 'contents']), null)
  assert.equal(entryToTarget(null), null)
  assert.equal(openTarget({ bAlive: true }), 'B')
  assert.equal(openTarget({ bAlive: false }), 'A', 'B closed: native')
  assert.equal(openTarget({ bAlive: true, disabled: true }), 'A', 'mutation switch')
})

test('plugin card key: the local part is what B opens', () => {
  assert.equal(pluginLocalKey(':thread-workspace/gtd'), 'gtd')
  assert.equal(pluginLocalKey('gtd'), 'gtd')
})

test('splitPluginId', () => {
  assert.deepEqual(splitPluginId(':thread-workspace/gtd'), { pid: 'thread-workspace', key: 'gtd' })
  assert.equal(splitPluginId('gtd'), null)
})
