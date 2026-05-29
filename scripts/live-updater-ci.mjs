/**
 * QCDegens Live Updater — CI version
 * Calls the Render.com scraper server to get live data
 * then pushes live-data.json to GitHub.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'

const FILE_PATH    = 'public/live-data.json'
const SCRAPER_URL  = process.env.SCRAPER_URL || ''

function log(msg) { console.log(`[${new Date().toLocaleTimeString('en-US')}] ${msg}`) }

async function run() {
  if (!SCRAPER_URL) {
    console.error('Missing SCRAPER_URL env var')
    process.exit(1)
  }

  // Load previous data for completedEvents
  let prevData = null
  try {
    if (existsSync(FILE_PATH)) prevData = JSON.parse(readFileSync(FILE_PATH, 'utf-8'))
  } catch {}

  const completedEvents = prevData?.completedEvents || []
  log(`Calling scraper: ${SCRAPER_URL}`)
  log(`Skipping ${completedEvents.length} completed events`)

  // Call Render scraper
  const baseUrl = SCRAPER_URL.replace(/\/$/, '') // remove trailing slash
  const params = completedEvents.length ? `?completed=${completedEvents.join(',')}` : ''
  const res = await fetch(`${baseUrl}/scrape${params}`, {
    signal: AbortSignal.timeout(300000) // 5 min timeout
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Scraper returned ${res.status}: ${text.substring(0, 200)}`)
  }

  const json = await res.json()
  if (json.status !== 'ok') {
    throw new Error(`Scraper error: ${json.message}`)
  }

  const data = json.data

  // Merge with previous history (keep eliminated player history)
  if (prevData?.players) {
    data.players.forEach(p => {
      const prev = prevData.players.find(pp => pp.slug === p.slug)
      if (!prev) return
      const currentSlugs = new Set(p.eventHistory.map(e => e.eventSlug))
      ;(prev.eventHistory || []).forEach(old => {
        if (!currentSlugs.has(old.eventSlug)) {
          p.eventHistory.push({ ...old, status: old.status === 'active' ? 'eliminated' : old.status })
        }
      })
      p.eventHistory.sort((a, b) => a.eventSlug.localeCompare(b.eventSlug))
    })
  }

  log(`Team score: ${data.teamScore} pts`)
  data.players.forEach(p => {
    const live = p.liveStatus
      ? `LIVE in ${p.liveStatus.eventName} — #${p.liveStatus.rank ?? '?'} (${p.liveStatus.chips?.toLocaleString() ?? '?'} chips)`
      : 'not live'
    log(`  ${p.name}: ${p.pts2026} pts — ${live}`)
  })

  writeFileSync(FILE_PATH, JSON.stringify(data, null, 2))
  log(`Saved ${FILE_PATH}`)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
