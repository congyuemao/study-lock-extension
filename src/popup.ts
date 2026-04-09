const topicInput = document.getElementById('topic') as HTMLInputElement
const minutesInput = document.getElementById('minutes') as HTMLInputElement
const startBtn = document.getElementById('startBtn') as HTMLButtonElement
const endBtn = document.getElementById('endBtn') as HTMLButtonElement
const statusText = document.getElementById('status') as HTMLParagraphElement
const optionsBtn = document.getElementById('optionsBtn') as HTMLButtonElement

optionsBtn.addEventListener('click', async () => {
    await chrome.runtime.openOptionsPage()
})

type SessionData = {
    active: boolean
    topic: string
    endTime: number | null
}

function formatRemainingTime(endTime: number | null): string {
    if (!endTime) return 'No active session.'

    const diff = endTime - Date.now()
    if (diff <= 0) return 'Session ended.'

    const totalSeconds = Math.floor(diff / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `Active session. ${minutes}m ${seconds}s remaining.`
}

async function loadSession(): Promise<void> {
    const result = await chrome.storage.local.get(['session'])
    const session = result.session as SessionData | undefined

    if (!session || !session.active) {
        statusText.textContent = 'No active session.'
        return
    }

    topicInput.value = session.topic
    statusText.textContent = `Topic: ${session.topic}. ${formatRemainingTime(session.endTime)}`
}

startBtn.addEventListener('click', async () => {
    const topic = topicInput.value.trim()
    const minutes = Number(minutesInput.value)

    if (!topic) {
        statusText.textContent = 'Please enter a study topic.'
        return
    }

    if (!minutes || minutes <= 0) {
        statusText.textContent = 'Please enter a valid number of minutes.'
        return
    }

    const endTime = Date.now() + minutes * 60 * 1000

    const session: SessionData = {
        active: true,
        topic,
        endTime
    }

    await chrome.storage.local.set({ session })
    statusText.textContent = `Started: ${topic}. ${minutes} minutes.`
})

endBtn.addEventListener('click', async () => {
    const session: SessionData = {
        active: false,
        topic: '',
        endTime: null
    }

    await chrome.storage.local.set({ session })
    statusText.textContent = 'Session ended.'
})

loadSession()
setInterval(loadSession, 1000)