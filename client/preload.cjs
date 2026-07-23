// Preload script — intentionally minimal.
// Since nodeIntegration is enabled and contextIsolation is disabled,
// the renderer has direct access to Node.js globals and doesn't need
// a contextBridge. This file exists as a placeholder for future use
// if the security model is tightened later.

console.log('[AI Council] Preload script loaded.');
