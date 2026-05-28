import { formatChips, formatBuyin } from '../services/pokernews'
import styles from './PlayerCard.module.css'

export function PlayerCard({ player, status, onRefresh, loading }) {
  const latest = status?.events?.[0] ?? null
  const isActive = latest?.status === 'active'
  const isBusted = latest?.status === 'busted'
  const hasData  = !!latest

  // Compute position % for the chip bar
  const chipPct = isActive && latest?.avgStack && latest?.playerChips
    ? Math.min(200, Math.round((latest.playerChips / latest.avgStack) * 100))
    : null

  return (
    <div className={`${styles.card} ${isActive ? styles.active : ''} ${isBusted ? styles.busted : ''}`}>
      {/* Player header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.name}>{player.name}</div>
          <div className={styles.meta}>
            #{player.rank} all-time
            {player.isBonus && <span className={styles.bonusBadge}>★ BONUS</span>}
          </div>
        </div>
        <div className={styles.headerRight}>
          {/* Live status badge */}
          {isActive && (
            <span className={styles.liveBadge}>
              <span className={styles.liveDot}/>
              LIVE
            </span>
          )}
          {isBusted && <span className={styles.bustedBadge}>BUSTED</span>}
          {!hasData && !loading && <span className={styles.unknownBadge}>—</span>}
          {loading && <span className={styles.loadingBadge}>⟳</span>}

          {/* Score display */}
          <div className={styles.score}>
            <span className={styles.scoreNum}>{status?.totalPts ?? 0}</span>
            <span className={styles.scoreLbl}>pts</span>
          </div>
        </div>
      </div>

      {/* Event info */}
      {hasData && (
        <div className={styles.eventBox}>
          <div className={styles.eventHeader}>
            <div className={styles.eventName}>
              {latest.eventName}
              {latest.chipsUrl && (
                <a href={latest.chipsUrl} target="_blank" rel="noreferrer" className={styles.extLink}>↗</a>
              )}
            </div>
            <div className={styles.eventDay}>{latest.day}</div>
          </div>

          <div className={styles.statsRow}>
            <Stat label="Buy-in"   value={formatBuyin(latest.buyin)} />
            <Stat label="Players"  value={latest.playersLeft != null ? `${latest.playersLeft?.toLocaleString()} left` : '—'} />
            <Stat label="Entries"  value={latest.totalEntries?.toLocaleString() ?? '—'} />
            <Stat label="Prize"    value={latest.prizePool ?? '—'} />
          </div>

          {isActive && (
            <div className={styles.chipsRow}>
              <div className={styles.chipsLeft}>
                <span className={styles.chipsLabel}>Chips</span>
                <span className={styles.chipsValue}>{formatChips(latest.playerChips)}</span>
                {latest.playerRank && (
                  <span className={styles.chipsRank}>#{latest.playerRank}</span>
                )}
              </div>
              {chipPct !== null && (
                <div className={styles.chipsBarWrap}>
                  <div className={styles.chipsBarLabel}>{chipPct}% of avg</div>
                  <div className={styles.chipsBar}>
                    <div
                      className={`${styles.chipsBarFill} ${chipPct >= 100 ? styles.chipsBarGood : chipPct < 50 ? styles.chipsBarDanger : ''}`}
                      style={{ width: `${Math.min(100, chipPct / 2)}%` }}
                    />
                    <div className={styles.chipsBarAvgLine} />
                  </div>
                </div>
              )}
            </div>
          )}

          {isBusted && (
            <div className={styles.bustedMsg}>
              Eliminated from this event
              {latest.playerRank && ` · finished ~#${latest.playerRank}`}
            </div>
          )}
        </div>
      )}

      {!hasData && !loading && (
        <div className={styles.noData}>
          Not currently tracked in any active event
        </div>
      )}

      {/* Refresh button */}
      <button
        className={styles.refreshBtn}
        onClick={() => onRefresh(player)}
        disabled={loading}
        title="Refresh from PokerNews"
      >
        {loading ? '⟳ Updating…' : '⟳ Refresh'}
      </button>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}
