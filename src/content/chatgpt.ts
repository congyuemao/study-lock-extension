import {
    endSession,
    getEffectiveSession,
    type SessionData
} from '../shared/storage'

const WRAP_MARKER = '[STUDY_LOCK_WRAPPED]'

let currentSession: SessionData | null = null

function formatRemainingTime(endTime: number | null): string {
    if (!endTime) return 'No active session'

    const diff = endTime - Date.now()
    if (diff <= 0) return 'Session ended'

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}m ${seconds}s remaining`
}

function getOrCreateBanner(): HTMLDivElement {
    const existing = document.getElementById('study-lock-banner') as HTMLDivElement | null
    if (existing) return existing

    const banner = document.createElement('div')
    banner.id = 'study-lock-banner'
    banner.style.position = 'fixed'
    banner.style.top = '0'
    banner.style.left = '0'
    banner.style.right = '0'
    banner.style.zIndex = '999999'
    banner.style.padding = '10px 16px'
    banner.style.background = '#111'
    banner.style.color = '#fff'
    banner.style.fontSize = '14px'
    banner.style.fontFamily = 'Arial, sans-serif'
    banner.style.textAlign = 'center'
    banner.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)'

    document.body.appendChild(banner)
    return banner
}

function updateBanner(): void {
    const oldBanner = document.getElementById('study-lock-banner')
    if (!currentSession || !currentSession.active) {
        oldBanner?.remove()
        return
    }

    const banner = getOrCreateBanner()
    banner.textContent = `Study Lock active | Topic: ${currentSession.topic} | ${formatRemainingTime(currentSession.endTime)}`
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

User's actual request:
${userInput}`
}

function getChatEditor(): HTMLDivElement | null {
    return document.querySelector('#prompt-textarea[contenteditable="true"]')
}

function getEditorPlainText(editor: HTMLDivElement): string {
    return editor.innerText.trim()
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

function setEditorText(editor: HTMLDivElement, value: string): void {
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

    editor.dispatchEvent(
        new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: value
        })
    )

    syncFallbackTextarea(value)
}

function wrapInputIfNeeded(): void {
    if (!currentSession || !currentSession.active) return

    const editor = getChatEditor()
    if (!editor) return

    const rawText = getEditorPlainText(editor)
    if (!rawText) return
    if (rawText.startsWith(WRAP_MARKER)) return

    const wrapped = buildWrappedPrompt(rawText, currentSession.topic)
    setEditorText(editor, wrapped)
}

async function loadSession(): Promise<void> {
    currentSession = await getEffectiveSession()
    updateBanner()
}

function startBannerLoop(): void {
    void loadSession()

    setInterval(() => {
        void loadSession()
    }, 1000)
}

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

function isEditorTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return !!target.closest('#prompt-textarea')
}

function setupSendInterception(): void {
    document.addEventListener(
        'keydown',
        (event) => {
            if (!isEditorTarget(event.target)) return
            if (event.key !== 'Enter') return
            if (event.shiftKey) return
            if (event.isComposing) return

            wrapInputIfNeeded()
        },
        true
    )

    document.addEventListener(
        'submit',
        (event) => {
            const form = event.target
            if (!(form instanceof HTMLFormElement)) return
            if (!form.querySelector('#prompt-textarea')) return

            wrapInputIfNeeded()
        },
        true
    )
}

function start(): void {
    startBannerLoop()
    setupSessionListener()
    setupSendInterception()
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
} else {
    start()
}