/**
 * Preset-local plugin: a coarse local-time runtime-context snapshot.
 *
 * Contributes the local date, weekday, and a four-bucket time-of-day label
 * (early morning / morning / afternoon / evening) through
 * `systemPrompt.context`, so the value travels as a runtime-context snapshot
 * after retained history instead of touching the cached system-prompt prefix.
 * The text is deliberately truncated to the bucket: the projection layer
 * dedupes identical renders, so at most four snapshot messages reach the
 * session log per day.
 *
 * Plain ESM JavaScript on purpose: relative preset rows load under both the
 * tsx source launch and the built `node lib/bin.js` binary, and a `.ts` file
 * would only load under the former.
 */

/** Cordis plugin name. */
export const name = 'time-context'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * The four local time-of-day buckets: [0,6) early morning, [6,12) morning,
 * [12,18) afternoon, [18,24) evening.
 * @param {number} hour - local hour, 0-23.
 * @returns {string} the bucket label.
 */
function bucketOf(hour) {
  if (hour < 6) return 'early morning'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/**
 * Render the snapshot text for one instant, in that instant's local timezone.
 * Exported for direct testing; `apply` feeds it the current time.
 * @param {Date} now - the instant to render.
 * @returns {string} e.g. `Current local time: 2026-08-17, Sunday, afternoon (UTC+8).`
 */
export function renderTimeContext(now) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const weekday = WEEKDAYS[now.getDay()]
  // getTimezoneOffset() is minutes WEST of UTC, so UTC+8 reports -480.
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const offset = abs % 60 === 0 ? `${sign}${abs / 60}` : `${sign}${Math.trunc(abs / 60)}:${pad(abs % 60)}`
  return `Current local time: ${date}, ${weekday}, ${bucketOf(now.getHours())} (UTC${offset}).`
}

/**
 * Register the snapshot provider for the mounting agent scope.
 * @param {import('@deepseek-ai/cordis').Context} ctx - an agent scope context.
 */
export function apply(ctx) {
  // Order 105 places the line just before the sandbox (110) and approval (115)
  // facts inside the joined snapshot.
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'time:local',
    order: 105,
    text: () => renderTimeContext(new Date()),
  }), 'timeContext.context()')
}
