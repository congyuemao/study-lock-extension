import { DEFAULT_ALLOWLIST_DOMAINS } from './shared/constants'
import { getAllowlistDomains, saveAllowlistDomains } from './shared/storage'

const textarea = document.getElementById('allowlist') as HTMLTextAreaElement
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement
const statusText = document.getElementById('status') as HTMLParagraphElement

async function loadAllowlist(): Promise<void> {
    const domains = await getAllowlistDomains()
    textarea.value = domains.join('\n')
}

saveBtn.addEventListener('click', async () => {
    const lines = textarea.value.split('\n')
    const saved = await saveAllowlistDomains(lines)
    textarea.value = saved.join('\n')
    statusText.textContent = 'Allowlist saved.'
})

resetBtn.addEventListener('click', async () => {
    const saved = await saveAllowlistDomains(DEFAULT_ALLOWLIST_DOMAINS)
    textarea.value = saved.join('\n')
    statusText.textContent = 'Allowlist reset to default.'
})

void loadAllowlist()