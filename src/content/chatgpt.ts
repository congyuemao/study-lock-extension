(() => {
const WRAP_MARKER = '[STUDY_LOCK_WRAPPED]'
const USER_REQUEST_LABEL = "User's actual request:"
const SESSION_STORAGE_KEY = 'session'

type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
    startTime?: number | null
    burnMode?: boolean
}

type ChatEditor = HTMLDivElement | HTMLTextAreaElement

let currentSession: SessionData | null = null
let isReplayingSendClick = false

function normalizeSession(raw: unknown): SessionData | null {
    if (!raw || typeof raw !== 'object') return null
    const source = raw as Record<string, unknown>
    if (!source.active) return null

    return {
        active: Boolean(source.active),
        topic: typeof source.topic === 'string' ? source.topic : '',
        endTime: typeof source.endTime === 'number' ? source.endTime : null,
        startTime: typeof source.startTime === 'number' ? source.startTime : null,
        burnMode: Boolean(source.burnMode)
    }
}

async function getStoredSession(): Promise<SessionData | null> {
    const result = await chrome.storage.local.get([SESSION_STORAGE_KEY])
    return normalizeSession(result[SESSION_STORAGE_KEY])
}

function isSessionExpired(session: SessionData | null): boolean {
    if (!session || !session.active) return false
    if (!session.endTime) return false
    return Date.now() >= session.endTime
}

async function forceEndSession(): Promise<void> {
    await chrome.storage.local.set({
        [SESSION_STORAGE_KEY]: {
            active: false,
            topic: '',
            endTime: null,
            startTime: null,
            burnMode: false
        }
    })
}

async function getEffectiveSession(): Promise<SessionData | null> {
    const session = await getStoredSession()
    if (!session) return null

    if (isSessionExpired(session)) {
        await forceEndSession()
        return null
    }

    return session
}

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

function extractRawRequestFromWrappedText(text: string): string | null {
    if (!text.startsWith(WRAP_MARKER)) return null

    const labelIndex = text.indexOf(USER_REQUEST_LABEL)
    if (labelIndex < 0) return null

    const start = labelIndex + USER_REQUEST_LABEL.length
    return text.slice(start).replace(/^\s+/, '')
}

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

function getEditorPlainText(editor: ChatEditor): string {
    return editor instanceof HTMLTextAreaElement
        ? editor.value.trim()
        : editor.innerText.trim()
}

function setNativeTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
    const prototype = Object.getPrototypeOf(textarea)
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

function syncFallbackTextarea(value: string): void {
    const textarea = document.querySelector(
        'textarea[name="prompt-textarea"]'
    ) as HTMLTextAreaElement | null

    if (!textarea) return
    setNativeTextareaValue(textarea, value)
}

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

function setEditorText(editor: ChatEditor, value: string): void {
    if (editor instanceof HTMLTextAreaElement) {
        setNativeTextareaValue(editor, value)
        return
    }

    setDivEditorText(editor, value)
    syncFallbackTextarea(value)
}

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

function maybeRestoreRawTextInEditor(rawText: string): void {
    const editor = getChatEditor()
    if (!editor) return

    const currentText = getEditorPlainText(editor)
    if (!currentText.startsWith(WRAP_MARKER)) return

    setEditorText(editor, rawText)
}

function scheduleRestoreRawText(rawText: string): void {
    for (const delay of [120, 220, 420, 720]) {
        window.setTimeout(() => {
            maybeRestoreRawTextInEditor(rawText)
        }, delay)
    }
}

function wrapInputWithRetry(editor: ChatEditor | null = getChatEditor()): string | null {
    const rawText = wrapInputIfNeeded(editor)
    window.setTimeout(() => {
        void wrapInputIfNeeded(editor)
    }, 30)
    return rawText
}

async function loadSession(): Promise<void> {
    currentSession = await getEffectiveSession()
}

function setupSessionListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return
        if (!changes.session) return
        void loadSession()
    })
}

function isEditorTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return !!target.closest('#prompt-textarea, textarea[name="prompt-textarea"]')
}

function isChatForm(form: HTMLFormElement): boolean {
    return Boolean(form.querySelector('#prompt-textarea, textarea[name="prompt-textarea"]'))
}

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

function start(): void {
    void loadSession()
    setupSessionListener()
    setupSendInterception()
    setupWrappedTextSanitizer()

    window.setInterval(() => {
        void loadSession()
    }, 1000)
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
} else {
    start()
}
})()
