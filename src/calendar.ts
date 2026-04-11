import {
    getFocusArchive,
    normalizeFocusArchive,
    rebuildArchiveWithNightMode,
    resolveRecordDateKey,
    saveFocusArchive,
    type FocusArchive,
    type FocusTaskRecord
} from './shared/focus-archive'
import { getEffectiveSession, type SessionData } from './shared/storage'

const prevMonthBtn = document.getElementById('prevMonthBtn') as HTMLButtonElement
const nextMonthBtn = document.getElementById('nextMonthBtn') as HTMLButtonElement
const monthLabel = document.getElementById('monthLabel') as HTMLParagraphElement
const calendarGrid = document.getElementById('calendarGrid') as HTMLDivElement
const nightOwlModeInput = document.getElementById('nightOwlMode') as HTMLInputElement

const selectedDateLabel = document.getElementById('selectedDateLabel') as HTMLHeadingElement
const selectedDayTotal = document.getElementById('selectedDayTotal') as HTMLParagraphElement
const taskList = document.getElementById('taskList') as HTMLUListElement

const exportArchiveBtn = document.getElementById('exportArchiveBtn') as HTMLButtonElement
const importArchiveBtn = document.getElementById('importArchiveBtn') as HTMLButtonElement
const importArchiveInput = document.getElementById('importArchiveInput') as HTMLInputElement
const archiveStatus = document.getElementById('archiveStatus') as HTMLParagraphElement
const burnModeLockPanel = document.getElementById('burnModeLockPanel') as HTMLDivElement
const calendarContent = document.getElementById('calendarContent') as HTMLDivElement

let archive: FocusArchive = normalizeFocusArchive(null)
let monthCursor = new Date()
monthCursor.setDate(1)
monthCursor.setHours(0, 0, 0, 0)
let selectedDateKey = ''
let isLockedByBurnMode = false

function isCalendarLocked(session: SessionData | null): boolean {
    return Boolean(session?.active && session?.burnMode)
}

async function syncCalendarLockState(): Promise<void> {
    const session = await getEffectiveSession()
    isLockedByBurnMode = isCalendarLocked(session)

    burnModeLockPanel.classList.toggle('hidden', !isLockedByBurnMode)
    calendarContent.classList.toggle('hidden', isLockedByBurnMode)
}

function toDateKey(year: number, monthIndex: number, day: number): string {
    const month = String(monthIndex + 1).padStart(2, '0')
    const dayText = String(day).padStart(2, '0')
    return `${year}-${month}-${dayText}`
}

function formatDuration(durationMs: number): string {
    const totalMinutes = Math.round(durationMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours <= 0) return `${minutes}m`
    if (minutes <= 0) return `${hours}h`
    return `${hours}h ${minutes}m`
}

function formatTimeRange(task: FocusTaskRecord): string {
    const start = new Date(task.startTime)
    const end = new Date(task.endTime)

    const startText = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const endText = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${startText}-${endText}`
}

function jumpToSelectedMonth(): void {
    const sourceKey =
        selectedDateKey ||
        resolveRecordDateKey(Date.now(), archive.nightOwlMode, archive.rolloverHour)

    const date = new Date(`${sourceKey}T00:00:00`)
    monthCursor = new Date(date.getFullYear(), date.getMonth(), 1)
}

function renderSelectedDay(): void {
    if (!selectedDateKey) {
        selectedDateKey = resolveRecordDateKey(Date.now(), archive.nightOwlMode, archive.rolloverHour)
    }

    selectedDateLabel.textContent = `Selected Day: ${selectedDateKey}`

    const day = archive.days[selectedDateKey]
    taskList.innerHTML = ''

    if (!day) {
        selectedDayTotal.textContent = 'No focus records.'
        const li = document.createElement('li')
        li.textContent = 'No tasks recorded for this day.'
        taskList.appendChild(li)
        return
    }

    selectedDayTotal.textContent = `${day.tasks.length} task(s) · ${formatDuration(day.totalDurationMs)}`

    for (const task of day.tasks) {
        const li = document.createElement('li')
        const burnTag = task.burnMode ? ' [Burn mode]' : ''
        li.textContent = `${formatTimeRange(task)} · ${task.topic} (${formatDuration(task.durationMs)})${burnTag}`
        taskList.appendChild(li)
    }
}

function createCalendarDayCell(year: number, monthIndex: number, day: number): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'calendar-cell'

    const dateKey = toDateKey(year, monthIndex, day)
    const dayRecord = archive.days[dateKey]

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'calendar-day-btn'

    if (dayRecord) button.classList.add('has-record')
    if (dateKey === selectedDateKey) button.classList.add('selected')

    const dayNumber = document.createElement('span')
    dayNumber.className = 'day-number'
    dayNumber.textContent = String(day)

    const dayTotal = document.createElement('span')
    dayTotal.className = 'day-total'
    dayTotal.textContent = dayRecord ? formatDuration(dayRecord.totalDurationMs) : '-'

    button.appendChild(dayNumber)
    button.appendChild(dayTotal)

    button.addEventListener('click', () => {
        selectedDateKey = dateKey
        renderCalendar()
        renderSelectedDay()
    })

    cell.appendChild(button)
    return cell
}

function renderCalendar(): void {
    const year = monthCursor.getFullYear()
    const monthIndex = monthCursor.getMonth()

    monthLabel.textContent = monthCursor.toLocaleString([], {
        year: 'numeric',
        month: 'long'
    })

    calendarGrid.innerHTML = ''

    const firstDayWeekIndex = new Date(year, monthIndex, 1).getDay()
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

    for (let i = 0; i < firstDayWeekIndex; i += 1) {
        const empty = document.createElement('div')
        empty.className = 'calendar-cell empty'
        calendarGrid.appendChild(empty)
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        calendarGrid.appendChild(createCalendarDayCell(year, monthIndex, day))
    }

    while (calendarGrid.children.length % 7 !== 0) {
        const empty = document.createElement('div')
        empty.className = 'calendar-cell empty'
        calendarGrid.appendChild(empty)
    }
}

async function loadArchivePanel(): Promise<void> {
    if (isLockedByBurnMode) return

    archive = await getFocusArchive()
    nightOwlModeInput.checked = archive.nightOwlMode

    if (!selectedDateKey) {
        selectedDateKey = resolveRecordDateKey(Date.now(), archive.nightOwlMode, archive.rolloverHour)
        jumpToSelectedMonth()
    }

    renderCalendar()
    renderSelectedDay()
}

async function exportArchive(): Promise<void> {
    const content = JSON.stringify(archive, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    anchor.href = url
    anchor.download = `focus-archive-${date}.json`
    anchor.click()

    URL.revokeObjectURL(url)
    archiveStatus.textContent = 'Archive exported.'
}

async function importArchive(file: File): Promise<void> {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const normalized = normalizeFocusArchive(parsed)

    await saveFocusArchive(normalized)
    archive = normalized

    selectedDateKey = resolveRecordDateKey(Date.now(), archive.nightOwlMode, archive.rolloverHour)
    jumpToSelectedMonth()
    nightOwlModeInput.checked = archive.nightOwlMode

    renderCalendar()
    renderSelectedDay()

    archiveStatus.textContent = `Archive imported: ${file.name}`
}

prevMonthBtn.addEventListener('click', () => {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)
    renderCalendar()
})

nextMonthBtn.addEventListener('click', () => {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)
    renderCalendar()
})

nightOwlModeInput.addEventListener('change', async () => {
    const nextArchive = rebuildArchiveWithNightMode(archive, nightOwlModeInput.checked)
    await saveFocusArchive(nextArchive)
    archive = nextArchive

    selectedDateKey = resolveRecordDateKey(Date.now(), archive.nightOwlMode, archive.rolloverHour)
    jumpToSelectedMonth()

    renderCalendar()
    renderSelectedDay()

    archiveStatus.textContent = `Night Owl Mode ${archive.nightOwlMode ? 'enabled' : 'disabled'}.`
})

exportArchiveBtn.addEventListener('click', () => {
    void exportArchive()
})

importArchiveBtn.addEventListener('click', () => {
    importArchiveInput.click()
})

importArchiveInput.addEventListener('change', () => {
    void (async () => {
        const file = importArchiveInput.files?.[0]
        if (!file) return

        try {
            await importArchive(file)
        } catch {
            archiveStatus.textContent = 'Import failed: invalid archive JSON format.'
        } finally {
            importArchiveInput.value = ''
        }
    })()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return

    if (changes.session) {
        void (async () => {
            await syncCalendarLockState()
            if (!isLockedByBurnMode) {
                await loadArchivePanel()
            }
        })()
    }

    if (changes.focusArchive) {
        void loadArchivePanel()
    }
})

void (async () => {
    await syncCalendarLockState()
    await loadArchivePanel()
})()
