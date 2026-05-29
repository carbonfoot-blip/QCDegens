/**
 * QCDegens Live Updater — CI version (no Playwright)
 * Runs on GitHub Actions every 5 minutes.
 * Uses fetch() directly — no CORS issues server-side.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { JSDOM } from 'jsdom'

const PN_BASE     = 'https://www.pokernews.com/tours/wsop/2026-wsop'
const FANTASY_URL = 'https://www.25kfantasy.com/players/'
const FILE_PATH   = 'public/live-data.json'

const PLAYERS = [
  { name: 'Daniel Negreanu',  slug: 'daniel-negreanu',  isBonus: false, altNames: [] },
  { name: 'Calvin Anderson',  slug: 'calvin-anderson',  isBonus: false, altNames: [] },
  { name: 'Yuval Bronshtein', slug: 'yuval-bronshtein', isBonus: false, altNames: [] },
  { name: 'Matt Glantz',      slug: 'matt-glantz',      isBonus: false, altNames: ['matthew glantz'] },
  { name: 'Ben Lamb',         slug: 'ben-lamb',         isBonus: false, altNames: [] },
  { name: 'Shawn Buchanan',   slug: 'shawn-buchanan',   isBonus: false, altNames: [] },
  { name: 'Ryan Leng',        slug: 'ryan-leng',        isBonus: false, altNames: [] },
  { name: 'John Riordan',     slug: 'john-riordan',     isBonus: false, altNames: [] },
  { name: 'Andrew Yeh',       slug: 'andrew-yeh',       isBonus: true,  altNames: [] },
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

function log(msg) { console.log(`[${new Date().toLocaleTimeString('en-US')}] ${msg}`) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Cloudflare Worker proxy URL — set this env var in GitHub Actions secrets
// If not set, falls back to direct fetch (may be blocked by PokerNews)
const CF_PROXY = process.env.CF_PROXY_URL || ''

// ── Fetch HTML via Cloudflare Worker proxy ────────────────────────────────────
async function fetchHtml(url, retries = 2) {
  const fetchUrl = CF_PROXY
    ? `${CF_PROXY}?url=${encodeURIComponent(url)}`
    : url

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(fetchUrl, {
        headers: CF_PROXY ? {} : HEADERS,
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      if (html.length < 1000) throw new Error(`Response too short (${html.length} chars)`)
      return html
    } catch(e) {
      if (i === retries) throw e
      await sleep(2000)
    }
  }
}

// ── Parse chip count table from HTML ─────────────────────────────────────────
function parseChipsPage(html, url) {
  const dom  = new JSDOM(html)
  const doc  = dom.window.document
  const body = doc.body.textContent || ''

  // Buy-in from title/h1
  const titleText = doc.title + ' ' + (doc.querySelector('h1')?.textContent || '')
  const buyinM = titleText.replace(/,/g, '').match(/\$(\d+)/)
  const buyin  = buyinM ? parseFloat(buyinM[1]) : null

  // Players left
  const plM = body.match(/Players Left[^\d]{0,15}([\d,]+)/i)
  const playersLeft = plM ? parseInt(plM[1].replace(/,/g,'')) : null

  // Total entries
  const entM = body.match(/Total Entries[^\d]{0,10}([\d,]+)/i)
           || body.match(/Entries[^\d]{0,5}([\d,]+)/i)
  const totalEntries = entM ? parseInt(entM[1].replace(/,/g,'')) : null

  // Parse chip count table
  const players = []
  doc.querySelectorAll('table tbody tr').forEach(tr => {
    const link = tr.querySelector('a')
    if (!link) return
    const name = link.textContent.trim()
    if (!name || name.length < 2 || name.length > 60) return

    // Rank from first short numeric cell
    const cells = [...tr.querySelectorAll('td')]
    let rank = null
    for (let i = 0; i < Math.min(3, cells.length); i++) {
      const n = parseInt(cells[i].textContent.replace(/[^\d]/g,''))
      if (!isNaN(n) && n > 0 && n < 10000 && cells[i].textContent.replace(/[^\d]/g,'').length <= 4) {
        rank = n; break
      }
    }

    // Chips — join child nodes with space to prevent "535,00015,000" concatenation
    const allNums = cells.flatMap(td => {
      const parts = [...td.childNodes].map(n => n.textContent || '')
      const text  = parts.join(' ').replace(/[\u2191\u2193+\n\r]/g, ' ')
      const matches = text.match(/\d{1,3}(?:,\d{3})+|\d{5,}/g) || []
      return matches.map(m => parseInt(m.replace(/,/g,'')))
    }).filter(n => n >= 5000 && n <= 9999999)

    if (!allNums.length) return
    players.push({ name, rank, chips: Math.max(...allNums) })
  })

  return { url, buyin, playersLeft, totalEntries, players }
}

// ── Find a player in page data ─────────────────────────────────────────────────
function findPlayer(pageData, playerName, altNames = []) {
  if (!pageData?.players?.length) return null
  const allNames = [playerName, ...altNames].map(n => n.toLowerCase())
  return pageData.players.find(p => {
    const pLower = p.name.toLowerCase().trim()
    return allNames.some(name => {
      const parts = name.trim().split(/\s+/)
      const first = parts[0]
      const last  = parts[parts.length - 1]
      // Exact word boundary match for last name — "lamb" won't match "lambe"
      const lastRegex = new RegExp('\\b' + last + '\\b', 'i')
      return lastRegex.test(pLower) && (pLower.includes(first) || first.length <= 3)
    })
  }) || null
}

// ── Get active WSOP event slugs from PokerNews ────────────────────────────────
async function getActiveEvents() {
  log('Fetching active WSOP events...')
  try {
    const html = await fetchHtml('https://www.pokernews.com/live-reporting/')
    const dom  = new JSDOM(html)
    const seen = new Set(), result = []
    dom.window.document.querySelectorAll('a[href*="/2026-wsop/event-"]').forEach(a => {
      const href = a.getAttribute('href') || ''
      const m    = href.match(/\/2026-wsop\/(event-[\w-]+)\//)
      if (m && !seen.has(m[1])) {
        seen.add(m[1])
        result.push({
          slug: m[1],
          name: a.textContent.trim() || m[1],
          url:  `${PN_BASE}/${m[1]}/chips.htm`,
        })
      }
    })
    log(`  Found ${result.length} events`)
    return result
  } catch(e) {
    log(`  Warning: ${e.message}`)
    return []
  }
}

// ── Scrape 25KFantasy scores ──────────────────────────────────────────────────
async function scrape25K() {
  log('Fetching 25KFantasy scores...')
  try {
    const html = await fetchHtml(FANTASY_URL)
    const dom  = new JSDOM(html)
    const scoreMap = {}, nameMap = {}
    dom.window.document.querySelectorAll('table tbody tr').forEach(tr => {
      const link = tr.querySelector('a[href*="player-profile"]')
      if (!link) return
      const href = link.getAttribute('href') || ''
      const slug = href.split('/player-profile/')[1]?.replace(/\//g,'') || ''
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      if (cells.length < 5) return
      const entry = { slug, name: link.textContent.trim(), pts: parseFloat(cells[3])||0, salary: parseFloat(cells[4])||0, cashes: parseInt(cells[5])||0 }
      scoreMap[slug] = entry
      nameMap[entry.name.toLowerCase().replace(/[^a-z]/g,'')] = entry
    })
    log(`  Got ${Object.keys(scoreMap).length} scores`)
    return { scoreMap, nameMap }
  } catch(e) {
    log(`  Warning: ${e.message}`)
    return { scoreMap: {}, nameMap: {} }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  // Load previous data
  let prevData = null
  try {
    if (existsSync(FILE_PATH)) prevData = JSON.parse(readFileSync(FILE_PATH, 'utf-8'))
  } catch {}

  const completedEvents = new Set(prevData?.completedEvents || [])
  log(`  Skipping ${completedEvents.size} completed events`)

  // 1. Scores
  const { scoreMap, nameMap } = await scrape25K()

  // 2. Active events
  const events = await getActiveEvents()
  const eventsToCheck = events.slice(0, 15).filter(ev => !completedEvents.has(ev.slug))

  // 3. Scrape chip pages
  const pagesData = {}
  for (const ev of eventsToCheck) {
    log(`  Checking ${ev.slug}...`)
    try {
      const html = await fetchHtml(ev.url)
      pagesData[ev.slug] = parseChipsPage(html, ev.url)
      const pd = pagesData[ev.slug]
      log(`    → ${pd.players.length} players, ${pd.playersLeft ?? '?'} left, $${pd.buyin ?? '?'}`)
      PLAYERS.forEach(p => {
        const found = findPlayer(pd, p.name, p.altNames || [])
        if (found) log(`    ✓ FOUND ${p.name}: #${found.rank} (${found.chips?.toLocaleString()} chips)`)
      })
    } catch(e) {
      log(`    → failed: ${e.message}`)
    }
    await sleep(600)
  }

  // 4. Build player data
  const players = PLAYERS.map(player => {
    const normName = player.name.toLowerCase().replace(/[^a-z]/g,'')
    const lastName = player.name.split(' ').slice(-1)[0].toLowerCase()
    const score = scoreMap[player.slug]
               || nameMap[normName]
               || nameMap[Object.keys(nameMap).find(k => k.includes(lastName)) || '']
               || (player.isBonus ? { pts: 0, salary: 0, cashes: 0 } : null)

    const eventHistory = []
    let liveStatus = null

    for (const ev of eventsToCheck) {
      const pageData = pagesData[ev.slug]
      if (!pageData) continue
      const found = findPlayer(pageData, player.name, player.altNames || [])
      if (!found) continue

      const entry = {
        eventSlug:    ev.slug,
        eventName:    ev.name || ev.slug,
        eventUrl:     ev.url,
        buyin:        pageData.buyin,
        totalEntries: pageData.totalEntries,
        playersLeft:  pageData.playersLeft,
        status:       'active',
        rank:         found.rank,
        chips:        found.chips,
        updatedAt:    new Date().toISOString(),
      }
      eventHistory.push(entry)
      if (!liveStatus) liveStatus = entry
    }

    // Merge with previous history
    if (prevData) {
      const prev = prevData.players?.find(pp => pp.slug === player.slug)
      if (prev) {
        const currentSlugs = new Set(eventHistory.map(e => e.eventSlug))
        ;(prev.eventHistory || []).forEach(old => {
          if (!currentSlugs.has(old.eventSlug)) {
            eventHistory.push({ ...old, status: old.status === 'active' ? 'eliminated' : old.status })
          }
        })
        eventHistory.sort((a, b) => a.eventSlug.localeCompare(b.eventSlug))
      }
    }

    return {
      name:       player.name,
      slug:       player.slug,
      isBonus:    player.isBonus,
      pts2026:    score?.pts    ?? 0,
      salary:     score?.salary ?? null,
      cashes2026: score?.cashes ?? 0,
      liveStatus,
      eventHistory,
    }
  })

  // 5. Detect completed events
  const newlyCompleted = []
  for (const ev of eventsToCheck) {
    const pd = pagesData[ev.slug]
    if (pd?.playersLeft != null && pd.playersLeft <= 1 && !completedEvents.has(ev.slug)) {
      completedEvents.add(ev.slug)
      newlyCompleted.push(ev.slug)
      log(`  ✓ Completed: ${ev.slug}`)
    }
  }

  const teamScore = players.reduce((s, p) => s + (p.pts2026 || 0), 0)

  log(`\nTeam score: ${teamScore} pts`)
  players.forEach(p => {
    const live = p.liveStatus
      ? `LIVE in ${p.liveStatus.eventName} — #${p.liveStatus.rank ?? '?'} (${p.liveStatus.chips?.toLocaleString() ?? '?'} chips)`
      : `not live`
    log(`  ${p.name}: ${p.pts2026} pts — ${live}`)
  })

  const output = {
    updatedAt: new Date().toISOString(),
    teamScore,
    completedEvents: [...new Set([...(prevData?.completedEvents || []), ...newlyCompleted])],
    players,
    activeEvents: [
      ...eventsToCheck.map(e => ({
        slug: e.slug,
        name: e.name,
        url:  e.url,
        playersLeft:  pagesData[e.slug]?.playersLeft,
        totalEntries: pagesData[e.slug]?.totalEntries,
        buyin:        pagesData[e.slug]?.buyin,
        completed:    completedEvents.has(e.slug),
      })),
      ...(prevData?.activeEvents || [])
        .filter(e => completedEvents.has(e.slug) && !eventsToCheck.find(ev => ev.slug === e.slug))
        .map(e => ({ ...e, completed: true })),
    ],
  }

  writeFileSync(FILE_PATH, JSON.stringify(output, null, 2))
  log(`Saved ${FILE_PATH}`)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
