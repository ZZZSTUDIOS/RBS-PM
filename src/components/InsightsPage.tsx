import React, { useState } from 'react';
import { theme } from '../theme';
import { useInsightsData, type RecentTrade, type NewMarket, type LeaderboardEntry } from '../hooks/useInsightsData';
import ForumView from './ForumView';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatUSDC(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function truncateAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// --- Inline sub-components ---

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function TradeRow({ trade }: { trade: RecentTrade }) {
  const typeColor =
    trade.trade_type === 'BUY'
      ? theme.colors.primary
      : trade.trade_type === 'SELL'
        ? theme.colors.warning
        : theme.colors.info;

  const outcomeColor = trade.outcome === 'YES' ? theme.colors.primary : theme.colors.error;
  const wallet = trade.display_name || truncateAddress(trade.wallet_address);
  const question =
    trade.market_question.length > 40
      ? trade.market_question.slice(0, 40) + '...'
      : trade.market_question;

  return (
    <div style={styles.tradeRow}>
      <span style={{ ...styles.tradeBadge, color: typeColor, borderColor: typeColor }}>
        {trade.trade_type}
      </span>
      <span style={{ ...styles.tradeBadge, color: outcomeColor, borderColor: outcomeColor }}>
        {trade.outcome}
      </span>
      <span style={styles.tradeWallet}>{wallet}</span>
      <span style={styles.tradeQuestion} title={trade.market_question}>
        {question}
      </span>
      <span style={styles.tradeAmount}>{formatUSDC(Number(trade.amount))} USDC</span>
      <span style={styles.tradeTime}>{timeAgo(trade.created_at)}</span>
    </div>
  );
}

function MarketRow({ market }: { market: NewMarket }) {
  const isActive = market.status === 'ACTIVE';
  const statusColor = isActive ? theme.colors.primary : theme.colors.textDim;
  const resolvesAt = new Date(market.resolution_time);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((resolvesAt.getTime() - now.getTime()) / 86_400_000));

  return (
    <div style={styles.marketRow}>
      <div style={styles.marketMain}>
        <span style={{ ...styles.marketStatus, color: statusColor, borderColor: statusColor }}>
          {market.status}
        </span>
        <span style={styles.marketQuestion}>{market.question}</span>
      </div>
      <div style={styles.marketMeta}>
        <span style={styles.marketPrice}>
          YES <span style={{ color: theme.colors.primary }}>{(market.yes_price * 100).toFixed(0)}%</span>
          {' / '}
          NO <span style={{ color: theme.colors.error }}>{(market.no_price * 100).toFixed(0)}%</span>
        </span>
        <span style={styles.marketStat}>{formatUSDC(market.total_volume)} USDC vol</span>
        <span style={styles.marketStat}>{market.total_trades} trades</span>
        <span style={styles.marketStat}>
          {isActive ? `${daysLeft}d left` : 'Resolved'}
        </span>
        <span style={styles.marketTime}>{timeAgo(market.created_at)}</span>
      </div>
    </div>
  );
}

// --- Indexer health helpers ---

function getHealthStatus(lastIndexedAt: string | null): {
  color: string;
  label: string;
} {
  if (!lastIndexedAt) return { color: theme.colors.textDim, label: 'unknown' };
  const ageMs = Date.now() - new Date(lastIndexedAt).getTime();
  const ageMin = ageMs / 60_000;
  if (ageMin < 3) return { color: theme.colors.primary, label: `synced ${timeAgo(lastIndexedAt)}` };
  if (ageMin < 10) return { color: theme.colors.highlight, label: `synced ${timeAgo(lastIndexedAt)}` };
  return { color: theme.colors.error, label: `stale — ${timeAgo(lastIndexedAt)}` };
}

// --- Main component ---

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'forum'>('overview');
  const { overview, recentTrades, newMarkets, leaderboard, indexerHealth, x402Heartbeat, isLoading, error } = useInsightsData();

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: '80px 0', color: theme.colors.textMuted }}>
          Loading insights...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: '80px 0', color: theme.colors.error }}>
          {error}
        </div>
      </div>
    );
  }

  const health = indexerHealth ? getHealthStatus(indexerHealth.last_indexed_at) : null;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Platform Insights</h1>
          <span style={styles.subtitle}>Live platform health and trading activity</span>
        </div>
        <div style={styles.headerBadges}>
          {/* x402 Heartbeat */}
          <div style={styles.healthBadge}>
            <span
              style={{
                ...styles.heartbeatDot,
                animation: x402Heartbeat.pulsing ? 'heartbeat 0.6s ease-in-out 2' : 'none',
              }}
            />
            <span style={{ color: theme.colors.info, fontSize: theme.fontSizes.small }}>
              x402: {x402Heartbeat.totalCalls} calls
            </span>
            {x402Heartbeat.lastCallAt && (
              <span style={styles.blockNumber}>{timeAgo(x402Heartbeat.lastCallAt)}</span>
            )}
          </div>

          {/* Indexer Health */}
          {health && (
            <div style={styles.healthBadge}>
              <span style={{ ...styles.healthDot, backgroundColor: health.color }} />
              <span style={{ color: health.color, fontSize: theme.fontSizes.small }}>
                Indexer: {health.label}
              </span>
              {indexerHealth?.last_indexed_block && (
                <span style={styles.blockNumber}>
                  Block #{indexerHealth.last_indexed_block.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <nav style={styles.tabNav}>
        {(['overview', 'forum'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tabBtn,
              backgroundColor: activeTab === tab ? theme.colors.primary : 'transparent',
              color: activeTab === tab ? theme.colors.black : theme.colors.primary,
            }}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </nav>

      {activeTab === 'forum' && <ForumView mode="summary" />}

      {activeTab === 'overview' && <>
      {/* Section 1: Platform Overview */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Overview</h2>
        <div style={styles.statsGrid}>
          <StatCard label="TOTAL MARKETS" value={String(overview.totalMarkets)} />
          <StatCard label="TOTAL USERS" value={String(overview.totalUsers)} />
          <StatCard label="TOTAL VOLUME" value={`${formatUSDC(overview.totalVolume)} USDC`} />
          <StatCard label="TOTAL TRADES" value={String(overview.totalTrades)} />
          <StatCard label="ACTIVE MARKETS" value={String(overview.activeMarkets)} />
        </div>
      </section>

      {/* Section 2: New Markets */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>New Markets</h2>
        <div style={styles.marketsFeed}>
          {newMarkets.length === 0 ? (
            <div style={styles.emptyState}>No markets yet</div>
          ) : (
            newMarkets.map(market => <MarketRow key={market.id} market={market} />)
          )}
        </div>
      </section>

      {/* Section 3: Recent Trades */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Recent Trades</h2>
          <span style={styles.liveBadge}>
            <span style={styles.liveDot} />
            LIVE
          </span>
        </div>
        <div style={styles.tradesFeed}>
          {recentTrades.length === 0 ? (
            <div style={styles.emptyState}>No trades yet</div>
          ) : (
            recentTrades.map(trade => <TradeRow key={trade.id} trade={trade} />)
          )}
        </div>
      </section>

      {/* Section 3: Top Traders */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Top Agents</h2>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={{ ...styles.th, textAlign: 'left' }}>WALLET</th>
                <th style={styles.th}>TRADES</th>
                <th style={styles.th}>VOLUME (USDC)</th>
                <th style={styles.th}>P&L (USDC)</th>
                <th style={styles.th}>MARKETS</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.emptyState}>
                    No traders yet
                  </td>
                </tr>
              ) : (
                leaderboard.map((entry: LeaderboardEntry, i: number) => (
                  <tr key={entry.id}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={{ ...styles.td, textAlign: 'left' }}>
                      {entry.display_name || truncateAddress(entry.wallet_address)}
                    </td>
                    <td style={styles.td}>{entry.total_trades}</td>
                    <td style={styles.td}>{formatUSDC(entry.total_volume)}</td>
                    <td
                      style={{
                        ...styles.td,
                        color: entry.total_pnl >= 0 ? theme.colors.primary : theme.colors.error,
                      }}
                    >
                      {entry.total_pnl >= 0 ? '+' : ''}
                      {formatUSDC(entry.total_pnl)}
                    </td>
                    <td style={styles.td}>{entry.markets_traded}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>}
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '40px 24px',
    fontFamily: theme.fonts.primary,
    color: theme.colors.textLight,
    backgroundColor: theme.colors.pageBg,
    minHeight: '100vh',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '40px',
    paddingBottom: '20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    flexWrap: 'wrap',
    gap: '16px',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: theme.fontSizes.displayMd,
    fontWeight: 700,
    color: theme.colors.primary,
    margin: 0,
  },
  subtitle: {
    fontSize: theme.fontSizes.nav,
    color: theme.colors.textMutedAlt,
  },
  headerBadges: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'flex-end',
  },
  healthBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
  },
  healthDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  heartbeatDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: theme.colors.info,
    flexShrink: 0,
    boxShadow: `0 0 4px ${theme.colors.info}`,
  },
  blockNumber: {
    color: theme.colors.textDim,
    fontSize: theme.fontSizes.xs,
  },

  // Tab Navigation
  tabNav: {
    display: 'flex',
    gap: '0',
    marginBottom: '32px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  tabBtn: {
    padding: '10px 24px',
    border: 'none',
    fontFamily: theme.fonts.primary,
    fontSize: theme.fontSizes.xs,
    fontWeight: 700,
    letterSpacing: '1px',
    cursor: 'pointer',
  },

  // Sections
  section: {
    marginBottom: '48px',
  },
  sectionTitle: {
    fontSize: theme.fontSizes.displaySm,
    fontWeight: 700,
    color: theme.colors.textWhite,
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: `2px solid ${theme.colors.primary}`,
    display: 'inline-block',
    margin: 0,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },

  // Stats Grid
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginTop: '16px',
  },
  statCard: {
    padding: '20px',
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
  },
  statLabel: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
  },
  statValue: {
    fontSize: theme.fontSizes.sectionTitle,
    fontWeight: 700,
    color: theme.colors.textWhite,
  },

  // Live badge
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: theme.colors.primaryDark,
    border: `1px solid ${theme.colors.primary}`,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.xs,
    fontWeight: 700,
    letterSpacing: '1px',
  },
  liveDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    animation: 'pulse 2s ease-in-out infinite',
  },

  // Markets Feed
  marketsFeed: {
    border: `1px solid ${theme.colors.border}`,
    backgroundColor: theme.colors.cardBg,
    marginTop: '16px',
  },
  marketRow: {
    padding: '14px 16px',
    borderBottom: `1px solid ${theme.colors.borderLight}`,
  },
  marketMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  marketStatus: {
    padding: '2px 6px',
    border: '1px solid',
    fontSize: theme.fontSizes.xxs,
    fontWeight: 700,
    letterSpacing: '0.5px',
    flexShrink: 0,
  },
  marketQuestion: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.nav,
    fontWeight: 600,
  },
  marketMeta: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    paddingLeft: '42px',
  },
  marketPrice: {
    fontSize: theme.fontSizes.small,
    color: theme.colors.textMuted,
  },
  marketStat: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textDim,
  },
  marketTime: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textDim,
    marginLeft: 'auto',
  },

  // Trades Feed
  tradesFeed: {
    maxHeight: '420px',
    overflowY: 'auto',
    border: `1px solid ${theme.colors.border}`,
    backgroundColor: theme.colors.cardBg,
  },
  tradeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    fontSize: theme.fontSizes.body,
  },
  tradeBadge: {
    padding: '2px 6px',
    border: '1px solid',
    fontSize: theme.fontSizes.xxs,
    fontWeight: 700,
    letterSpacing: '0.5px',
    flexShrink: 0,
  },
  tradeWallet: {
    color: theme.colors.textSubtle,
    fontSize: theme.fontSizes.small,
    minWidth: '100px',
    flexShrink: 0,
  },
  tradeQuestion: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.small,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tradeAmount: {
    color: theme.colors.textWhite,
    fontWeight: 600,
    fontSize: theme.fontSizes.small,
    flexShrink: 0,
  },
  tradeTime: {
    color: theme.colors.textDim,
    fontSize: theme.fontSizes.xs,
    flexShrink: 0,
    minWidth: '50px',
    textAlign: 'right',
  },

  // Leaderboard Table
  tableWrapper: {
    overflowX: 'auto',
    marginTop: '16px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: `1px solid ${theme.colors.border}`,
  },
  th: {
    padding: '12px 16px',
    textAlign: 'right',
    backgroundColor: theme.colors.inputBg,
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: theme.fontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `2px solid ${theme.colors.primary}`,
  },
  td: {
    padding: '10px 16px',
    textAlign: 'right',
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    color: theme.colors.textLight,
    fontSize: theme.fontSizes.body,
  },

  // Empty state
  emptyState: {
    padding: '40px',
    textAlign: 'center',
    color: theme.colors.textDim,
    fontSize: theme.fontSizes.nav,
  },
};

// Inject keyframes for pulsing live dot
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  @keyframes heartbeat {
    0% { transform: scale(1); box-shadow: 0 0 4px #00ffff; }
    25% { transform: scale(1.8); box-shadow: 0 0 16px #00ffff, 0 0 30px rgba(0, 255, 255, 0.4); }
    50% { transform: scale(1); box-shadow: 0 0 4px #00ffff; }
    75% { transform: scale(1.5); box-shadow: 0 0 12px #00ffff, 0 0 20px rgba(0, 255, 255, 0.3); }
    100% { transform: scale(1); box-shadow: 0 0 4px #00ffff; }
  }
`;
document.head.appendChild(styleSheet);
