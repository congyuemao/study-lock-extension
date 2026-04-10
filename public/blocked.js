async function syncAndRenderBlockedState() {
    const meta = document.getElementById('meta')

    if (!meta) return

    const result = await chrome.storage.local.get(['session'])
    const session = result.session
    const isExpired = Boolean(session?.active && session?.endTime && Date.now() >= session.endTime)

    if (isExpired) {
        await chrome.storage.local.set({
            session: {
                active: false,
                topic: '',
                endTime: null
            }
        })

        await chrome.runtime.sendMessage({ type: 'sync-session-state' })
        meta.textContent = 'Session expired. You can now refresh and continue browsing.'
        return
    }

    if (session && session.active) {
        meta.textContent = `Current topic: ${session.topic || 'Not set'}`
        return
    }

    await chrome.runtime.sendMessage({ type: 'sync-session-state' })
    meta.textContent = 'No active session. Refresh to continue browsing.'
}

void syncAndRenderBlockedState()
