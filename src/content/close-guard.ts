type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
    burnMode?: boolean
}

/**
 * Runtime guard flag: true only while an active burn-mode session is running.
 */
let isGuardActive = false

/**
 * Burn mode protection applies only to active, unexpired sessions.
 */
function isProtectedBurnSession(session: SessionData | null): boolean {
    if (!session?.active) return false
    if (!session.burnMode) return false
    if (!session.endTime) return false
    return Date.now() < session.endTime
}

/**
 * Triggers browser native "Leave site?" confirmation when burn mode is active.
 */
function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isGuardActive) return
    event.preventDefault()
    event.returnValue = ''
}

/**
 * Blocks common close/reload/navigation shortcuts during burn mode.
 */
function handleKeydown(event: KeyboardEvent): void {
    if (!isGuardActive) return

    const key = event.key.toLowerCase()
    const shouldBlock =
        key === 'f5' ||
        ((event.ctrlKey || event.metaKey) && (key === 'w' || key === 'r' || key === 'l'))

    if (!shouldBlock) return

    event.preventDefault()
    event.stopPropagation()
}

/**
 * Refreshes guard state from current session storage.
 */
async function refreshGuardState(): Promise<void> {
    const result = await chrome.storage.local.get(['session'])
    const session = (result.session as SessionData | undefined) ?? null
    isGuardActive = isProtectedBurnSession(session)
}

window.addEventListener('beforeunload', handleBeforeUnload, true)
window.addEventListener('keydown', handleKeydown, true)

// React instantly when popup/background updates session.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.session) return
    void refreshGuardState()
})

void refreshGuardState()

// Interval fallback in case storage listener misses rare edge updates.
window.setInterval(() => {
    void refreshGuardState()
}, 2000)

