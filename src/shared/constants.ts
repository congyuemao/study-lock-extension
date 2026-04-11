/**
 * Default domains that remain reachable during an active study session.
 *
 * Users can edit this list in the options page; this array is only the initial fallback.
 */
export const DEFAULT_ALLOWLIST_DOMAINS = [
    'chatgpt.com',
    'canvas.lms.unimelb.edu.au',
    'edstem.org',
    'github.com'
]

/**
 * Stable dynamic-rule ID for Chrome Declarative Net Request.
 *
 * Keeping this constant fixed lets us reliably replace the previous rule with remove+add.
 */
export const BLOCK_RULE_ID = 2

