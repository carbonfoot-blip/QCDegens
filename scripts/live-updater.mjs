/**
 * QCDegens Live Updater v8
 * - Tracks all 9 players across ALL WSOP events
 * - Keeps full history: every event each player appeared in
 * - Detects live vs eliminated status per event
 *
 * Usage:
 *   node scripts/live-updater.mjs                 # once
 *   node scripts/live-updater.mjs --loop 5        # every 5 min
 */

import { chromium } from 'playwright'
import { Octokit }  from '@octokit/rest'

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN  || ''
const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'carbonfoot-blip'
const GITHUB_REPO   = process.env.GITHUB_REPO   || 'QCDegens'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'
const FILE_PATH     = 'public/live-data.json'

const LOOP_MINUTES = (() => {
  const idx = process.argv.indexOf('--loop')
  return idx !== -1 ? parseInt(process.argv[idx + 1]) || 5 : null
})()

const PLAYERS = [
  { name: 'Daniel Negreanu',  slug: 'daniel-negreanu',  isBonus: false },
  { name: 'Calvin Anderson',  slug: 'calvin-anderson',  isBonus: false },
  { name: 'Yuval Bronshtein', slug: 'yuval-bronshtein', isBonus: false },
  { name: 'Matt Glantz',      slug: 'matt-glantz',      isBonus: false },
  { name: 'Ben Lamb',         slug: 'ben-lamb',         isBonus: false },
  { name: 'Shawn Buchanan',   slug: 'shawn-buchanan',   isBonus: false },
  { name: 'Ryan Leng',        slug: 'ryan-leng',        isBonus: false },
  { name: 'John Riordan',     slug: 'john-riordan',     isBonus: false },
  { name: 'Andrew Yeh',       slug: 'andrew-yeh',       isBonus: true  },
]

const PN_BASE        = 'https://www.pokernews.com/tours/wsop/2026-wsop'
const FANTASY_URL    = 'https://www.25kfantasy.com/players/'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function log(msg)  { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`) }

// ── Scrape 25KFantasy scores ──────────────────────────────────────────────────
async function scrape25K(page) {
  log('Fetching 25KFantasy scores...')
  await page.goto(FANTASY_URL, { waitUntil: 'networkidle', timeout: 20000 })
  const rows = await page.evaluate(() => {
    const result = []
    document.querySelectorAll('table tbody tr').forEach(tr => {
      const link = tr.querySelector('a[href*="player-profile"]')
      if (!link) return
      const href = link.getAttribute('href') || ''
      const slug = href.split('/player-profile/')[1]?.replace(/\//g, '') || ''
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      if (cells.length < 5) return
      result.push({
        slug,
        name:   link.textContent.trim(),
        pts:    parseFloat(cells[3]) || 0,
        salary: parseFloat(cells[4]) || 0,
        cashes: parseInt(cells[5])   || 0,
      })
    })
    return result
  })
  const scoreMap = {}, nameMap = {}
  rows.forEach(r => {
    scoreMap[r.slug] = r
    nameMap[r.name.toLowerCase().replace(/[^a-z]/g, '')] = r
  })
  log(`  Got ${rows.length} scores from 25KFantasy`)
  return { scoreMap, nameMap }
}

// ── Get all active WSOP event slugs from PokerNews ───────────────────────────
async function getActiveEvents(page) {
  log('Fetching active WSOP events...')
  try {
    await page.goto('https://www.pokernews.com/live-reporting/', { waitUntil: 'networkidle', timeout: 20000 })
    const events = await page.evaluate(() => {
      const seen = new Set(), result = []
      document.querySelectorAll('a[href*="/2026-wsop/event-"]').forEach(a => {
        const href = a.getAttribute('href') || ''
        const m = href.match(/\/2026-wsop\/(event-[\w-]+)\//)
        if (m && !seen.has(m[1])) {
          seen.add(m[1])
          const name = a.closest('[class*="event"], li, div')?.querySelector('h2,h3,strong,span')?.textContent?.trim()
                    || a.textContent.trim()
          result.push({ slug: m[1], name, url: `${PN_BASE}/${m[1]}/chips.htm` })
        }
      })
      return result
    })
    log(`  Found ${events.length} events`)
    return events
  } catch(e) {
    log(`  Warning: ${e.message}`)
    return []
  }
}

// ── Scrape a single chips page ────────────────────────────────────────────────
async function scrapeChipsPage(page, eventSlug) {
  const url = `${PN_BASE}/${eventSlug}/chips.htm`
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
    try { await page.waitForSelector('table tbody tr', { timeout: 5000 }) } catch {}
    await page.waitForTimeout(1500)

    return await page.evaluate((url) => {
      const bodyText = document.body.innerText

      // Buy-in from title/h1
      const titleText = (document.title + ' ' + (document.querySelector('h1')?.textContent || ''))
      const buyinM = titleText.match(/\$([\d,]+)/)
      const buyin  = buyinM ? parseFloat(buyinM[1].replace(/,/g,'')) : null

      // Players left
      const plM = bodyText.match(/Players Left[^\d]{0,15}([\d,]+)/i)
      const playersLeft = plM ? parseInt(plM[1].replace(/,/g,'')) : null

      // Total entries
      const entM = bodyText.match(/Total Entries[^\d]{0,10}([\d,]+)/i)
              || bodyText.match(/Entries[^\d]{0,5}([\d,]+)/i)
      const totalEntries = entM ? parseInt(entM[1].replace(/,/g,'')) : null

      // Prize pool
      const prizeM = bodyText.match(/Prize Pool[^\$]*\$([\d,]+)/i)
      const prizePool = prizeM ? prizeM[1] : null

      // Current day
      const dayM = bodyText.match(/Day\s*:?\s*(\w+)/i)
      const currentDay = dayM ? dayM[1] : null

      // Chip counts table — extract all players with rank + chips
      const players = []
      document.querySelectorAll('table tbody tr').forEach(tr => {
        const link = tr.querySelector('a')
        if (!link) return
        const name = link.textContent.trim()
        if (!name || name.length < 2 || name.length > 60) return

        // Rank: first short numeric value in first 3 cells
        const cells = [...tr.querySelectorAll('td')]
        let rank = null
        for (let i = 0; i < Math.min(3, cells.length); i++) {
          const n = parseInt(cells[i].textContent.replace(/[^\d]/g,''))
          if (!isNaN(n) && n > 0 && n < 10000 && cells[i].textContent.replace(/[^\d]/g,'').length <= 4) {
            rank = n; break
          }
        }

        // Chips: join child nodes with space to avoid concatenation, take largest
        const allNums = cells.flatMap(td => {
          const parts = []
          td.childNodes.forEach(n => parts.push(n.textContent || ''))
          const text = parts.join(' ').replace(/[\u2191\u2193+\n\r]/g, ' ')
          const matches = text.match(/\d{1,3}(?:,\d{3})+|\d{5,}/g) || []
          return matches.map(m => parseInt(m.replace(/,/g,'')))
        }).filter(n => n >= 5000 && n <= 9999999)

        if (allNums.length === 0) return
        const chips = Math.max(...allNums)
        players.push({ name, rank, chips })
      })

      return { url, buyin, playersLeft, totalEntries, prizePool, currentDay, players }
    }, url)
  } catch(e) {
    log(`  Warning: ${eventSlug}: ${e.message}`)
    return null
  }
}

// ── Find a player in chips page data ─────────────────────────────────────────
function findPlayer(pageData, playerName) {
  if (!pageData?.players?.length) return null
  const first = playerName.split(' ')[0].toLowerCase()
  const last  = playerName.split(' ').slice(-1)[0].toLowerCase()
  return pageData.players.find(p => {
    const n = p.name.toLowerCase()
    return n.includes(last) && (n.includes(first) || first.length <= 3)
  }) || null
}

// ── Push to GitHub ────────────────────────────────────────────────────────────
async function pushToGitHub(data) {
  const json = JSON.stringify(data, null, 2)
  if (!GITHUB_TOKEN) {
    const { writeFileSync } = await import('fs')
    writeFileSync('public/live-data.json', json)
    log('Saved to public/live-data.json (no GitHub token)')
    return
  }
  const octokit = new Octokit({ auth: GITHUB_TOKEN })
  const content = Buffer.from(json).toString('base64')
  let sha
  try {
    const { data: f } = await octokit.repos.getContent({ owner: GITHUB_OWNER, repo: GITHUB_REPO, path: FILE_PATH, ref: GITHUB_BRANCH })
    sha = f.sha
  } catch {}
  await octokit.repos.createOrUpdateFileContents({ owner: GITHUB_OWNER, repo: GITHUB_REPO, path: FILE_PATH, message: `live update ${new Date().toISOString()}`, content, sha, branch: GITHUB_BRANCH })
  log(`Pushed to GitHub`)
}

// ── Main run ──────────────────────────────────────────────────────────────────
async function run() {
  const browser = await chromium.launch({ headless: true })
  const ctx  = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' })
  const page = await ctx.newPage()

  try {
    // 1. Scores from 25KFantasy
    const { scoreMap, nameMap } = await scrape25K(page)

    // 2. Active events
    const events = await getActiveEvents(page)
    const eventsToCheck = events.slice(0, 10)

    // 3. Scrape chips pages
    const pagesData = {}
    for (const ev of eventsToCheck) {
      log(`  Checking ${ev.slug}...`)
      pagesData[ev.slug] = await scrapeChipsPage(page, ev.slug)
      await sleep(800)
    }

    // 4. Build player data
    const players = PLAYERS.map(player => {
      // Score
      const normName = player.name.toLowerCase().replace(/[^a-z]/g,'')
      const score = scoreMap[player.slug]
                 || nameMap[normName]
                 || nameMap[Object.keys(nameMap).find(k => k.includes(player.name.split(' ').slice(-1)[0].toLowerCase())) || '']
                 || null

      // Build event history across all checked events
      const eventHistory = []
      let liveStatus = null

      for (const ev of eventsToCheck) {
        const pageData = pagesData[ev.slug]
        if (!pageData) continue

        const found = findPlayer(pageData, player.name)

        if (found) {
          // Player is currently in chip counts = ACTIVE in this event
          const entry = {
            eventSlug:   ev.slug,
            eventName:   ev.name || ev.slug,
            eventUrl:    ev.url,
            buyin:       pageData.buyin,
            totalEntries: pageData.totalEntries,
            prizePool:   pageData.prizePool,
            playersLeft: pageData.playersLeft,
            currentDay:  pageData.currentDay,
            status:      'active',
            rank:        found.rank,
            chips:       found.chips,
            updatedAt:   new Date().toISOString(),
          }
          eventHistory.push(entry)
          // Most recent active event = liveStatus
          if (!liveStatus) liveStatus = entry
        }
        // Note: if not found in chip table, they're not currently tracked in this event
        // (could be eliminated or not entered — we only track appearances)
      }

      // Merge with previous history from existing live-data.json if available
      // (so eliminated players stay in history)

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

    const teamScore = players.reduce((s, p) => s + (p.pts2026 || 0), 0)

    // 5. Merge with previous data to preserve eliminated player history
    let prevData = null
    try {
      const { readFileSync, existsSync } = await import('fs')
      if (existsSync('public/live-data.json')) {
        prevData = JSON.parse(readFileSync('public/live-data.json', 'utf-8'))
      }
    } catch {}

    if (prevData) {
      players.forEach(p => {
        const prev = prevData.players?.find(pp => pp.slug === p.slug)
        if (!prev) return
        // Merge history: keep all previous entries, update/add current ones
        const prevHistory = prev.eventHistory || []
        const currentSlugs = new Set(p.eventHistory.map(e => e.eventSlug))
        // Add old history entries that are no longer active (eliminated)
        prevHistory.forEach(old => {
          if (!currentSlugs.has(old.eventSlug)) {
            // Mark as eliminated if they were active before but not now
            p.eventHistory.push({
              ...old,
              status: old.status === 'active' ? 'eliminated' : old.status,
            })
          }
        })
        // Sort by event slug (event-1, event-2, etc.)
        p.eventHistory.sort((a, b) => a.eventSlug.localeCompare(b.eventSlug))
      })
    }

    const output = {
      updatedAt: new Date().toISOString(),
      teamScore,
      players,
      activeEvents: eventsToCheck.map(e => ({
        slug: e.slug,
        name: e.name,
        url:  e.url,
        playersLeft: pagesData[e.slug]?.playersLeft,
        totalEntries: pagesData[e.slug]?.totalEntries,
        buyin: pagesData[e.slug]?.buyin,
      })),
    }

    log(`\nTeam score: ${teamScore} pts`)
    players.forEach(p => {
      const live = p.liveStatus ? `LIVE in ${p.liveStatus.eventName} — #${p.liveStatus.rank ?? '?'} (${p.liveStatus.chips?.toLocaleString() ?? '?'} chips)` : `not live (${p.eventHistory.length} event entries)`
      log(`  ${p.name}: ${p.pts2026} pts — ${live}`)
    })

    await pushToGitHub(output)

  } finally {
    await browser.close()
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────
if (LOOP_MINUTES) {
  log(`Loop mode: every ${LOOP_MINUTES} min`)
  while (true) {
    try { await run() } catch(e) { log(`Error: ${e.message}`) }
    log(`Next in ${LOOP_MINUTES} min...`)
    await sleep(LOOP_MINUTES * 60 * 1000)
  }
} else {
  await run()
}
