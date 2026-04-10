import { DEFAULT_ALLOWLIST_DOMAINS } from './constants'

export type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
    burnMode?: boolean
}

function normalizeDomain(input: string): string | null {
    let value = input.trim().toLowerCase()
    if (!value) return null

    value = value.replace(/^https?:\/\//, '')
    value = value.replace(/^\*\./, '')
    value = value.replace(/^www\./, '')
    value = value.split('/')[0].split('?')[0].split('#')[0].split(':')[0]

    if (!value) return null
    return value
}

export function normalizeDomainList(inputs: string[]): string[] {
    const set = new Set<string>()

    for (const input of inputs) {
        const domain = normalizeDomain(input)
        if (domain) set.add(domain)
    }

    return [...set]
}

export async function getAllowlistDomains(): Promise<string[]> {
    const result = await chrome.storage.local.get(['allowlistDomains'])
    const stored = Array.isArray(result.allowlistDomains)
        ? result.allowlistDomains
        : DEFAULT_ALLOWLIST_DOMAINS

    return normalizeDomainList(stored)
}

export async function saveAllowlistDomains(inputs: string[]): Promise<string[]> {
    const domains = normalizeDomainList(inputs)
    await chrome.storage.local.set({ allowlistDomains: domains })
    return domains
}

export async function saveSession(session: SessionData): Promise<void> {
    await chrome.storage.local.set({
        session: {
            ...session,
            burnMode: Boolean(session.burnMode)
        } satisfies SessionData
    })
}

export async function endSession(options?: { force?: boolean }): Promise<boolean> {
    const existing = await getStoredSession()
    const isProtected = Boolean(existing?.active && existing.burnMode && !options?.force)
    if (isProtected) return false

    await chrome.storage.local.set({
        session: {
            active: false,
            topic: '',
            endTime: null,
            burnMode: false
        } satisfies SessionData
    })

    return true
}

export async function getStoredSession(): Promise<SessionData | null> {
    const result = await chrome.storage.local.get(['session'])
    const session = (result.session as SessionData | undefined) ?? null

    if (!session) return null
    return {
        ...session,
        burnMode: Boolean(session.burnMode)
    }
}

export function isSessionExpired(session: SessionData | null): boolean {
    if (!session || !session.active) return false
    if (!session.endTime) return false
    return Date.now() >= session.endTime
}

export async function getEffectiveSession(): Promise<SessionData | null> {
    const session = await getStoredSession()

    if (!session || !session.active) return null

    if (isSessionExpired(session)) {
        await endSession({ force: true })
        return null
    }

    return session
}
