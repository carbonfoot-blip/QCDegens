import { useState, useEffect, useCallback } from 'react'

// ── Format helpers ─────────────────────────────────────────────────────────
function fmtChips(n) {
  if (!n) return '?'
  if (n >= 1_000_000) return (n/1_000_000).toFixed(2)+'M'
  if (n >= 1_000)     return (n/1_000).toFixed(0)+'K'
  return n.toString()
}
function fmtBuyin(n) {
  if (!n) return '?'
  if (n >= 1000) return '$'+(n/1000).toFixed(0)+'K'
  return '$'+n
}
function timeAgo(iso) {
  if (!iso) return '—'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`
  return `${Math.floor(secs/3600)}h ago`
}

// ── Player card ────────────────────────────────────────────────────────────
function PlayerCard({ player }) {
  const live = player.liveStatus
  const isLive = !!live

  return (
    <div style={{
      background: isLive ? 'rgba(45,189,110,0.05)' : 'var(--bg2)',
      border: isLive ? '1px solid rgba(45,189,110,0.3)' : '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Gold accent top bar for live players */}
      {isLive && (
        <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--green)' }}/>
      )}

      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:'var(--font-display)', fontSize:20, letterSpacing:'0.04em', color:'var(--text)' }}>
              {player.name}
            </span>
            {player.isBonus && (
              <span style={{ fontSize:10, padding:'2px 6px', background:'rgba(212,160,23,0.15)', color:'var(--gold)', borderRadius:4, border:'1px solid rgba(212,160,23,0.3)', fontWeight:500 }}>
                ★ BONUS
              </span>
            )}
          </div>
          {player.salary && (
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, fontFamily:'var(--font-mono)' }}>
              salary {fmtBuyin(player.salary)} · {player.cashes2026 || 0} cashes
            </div>
          )}
        </div>

        {/* Score */}
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:32, lineHeight:1, color: player.pts2026 > 0 ? 'var(--gold)' : 'var(--text3)' }}>
            {player.pts2026 || 0}
          </div>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.1em' }}>pts</div>
        </div>
      </div>

      {/* Live event info */}
      {isLive ? (
        <div style={{ background:'rgba(45,189,110,0.08)', border:'1px solid rgba(45,189,110,0.2)', borderRadius:6, padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', display:'inline-block', boxShadow:'0 0 6px var(--green)', animation:'pulse 1.5s infinite' }}/>
              <span style={{ fontSize:12, fontWeight:500, color:'var(--green)' }}>LIVE</span>
            </div>
            <a href={live.eventUrl} target="_blank" rel="noreferrer"
               style={{ fontSize:11, color:'var(--gold)', textDecoration:'none', display:'flex', alignItems:'center', gap:3 }}>
              PokerNews ↗
            </a>
          </div>

          <div style={{ fontSize:13, color:'var(--text)', fontWeight:500, lineHeight:1.3 }}>
            {live.eventName}
          </div>

          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <StatChip label="Buy-in"   value={fmtBuyin(live.buyin)} />
            <StatChip label="Players"  value={live.playersLeft != null ? `${live.playersLeft} left` : '?'} />
            {live.chips && <StatChip label="Chips" value={fmtChips(live.chips)} gold />}
          </div>
        </div>
      ) : (
        <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>
          Not currently tracked in any live event
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value, gold }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
      <span style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</span>
      <span style={{ fontSize:13, color: gold ? 'var(--gold)' : 'var(--text)', fontFamily:'var(--font-mono)', fontWeight: gold ? 500 : 400 }}>{value}</span>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastFetch, setLastFetch] = useState(null)
  const [countdown, setCountdown] = useState(120)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Bust cache with timestamp
      const res = await fetch(`./live-data.json?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastFetch(new Date())
      setCountdown(120)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => c <= 1 ? 120 : c - 1), 1000)
    return () => clearInterval(tick)
  }, [])

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchData, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Count live players
  const livePlayers = data?.players?.filter(p => p.liveStatus).length ?? 0

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', fontFamily:'var(--font-body)' }}>

      {/* Header */}
      <div style={{ borderBottom:'1px solid var(--border)', background:'var(--bg2)', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:60, position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:22, color:'var(--gold)' }}>♠</span>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:22, letterSpacing:'0.06em', lineHeight:1 }}>QCDegens</div>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.1em' }}>WSOP 2026 Live Tracker</div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {livePlayers > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'rgba(45,189,110,0.1)', border:'1px solid rgba(45,189,110,0.3)', borderRadius:20, fontSize:12 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)', display:'inline-block' }}/>
              <span style={{ color:'var(--green)', fontWeight:500 }}>{livePlayers} live</span>
            </div>
          )}
          {lastFetch && (
            <span style={{ fontSize:11, color:'var(--text3)' }}>
              Updated {timeAgo(lastFetch.toISOString())} · next in {countdown}s
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            style={{ fontSize:12, padding:'5px 12px', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:6, color:'var(--text2)', cursor:'pointer' }}
          >
            {loading ? '⟳' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Team score banner */}
      {data && (
        <div style={{ background:'linear-gradient(135deg, var(--bg2), var(--bg3))', borderBottom:'1px solid var(--border)', padding:'20px 24px', display:'flex', alignItems:'center', gap:24 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Team Score</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:56, lineHeight:1, color:'var(--gold)', letterSpacing:'0.02em' }}>
              {data.teamScore ?? 0}
            </div>
          </div>
          <div style={{ height:60, width:1, background:'var(--border)' }}/>
          <div style={{ display:'flex', gap:24 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Players</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--text)' }}>{data.players?.length ?? 9}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Live Now</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:28, color: livePlayers > 0 ? 'var(--green)' : 'var(--text3)' }}>{livePlayers}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Data from</div>
              <div style={{ fontSize:13, color:'var(--text2)', fontFamily:'var(--font-mono)', marginTop:4 }}>
                {data.updatedAt ? timeAgo(data.updatedAt) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ padding:'20px 24px', maxWidth:1100, margin:'0 auto' }}>

        {error && (
          <div style={{ background:'rgba(224,82,82,0.08)', border:'1px solid rgba(224,82,82,0.25)', borderRadius:8, padding:'16px 20px', marginBottom:20, fontSize:13, color:'#e05252' }}>
            <strong>Could not load live data.</strong> {error}
            <br/><br/>
            Make sure <code>live-data.json</code> exists in the <code>public/</code> folder.
            Run <code>npm run update</code> locally to generate it.
          </div>
        )}

        {!data && !error && !loading && (
          <div style={{ textAlign:'center', padding:'4rem', color:'var(--text3)', fontSize:14 }}>
            No data yet — run <code style={{ background:'var(--bg3)', padding:'2px 8px', borderRadius:4 }}>npm run update</code> to fetch live data.
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign:'center', padding:'4rem', color:'var(--text3)', fontSize:13 }}>Loading...</div>
        )}

        {data && (
          <>
            {/* Sort: live players first, then by score */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:12 }}>
              {[...data.players]
                .sort((a, b) => {
                  if (a.liveStatus && !b.liveStatus) return -1
                  if (!a.liveStatus && b.liveStatus) return 1
                  return (b.pts2026 || 0) - (a.pts2026 || 0)
                })
                .map(player => (
                  <PlayerCard key={player.slug} player={player} />
                ))
              }
            </div>

            {/* Active events footer */}
            {data.activeEvents?.length > 0 && (
              <div style={{ marginTop:24, padding:'16px 20px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10 }}>
                <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Active events monitored</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {data.activeEvents.map(e => (
                    <a key={e.slug} href={e.url} target="_blank" rel="noreferrer"
                       style={{ fontSize:12, padding:'4px 10px', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:6, color:'var(--text2)', textDecoration:'none' }}>
                      {e.name || e.slug} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        code { font-family: var(--font-mono); background: var(--bg3); padding: 1px 5px; border-radius: 3px; font-size: 12px; color: var(--gold); }
      `}</style>
    </div>
  )
}
