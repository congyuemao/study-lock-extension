const FOCUS_ARCHIVE_KEY = 'focusArchive'
const FOCUS_ARCHIVE_VERSION = 1

export type FocusTaskRecord = {
    id: string
    topic: string
    startTime: number
    endTime: number
    durationMs: number
    burnMode: boolean
}

export type FocusDayRecord = {
    date: string
    totalDurationMs: number
    tasks: FocusTaskRecord[]
}

export type FocusArchive = {
    version: number
    nightOwlMode: boolean
    rolloverHour: number
    updatedAt: number
    days: Record<string, FocusDayRecord>
}

export type FocusSessionInput = {
    topic: string
    startTime: number
    endTime: number | null
    burnMode?: boolean
}

type FocusSegment = {
    dateKey: string
    startTime: number
    endTime: number
    durationMs: number
}

function createEmptyArchive(): FocusArchive {
    return {
        version: FOCUS_ARCHIVE_VERSION,
        nightOwlMode: true,
        rolloverHour: 6,
        updatedAt: Date.now(),
        days: {}
    }
}

function clampRolloverHour(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 6
    const normalized = Math.floor(value)
    if (normalized < 0) return 0
    if (normalized > 23) return 23
    return normalized
}

function formatDateKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Maps a timestamp to the archive date key.
 * When night-owl mode is enabled, [00:00, rolloverHour) counts for previous day.
 */
export function resolveRecordDateKey(
    timestamp: number,
    nightOwlMode: boolean,
    rolloverHour: number
): string {
    const date = new Date(timestamp)

    if (nightOwlMode && date.getHours() < rolloverHour) {
        date.setDate(date.getDate() - 1)
    }

    return formatDateKey(date)
}

function getNextBoundary(timestamp: number, nightOwlMode: boolean, rolloverHour: number): number {
    const date = new Date(timestamp)
    const boundary = new Date(date)
    boundary.setHours(nightOwlMode ? rolloverHour : 0, 0, 0, 0)

    if (timestamp >= boundary.getTime()) {
        boundary.setDate(boundary.getDate() + 1)
    }

    return boundary.getTime()
}

function splitByRecordDate(
    startTime: number,
    endTime: number,
    nightOwlMode: boolean,
    rolloverHour: number
): FocusSegment[] {
    if (endTime <= startTime) return []

    const segments: FocusSegment[] = []
    let cursor = startTime

    while (cursor < endTime) {
        const nextBoundary = getNextBoundary(cursor, nightOwlMode, rolloverHour)
        const segmentEnd = Math.min(endTime, nextBoundary)
        const durationMs = segmentEnd - cursor

        if (durationMs > 0) {
            segments.push({
                dateKey: resolveRecordDateKey(cursor, nightOwlMode, rolloverHour),
                startTime: cursor,
                endTime: segmentEnd,
                durationMs
            })
        }

        cursor = segmentEnd
    }

    return segments
}

function ensureDay(days: Record<string, FocusDayRecord>, dateKey: string): FocusDayRecord {
    const existing = days[dateKey]
    if (existing) return existing

    const created: FocusDayRecord = {
        date: dateKey,
        totalDurationMs: 0,
        tasks: []
    }
    days[dateKey] = created
    return created
}

function normalizeTask(raw: unknown): FocusTaskRecord | null {
    if (!raw || typeof raw !== 'object') return null

    const source = raw as Record<string, unknown>
    const startTime = typeof source.startTime === 'number' ? source.startTime : NaN
    const endTime = typeof source.endTime === 'number' ? source.endTime : NaN
    const topic = typeof source.topic === 'string' ? source.topic : ''

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        return null
    }
    if (!topic.trim()) return null

    const durationMsRaw = typeof source.durationMs === 'number' ? source.durationMs : endTime - startTime
    const durationMs = Math.max(1, Math.floor(durationMsRaw))
    const idSource = source.id
    const id =
        typeof idSource === 'string' && idSource.trim()
            ? idSource
            : `${Math.floor(startTime)}-${Math.floor(endTime)}`

    return {
        id,
        topic: topic.trim(),
        startTime,
        endTime,
        durationMs,
        burnMode: Boolean(source.burnMode)
    }
}

function normalizeDayRecord(dateKey: string, raw: unknown): FocusDayRecord | null {
    if (!raw || typeof raw !== 'object') return null

    const source = raw as Record<string, unknown>
    const tasksRaw = Array.isArray(source.tasks) ? source.tasks : []
    const tasks = tasksRaw
        .map((item) => normalizeTask(item))
        .filter((item): item is FocusTaskRecord => item !== null)
        .sort((a, b) => a.startTime - b.startTime)

    if (tasks.length === 0) return null

    const totalDurationMs = tasks.reduce((sum, task) => sum + task.durationMs, 0)
    return {
        date: dateKey,
        totalDurationMs,
        tasks
    }
}

/**
 * Normalizes imported or stored archive data into a safe internal structure.
 */
export function normalizeFocusArchive(raw: unknown): FocusArchive {
    if (!raw || typeof raw !== 'object') return createEmptyArchive()

    const source = raw as Record<string, unknown>
    const nightOwlMode = Boolean(source.nightOwlMode)
    const rolloverHour = clampRolloverHour(source.rolloverHour)
    const daysRaw = source.days && typeof source.days === 'object' ? (source.days as Record<string, unknown>) : {}
    const days: Record<string, FocusDayRecord> = {}

    for (const [dateKey, dayRaw] of Object.entries(daysRaw)) {
        const normalizedDay = normalizeDayRecord(dateKey, dayRaw)
        if (normalizedDay) {
            days[dateKey] = normalizedDay
        }
    }

    return {
        version: FOCUS_ARCHIVE_VERSION,
        nightOwlMode,
        rolloverHour,
        updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : Date.now(),
        days
    }
}

export async function getFocusArchive(): Promise<FocusArchive> {
    const result = await chrome.storage.local.get([FOCUS_ARCHIVE_KEY])
    return normalizeFocusArchive(result[FOCUS_ARCHIVE_KEY])
}

export async function saveFocusArchive(archive: FocusArchive): Promise<void> {
    await chrome.storage.local.set({
        [FOCUS_ARCHIVE_KEY]: {
            ...archive,
            updatedAt: Date.now()
        }
    })
}

function appendSessionSpan(
    days: Record<string, FocusDayRecord>,
    session: FocusSessionInput,
    nightOwlMode: boolean,
    rolloverHour: number,
    idSeed: string
): void {
    const startTime = Math.floor(session.startTime)
    const endTime = Math.floor(session.endTime ?? Date.now())
    const segments = splitByRecordDate(startTime, endTime, nightOwlMode, rolloverHour)

    segments.forEach((segment, index) => {
        const day = ensureDay(days, segment.dateKey)
        const task: FocusTaskRecord = {
            id: `${idSeed}-${index}`,
            topic: session.topic.trim(),
            startTime: segment.startTime,
            endTime: segment.endTime,
            durationMs: segment.durationMs,
            burnMode: Boolean(session.burnMode)
        }

        day.tasks.push(task)
        day.totalDurationMs += segment.durationMs
    })
}

/**
 * Appends one completed session into archive using current date-bucket settings.
 */
export function appendSessionToArchive(
    archive: FocusArchive,
    session: FocusSessionInput,
    actualEndTimestamp: number
): FocusArchive {
    if (!session.topic.trim()) return archive
    if (!Number.isFinite(session.startTime)) return archive

    const plannedEnd = session.endTime ?? actualEndTimestamp
    const boundedEnd = Math.min(actualEndTimestamp, plannedEnd)

    if (boundedEnd <= session.startTime) return archive

    const nextDays: Record<string, FocusDayRecord> = {}

    for (const [dateKey, day] of Object.entries(archive.days)) {
        nextDays[dateKey] = {
            date: day.date,
            totalDurationMs: day.totalDurationMs,
            tasks: [...day.tasks]
        }
    }

    const idSeed = `${Math.floor(session.startTime)}-${Math.floor(boundedEnd)}`
    appendSessionSpan(
        nextDays,
        {
            topic: session.topic,
            startTime: session.startTime,
            endTime: boundedEnd,
            burnMode: session.burnMode
        },
        archive.nightOwlMode,
        archive.rolloverHour,
        idSeed
    )

    for (const day of Object.values(nextDays)) {
        day.tasks.sort((a, b) => a.startTime - b.startTime)
    }

    return {
        ...archive,
        updatedAt: Date.now(),
        days: nextDays
    }
}

/**
 * Rebuilds all day buckets based on the selected night-owl mode.
 * Existing task spans are preserved and regrouped by the new boundary rule.
 */
export function rebuildArchiveWithNightMode(archive: FocusArchive, enabled: boolean): FocusArchive {
    const allTasks = Object.values(archive.days).flatMap((day) => day.tasks)
    const rebuiltDays: Record<string, FocusDayRecord> = {}

    allTasks.forEach((task, index) => {
        appendSessionSpan(
            rebuiltDays,
            {
                topic: task.topic,
                startTime: task.startTime,
                endTime: task.endTime,
                burnMode: task.burnMode
            },
            enabled,
            archive.rolloverHour,
            `reindex-${index}-${task.id}`
        )
    })

    for (const day of Object.values(rebuiltDays)) {
        day.tasks.sort((a, b) => a.startTime - b.startTime)
    }

    return {
        ...archive,
        nightOwlMode: enabled,
        updatedAt: Date.now(),
        days: rebuiltDays
    }
}

export async function appendSessionRecord(
    session: FocusSessionInput,
    actualEndTimestamp: number
): Promise<void> {
    const archive = await getFocusArchive()
    const nextArchive = appendSessionToArchive(archive, session, actualEndTimestamp)
    await saveFocusArchive(nextArchive)
}

