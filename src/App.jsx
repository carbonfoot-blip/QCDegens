import { useState, useEffect, useCallback } from 'react'

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
  const s = Math.floor((Date.now()-new Date(iso).getTime())/1000)
  if (s<60) return `${s}s ago`
  if (s<3600) return `${Math.floor(s/60)}m ago`
  return `${Math.floor(s/3600)}h ago`
}

// ── Player Detail Panel ────────────────────────────────────────────────────────
function PlayerPanel({ player, onClose }) {
  const history = [...(player.eventHistory||[])].sort((a,b) => a.eventSlug.localeCompare(b.eventSlug))

  return (
    <div style={{
      position:'fixed', top:0, right:0, bottom:0, width:380,
      background:'var(--bg2)', borderLeft:'1px solid var(--border2)',
      display:'flex', flexDirection:'column', zIndex:200,
      boxShadow:'-8px 0 40px rgba(0,0,0,0.5)',
      animation:'slideIn 0.2s ease-out',
    }}>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      {/* Header */}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'flex-start', background:'var(--bg3)' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:22, letterSpacing:'0.04em' }}>{player.name}</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:3, fontFamily:'var(--font-mono)' }}>
            salary {fmtBuyin(player.salary)} · {player.pts2026} pts · {player.cashes2026} cashes
            {player.isBonus && <span style={{ marginLeft:8, color:'var(--gold)' }}>★ BONUS</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--text3)', fontSize:18, padding:'2px 6px', cursor:'pointer', lineHeight:1 }}>✕</button>
      </div>

      {/* Event history */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
          Tournament History ({history.length} events)
        </div>

        {history.length === 0 && (
          <div style={{ color:'var(--text3)', fontSize:13, fontStyle:'italic', padding:'1rem 0' }}>
            No tournament appearances tracked yet
          </div>
        )}

        {history.map((ev, i) => (
          <div key={i} style={{
            background: ev.status === 'active' ? 'rgba(45,189,110,0.07)' : 'var(--bg3)',
            border: `1px solid ${ev.status === 'active' ? 'rgba(45,189,110,0.25)' : 'var(--border)'}`,
            borderRadius:8, padding:'12px 14px',
            borderLeft: `3px solid ${ev.status === 'active' ? 'var(--green)' : ev.status === 'eliminated' ? 'var(--text3)' : 'var(--gold)'}`,
          }}>
            {/* Event name + status */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'var(--text)', lineHeight:1.3, flex:1, paddingRight:8 }}>
                {ev.eventName || ev.eventSlug}
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
                {ev.status === 'active' && (
                  <span style={{ fontSize:10, color:'var(--green)', fontWeight:600, display:'flex', alignItems:'center', gap:3 }}>
                    <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--green)', display:'inline-block', animation:'pulse 1.5s infinite' }}/>
                    LIVE
                  </span>
                )}
                {ev.status === 'eliminated' && (
                  <span style={{ fontSize:10, color:'var(--text3)' }}>ELIMINATED</span>
                )}
                <a href={ev.eventUrl} target="_blank" rel="noreferrer"
                   style={{ fontSize:10, color:'var(--gold)', textDecoration:'none' }}>PokerNews ↗</a>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {ev.rank && (
                <div>
                  <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Position</div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:20, color: ev.status==='active' ? 'var(--gold)' : 'var(--text)', lineHeight:1.1 }}>#{ev.rank}</div>
                </div>
              )}
              {ev.playersLeft != null && (
                <div>
                  <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Players left</div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:20, color:'var(--text)', lineHeight:1.1 }}>{ev.playersLeft}</div>
                </div>
              )}
              {ev.chips && (
                <div>
                  <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Chips</div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:20, color:'var(--gold)', lineHeight:1.1 }}>{fmtChips(ev.chips)}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Buy-in</div>
                <div style={{ fontSize:12, color:'var(--text2)', fontFamily:'var(--font-mono)', marginTop:2 }}>{fmtBuyin(ev.buyin)}</div>
              </div>
              {ev.totalEntries && (
                <div>
                  <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Entries</div>
                  <div style={{ fontSize:12, color:'var(--text2)', fontFamily:'var(--font-mono)', marginTop:2 }}>{ev.totalEntries.toLocaleString()}</div>
                </div>
              )}
            </div>

            {ev.currentDay && (
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>Day {ev.currentDay}</div>
            )}
            {ev.updatedAt && (
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>Updated {timeAgo(ev.updatedAt)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Player Card ───────────────────────────────────────────────────────────────
function PlayerCard({ player, onClick }) {
  const live = player.liveStatus
  const isLive = !!live
  const histCount = player.eventHistory?.length ?? 0

  return (
    <div
      onClick={onClick}
      style={{
        background: isLive ? 'rgba(45,189,110,0.05)' : 'var(--bg2)',
        border: isLive ? '1px solid rgba(45,189,110,0.3)' : '1px solid var(--border)',
        borderRadius:10, padding:'16px 18px',
        display:'flex', flexDirection:'column', gap:10,
        position:'relative', overflow:'hidden',
        cursor:'pointer', transition:'border-color 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'}
      onMouseLeave={e => e.currentTarget.style.transform='translateY(0)'}
    >
      {isLive && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--green)' }}/>}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:'var(--font-display)', fontSize:20, letterSpacing:'0.04em' }}>{player.name}</span>
            {player.isBonus && <span style={{ fontSize:10, padding:'2px 6px', background:'rgba(212,160,23,0.15)', color:'var(--gold)', borderRadius:4, border:'1px solid rgba(212,160,23,0.3)', fontWeight:500 }}>★ BONUS</span>}
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, fontFamily:'var(--font-mono)', display:'flex', gap:8 }}>
            {player.salary && <span>salary {fmtBuyin(player.salary)}</span>}
            {histCount > 0 && <span style={{ color:'var(--text3)' }}>{histCount} event{histCount>1?'s':''}</span>}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:32, lineHeight:1, color: player.pts2026>0 ? 'var(--gold)' : 'var(--text3)' }}>
            {player.pts2026||0}
          </div>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.1em' }}>pts</div>
        </div>
      </div>

      {/* Live status */}
      {isLive ? (
        <div style={{ background:'rgba(45,189,110,0.08)', border:'1px solid rgba(45,189,110,0.2)', borderRadius:6, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', display:'inline-block', boxShadow:'0 0 6px var(--green)', animation:'pulse 1.5s infinite' }}/>
              <span style={{ fontSize:12, fontWeight:500, color:'var(--green)' }}>LIVE</span>
            </div>
            <a href={live.eventUrl} target="_blank" rel="noreferrer"
               onClick={e => e.stopPropagation()}
               style={{ fontSize:11, color:'var(--gold)', textDecoration:'none' }}>PokerNews ↗</a>
          </div>
          <div style={{ fontSize:12, color:'var(--text)', fontWeight:500 }}>{live.eventName}</div>
          <div style={{ display:'flex', gap:12, alignItems:'center', padding:'8px 10px', background:'rgba(255,255,255,0.04)', borderRadius:6, flexWrap:'wrap' }}>
            <StatPill label="position" value={live.rank ? `#${live.rank}` : '—'} gold={!!live.rank} />
            {live.playersLeft != null && <StatPill label="players left" value={live.playersLeft} />}
            {live.chips && <StatPill label="chips" value={fmtChips(live.chips)} gold />}
          </div>
          <div style={{ display:'flex', gap:16 }}>
            <StatChip label="Buy-in" value={fmtBuyin(live.buyin)} />
            {live.totalEntries && <StatChip label="Entries" value={live.totalEntries.toLocaleString()} />}
          </div>
        </div>
      ) : (
        <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic', display:'flex', alignItems:'center', gap:6 }}>
          {histCount > 0
            ? <span>Played {histCount} event{histCount>1?'s':''} — click to see history</span>
            : <span>Not tracked in any active event</span>
          }
        </div>
      )}

      {/* Click hint */}
      <div style={{ fontSize:10, color:'var(--text3)', textAlign:'right', marginTop:-4 }}>
        click for details →
      </div>
    </div>
  )
}

function StatPill({ label, value, gold }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:44 }}>
      <span style={{ fontFamily:'var(--font-display)', fontSize:22, lineHeight:1, color: gold ? 'var(--gold)' : 'var(--text)' }}>{value}</span>
      <span style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2 }}>{label}</span>
    </div>
  )
}
function StatChip({ label, value }) {
  return (
    <div>
      <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      <div style={{ fontSize:12, color:'var(--text2)', fontFamily:'var(--font-mono)', marginTop:1 }}>{value}</div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [lastFetch, setLastFetch] = useState(null)
  const [countdown, setCountdown] = useState(120)
  const [selected, setSelected]   = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`./live-data.json?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastFetch(new Date())
      setCountdown(120)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const i = setInterval(fetchData, 120*1000)
    return () => clearInterval(i)
  }, [fetchData])
  useEffect(() => {
    const t = setInterval(() => setCountdown(c => c<=1 ? 120 : c-1), 1000)
    return () => clearInterval(t)
  }, [])

  // Close panel on Escape
  useEffect(() => {
    const h = e => { if (e.key==='Escape') setSelected(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const livePlayers = data?.players?.filter(p => p.liveStatus).length ?? 0

  const sortedPlayers = data ? [...data.players].sort((a,b) => {
    if (a.liveStatus && !b.liveStatus) return -1
    if (!a.liveStatus && b.liveStatus) return 1
    return (b.pts2026||0)-(a.pts2026||0)
  }) : []

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', fontFamily:'var(--font-body)' }}>

      {/* Header */}
      <div style={{ borderBottom:'1px solid var(--border)', background:'var(--bg2)', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:60, position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:22, color:'var(--gold)' }}>♠</span>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:22, letterSpacing:'0.06em', lineHeight:1 }}>QCDegens</div>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.1em' }}>WSOP 2026 Live Tracker</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {livePlayers>0 && (
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'rgba(45,189,110,0.1)', border:'1px solid rgba(45,189,110,0.3)', borderRadius:20, fontSize:12 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)', display:'inline-block' }}/>
              <span style={{ color:'var(--green)', fontWeight:500 }}>{livePlayers} live</span>
            </div>
          )}
          {lastFetch && <span style={{ fontSize:11, color:'var(--text3)' }}>Updated {timeAgo(lastFetch.toISOString())} · next in {countdown}s</span>}
          <button onClick={fetchData} disabled={loading} style={{ fontSize:12, padding:'5px 12px' }}>
            {loading ? '⟳' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Team score */}
      {data && (
        <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', padding:'20px 24px', display:'flex', alignItems:'center', gap:24 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Team Score</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:56, lineHeight:1, color:'var(--gold)' }}>{data.teamScore??0}</div>
          </div>
          <div style={{ height:60, width:1, background:'var(--border)' }}/>
          <div style={{ display:'flex', gap:24 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Live Now</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:28, color: livePlayers>0 ? 'var(--green)' : 'var(--text3)' }}>{livePlayers}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Data from</div>
              <div style={{ fontSize:12, color:'var(--text2)', fontFamily:'var(--font-mono)', marginTop:4 }}>{data.updatedAt ? timeAgo(data.updatedAt) : '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Player grid */}
      <div style={{ padding:'20px 24px', maxWidth: selected ? 780 : 1100, margin:'0 auto', transition:'max-width 0.2s' }}>
        {error && (
          <div style={{ background:'rgba(224,82,82,0.08)', border:'1px solid rgba(224,82,82,0.25)', borderRadius:8, padding:'16px 20px', marginBottom:20, fontSize:13, color:'#e05252' }}>
            <strong>Could not load live data.</strong> {error}<br/><br/>
            Run <code>npm run update</code> to generate it.
          </div>
        )}
        {!data && !error && !loading && (
          <div style={{ textAlign:'center', padding:'4rem', color:'var(--text3)' }}>
            Run <code>npm run update</code> to fetch live data.
          </div>
        )}
        {data && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:12 }}>
            {sortedPlayers.map(player => (
              <PlayerCard
                key={player.slug}
                player={player}
                onClick={() => setSelected(selected?.slug===player.slug ? null : player)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Overlay + side panel */}
      {selected && (
        <>
          <div
            onClick={() => setSelected(null)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:199, backdropFilter:'blur(2px)' }}
          />
          <PlayerPanel
            player={selected}
            onClose={() => setSelected(null)}
          />
        </>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        code { font-family:var(--font-mono); background:var(--bg3); padding:1px 5px; border-radius:3px; font-size:12px; color:var(--gold); }
      `}</style>
    </div>
  )
}
