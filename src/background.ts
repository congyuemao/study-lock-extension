import { BLOCK_RULE_ID } from './shared/constants'
import { getAllowlistDomains, type SessionData } from './shared/storage'

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

    if (changes.session || changes.allowlistDomains) {
        void syncRulesFromSession()
    }
})