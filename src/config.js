// QCDegens team roster for ODB Fantasy 2026
export const TEAM_NAME = 'QCDegens'

export const PLAYERS = [
  {
    name: 'Daniel Negreanu',
    slug: 'daniel-negreanu',
    pokernewsName: 'Daniel Negreanu',
    cost: null,       // will be set after draft
    pts2025: 269,
    rank: 1,
    isBonus: false,
  },
  {
    name: 'Calvin Anderson',
    slug: 'calvin-anderson',
    pokernewsName: 'Calvin Anderson',
    cost: null,
    pts2025: 104,
    rank: 12,
    isBonus: false,
  },
  {
    name: 'Yuval Bronshtein',
    slug: 'yuval-bronshtein',
    pokernewsName: 'Yuval Bronshtein',
    cost: null,
    pts2025: 16,
    rank: 29,
    isBonus: false,
  },
  {
    name: 'Matt Glantz',
    slug: 'matt-glantz',
    pokernewsName: 'Matt Glantz',
    cost: null,
    pts2025: 133,
    rank: 24,
    isBonus: false,
  },
  {
    name: 'Ben Lamb',
    slug: 'ben-lamb',
    pokernewsName: 'Ben Lamb',
    cost: null,
    pts2025: 228,
    rank: 50,
    isBonus: false,
  },
  {
    name: 'Shawn Buchanan',
    slug: 'shawn-buchanan',
    pokernewsName: 'Shawn Buchanan',
    cost: null,
    pts2025: 14,
    rank: 77,
    isBonus: false,
  },
  {
    name: 'Ryan Leng',
    slug: 'ryan-leng',
    pokernewsName: 'Ryan Leng',
    cost: null,
    pts2025: 139,
    rank: 87,
    isBonus: false,
  },
  {
    name: 'John Riordan',
    slug: 'john-riordan',
    pokernewsName: 'John Riordan',
    cost: null,
    pts2025: 48,
    rank: 90,
    isBonus: false,
  },
  {
    name: 'Andrew Yeh',
    slug: 'andrew-yeh',
    pokernewsName: 'Andrew Yeh',
    cost: 0,
    pts2025: 8,
    rank: 326,
    isBonus: true,
  },
]

// 25KFantasy scoring multipliers by buy-in
export const BUY_IN_MULTIPLIERS = {
  'PPC':       3.0,   // $50,000 Poker Players Championship
  'MainEvent': 3.0,   // Main Event $10,000+
  'HighRoller': 2.0,  // $10,000–$24,999
  'MidStakes': 1.5,   // $5,000–$9,999
  'Standard':  1.0,   // $1,500–$4,999
  'Low':       0.5,   // Under $1,500
}

// PokerNews WSOP 2026 base URL
export const PN_BASE = 'https://www.pokernews.com/tours/wsop/2026-wsop'

// WSOP 2026 Schedule (key events) — event slug for PokerNews URLs
// Format: { num, name, buyin, slug, multiplier, startDate }
export const WSOP_SCHEDULE = [
  { num: 1,  slug: 'event-1-mini-mystery-millions',      name: '$550 Mini Mystery Millions',       buyin: 550,    multiplier: 0.5 },
  { num: 2,  slug: 'event-2-8-handed',                   name: '$5,000 8-Handed NLH',              buyin: 5000,   multiplier: 1.5 },
  { num: 3,  slug: 'event-3-industry-employees',         name: '$500 Industry Employees NLH',      buyin: 500,    multiplier: 0.5 },
  { num: 4,  slug: 'event-4-omaha-hi-lo-8-or-better',   name: '$1,500 Omaha Hi-Lo 8 or Better',   buyin: 1500,   multiplier: 1.0 },
]
