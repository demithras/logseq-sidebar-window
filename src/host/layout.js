// The sidebar-only layout of window B: left menu, header and main area hidden, the native right sidebar fills the window.
// Private ids (#left-container, #right-sidebar) - checked by a guard so a missing one never breaks A.
export const STYLE_KEY = 'sw-layout'
export const LAYOUT_CSS = `
#left-container { display: none !important; }
#right-sidebar { width: 100vw !important; max-width: 100vw !important; flex: 1 1 100% !important; }
`
export const privateIdsPresent = (doc) => !!(doc.getElementById('left-container') && doc.getElementById('right-sidebar'))

// Logseq ignores provideStyle with an empty string (the old rules stay), so "no style" is a comment
export const NO_STYLE = '/* sidebar-window: off */'
