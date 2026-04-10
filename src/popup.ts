import {
    endSession,
    getAllowlistDomains,
    getEffectiveSession,
    saveSession,
    type SessionData
} from './shared/storage'

// Main popup controls.
const topicInput = document.getElementById('topic') as HTMLInputElement
const minutesInput = document.getElementById('minutes') as HTMLInputElement
const burnModeInput = document.getElementById('burnMode') as HTMLInputElement
const startBtn = document.getElementById('startBtn') as HTMLButtonElement
const endBtn = document.getElementById('endBtn') as HTMLButtonElement
const optionsBtn = document.getElementById('optionsBtn') as HTMLButtonElement
const statusText = document.getElementById('status') as HTMLParagraphElement
const sessionInfo = document.getElementById('sessionInfo') as HTMLParagraphElement
const allowlistCount = document.getElementById('allowlistCount') as HTMLParagraphElement
const allowlistList = document.getElementById('allowlistList') as HTMLUListElement

/**
 * Converts session endTime into human-readable remaining time.
 */
function formatRemainingTime(endTime: number | null): string {
    if (!endTime) return 'No active session.'

    const diff = endTime - Date.now()
    if (diff <= 0) return 'Session ended.'

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}m ${seconds}s remaining.`
}

/**
 * Reloads session state and reflects lock/availability rules in popup UI.
 */
async function loadSession(): Promise<void> {
    const session = await getEffectiveSession()

    if (!session) {
        optionsBtn.disabled = false
        endBtn.disabled = false
        burnModeInput.disabled = false
        statusText.textContent = 'No active session.'
        sessionInfo.textContent = 'No active session.'
        return
    }

    topicInput.value = session.topic
    burnModeInput.checked = Boolean(session.burnMode)

    // Burn mode can only be selected before a session starts.
    burnModeInput.disabled = true

    // Options changes are blocked during active sessions.
    optionsBtn.disabled = true

    // Manual stop is blocked in burn mode.
    endBtn.disabled = Boolean(session.burnMode)

    const modeText = session.burnMode ? ' | Burn mode' : ''
    statusText.textContent = `Topic: ${session.topic}. ${formatRemainingTime(session.endTime)}${modeText}`
    sessionInfo.textContent = `Topic: ${session.topic} | ${formatRemainingTime(session.endTime)}${modeText}`
}

/**
 * Renders current allowlist domains in popup summary panel.
 */
async function loadAllowlist(): Promise<void> {
    const domains = await getAllowlistDomains()

    allowlistCount.textContent = `${domains.length} domain(s) currently allowlisted.`
    allowlistList.innerHTML = ''

    for (const domain of domains) {
        const li = document.createElement('li')
        li.textContent = domain
        allowlistList.appendChild(li)
    }
}

// Starts a new study session with current form values.
startBtn.addEventListener('click', async () => {
    const topic = topicInput.value.trim()
    const minutes = Number(minutesInput.value)

    if (!topic) {
        statusText.textContent = 'Please enter a study topic.'
        return
    }

    if (!minutes || minutes <= 0) {
        statusText.textContent = 'Please enter a valid number of minutes.'
        return
    }

    const endTime = Date.now() + minutes * 60 * 1000

    const session: SessionData = {
        active: true,
        topic,
        endTime,
        burnMode: burnModeInput.checked
    }

    await saveSession(session)
    await loadSession()
})

// Attempts to stop the current session.
endBtn.addEventListener('click', async () => {
    const ended = await endSession()
    if (!ended) {
        statusText.textContent = 'Burn mode active: manual stop is disabled.'
        return
    }

    await loadSession()
})

// Opens options page unless active-session lock is in place.
optionsBtn.addEventListener('click', async () => {
    if (optionsBtn.disabled) {
        statusText.textContent = 'Options are locked during an active session.'
        return
    }

    await chrome.runtime.openOptionsPage()
})

/**
 * Initializes popup and keeps countdown text fresh.
 */
async function init(): Promise<void> {
    await loadSession()
    await loadAllowlist()

    setInterval(() => {
        void loadSession()
    }, 1000)
}

void init()
