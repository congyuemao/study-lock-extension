(() => {
const BANNER_ID = 'study-lock-banner'
const SESSION_STORAGE_KEY = 'session'

type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
    startTime?: number | null
    burnMode?: boolean
}

let currentSession: SessionData | null = null

function normalizeSession(raw: unknown): SessionData | null {
    if (!raw || typeof raw !== 'object') return null
    const source = raw as Record<string, unknown>
    if (!source.active) return null

    return {
        active: Boolean(source.active),
        topic: typeof source.topic === 'string' ? source.topic : '',
        endTime: typeof source.endTime === 'number' ? source.endTime : null,
        startTime: typeof source.startTime === 'number' ? source.startTime : null,
        burnMode: Boolean(source.burnMode)
    }
}

async function getStoredSession(): Promise<SessionData | null> {
    const result = await chrome.storage.local.get([SESSION_STORAGE_KEY])
    return normalizeSession(result[SESSION_STORAGE_KEY])
}

function isSessionExpired(session: SessionData | null): boolean {
    if (!session || !session.active) return false
    if (!session.endTime) return false
    return Date.now() >= session.endTime
}

async function endSession(options?: { force?: boolean }): Promise<boolean> {
    const existing = await getStoredSession()
    const isProtected = Boolean(existing?.active && existing.burnMode && !options?.force)
    if (isProtected) return false

    await chrome.storage.local.set({
        [SESSION_STORAGE_KEY]: {
            active: false,
            topic: '',
            endTime: null,
            startTime: null,
            burnMode: false
        }
    })

    return true
}

async function getEffectiveSession(): Promise<SessionData | null> {
    const session = await getStoredSession()
    if (!session) return null

    if (isSessionExpired(session)) {
        await endSession({ force: true })
        return null
    }

    return session
}

function formatRemainingTime(endTime: number | null): string {
    if (!endTime) return 'No active session'

    const diff = endTime - Date.now()
    if (diff <= 0) return 'Session ended'

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}m ${seconds}s remaining`
}

function removeBanner(): void {
    document.getElementById(BANNER_ID)?.remove()
}

function ensureBanner(): HTMLDivElement {
    const existing = document.getElementById(BANNER_ID) as HTMLDivElement | null
    if (existing) return existing

    const banner = document.createElement('div')
    banner.id = BANNER_ID
    banner.style.position = 'fixed'
    banner.style.top = '12px'
    banner.style.left = '50%'
    banner.style.transform = 'translateX(-50%)'
    banner.style.zIndex = '2147483647'
    banner.style.padding = '10px 14px'
    banner.style.maxWidth = 'calc(100vw - 24px)'
    banner.style.borderRadius = '12px'
    banner.style.border = '1px solid rgba(255, 255, 255, 0.25)'
    banner.style.background = '#111'
    banner.style.color = '#fff'
    banner.style.fontSize = '14px'
    banner.style.fontFamily = 'Arial, sans-serif'
    banner.style.textAlign = 'center'
    banner.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)'
    banner.style.pointerEvents = 'none'
    banner.style.whiteSpace = 'nowrap'
    banner.style.overflow = 'hidden'
    banner.style.textOverflow = 'ellipsis'

    ;(document.body ?? document.documentElement).appendChild(banner)
    return banner
}

function renderBanner(): void {
    if (!currentSession?.active) {
        removeBanner()
        return
    }

    const banner = ensureBanner()
    const burnText = currentSession.burnMode ? ' | Burn mode' : ''
    banner.textContent = `Study Lock active | Topic: ${currentSession.topic} | ${formatRemainingTime(currentSession.endTime)}${burnText}`
}

async function refreshSessionAndRender(): Promise<void> {
    currentSession = await getEffectiveSession()
    renderBanner()
}

function start(): void {
    void refreshSessionAndRender()

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return
        if (!changes.session) return
        void refreshSessionAndRender()
    })

    window.setInterval(() => {
        void refreshSessionAndRender()
    }, 1000)
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
} else {
    start()
}
})()
