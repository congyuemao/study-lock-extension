import { DEFAULT_ALLOWLIST_DOMAINS } from './constants'

/**
 * Shared shape for the active study session state saved in chrome.storage.
 */
export type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
    startTime?: number | null
    burnMode?: boolean
}

/**
 * Normalizes one user-entered domain into a canonical host string.
 *
 * Examples:
 * - https://www.github.com/path -> github.com
 * - *.chatgpt.com -> chatgpt.com
 */
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

/**
 * Normalizes and deduplicates a domain list while preserving first-seen order.
 */
export function normalizeDomainList(inputs: string[]): string[] {
    const set = new Set<string>()

    for (const input of inputs) {
        const domain = normalizeDomain(input)
        if (domain) set.add(domain)
    }

    return [...set]
}

/**
 * Reads the allowlist from storage, falling back to defaults on first run.
 */
export async function getAllowlistDomains(): Promise<string[]> {
    const result = await chrome.storage.local.get(['allowlistDomains'])
    const stored = Array.isArray(result.allowlistDomains)
        ? result.allowlistDomains
        : DEFAULT_ALLOWLIST_DOMAINS

    return normalizeDomainList(stored)
}

/**
 * Saves a normalized allowlist and returns the stored canonical values.
 */
export async function saveAllowlistDomains(inputs: string[]): Promise<string[]> {
    const domains = normalizeDomainList(inputs)
    await chrome.storage.local.set({ allowlistDomains: domains })
    return domains
}

/**
 * Persists session data and coerces burnMode into a strict boolean.
 */
export async function saveSession(session: SessionData): Promise<void> {
    await chrome.storage.local.set({
        session: {
            ...session,
            startTime: typeof session.startTime === 'number' ? session.startTime : null,
            burnMode: Boolean(session.burnMode)
        } satisfies SessionData
    })
}

/**
 * Ends the active session.
 *
 * Returns false when burn mode blocks manual stop (unless force=true).
 */
export async function endSession(options?: { force?: boolean }): Promise<boolean> {
    const existing = await getStoredSession()
    const isProtected = Boolean(existing?.active && existing.burnMode && !options?.force)
    if (isProtected) return false

    await chrome.storage.local.set({
        session: {
            active: false,
            topic: '',
            endTime: null,
            startTime: null,
            burnMode: false
        } satisfies SessionData
    })

    return true
}

/**
 * Reads raw session from storage and normalizes optional fields.
 */
export async function getStoredSession(): Promise<SessionData | null> {
    const result = await chrome.storage.local.get(['session'])
    const session = (result.session as SessionData | undefined) ?? null

    if (!session) return null
    return {
        ...session,
        startTime: typeof session.startTime === 'number' ? session.startTime : null,
        burnMode: Boolean(session.burnMode)
    }
}

/**
 * Checks if the current timestamp has passed session endTime.
 */
export function isSessionExpired(session: SessionData | null): boolean {
    if (!session || !session.active) return false
    if (!session.endTime) return false
    return Date.now() >= session.endTime
}

/**
 * Returns a valid active session, auto-ending expired sessions on read.
 */
export async function getEffectiveSession(): Promise<SessionData | null> {
    const session = await getStoredSession()

    if (!session || !session.active) return null

    if (isSessionExpired(session)) {
        await endSession({ force: true })
        return null
    }

    return session
}

