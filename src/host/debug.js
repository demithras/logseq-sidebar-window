// Switches for the e2e mutation checks: a named interception can be turned off at run time. Off by default.
export function createDebug() {
  const off = new Set()
  return { disabled: (k) => off.has(k), disable: (k) => off.add(k), enable: (k) => off.delete(k), list: () => [...off] }
}
