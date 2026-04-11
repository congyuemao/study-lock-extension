/**
 * Marker inserted at the top of wrapped prompts so we can detect and avoid double-wrap.
 */
const WRAP_MARKER = '[STUDY_LOCK_WRAPPED]'

/**
 * Storage key used by all extension surfaces for session state.
 */
const SESSION_STORAGE_KEY = 'session'

/**
 * Delimiter used to recover the original user request from wrapped text.
 */
const USER_REQUEST_LABEL = "User's actual request:"

type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
    startTime?: number | null
    burnMode?: boolean
}

type ChatEditor = HTMLDivElement | HTMLTextAreaElement

let currentSession: SessionData | null = null

/**
 * Prevents replayed synthetic clicks from recursively triggering the same interception flow.
 */
let isReplayingSendClick = false

/**
 * Local emergency end used by this content script when it detects an expired session.
 */
async function endSession(): Promise<void> {
    await chrome.storage.local.set({
        [SESSION_STORAGE_KEY]: {
            active: false,
            topic: '',
            endTime: null,
            startTime: null,
            burnMode: false
        } satisfies SessionData
    })
}

/**
 * Reads raw session data from extension storage.
 */
async function getStoredSession(): Promise<SessionData | null> {
    const result = await chrome.storage.local.get([SESSION_STORAGE_KEY])
    return (result[SESSION_STORAGE_KEY] as SessionData | undefined) ?? null
}

/**
 * Checks whether a session is active but already past endTime.
 */
function isSessionExpired(session: SessionData | null): boolean {
    if (!session || !session.active) return false
    if (!session.endTime) return false
    return Date.now() >= session.endTime
}

/**
 * Returns active session only when still valid, otherwise auto-cleans expired session.
 */
async function getEffectiveSession(): Promise<SessionData | null> {
    const session = await getStoredSession()
    if (!session || !session.active) return null

    if (isSessionExpired(session)) {
        await endSession()
        return null
    }

    return session
}

/**
 * Converts endTime into a compact countdown string used in top banner.
 */
function formatRemainingTime(endTime: number | null): string {
    if (!endTime) return 'No active session'

    const diff = endTime - Date.now()
    if (diff <= 0) return 'Session ended'

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}m ${seconds}s remaining`
}

/**
 * Creates or reuses the fixed top banner displayed on ChatGPT pages.
 */
function getOrCreateBanner(): HTMLDivElement {
    const existing = document.getElementById('study-lock-banner') as HTMLDivElement | null
    if (existing) return existing

    const banner = document.createElement('div')
    banner.id = 'study-lock-banner'
    banner.style.position = 'fixed'
    banner.style.top = '12px'
    banner.style.left = '50%'
    banner.style.transform = 'translateX(-50%)'
    banner.style.zIndex = '2147483647'
    banner.style.padding = '10px 14px'
    banner.style.maxWidth = 'calc(100vw - 24px)'
    banner.style.borderRadius = '12px'
    banner.style.border = '1px solid rgba(255, 255, 255, 0.25)'
    banner.style.background = '#111'
    banner.style.color = '#fff'
    banner.style.fontSize = '14px'
    banner.style.fontFamily = 'Arial, sans-serif'
    banner.style.textAlign = 'center'
    banner.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)'
    banner.style.pointerEvents = 'none'
    banner.style.whiteSpace = 'nowrap'
    banner.style.overflow = 'hidden'
    banner.style.textOverflow = 'ellipsis'

    ;(document.body ?? document.documentElement).appendChild(banner)
    return banner
}

/**
 * Shows/hides banner based on active session.
 */
function updateBanner(): void {
    const oldBanner = document.getElementById('study-lock-banner')
    if (!currentSession || !currentSession.active) {
        oldBanner?.remove()
        return
    }

    const banner = getOrCreateBanner()
    const modeText = currentSession.burnMode ? ' | Burn mode' : ''
    banner.textContent = `Study Lock active | Topic: ${currentSession.topic} | ${formatRemainingTime(currentSession.endTime)}${modeText}`
}

/**
 * Builds the policy-wrapped prompt that is sent to ChatGPT.
 */
function buildWrappedPrompt(userInput: string, topic: string): string {
    return `${WRAP_MARKER}

You are currently being used in a study-only session.

Current study topic:
${topic}

Rules:
1. Only answer questions directly related to the study topic above.
2. If the user's request is unrelated or only weakly related, politely tell the user to return to the study topic.
3. Prefer explanation, teaching, worked examples, and study guidance.
4. Do not encourage off-topic conversation.

${USER_REQUEST_LABEL}
${userInput}`
}

/**
 * Extracts original user request from wrapped text block.
 */
function extractRawRequestFromWrappedText(text: string): string | null {
    if (!text.startsWith(WRAP_MARKER)) return null

    const labelIndex = text.indexOf(USER_REQUEST_LABEL)
    if (labelIndex < 0) return null

    const start = labelIndex + USER_REQUEST_LABEL.length
    return text.slice(start).replace(/^\s+/, '')
}

/**
 * Locates the active ChatGPT editor using several selectors to survive UI changes.
 */
function getChatEditor(): ChatEditor | null {
    const selectors = [
        '#prompt-textarea[contenteditable="true"]',
        'div#prompt-textarea',
        'textarea#prompt-textarea',
        'textarea[name="prompt-textarea"]'
    ]

    for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (el instanceof HTMLDivElement || el instanceof HTMLTextAreaElement) {
            return el
        }
    }

    return null
}

/**
 * Reads plain text from either contenteditable div or textarea editor.
 */
function getEditorPlainText(editor: ChatEditor): string {
    return editor instanceof HTMLTextAreaElement
        ? editor.value.trim()
        : editor.innerText.trim()
}

/**
 * Updates textarea value through the native setter so React-like frameworks detect changes.
 */
function setNativeTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
    const prototype = Object.getPrototypeOf(textarea)
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Syncs fallback hidden textarea used by some ChatGPT builds.
 */
function syncFallbackTextarea(value: string): void {
    const textarea = document.querySelector(
        'textarea[name="prompt-textarea"]'
    ) as HTMLTextAreaElement | null

    if (!textarea) return
    setNativeTextareaValue(textarea, value)
}

/**
 * Writes text into contenteditable editor preserving line breaks.
 */
function setDivEditorText(editor: HTMLDivElement, value: string): void {
    editor.focus()
    editor.innerHTML = ''

    const lines = value.split('\n')

    for (const line of lines) {
        const p = document.createElement('p')
        if (line.length === 0) {
            p.appendChild(document.createElement('br'))
        } else {
            p.textContent = line
        }
        editor.appendChild(p)
    }

    if (typeof InputEvent === 'function') {
        editor.dispatchEvent(
            new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: value
            })
        )
    } else {
        editor.dispatchEvent(new Event('input', { bubbles: true }))
    }
}

/**
 * Unified writer for both editor modes.
 */
function setEditorText(editor: ChatEditor, value: string): void {
    if (editor instanceof HTMLTextAreaElement) {
        setNativeTextareaValue(editor, value)
        return
    }

    setDivEditorText(editor, value)
    syncFallbackTextarea(value)
}

/**
 * Wraps current editor content once and returns original text for restoration.
 */
function wrapInputIfNeeded(editor: ChatEditor | null = getChatEditor()): string | null {
    if (!currentSession || !currentSession.active) return null
    if (!editor) return null

    const rawText = getEditorPlainText(editor)
    if (!rawText) return null
    if (rawText.startsWith(WRAP_MARKER)) return null

    const wrapped = buildWrappedPrompt(rawText, currentSession.topic)
    setEditorText(editor, wrapped)
    return rawText
}

/**
 * Restores visible editor text only if wrapped text is still present.
 */
function maybeRestoreRawTextInEditor(rawText: string): void {
    const editor = getChatEditor()
    if (!editor) return

    const currentText = getEditorPlainText(editor)
    if (!currentText.startsWith(WRAP_MARKER)) return

    setEditorText(editor, rawText)
}

/**
 * Multiple delayed restoration attempts to handle async UI updates.
 */
function scheduleRestoreRawText(rawText: string): void {
    for (const delay of [120, 220, 420, 720]) {
        window.setTimeout(() => {
            maybeRestoreRawTextInEditor(rawText)
        }, delay)
    }
}

/**
 * Immediate wrap plus short retry to catch race conditions before send.
 */
function wrapInputWithRetry(editor: ChatEditor | null = getChatEditor()): string | null {
    const rawText = wrapInputIfNeeded(editor)
    window.setTimeout(() => {
        void wrapInputIfNeeded(editor)
    }, 30)
    return rawText
}

/**
 * Pulls latest session and refreshes banner.
 */
async function loadSession(): Promise<void> {
    currentSession = await getEffectiveSession()
    updateBanner()
}

/**
 * Keeps countdown accurate while tab remains open.
 */
function startBannerLoop(): void {
    void loadSession()

    setInterval(() => {
        void loadSession()
    }, 1000)
}

/**
 * Reacts to session changes and auto-cleans expired state from content side.
 */
function setupSessionListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return
        if (!changes.session) return

        const newSession = changes.session.newValue as SessionData | null

        if (newSession && newSession.active && newSession.endTime && Date.now() >= newSession.endTime) {
            void endSession()
            return
        }

        currentSession = newSession
        updateBanner()
    })
}

/**
 * True when keyboard event originated from the chat editor.
 */
function isEditorTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return !!target.closest('#prompt-textarea, textarea[name="prompt-textarea"]')
}

/**
 * True when submit event came from the ChatGPT compose form.
 */
function isChatForm(form: HTMLFormElement): boolean {
    return Boolean(form.querySelector('#prompt-textarea, textarea[name="prompt-textarea"]'))
}

/**
 * Resolves the send button from direct target or composed event path.
 */
function getSendButtonFromEvent(event: Event): HTMLButtonElement | null {
    const selector =
        'button#composer-submit-button, button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"]'

    const target = event.target
    if (target instanceof Element) {
        const found = target.closest(selector)
        if (found instanceof HTMLButtonElement) return found
    }

    for (const node of event.composedPath()) {
        if (node instanceof HTMLButtonElement && node.matches(selector)) {
            return node
        }
    }

    return null
}

/**
 * Button-send path:
 * 1) cancel original click,
 * 2) wrap prompt,
 * 3) replay one synthetic click.
 */
function handleSendButtonClick(event: MouseEvent): void {
    const sendButton = getSendButtonFromEvent(event)
    if (!sendButton) return

    if (isReplayingSendClick) return
    if (!currentSession?.active) return

    const editor = getChatEditor()
    if (!editor) return

    const rawText = getEditorPlainText(editor)
    if (!rawText) return
    if (rawText.startsWith(WRAP_MARKER)) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    const wrappedRawText = wrapInputWithRetry(editor)
    if (!wrappedRawText) return
    scheduleRestoreRawText(wrappedRawText)

    isReplayingSendClick = true
    window.setTimeout(() => {
        sendButton.click()
        window.setTimeout(() => {
            isReplayingSendClick = false
        }, 0)
    }, 40)
}

/**
 * Replaces wrapped text that may briefly appear in visible UI fragments.
 */
function sanitizeWrappedTextInElement(element: Element): void {
    if (element instanceof HTMLTextAreaElement) return
    if (element.id === 'prompt-textarea') return
    if (element.closest('#prompt-textarea')) return

    if (element.childElementCount === 0) {
        const text = element.textContent ?? ''
        const raw = extractRawRequestFromWrappedText(text.trim())
        if (raw !== null) {
            element.textContent = raw
        }
    }

    for (const child of Array.from(element.querySelectorAll('*'))) {
        if (!(child instanceof Element)) continue
        if (child.childElementCount !== 0) continue

        const text = child.textContent ?? ''
        const raw = extractRawRequestFromWrappedText(text.trim())
        if (raw !== null) {
            child.textContent = raw
        }
    }
}

/**
 * Watches DOM mutations and periodically scans chat area for wrapped-text artifacts.
 */
function setupWrappedTextSanitizer(): void {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const addedNode of Array.from(mutation.addedNodes)) {
                if (!(addedNode instanceof Element)) continue
                sanitizeWrappedTextInElement(addedNode)
            }
        }
    })

    observer.observe(document.body ?? document.documentElement, {
        childList: true,
        subtree: true
    })

    window.setInterval(() => {
        const candidates = document.querySelectorAll('main *')
        for (const candidate of Array.from(candidates)) {
            sanitizeWrappedTextInElement(candidate)
        }
    }, 1200)
}

/**
 * Hooks Enter submit, form submit, and send-button clicks to enforce wrapping.
 */
function setupSendInterception(): void {
    document.addEventListener(
        'keydown',
        (event) => {
            if (!isEditorTarget(event.target)) return
            if (event.key !== 'Enter') return
            if (event.shiftKey) return
            if (event.isComposing) return

            const wrappedRawText = wrapInputIfNeeded()
            if (wrappedRawText) {
                scheduleRestoreRawText(wrappedRawText)
            }
        },
        true
    )

    document.addEventListener(
        'submit',
        (event) => {
            const form = event.target
            if (!(form instanceof HTMLFormElement)) return
            if (!isChatForm(form)) return

            const wrappedRawText = wrapInputIfNeeded()
            if (wrappedRawText) {
                scheduleRestoreRawText(wrappedRawText)
            }
        },
        true
    )

    document.addEventListener(
        'click',
        (event) => {
            if (!(event instanceof MouseEvent)) return
            handleSendButtonClick(event)
        },
        true
    )
}

/**
 * Content-script bootstrap.
 */
function start(): void {
    startBannerLoop()
    setupSessionListener()
    setupSendInterception()
    setupWrappedTextSanitizer()
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
} else {
    start()
}

