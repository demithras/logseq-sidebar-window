// Which window is this? B = the sidebar window this plugin opened; everything else is A (a plain main window).
// B is recognised by (1) a role kept in this window's sessionStorage (survives a reload of the window, never an app
// restart) or (2) a fresh token that A wrote just before it opened the window, written by ANOTHER window than this one
// (each window keeps its own random id in sessionStorage). So a restart can never turn the only window into a sidebar window:
// after it there is no fresh token and no session role.
export const TOKEN_KEY = 'sw-open-token'
export const ROLE_KEY = 'sw-role'
export const WINID_KEY = 'sw-win-id'
export const TOKEN_TTL_MS = 15000

/** @returns {'B'|'A'} */
export function decideRole({ token, sessionRole, ownId, now }) {
  if (sessionRole === 'B') return 'B'
  const ts = token && Number(token.ts)
  if (Number.isFinite(ts) && now - ts >= 0 && now - ts < TOKEN_TTL_MS && token.from && token.from !== ownId) return 'B'
  return 'A'
}
