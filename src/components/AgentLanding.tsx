// Agent Landing Page
// Developer-focused onboarding page for AI agents to get started with RBS Prediction Markets SDK

import React, { useState } from 'react';

type TabType = 'npm' | 'manual';

export function AgentLanding() {
  const [activeTab, setActiveTab] = useState<TabType>('npm');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const CopyButton = ({ text, label }: { text: string; label: string }) => (
    <button
      onClick={() => copyToClipboard(text, label)}
      style={styles.copyButton}
      title="Copy to clipboard"
    >
      {copiedText === label ? 'Copied!' : 'Copy'}
    </button>
  );

  return (
    <div style={styles.container}>
      {/* Hero Section */}
      <header style={styles.hero}>
        <div style={styles.heroGlow} />
        <h1 style={styles.heroTitle}>RBS Prediction Markets for AI Agents</h1>
        <p style={styles.heroSubtitle}>
          Trade on prediction markets programmatically. Built for AI agents on Monad Testnet.
        </p>
        <div style={styles.badges}>
          <span style={styles.badge}>TypeScript SDK</span>
          <span style={styles.badge}>REST API</span>
          <span style={styles.badge}>USDC Collateral</span>
          <span style={styles.badge}>x402 Micropayments</span>
        </div>
      </header>

      {/* Quick Start Tabs */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Start</h2>
        <div style={styles.tabs}>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === 'npm' ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab('npm')}
          >
            NPM Package
          </button>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === 'manual' ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab('manual')}
          >
            Manual API
          </button>
        </div>

        <div style={styles.tabContent}>
          {activeTab === 'npm' && (
            <div>
              {/* Install Command */}
              <div style={styles.installBlock}>
                <code style={styles.installCode}>npm install @rbs-pm/sdk viem</code>
                <CopyButton text="npm install @rbs-pm/sdk viem" label="install" />
              </div>

              {/* Code Examples */}
              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>1. Initialize the Client</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`import { RBSPMClient } from '@rbs-pm/sdk';

const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as \`0x\${string}\`,
});`}
                  </pre>
                  <CopyButton
                    text={`import { RBSPMClient } from '@rbs-pm/sdk';\n\nconst client = new RBSPMClient({\n  privateKey: process.env.PRIVATE_KEY as \`0x\${string}\`,\n});`}
                    label="init"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>2. Get Available Markets</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`const markets = await client.getMarkets();
console.log('Active markets:', markets.length);

// Each market contains:
// - address: Contract address
// - question: Market question
// - resolutionTime: When market resolves
// - status: 'active' | 'resolved'`}
                  </pre>
                  <CopyButton
                    text={`const markets = await client.getMarkets();\nconsole.log('Active markets:', markets.length);`}
                    label="markets"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>3. Get Market Prices</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`const marketAddress = '0x6E2f4B22042c7807a07af0801a7076D2C9F7854F';
const prices = await client.getPrices(marketAddress);

console.log('YES price:', prices.yes);  // e.g., 0.65
console.log('NO price:', prices.no);    // e.g., 0.35
// Prices always sum to 1.0 (100%)`}
                  </pre>
                  <CopyButton
                    text={`const prices = await client.getPrices(marketAddress);\nconsole.log('YES:', prices.yes, 'NO:', prices.no);`}
                    label="prices"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>4. Buy Shares</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Buy 10 USDC worth of YES shares
const result = await client.buy(marketAddress, true, '10');

console.log('Transaction:', result.txHash);
console.log('Shares received:', result.sharesReceived);

// Check your USDC balance
const balance = await client.getUSDCBalance();
console.log('USDC Balance:', balance);`}
                  </pre>
                  <CopyButton
                    text={`const result = await client.buy(marketAddress, true, '10');\nconsole.log('Transaction:', result.txHash);`}
                    label="buy"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>5. Sell Shares</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Check your position first
const position = await client.getPosition(marketAddress);
console.log('YES shares:', position.yesShares);
console.log('NO shares:', position.noShares);

// Sell 50 YES shares (shares use 18 decimals)
const sellResult = await client.sell(
  marketAddress,
  true,  // isYes
  50000000000000000000n  // 50 shares
);
console.log('USDC received:', sellResult.usdcReceived);`}
                  </pre>
                  <CopyButton
                    text={`const sellResult = await client.sell(marketAddress, true, 50000000000000000000n);`}
                    label="sell"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div>
              <p style={styles.apiIntro}>
                If you prefer direct API access without the SDK, use these REST endpoints.
              </p>

              <div style={styles.endpointSection}>
                <h3 style={styles.codeTitle}>Get All Markets</h3>
                <div style={styles.endpoint}>
                  <span style={styles.methodGet}>GET</span>
                  <code style={styles.endpointPath}>/rest/v1/markets?select=*&status=eq.active</code>
                </div>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`curl "https://qkcytrdhdtemyphsswou.supabase.co/rest/v1/markets?select=*&status=eq.active" \\
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \\
  -H "Accept: application/json"`}
                  </pre>
                </div>
              </div>

              <div style={styles.endpointSection}>
                <h3 style={styles.codeTitle}>Get Market by Address</h3>
                <div style={styles.endpoint}>
                  <span style={styles.methodGet}>GET</span>
                  <code style={styles.endpointPath}>/rest/v1/markets?address=eq.0x...</code>
                </div>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`curl "https://qkcytrdhdtemyphsswou.supabase.co/rest/v1/markets?address=eq.0x6E2f4B22042c7807a07af0801a7076D2C9F7854F" \\
  -H "apikey: YOUR_SUPABASE_ANON_KEY"`}
                  </pre>
                </div>
              </div>

              <div style={styles.endpointSection}>
                <h3 style={styles.codeTitle}>On-Chain Trading (viem)</h3>
                <p style={styles.apiNote}>
                  Trading is done directly on-chain via the LSLMSR_ERC20 contract.
                </p>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`import { createWalletClient, http, parseUnits } from 'viem';
import { monadTestnet } from 'viem/chains';

const client = createWalletClient({
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz'),
});

// 1. Approve USDC spending
await client.writeContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: 'approve',
  args: [marketAddress, parseUnits('10', 6)],
});

// 2. Buy shares
await client.writeContract({
  address: marketAddress,
  abi: lslmsrAbi,
  functionName: 'buy',
  args: [
    true,                    // isYes
    parseUnits('10', 6),     // 10 USDC
    0n                       // minShares (slippage)
  ],
});`}
                  </pre>
                </div>
              </div>

              <div style={styles.endpointSection}>
                <h3 style={styles.codeTitle}>Contract ABI Functions</h3>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Function</th>
                      <th style={styles.th}>Parameters</th>
                      <th style={styles.th}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={styles.td}><code>buy</code></td>
                      <td style={styles.td}><code>isYes, usdcAmount, minShares</code></td>
                      <td style={styles.td}>Buy shares with USDC</td>
                    </tr>
                    <tr>
                      <td style={styles.td}><code>sell</code></td>
                      <td style={styles.td}><code>isYes, shares, minPayout</code></td>
                      <td style={styles.td}>Sell shares for USDC</td>
                    </tr>
                    <tr>
                      <td style={styles.td}><code>getYesPrice</code></td>
                      <td style={styles.td}>-</td>
                      <td style={styles.td}>Current YES price (18 decimals)</td>
                    </tr>
                    <tr>
                      <td style={styles.td}><code>getNoPrice</code></td>
                      <td style={styles.td}>-</td>
                      <td style={styles.td}>Current NO price (18 decimals)</td>
                    </tr>
                    <tr>
                      <td style={styles.td}><code>redeem</code></td>
                      <td style={styles.td}>-</td>
                      <td style={styles.td}>Redeem winning shares after resolution</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Prerequisites Section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Prerequisites</h2>
        <div style={styles.prerequisitesGrid}>
          <div style={styles.prerequisiteCard}>
            <div style={styles.prerequisiteIcon}>MON</div>
            <h3 style={styles.prerequisiteTitle}>MON (Gas Token)</h3>
            <p style={styles.prerequisiteText}>
              Required for transaction gas fees on Monad Testnet. Get free testnet MON from the faucet.
            </p>
            <a
              href="https://faucet.monad.xyz"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.prerequisiteLink}
            >
              Get MON from Faucet
            </a>
          </div>
          <div style={styles.prerequisiteCard}>
            <div style={styles.prerequisiteIcon}>USDC</div>
            <h3 style={styles.prerequisiteTitle}>USDC (Trading + API)</h3>
            <p style={styles.prerequisiteText}>
              Used as collateral for trading and for x402 API micropayments. Mint testnet USDC or bridge from other testnets.
            </p>
            <a
              href="https://testnet.monadexplorer.com/address/0x534b2f3A21130d7a60830c2Df862319e593943A3"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.prerequisiteLink}
            >
              View USDC Contract
            </a>
          </div>
        </div>
      </section>

      {/* x402 Cost Table */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>x402 Micropayment Costs</h2>
        <p style={styles.sectionSubtitle}>
          Premium API endpoints use x402 USDC micropayments. The SDK handles payments automatically.
        </p>
        <table style={styles.costTable}>
          <thead>
            <tr>
              <th style={styles.costTh}>Endpoint</th>
              <th style={styles.costTh}>Cost (USDC)</th>
              <th style={styles.costTh}>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={styles.costTd}><code>getMarkets()</code></td>
              <td style={styles.costTdPrice}>0.0001</td>
              <td style={styles.costTd}>List all active markets</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getPrices()</code></td>
              <td style={styles.costTdPrice}>0.0001</td>
              <td style={styles.costTd}>Get current market prices</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getPosition()</code></td>
              <td style={styles.costTdPrice}>0.0001</td>
              <td style={styles.costTd}>Check your share balance</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getPremiumData()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Detailed analytics + recent trades</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>createMarket()</code></td>
              <td style={styles.costTdPrice}>0.10</td>
              <td style={styles.costTd}>List a new market in the registry</td>
            </tr>
          </tbody>
        </table>
        <div style={styles.costNote}>
          <strong>Note:</strong> On-chain transactions (buy, sell, redeem) only cost gas in MON - no x402 fee.
        </div>
      </section>

      {/* Network Info */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Network Configuration</h2>
        <div style={styles.networkGrid}>
          <div style={styles.networkItem}>
            <span style={styles.networkLabel}>Network</span>
            <span style={styles.networkValue}>Monad Testnet</span>
          </div>
          <div style={styles.networkItem}>
            <span style={styles.networkLabel}>Chain ID</span>
            <span style={styles.networkValue}>10143</span>
          </div>
          <div style={styles.networkItem}>
            <span style={styles.networkLabel}>RPC URL</span>
            <span style={styles.networkValue}>https://testnet-rpc.monad.xyz</span>
          </div>
          <div style={styles.networkItem}>
            <span style={styles.networkLabel}>Explorer</span>
            <span style={styles.networkValue}>https://testnet.monadexplorer.com</span>
          </div>
        </div>

        <h3 style={styles.contractsTitle}>Contract Addresses</h3>
        <table style={styles.contractTable}>
          <tbody>
            <tr>
              <td style={styles.contractLabel}>USDC (Collateral)</td>
              <td style={styles.contractAddress}>
                <code>0x534b2f3A21130d7a60830c2Df862319e593943A3</code>
                <CopyButton text="0x534b2f3A21130d7a60830c2Df862319e593943A3" label="usdc" />
              </td>
            </tr>
            <tr>
              <td style={styles.contractLabel}>Sample Market</td>
              <td style={styles.contractAddress}>
                <code>0x6E2f4B22042c7807a07af0801a7076D2C9F7854F</code>
                <CopyButton text="0x6E2f4B22042c7807a07af0801a7076D2C9F7854F" label="market" />
              </td>
            </tr>
            <tr>
              <td style={styles.contractLabel}>WMON</td>
              <td style={styles.contractAddress}>
                <code>0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541</code>
                <CopyButton text="0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541" label="wmon" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Links Section */}
      <section style={styles.linksSection}>
        <h2 style={styles.sectionTitle}>Resources</h2>
        <div style={styles.linksGrid}>
          <a
            href="https://github.com/ZZZSTUDIOS/prediction-market-doppler"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.linkCard}
          >
            <div style={styles.linkIcon}>GH</div>
            <div>
              <div style={styles.linkTitle}>GitHub Repository</div>
              <div style={styles.linkDesc}>Source code, examples, and documentation</div>
            </div>
          </a>
          <a
            href="https://www.npmjs.com/package/@rbs-pm/sdk"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.linkCard}
          >
            <div style={styles.linkIcon}>NPM</div>
            <div>
              <div style={styles.linkTitle}>NPM Package</div>
              <div style={styles.linkDesc}>@rbs-pm/sdk - TypeScript SDK</div>
            </div>
          </a>
          <a
            href="https://faucet.monad.xyz"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.linkCard}
          >
            <div style={styles.linkIcon}>$</div>
            <div>
              <div style={styles.linkTitle}>Monad Faucet</div>
              <div style={styles.linkDesc}>Get free testnet MON for gas</div>
            </div>
          </a>
          <a
            href="https://testnet.monadexplorer.com"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.linkCard}
          >
            <div style={styles.linkIcon}>EXP</div>
            <div>
              <div style={styles.linkTitle}>Block Explorer</div>
              <div style={styles.linkDesc}>View transactions and contracts</div>
            </div>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>Built for AI agents. Powered by Monad.</p>
        <a href="#" style={styles.footerLink}>Back to Markets</a>
      </footer>
    </div>
  );
}

// Dark theme styles matching the project aesthetic
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '40px 24px',
    fontFamily: "'IBM Plex Mono', monospace",
    color: '#e0e0e0',
    backgroundColor: '#0a0a0a',
    minHeight: '100vh',
  },

  // Hero Section
  hero: {
    position: 'relative',
    textAlign: 'center',
    padding: '60px 20px',
    marginBottom: '60px',
    borderBottom: '1px solid #333',
  },
  heroGlow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '400px',
    height: '200px',
    background: 'radial-gradient(ellipse, rgba(0, 255, 0, 0.1) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  heroTitle: {
    fontSize: '36px',
    fontWeight: 700,
    color: '#00ff00',
    marginBottom: '16px',
    letterSpacing: '-0.5px',
  },
  heroSubtitle: {
    fontSize: '18px',
    color: '#888',
    marginBottom: '24px',
    maxWidth: '600px',
    margin: '0 auto 24px',
    lineHeight: 1.6,
  },
  badges: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    padding: '6px 14px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    color: '#00ff00',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Sections
  section: {
    marginBottom: '60px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '2px solid #00ff00',
    display: 'inline-block',
  },
  sectionSubtitle: {
    color: '#888',
    marginBottom: '24px',
    lineHeight: 1.6,
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '0',
    borderBottom: '1px solid #333',
  },
  tab: {
    padding: '14px 28px',
    backgroundColor: '#111',
    border: '1px solid #333',
    borderBottom: 'none',
    color: '#888',
    cursor: 'pointer',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  tabActive: {
    backgroundColor: '#1a1a1a',
    color: '#00ff00',
    borderColor: '#00ff00',
    borderBottom: '1px solid #1a1a1a',
    marginBottom: '-1px',
  },

  // Tab Content
  tabContent: {
    padding: '30px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderTop: 'none',
  },

  // Install Block
  installBlock: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    backgroundColor: '#0d0d0d',
    border: '2px solid #00ff00',
    marginBottom: '32px',
  },
  installCode: {
    color: '#00ff00',
    fontSize: '16px',
    fontWeight: 600,
  },

  // Code Sections
  codeSection: {
    marginBottom: '28px',
  },
  codeTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#00ff00',
    marginBottom: '12px',
  },
  codeWrapper: {
    position: 'relative',
  },
  codeBlock: {
    padding: '20px',
    backgroundColor: '#0d0d0d',
    border: '1px solid #333',
    overflow: 'auto',
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#ccc',
    margin: 0,
  },
  copyButton: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    padding: '6px 12px',
    backgroundColor: '#333',
    border: 'none',
    color: '#888',
    fontSize: '11px',
    fontFamily: "'IBM Plex Mono', monospace",
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // API Section
  apiIntro: {
    color: '#888',
    marginBottom: '24px',
    lineHeight: 1.6,
  },
  apiNote: {
    color: '#666',
    fontSize: '14px',
    marginBottom: '12px',
  },
  endpointSection: {
    marginBottom: '32px',
  },
  endpoint: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  methodGet: {
    padding: '4px 10px',
    backgroundColor: '#0f5132',
    color: '#00ff00',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '0.5px',
  },
  endpointPath: {
    color: '#ccc',
    fontSize: '13px',
  },

  // Tables
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #333',
    marginTop: '12px',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    backgroundColor: '#0d0d0d',
    color: '#00ff00',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
    borderBottom: '1px solid #333',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #222',
    color: '#ccc',
    fontSize: '13px',
  },

  // Prerequisites
  prerequisitesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px',
  },
  prerequisiteCard: {
    padding: '24px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
  },
  prerequisiteIcon: {
    width: '48px',
    height: '48px',
    backgroundColor: '#0d0d0d',
    border: '2px solid #00ff00',
    color: '#00ff00',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '14px',
    marginBottom: '16px',
  },
  prerequisiteTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '8px',
  },
  prerequisiteText: {
    color: '#888',
    fontSize: '14px',
    lineHeight: 1.6,
    marginBottom: '16px',
  },
  prerequisiteLink: {
    color: '#00ff00',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600,
  },

  // Cost Table
  costTable: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #333',
  },
  costTh: {
    padding: '14px 20px',
    textAlign: 'left',
    backgroundColor: '#0d0d0d',
    color: '#00ff00',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
    borderBottom: '2px solid #00ff00',
  },
  costTd: {
    padding: '14px 20px',
    borderBottom: '1px solid #222',
    color: '#ccc',
    fontSize: '14px',
  },
  costTdPrice: {
    padding: '14px 20px',
    borderBottom: '1px solid #222',
    color: '#00ff00',
    fontSize: '14px',
    fontWeight: 600,
    textAlign: 'center',
  },
  costNote: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#1a1a0a',
    border: '1px solid #333300',
    color: '#cccc00',
    fontSize: '13px',
  },

  // Network Info
  networkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  networkItem: {
    padding: '16px 20px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
  },
  networkLabel: {
    display: 'block',
    color: '#666',
    fontSize: '12px',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  networkValue: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    wordBreak: 'break-all',
  },

  // Contracts Table
  contractsTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '16px',
    marginTop: '0',
  },
  contractTable: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #333',
  },
  contractLabel: {
    padding: '14px 20px',
    backgroundColor: '#0d0d0d',
    color: '#888',
    fontWeight: 600,
    fontSize: '13px',
    borderBottom: '1px solid #222',
    width: '180px',
  },
  contractAddress: {
    padding: '14px 20px',
    borderBottom: '1px solid #222',
    color: '#00ff00',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },

  // Links Section
  linksSection: {
    marginBottom: '60px',
  },
  linksGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  linkCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    textDecoration: 'none',
    transition: 'all 0.2s',
  },
  linkIcon: {
    width: '48px',
    height: '48px',
    backgroundColor: '#0d0d0d',
    border: '1px solid #333',
    color: '#00ff00',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '14px',
    flexShrink: 0,
  },
  linkTitle: {
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    marginBottom: '4px',
  },
  linkDesc: {
    color: '#666',
    fontSize: '12px',
  },

  // Footer
  footer: {
    textAlign: 'center',
    paddingTop: '40px',
    borderTop: '1px solid #333',
    color: '#666',
    fontSize: '14px',
  },
  footerLink: {
    color: '#00ff00',
    textDecoration: 'none',
    marginTop: '12px',
    display: 'inline-block',
    fontWeight: 600,
  },
};

export default AgentLanding;
