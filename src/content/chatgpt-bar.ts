(() => {
const BAR_ID = 'study-lock-chatgpt-bar'
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

function removeBar(): void {
    document.getElementById(BAR_ID)?.remove()
}

function ensureBar(): HTMLDivElement {
    const existing = document.getElementById(BAR_ID) as HTMLDivElement | null
    if (existing) return existing

    const bar = document.createElement('div')
    bar.id = BAR_ID
    bar.style.position = 'fixed'
    bar.style.top = '12px'
    bar.style.left = '50%'
    bar.style.transform = 'translateX(-50%)'
    bar.style.zIndex = '2147483647'
    bar.style.maxWidth = 'min(900px, calc(100vw - 24px))'
    bar.style.width = 'min(680px, calc(100vw - 24px))'
    bar.style.minHeight = '44px'
    bar.style.display = 'flex'
    bar.style.alignItems = 'center'
    bar.style.justifyContent = 'space-between'
    bar.style.gap = '10px'
    bar.style.padding = '8px 12px'
    bar.style.background = 'rgba(17, 17, 17, 0.94)'
    bar.style.backdropFilter = 'blur(6px)'
    bar.style.color = '#fff'
    bar.style.fontSize = '13px'
    bar.style.fontFamily = 'Arial, sans-serif'
    bar.style.border = '1px solid rgba(255, 255, 255, 0.25)'
    bar.style.borderRadius = '12px'
    bar.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)'
    bar.style.boxSizing = 'border-box'

    const left = document.createElement('div')
    left.id = `${BAR_ID}-text`
    left.style.minWidth = '0'
    left.style.overflow = 'hidden'
    left.style.textOverflow = 'ellipsis'
    left.style.whiteSpace = 'nowrap'
    left.style.flex = '1'
    left.style.paddingRight = '6px'
    bar.appendChild(left)

    const right = document.createElement('div')
    right.style.display = 'flex'
    right.style.gap = '6px'
    right.style.flexShrink = '0'
    bar.appendChild(right)

    const endBtn = document.createElement('button')
    endBtn.id = `${BAR_ID}-end`
    endBtn.type = 'button'
    endBtn.textContent = 'End'
    endBtn.style.cssText = 'padding:4px 8px;border:1px solid #666;border-radius:6px;background:#262626;color:#fff;cursor:pointer;'
    endBtn.addEventListener('click', async () => {
        const ended = await endSession()
        if (!ended) return
        await refreshSessionAndRender()
    })
    right.appendChild(endBtn)

    const optionsBtn = document.createElement('button')
    optionsBtn.type = 'button'
    optionsBtn.textContent = 'Options'
    optionsBtn.style.cssText = 'padding:4px 8px;border:1px solid #666;border-radius:6px;background:#262626;color:#fff;cursor:pointer;'
    optionsBtn.addEventListener('click', async () => {
        await chrome.runtime.openOptionsPage()
    })
    right.appendChild(optionsBtn)

    const calendarBtn = document.createElement('button')
    calendarBtn.id = `${BAR_ID}-calendar`
    calendarBtn.type = 'button'
    calendarBtn.textContent = 'Calendar'
    calendarBtn.style.cssText = 'padding:4px 8px;border:1px solid #666;border-radius:6px;background:#262626;color:#fff;cursor:pointer;'
    calendarBtn.addEventListener('click', () => {
        const url = chrome.runtime.getURL('src/calendar.html')
        window.open(url, '_blank', 'noopener,noreferrer')
    })
    right.appendChild(calendarBtn)

    ;(document.body ?? document.documentElement).appendChild(bar)
    return bar
}

function renderBar(): void {
    if (!currentSession?.active) {
        removeBar()
        return
    }

    const bar = ensureBar()
    const text = bar.querySelector(`#${BAR_ID}-text`) as HTMLDivElement | null
    const endBtn = bar.querySelector(`#${BAR_ID}-end`) as HTMLButtonElement | null
    const calendarBtn = bar.querySelector(`#${BAR_ID}-calendar`) as HTMLButtonElement | null

    if (text) {
        const modeText = currentSession.burnMode ? ' | Burn mode' : ''
        text.textContent = `Study Lock active | Topic: ${currentSession.topic} | ${formatRemainingTime(currentSession.endTime)}${modeText}`
    }

    if (endBtn) {
        endBtn.disabled = Boolean(currentSession.burnMode)
        endBtn.style.opacity = endBtn.disabled ? '0.5' : '1'
        endBtn.style.cursor = endBtn.disabled ? 'not-allowed' : 'pointer'
    }

    if (calendarBtn) {
        calendarBtn.disabled = Boolean(currentSession.burnMode)
        calendarBtn.style.opacity = calendarBtn.disabled ? '0.5' : '1'
        calendarBtn.style.cursor = calendarBtn.disabled ? 'not-allowed' : 'pointer'
    }
}

async function refreshSessionAndRender(): Promise<void> {
    currentSession = await getEffectiveSession()
    renderBar()
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
