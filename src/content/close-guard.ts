type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
    burnMode?: boolean
}

let isGuardActive = false

function isProtectedBurnSession(session: SessionData | null): boolean {
    if (!session?.active) return false
    if (!session.burnMode) return false
    if (!session.endTime) return false
    return Date.now() < session.endTime
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isGuardActive) return
    event.preventDefault()
    event.returnValue = ''
}

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

async function refreshGuardState(): Promise<void> {
    const result = await chrome.storage.local.get(['session'])
    const session = (result.session as SessionData | undefined) ?? null
    isGuardActive = isProtectedBurnSession(session)
}

window.addEventListener('beforeunload', handleBeforeUnload, true)
window.addEventListener('keydown', handleKeydown, true)

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.session) return
    void refreshGuardState()
})

void refreshGuardState()
window.setInterval(() => {
    void refreshGuardState()
}, 2000)
