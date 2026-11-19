import test from 'node:test'
import assert from 'node:assert/strict'
import { openNewWindow, openAction, doActionOf } from '../src/host/openwin.js'
import { hitOf, installSideMain } from '../src/host/sideMain.js'
import { createDebug } from '../src/host/debug.js'

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m } }

test('P1 open: a missing or throwing private helper gives a reason and leaves a clean state', async () => {
  const noApis = { localStorage: store() }
  assert.equal(doActionOf(noApis), null)
  assert.match((await openNewWindow({ host: noApis, graph: 'g' })).reason, /no window helper/)
  const thrower = { localStorage: store(), apis: { doAction: async () => { throw new Error('boom') } } }
  const r = await openNewWindow({ host: thrower, graph: 'g', from: 'A1' })
  assert.equal(r.ok, false); assert.match(r.reason, /boom/)
  assert.equal(thrower.localStorage.getItem('sw-open-token'), null, 'no token left behind after a failure')
  const calls = []
  const ok = { localStorage: store(), apis: { doAction: async (s) => { calls.push(s) } } }
  assert.equal((await openNewWindow({ host: ok, graph: 'logseq_db_Demo', from: 'A1', now: () => 42 })).ok, true)
  assert.deepEqual(calls, ['["~:openNewWindow","logseq_db_Demo"]'])
  assert.deepEqual(JSON.parse(ok.localStorage.getItem('sw-open-token')), { ts: 42, from: 'A1' })
  assert.equal(openAction('x'), '["~:openNewWindow","x"]')
  assert.match((await openNewWindow({ host: ok, graph: '' })).reason, /no graph/)
})

const el = (attrs = {}, closestMap = {}) => ({ closest: (sel) => closestMap[sel] || null, getAttribute: (k) => (k in attrs ? attrs[k] : null), textContent: attrs.text || '' })

test('hitOf: bullets and links are hits; action buttons and text editing are not', () => {
  const block = el({ blockid: 'u-1' })
  const bullet = el({}, { '.bullet-container': { closest: () => block } })
  assert.deepEqual(hitOf(bullet), { id: 'u-1' })
  const link = el({ 'data-ref': 'Beta release' })
  const crumb = { ...el({}), matches: () => false, textContent: 'Alpha launch' }
  assert.equal(hitOf({ closest: (sel) => (sel.includes('a.page-ref') ? crumb : null) }), null, 'a breadcrumb without an id is left to the pushState net')
  assert.deepEqual(hitOf({ closest: (s) => (s.includes('a.page-ref') ? link : null) }), { id: 'Beta release' })
  const hrefLink = el({ href: '#/page/A%20B?x' })
  assert.deepEqual(hitOf({ closest: (s) => (s.includes('a.page-ref') ? hrefLink : null) }), { id: 'A B' })
  assert.equal(hitOf({ closest: (s) => (s.includes('item-actions') ? {} : null) }), null)
  assert.equal(hitOf({ closest: () => null }), null)
  assert.equal(hitOf(null), null)
})

function fakeHost(base) {
  const listeners = []
  const history = Object.create({ pushState: base, replaceState: base })
  return { history, addEventListener: (e, f, c) => listeners.push([e, f, c]), removeEventListener: (e, f) => { const i = listeners.findIndex((x) => x[0] === e && x[1] === f); if (i >= 0) listeners.splice(i, 1) }, listeners }
}

test('P6 install/uninstall: listeners and history patches are removed exactly, a double load does not stack', () => {
  const base = function pushState() { return 'orig' }
  const host = fakeHost(base)
  const sent = []
  const debug = createDebug()
  const undo1 = installSideMain({ host, send: (m) => sent.push(m), debug, graceMs: -1 })
  assert.equal(host.listeners.length, 5)
  const patched1 = host.history.pushState
  assert.notEqual(patched1, base)
  // a second load without unloading the first: the patch is built on the ORIGINAL, never on the first patch
  const undo2 = installSideMain({ host, send: (m) => sent.push(m), debug, graceMs: -1 })
  assert.equal(host.history.pushState.__swOrig, base)
  assert.equal(host.history.pushState('s', '', '#/page/X'), undefined)
  assert.ok(sent.length >= 1, 'forwarded to A')
  assert.equal(host.history.pushState('s', '', '#/'), 'orig', 'home route is not forwarded, goes through')
  undo2(); undo1()
  assert.equal(host.listeners.length, 0)
  assert.equal(host.history.pushState, base)
  assert.equal(Object.prototype.hasOwnProperty.call(host.history, 'pushState'), true) // restored to the original function
})

test('mutation switch: with side2main disabled a route change passes through', () => {
  const base = function () { return 'orig' }
  const host = fakeHost(base)
  const debug = createDebug(); debug.disable('side2main')
  const sent = []
  const undo = installSideMain({ host, send: (m) => sent.push(m), debug, graceMs: -1 })
  assert.equal(host.history.pushState('s', '', '#/page/X'), 'orig')
  assert.equal(sent.length, 0)
  undo()
})

