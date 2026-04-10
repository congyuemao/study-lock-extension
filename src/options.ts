import { DEFAULT_ALLOWLIST_DOMAINS } from './shared/constants'
import {
    getAllowlistDomains,
    getEffectiveSession,
    saveAllowlistDomains,
    type SessionData
} from './shared/storage'

// Options page controls.
const textarea = document.getElementById('allowlist') as HTMLTextAreaElement
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement
const statusText = document.getElementById('status') as HTMLParagraphElement
const lockNotice = document.getElementById('lockNotice') as HTMLParagraphElement

/**
 * Formats remaining time for lock banner in options page.
 */
function formatRemainingTime(endTime: number | null): string {
    if (!endTime) return 'unknown remaining time'

    const diff = endTime - Date.now()
    if (diff <= 0) return 'ending now'

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}s`
}

/**
 * Locks/unlocks options editing depending on active session state.
 */
function setLockedState(session: SessionData | null): void {
    const isLocked = Boolean(session)

    textarea.disabled = isLocked
    saveBtn.disabled = isLocked
    resetBtn.disabled = isLocked

    if (!session) {
        lockNotice.textContent = ''
        return
    }

    lockNotice.textContent = `Active session "${session.topic}" (${formatRemainingTime(session.endTime)}). Options are locked.`
}

/**
 * Loads allowlist into textarea, one domain per line.
 */
async function loadAllowlist(): Promise<void> {
    const domains = await getAllowlistDomains()
    textarea.value = domains.join('\n')
}

// Saves user-edited allowlist.
saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return

    const lines = textarea.value.split('\n')
    const saved = await saveAllowlistDomains(lines)
    textarea.value = saved.join('\n')
    statusText.textContent = 'Allowlist saved.'
})

// Resets allowlist back to project defaults.
resetBtn.addEventListener('click', async () => {
    if (resetBtn.disabled) return

    const saved = await saveAllowlistDomains(DEFAULT_ALLOWLIST_DOMAINS)
    textarea.value = saved.join('\n')
    statusText.textContent = 'Allowlist reset to default.'
})

/**
 * Initial options page load.
 */
async function init(): Promise<void> {
    const session = await getEffectiveSession()
    setLockedState(session)

    if (!session) {
        await loadAllowlist()
    } else {
        statusText.textContent = 'You can edit allowlist after the session ends.'
    }
}

// Keep lock state in sync while options page stays open.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.session) return

    void (async () => {
        const session = await getEffectiveSession()
        setLockedState(session)

        if (!session) {
            await loadAllowlist()
            statusText.textContent = 'Session ended. Allowlist editing is enabled.'
        }
    })()
})

void init()
