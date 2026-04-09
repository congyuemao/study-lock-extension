type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
}

const BLOCK_RULE_ID = 2

const ALLOWLIST_DOMAINS = [
    'chatgpt.com',
    'canvas.lms.unimelb.edu.au',
    'edstem.org',
    'github.com'
]

function buildBlockRule(): chrome.declarativeNetRequest.Rule {
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
            excludedRequestDomains: ALLOWLIST_DOMAINS
        }
    }
}

async function applyStudyRules(): Promise<void> {
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [BLOCK_RULE_ID],
            addRules: [buildBlockRule()]
        })

        const rules = await chrome.declarativeNetRequest.getDynamicRules()
        console.log('Study Lock rules applied:', rules)
    } catch (error) {
        console.error('Failed to apply Study Lock rules:', error)
    }
}

async function clearStudyRules(): Promise<void> {
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [BLOCK_RULE_ID]
        })

        const rules = await chrome.declarativeNetRequest.getDynamicRules()
        console.log('Study Lock rules cleared:', rules)
    } catch (error) {
        console.error('Failed to clear Study Lock rules:', error)
    }
}

async function syncRulesFromSession(): Promise<void> {
    const result = await chrome.storage.local.get(['session'])
    const session = result.session as SessionData | undefined

    if (session?.active) {
        await applyStudyRules()
    } else {
        await clearStudyRules()
    }
}

chrome.runtime.onInstalled.addListener(() => {
    void syncRulesFromSession()
})

chrome.runtime.onStartup.addListener(() => {
    void syncRulesFromSession()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if (!changes.session) return

    const newSession = changes.session.newValue as SessionData | undefined

    if (newSession?.active) {
        void applyStudyRules()
    } else {
        void clearStudyRules()
    }
})