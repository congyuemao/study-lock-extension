import { BLOCK_RULE_ID } from './shared/constants'
import {
    endSession,
    getAllowlistDomains,
    getStoredSession,
    isSessionExpired,
    type SessionData
} from './shared/storage'

const END_ALARM_NAME = 'study-lock-end'
let isRestoringProtectedSession = false

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

async function scheduleEndAlarm(session: SessionData | null): Promise<void> {
    await chrome.alarms.clear(END_ALARM_NAME)

    if (!session?.active || !session.endTime) return
    if (Date.now() >= session.endTime) return

    chrome.alarms.create(END_ALARM_NAME, {
        when: session.endTime
    })
}

async function syncRulesFromSession(): Promise<void> {
    const session = await getStoredSession()

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

function isProtectedBurnSession(session: SessionData | null): boolean {
    if (!session?.active) return false
    if (!session.burnMode) return false
    return !isSessionExpired(session)
}

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

async function reopenWindowIfAllClosed(): Promise<void> {
    const session = await getStoredSession()
    if (!isProtectedBurnSession(session)) return

    const windows = await chrome.windows.getAll()
    if (windows.length > 0) return

    await chrome.windows.create({
        url: 'https://chatgpt.com/'
    })
}

chrome.runtime.onInstalled.addListener(() => {
    void syncRulesFromSession()
})

chrome.runtime.onStartup.addListener(() => {
    void syncRulesFromSession()
})

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

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== END_ALARM_NAME) return

    void (async () => {
        await endSession({ force: true })
        await clearStudyRules()
        await chrome.alarms.clear(END_ALARM_NAME)
        console.log('Study Lock session ended automatically by alarm')
    })()
})

chrome.windows.onRemoved.addListener(() => {
    void reopenWindowIfAllClosed()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'sync-session-state') return

    void (async () => {
        await syncRulesFromSession()
        sendResponse({ ok: true })
    })()

    return true
})
