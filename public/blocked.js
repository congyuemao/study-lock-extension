let isBurnModeGuardActive = false

function handleBeforeUnload(event) {
    if (!isBurnModeGuardActive) return
    event.preventDefault()
    event.returnValue = ''
}

window.addEventListener('beforeunload', handleBeforeUnload, true)

async function syncAndRenderBlockedState() {
    const meta = document.getElementById('meta')

    if (!meta) return

    const result = await chrome.storage.local.get(['session'])
    const session = result.session
    const isExpired = Boolean(session?.active && session?.endTime && Date.now() >= session.endTime)
    isBurnModeGuardActive = Boolean(session?.active && session?.burnMode && !isExpired)

    if (isExpired) {
        await chrome.storage.local.set({
            session: {
                active: false,
                topic: '',
                endTime: null,
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

    await chrome.runtime.sendMessage({ type: 'sync-session-state' })
    meta.textContent = 'No active session. Refresh to continue browsing.'
}

void syncAndRenderBlockedState()
