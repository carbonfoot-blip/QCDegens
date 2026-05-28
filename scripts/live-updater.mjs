/**
 * QCDegens Live Updater
 *
 * Scrapes 25KFantasy (player scores) + PokerNews (live status/chips)
 * and pushes live-data.json to GitHub so the web app can read it.
 *
 * Setup:
 *   npm install playwright @octokit/rest
 *   npx playwright install chromium
 *
 * Usage:
 *   node scripts/live-updater.mjs                    # run once
 *   node scripts/live-updater.mjs --loop 5           # run every 5 minutes
 *
 * Required env vars (or pass as args):
 *   GITHUB_TOKEN=ghp_...   (needs repo write access)
 *   GITHUB_OWNER=carbonfoot-blip
 *   GITHUB_REPO=QCDegens
 *   GITHUB_BRANCH=main
 */

import { chromium } from 'playwright'
import { Octokit }  from '@octokit/rest'

// ── Config ────────────────────────────────────────────────────────────────────
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN  || ''
const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'carbonfoot-blip'
const GITHUB_REPO   = process.env.GITHUB_REPO   || 'QCDegens'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'
const FILE_PATH     = 'public/live-data.json'

const LOOP_MINUTES = (() => {
  const idx = process.argv.indexOf('--loop')
  return idx !== -1 ? parseInt(process.argv[idx + 1]) || 5 : null
})()

// Our 9 players — name exactly as it appears on 25KFantasy
const PLAYERS = [
  { name: 'Daniel Negreanu',  slug: 'daniel-negreanu',  pokernewsName: 'Daniel Negreanu',  isBonus: false },
  { name: 'Calvin Anderson',  slug: 'calvin-anderson',  pokernewsName: 'Calvin Anderson',  isBonus: false },
  { name: 'Yuval Bronshtein', slug: 'yuval-bronshtein', pokernewsName: 'Yuval Bronshtein', isBonus: false },
  { name: 'Matt Glantz',      slug: 'matt-glantz',      pokernewsName: 'Matt Glantz',      isBonus: false },
  { name: 'Ben Lamb',         slug: 'ben-lamb',         pokernewsName: 'Ben Lamb',         isBonus: false },
  { name: 'Shawn Buchanan',   slug: 'shawn-buchanan',   pokernewsName: 'Shawn Buchanan',   isBonus: false },
  { name: 'Ryan Leng',        slug: 'ryan-leng',        pokernewsName: 'Ryan Leng',        isBonus: false },
  { name: 'John Riordan',     slug: 'john-riordan',     pokernewsName: 'John Riordan',     isBonus: false },
  { name: 'Andrew Yeh',       slug: 'andrew-yeh',       pokernewsName: 'Andrew Yeh',       isBonus: true  },
]

const PN_BASE = 'https://www.pokernews.com/tours/wsop/2026-wsop'
const FANTASY_PLAYERS_URL = 'https://www.25kfantasy.com/players/'

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`) }

// ── 1. Scrape 25KFantasy player scores ───────────────────────────────────────
async function scrape25K(page) {
  log('Fetching 25KFantasy scores...')
  await page.goto(FANTASY_PLAYERS_URL, { waitUntil: 'networkidle', timeout: 20000 })

  const rows = await page.evaluate(() => {
    const result = []
    document.querySelectorAll('table tbody tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      const link  = tr.querySelector('a[href*="player-profile"]')
      if (!link || cells.length < 5) return
      const href = link.getAttribute('href') || ''
      const slug = href.split('/player-profile/')[1]?.replace(/\//g, '') || ''
      result.push({
        slug,
        name:   link.textContent.trim(),
        pts:    parseFloat(cells[3]) || 0,
        salary: parseFloat(cells[4]) || 0,
        cashes: parseInt(cells[5])   || 0,
        ppd:    parseFloat(cells[6]) || 0,
      })
    })
    return result
  })

  // Map to our players by slug AND by name (normalized)
  const scoreMap = {}
  const nameMap  = {}
  rows.forEach(r => {
    scoreMap[r.slug] = r
    // Also index by normalized name for fuzzy matching
    const normName = r.name.toLowerCase().replace(/[^a-z]/g, '')
    nameMap[normName] = r
  })

  log(`  Got ${rows.length} player scores from 25KFantasy`)
  return { scoreMap, nameMap }
}

// ── 2. Find active WSOP events on PokerNews ───────────────────────────────────
async function getActiveEvents(page) {
  log('Fetching active WSOP events from PokerNews...')
  try {
    await page.goto('https://www.pokernews.com/live-reporting/', { waitUntil: 'networkidle', timeout: 20000 })

    const events = await page.evaluate(() => {
      const result = []
      document.querySelectorAll('a[href*="/2026-wsop/"]').forEach(a => {
        const href = a.getAttribute('href') || ''
        const match = href.match(/\/2026-wsop\/(event-[\w-]+)\//)
        if (match && !result.find(e => e.slug === match[1])) {
          result.push({
            slug: match[1],
            name: a.textContent.trim() || match[1],
            url:  'https://www.pokernews.com' + href,
          })
        }
      })
      return result
    })

    log(`  Found ${events.length} WSOP 2026 event links`)
    return events.filter(e => e.slug && e.name)
  } catch (e) {
    log(`  Warning: could not fetch live events list: ${e.message}`)
    return []
  }
}

// ── 3. Scrape chips page for a single event ────────────────────────────────────
async function scrapeChipsPage(page, eventSlug) {
  const url = `${PN_BASE}/${eventSlug}/chips.htm`
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })

    return await page.evaluate((url) => {
      // Event info
      const getText = sel => document.querySelector(sel)?.textContent?.trim() || null

      const buyinEl = [...document.querySelectorAll('strong, b, .event-info td, td')]
        .find(el => el.textContent.match(/^\$[\d,]+$/))
      const buyin = buyinEl ? parseFloat(buyinEl.textContent.replace(/[$,]/g, '')) : null

      const playersLeftEl = [...document.querySelectorAll('strong, b, .players-left, h3, h4')]
        .find(el => /^\d+$/.test(el.textContent.trim()) && parseInt(el.textContent) < 10000)

      // Parse chip count table — PokerNews format:
      // The key insight: chips is ALWAYS the largest number in a row.
      // Progress delta (e.g. +15,000) is always smaller than chip stack (e.g. 535,000)
      // Player name link is inside an <a> tag
      const players = []
      document.querySelectorAll('table tbody tr').forEach(tr => {
        // Get player name from the <a> tag inside the row (most reliable)
        const nameLink = tr.querySelector('a')
        if (!nameLink) return
        const name = nameLink.textContent.trim()
        if (!name || name.length < 2 || name.length > 60) return

        // Get ALL numbers from the row, strip everything non-numeric
        const allNums = [...tr.querySelectorAll('td')].flatMap(td => {
          const text = td.textContent.replace(/[↑↓+,\n]/g, ' ').trim()
          const matches = text.match(/\b\d{4,}\b/g) || []
          return matches.map(m => parseInt(m))
        }).filter(n => n >= 1000 && n <= 9999999)

        if (allNums.length === 0) return

        // Chips = the LARGEST number in the row (stack > progress delta always)
        const chips = Math.max(...allNums)
        players.push({ name, chips })
      })

      // Also look for players mentioned in text
      const pageText = document.body.innerText

      return {
        url,
        buyin,
        playersLeft: playersLeftEl ? parseInt(playersLeftEl.textContent) : null,
        players,
        pageText: pageText.substring(0, 5000), // for name searching
      }
    }, url)
  } catch (e) {
    log(`  Warning: could not fetch ${url}: ${e.message}`)
    return null
  }
}

// ── 4. Find player in chips page data ─────────────────────────────────────────
function findPlayerInPage(pageData, playerName) {
  if (!pageData) return null

  // Try exact match in structured table data
  const firstName = playerName.split(' ')[0].toLowerCase()
  const lastName  = playerName.split(' ').slice(-1)[0].toLowerCase()

  // Check structured player list
  const found = pageData.players.find(p => {
    const pLower = p.name.toLowerCase()
    return pLower.includes(lastName) && pLower.includes(firstName)
  })
  if (found) return { chips: found.chips, foundInTable: true }

  // Check page text for mentions
  const text = pageData.pageText?.toLowerCase() || ''
  if (text.includes(lastName) && text.includes(firstName)) {
    // Try to find chip count near the name mention
    const nameIdx = text.indexOf(lastName)
    const snippet = text.substring(Math.max(0, nameIdx - 200), nameIdx + 300)
    const chipMatch = snippet.match(/[\d,]{4,}/)
    return {
      chips: chipMatch ? parseInt(chipMatch[0].replace(/,/g, '')) : null,
      foundInText: true,
      snippet: snippet.substring(0, 100),
    }
  }

  return null
}

// ── 5. Push to GitHub ─────────────────────────────────────────────────────────
async function pushToGitHub(data) {
  if (!GITHUB_TOKEN) {
    log('No GITHUB_TOKEN set — saving locally only')
    const { writeFileSync } = await import('fs')
    writeFileSync('public/live-data.json', JSON.stringify(data, null, 2))
    log('Saved to public/live-data.json')
    return
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN })
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64')

  // Get current file SHA (needed for update)
  let sha
  try {
    const { data: file } = await octokit.repos.getContent({
      owner: GITHUB_OWNER, repo: GITHUB_REPO, path: FILE_PATH, ref: GITHUB_BRANCH,
    })
    sha = file.sha
  } catch {}

  await octokit.repos.createOrUpdateFileContents({
    owner:   GITHUB_OWNER,
    repo:    GITHUB_REPO,
    path:    FILE_PATH,
    message: `live update ${new Date().toISOString()}`,
    content,
    sha,
    branch:  GITHUB_BRANCH,
  })
  log(`Pushed to GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}/${FILE_PATH}`)
}

// ── Main run ──────────────────────────────────────────────────────────────────
async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    // Step 1: Get 25KFantasy scores
    const scoreMapData = await scrape25K(page)

    // Step 2: Get list of active events
    const activeEvents = await getActiveEvents(page)

    // Step 3: Scrape chips pages for relevant events (limit to recent ones)
    const eventsToCheck = activeEvents.slice(0, 6) // check up to 6 events
    const chipsData = {}
    for (const event of eventsToCheck) {
      log(`  Checking chips for ${event.slug}...`)
      chipsData[event.slug] = await scrapeChipsPage(page, event.slug)
      await sleep(1000)
    }

    // Step 4: Build player status objects
    const players = PLAYERS.map(player => {
      // Get 25K score — try slug first, then name match
      const { scoreMap, nameMap } = scoreMapData
      const normName = player.name.toLowerCase().replace(/[^a-z]/g, '')
      const score = scoreMap[player.slug]
        || nameMap[normName]
        || nameMap[Object.keys(nameMap).find(k => k.includes(player.name.split(' ').slice(-1)[0].toLowerCase()))]
        || null

      // Find player in any chips page
      let liveStatus = null
      for (const [eventSlug, pageData] of Object.entries(chipsData)) {
        if (!pageData) continue
        const found = findPlayerInPage(pageData, player.pokernewsName)
        if (found) {
          const event = eventsToCheck.find(e => e.slug === eventSlug)
          liveStatus = {
            eventSlug,
            eventName: event?.name || eventSlug,
            eventUrl:  `${PN_BASE}/${eventSlug}/chips.htm`,
            chips:     found.chips,
            buyin:     pageData.buyin,
            playersLeft: pageData.playersLeft,
            foundInTable: found.foundInTable || false,
          }
          break
        }
      }

      return {
        name:      player.name,
        slug:      player.slug,
        isBonus:   player.isBonus,
        pts2026:   score?.pts ?? 0,
        salary:    score?.salary ?? null,
        cashes2026: score?.cashes ?? 0,
        liveStatus,
      }
    })

    const teamScore = players.reduce((sum, p) => sum + (p.pts2026 || 0), 0)

    const output = {
      updatedAt: new Date().toISOString(),
      teamScore,
      players,
      activeEvents: eventsToCheck.map(e => ({
        slug: e.slug,
        name: e.name,
        url:  `${PN_BASE}/${e.slug}/chips.htm`,
      })),
    }

    log(`Team score: ${teamScore} pts`)
    players.forEach(p => {
      const live = p.liveStatus ? `LIVE in ${p.liveStatus.eventName} (${p.liveStatus.chips ? p.liveStatus.chips.toLocaleString() + ' chips' : 'found'})` : 'not found live'
      log(`  ${p.name}: ${p.pts2026} pts — ${live}`)
    })

    await pushToGitHub(output)

  } finally {
    await browser.close()
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (LOOP_MINUTES) {
  log(`Starting loop — refreshing every ${LOOP_MINUTES} minutes`)
  while (true) {
    try { await run() } catch (e) { log(`Error: ${e.message}`) }
    log(`Next update in ${LOOP_MINUTES} minutes...`)
    await sleep(LOOP_MINUTES * 60 * 1000)
  }
} else {
  await run()
}
