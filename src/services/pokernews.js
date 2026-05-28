/**
 * Fetches live player chip count data from PokerNews via Anthropic API.
 * Uses claude-haiku-4-5 with web_search tool to read the chips page.
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const PN_BASE = 'https://www.pokernews.com/tours/wsop/2026-wsop'

/**
 * Search all active WSOP events for a specific player's chip count.
 * Returns an array of results (player can be in multiple events).
 */
export async function fetchPlayerStatus(playerName, apiKey) {
  const prompt = `Search PokerNews for the current WSOP 2026 live chip count status of poker player "${playerName}".

Check these pages on pokernews.com/tours/wsop/2026-wsop/ for chip counts mentioning "${playerName}":
- Look at the current active events' /chips.htm pages
- Also check the main live updates page for any recent mentions

For each event where you find "${playerName}" listed (either in chip counts OR mentioned as busted/eliminated):

Return ONLY valid JSON array, no other text:
[
  {
    "found": true,
    "eventNum": 2,
    "eventName": "$5,000 8-Handed No-Limit Hold'em",
    "buyin": 5000,
    "chipsUrl": "https://www.pokernews.com/tours/wsop/2026-wsop/event-2-8-handed/chips.htm",
    "status": "active",
    "chips": 245000,
    "position": 12,
    "totalPlayers": 415,
    "playersLeft": 142,
    "day": "Day 2",
    "avgStack": 58000,
    "prizePool": "$1,909,000",
    "lastUpdate": "2026-05-27T14:30:00Z"
  }
]

If the player was eliminated/busted from an event, set "status": "busted" and include what info is available.
If the player is not found anywhere, return: [{"found": false, "playerName": "${playerName}"}]
If found but status unclear, set "status": "unknown".

Important: only return real data from the pages, do not invent chip counts.`

  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${resp.status}`)
  }

  const data = await resp.json()
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')

  // Extract JSON array
  const arrMatch = text.match(/\[[\s\S]*\]/)
  if (!arrMatch) throw new Error('No JSON found in response')

  return JSON.parse(arrMatch[0])
}

/**
 * Fetch event info from a specific chips page.
 */
export async function fetchEventChipsPage(eventSlug, playerName, apiKey) {
  const url = `${PN_BASE}/${eventSlug}/chips.htm`

  const prompt = `Fetch and read this URL: ${url}

Extract:
1. Event name and buy-in
2. Total entries, players left, prize pool, average stack
3. Current day (Day 1a, Day 2, etc.)
4. Whether "${playerName}" appears in the chip count list — if yes, their chip count and approximate rank/position

Return ONLY valid JSON:
{
  "eventName": "...",
  "buyin": 5000,
  "totalEntries": 415,
  "playersLeft": 142,
  "prizePool": "$1,909,000",
  "avgStack": 58000,
  "day": "Day 2",
  "playerFound": true,
  "playerChips": 245000,
  "playerRank": 12,
  "playerStatus": "active"
}`

  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!resp.ok) throw new Error(`API error ${resp.status}`)

  const data = await resp.json()
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found')
  return JSON.parse(jsonMatch[0])
}

/**
 * Format chip count for display (e.g. 1450000 → "1.45M")
 */
export function formatChips(chips) {
  if (!chips) return '—'
  if (chips >= 1_000_000) return (chips / 1_000_000).toFixed(2) + 'M'
  if (chips >= 1_000)     return (chips / 1_000).toFixed(0) + 'K'
  return chips.toString()
}

/**
 * Format buy-in for display
 */
export function formatBuyin(buyin) {
  if (!buyin) return '—'
  if (buyin >= 1000) return '$' + (buyin / 1000).toFixed(0) + 'K'
  return '$' + buyin
}
