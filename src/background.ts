import { BLOCK_RULE_ID } from './shared/constants'
import {
    endSession,
    getAllowlistDomains,
    getStoredSession,
    isSessionExpired,
    type SessionData
} from './shared/storage'

/**
 * Alarm name used to auto-finish a running study session at its deadline.
 */
const END_ALARM_NAME = 'study-lock-end'

/**
 * Guard flag to avoid recursive session restoration while we patch storage state.
 */
let isRestoringProtectedSession = false

/**
 * Builds one DNR rule that blocks all main-frame navigation except allowlisted domains.
 */
function buildBlockRule(domains: string[]): chrome.declarativeNetRequest.Rule {
    return {
        id: BLOCK_RULE_ID,
        priority: 1,
        action: {
            type: 'redirect',
            redirect: {
                extensionPath: '/blocked.html'
            }
        },
        condition: {
            resourceTypes: ['main_frame'],
            excludedRequestDomains: domains
        }
    }
}

/**
 * Applies the current allowlist-based blocking rule.
 */
async function applyStudyRules(): Promise<void> {
    try {
        const domains = await getAllowlistDomains()

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [BLOCK_RULE_ID],
            addRules: [buildBlockRule(domains)]
        })

        console.log('Study Lock rules applied with allowlist:', domains)
    } catch (error) {
        console.error('Failed to apply Study Lock rules:', error)
    }
}

/**
 * Removes the dynamic blocking rule and restores normal browsing.
 */
async function clearStudyRules(): Promise<void> {
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [BLOCK_RULE_ID]
        })

        console.log('Study Lock rules cleared')
    } catch (error) {
        console.error('Failed to clear Study Lock rules:', error)
    }
}

/**
 * Schedules (or clears) the auto-end alarm based on session state.
 */
async function scheduleEndAlarm(session: SessionData | null): Promise<void> {
    await chrome.alarms.clear(END_ALARM_NAME)

    if (!session?.active || !session.endTime) return
    if (Date.now() >= session.endTime) return

    chrome.alarms.create(END_ALARM_NAME, {
        when: session.endTime
    })
}

/**
 * Single synchronization point that aligns DNR rules + alarm with current session state.
 */
async function syncRulesFromSession(): Promise<void> {
    const session = await getStoredSession()

    // If the session already expired, force-stop it and clean everything up.
    if (session?.active && isSessionExpired(session)) {
        await endSession({ force: true })
        await clearStudyRules()
        await chrome.alarms.clear(END_ALARM_NAME)
        return
    }

    if (session?.active) {
        await applyStudyRules()
        await scheduleEndAlarm(session)
    } else {
        await clearStudyRules()
        await chrome.alarms.clear(END_ALARM_NAME)
    }
}

/**
 * Burn mode is considered protected only while it is active and unexpired.
 */
function isProtectedBurnSession(session: SessionData | null): boolean {
    if (!session?.active) return false
    if (!session.burnMode) return false
    return !isSessionExpired(session)
}

/**
 * Restores a burn-mode session if something tried to clear it before timeout.
 */
async function restoreProtectedSessionIfNeeded(
    oldSession: SessionData | null,
    newSession: SessionData | null
): Promise<void> {
    if (isRestoringProtectedSession) return
    if (!isProtectedBurnSession(oldSession)) return
    if (newSession?.active) return

    isRestoringProtectedSession = true

    try {
        await chrome.storage.local.set({ session: oldSession })
        await applyStudyRules()
        await scheduleEndAlarm(oldSession)
        console.warn('Protected burn-mode session was restored after premature stop attempt.')
    } finally {
        isRestoringProtectedSession = false
    }
}

/**
 * Attempts to reopen a browser window if all windows were closed during active burn mode.
 */
async function reopenWindowIfAllClosed(): Promise<void> {
    const session = await getStoredSession()
    if (!isProtectedBurnSession(session)) return

    const windows = await chrome.windows.getAll()
    if (windows.length > 0) return

    await chrome.windows.create({
        url: 'https://chatgpt.com/'
    })
}

// Re-apply expected state whenever the extension is installed or browser starts.
chrome.runtime.onInstalled.addListener(() => {
    void syncRulesFromSession()
})

chrome.runtime.onStartup.addListener(() => {
    void syncRulesFromSession()
})

// React to storage changes from popup/options/content scripts.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return

    if (changes.session) {
        const oldSession = (changes.session.oldValue as SessionData | undefined) ?? null
        const newSession = (changes.session.newValue as SessionData | undefined) ?? null

        void restoreProtectedSessionIfNeeded(oldSession, newSession)
    }

    if (changes.session || changes.allowlistDomains) {
        void syncRulesFromSession()
    }
})

// Auto-end active session when deadline alarm fires.
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== END_ALARM_NAME) return

    void (async () => {
        await endSession({ force: true })
        await clearStudyRules()
        await chrome.alarms.clear(END_ALARM_NAME)
        console.log('Study Lock session ended automatically by alarm')
    })()
})

// If the user closes windows during burn mode, try to recover quickly.
chrome.windows.onRemoved.addListener(() => {
    void reopenWindowIfAllClosed()
})

// Allows blocked pages/content scripts to request a background sync.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'sync-session-state') return

    void (async () => {
        await syncRulesFromSession()
        sendResponse({ ok: true })
    })()

    return true
})
