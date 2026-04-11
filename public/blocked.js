// Block page script-level guard that mirrors burn-mode close protection.
let isBurnModeGuardActive = false

/**
 * Requests browser confirmation when user tries to leave while burn mode is active.
 */
function handleBeforeUnload(event) {
    if (!isBurnModeGuardActive) return
    event.preventDefault()
    event.returnValue = ''
}

window.addEventListener('beforeunload', handleBeforeUnload, true)

/**
 * Reads session state and renders the status message shown on blocked page.
 */
async function syncAndRenderBlockedState() {
    const meta = document.getElementById('meta')

    if (!meta) return

    const result = await chrome.storage.local.get(['session'])
    const session = result.session
    const isExpired = Boolean(session?.active && session?.endTime && Date.now() >= session.endTime)

    // Guard should stay active only for active, unexpired burn-mode sessions.
    isBurnModeGuardActive = Boolean(session?.active && session?.burnMode && !isExpired)

    if (isExpired) {
        // Auto-clean stale session on blocked page as a fallback safety path.
        await chrome.storage.local.set({
            session: {
                active: false,
                topic: '',
                endTime: null,
                startTime: null,
                burnMode: false
            }
        })

        await chrome.runtime.sendMessage({ type: 'sync-session-state' })
        meta.textContent = 'Session expired. You can now refresh and continue browsing.'
        return
    }

    if (session && session.active) {
        const burnText = session.burnMode ? ' | Burn mode active: closing/leaving is blocked.' : ''
        meta.textContent = `Current topic: ${session.topic || 'Not set'}${burnText}`
        return
    }

    // Ensure background rules are aligned if user reached this page after session ended.
    await chrome.runtime.sendMessage({ type: 'sync-session-state' })
    meta.textContent = 'No active session. Refresh to continue browsing.'
}

void syncAndRenderBlockedState()

