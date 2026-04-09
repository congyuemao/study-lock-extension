chrome.storage.local.get(['session']).then((result) => {
    const meta = document.getElementById('meta')
    const session = result.session

    if (!meta) return

    if (session && session.active) {
        meta.textContent = `Current topic: ${session.topic || 'Not set'}`
    } else {
        meta.textContent = 'No active session.'
    }
})