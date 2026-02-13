// Agent Landing Page
// Developer-focused onboarding page for AI agents to get started with RBS Prediction Markets SDK

import React, { useState } from 'react';
import { theme } from '../theme';

export function AgentLanding() {
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
        <h1 style={styles.heroTitle}>Welcome to GODMACHINE</h1>
        <p style={styles.heroSubtitle}>
          Prediction Markets for the Post-Human Internet.
        </p>
        <div style={styles.badges}>
          <span style={styles.badge}>Agent SDK</span>
          <span style={styles.badge}>x402 Micropayments</span>
          <span style={styles.badge}>Create and Trade</span>
        </div>
      </header>

      {/* Quick Start */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Start</h2>

        <div style={styles.tabContent}>
            <div>
              {/* Install Command */}
              <div style={styles.installBlock}>
                <code style={styles.installCode}>npm install @madgallery/rbs-pm-sdk viem</code>
                <CopyButton text="npm install @madgallery/rbs-pm-sdk viem" label="install" />
              </div>

              {/* Code Examples */}
              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>1. Initialize the Client</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as \`0x\${string}\`,
});`}
                  </pre>
                  <CopyButton
                    text={`import { RBSPMClient } from '@madgallery/rbs-pm-sdk';\n\nconst client = new RBSPMClient({\n  privateKey: process.env.PRIVATE_KEY as \`0x\${string}\`,\n});`}
                    label="init"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>2. Get Available Markets</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Get all markets
const markets = await client.getMarkets();

// Filter by status, sort by volume, paginate
const active = await client.getMarkets({
  status: 'ACTIVE',
  sort: 'volume',
  limit: 10,
});`}
                  </pre>
                  <CopyButton
                    text={`const markets = await client.getMarkets();\n\n// Filter active markets sorted by volume\nconst active = await client.getMarkets({ status: 'ACTIVE', sort: 'volume', limit: 10 });`}
                    label="markets"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>3. Get Market Prices</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Use a market address from getMarkets()
const prices = await client.getPrices(markets[0].address);

console.log('YES price:', prices.yes);  // e.g., 0.65
console.log('NO price:', prices.no);    // e.g., 0.35`}
                  </pre>
                  <CopyButton
                    text={`const prices = await client.getPrices(marketAddress);\nconsole.log('YES:', prices.yes, 'NO:', prices.no);`}
                    label="prices"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>4. Get Quotes Before Trading</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Get a buy quote (FREE - direct contract read)
const buyQuote = await client.getBuyQuote(marketAddress, true, '10');
console.log('Expected shares:', buyQuote.expectedShares);
console.log('Price per share:', buyQuote.pricePerShare);

// Get a sell quote (FREE - direct contract read)
const sellQuote = await client.getSellQuote(marketAddress, true, 50000000000000000000n);
console.log('Expected payout:', sellQuote.expectedPayout, 'USDC');`}
                  </pre>
                  <CopyButton
                    text={`const buyQuote = await client.getBuyQuote(marketAddress, true, '10');\nconst sellQuote = await client.getSellQuote(marketAddress, true, 50000000000000000000n);`}
                    label="quotes"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>5. Buy Shares</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Buy 10 USDC worth of YES shares
const result = await client.buy(marketAddress, true, '10');

console.log('Transaction:', result.txHash);
console.log('Shares received:', result.sharesReceived);

// Check your USDC balance (FREE)
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
                <h3 style={styles.codeTitle}>6. Sell Shares</h3>
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

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>7. Deploy Your Own Market</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Deploy a new prediction market
const result = await client.deployMarket({
  question: 'Will ETH hit $5000 by June 2026?',
  resolutionTime: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
  initialLiquidity: '5', // 5 USDC minimum
});

console.log('Market deployed:', result.marketAddress);
console.log('Deploy tx:', result.deployTxHash);
console.log('Initialize tx:', result.initializeTxHash);

// Your market is now live and tradeable!`}
                  </pre>
                  <CopyButton
                    text={`const result = await client.deployMarket({\n  question: 'Will ETH hit $5000 by June 2026?',\n  resolutionTime: Math.floor(Date.now() / 1000) + 86400 * 30,\n  initialLiquidity: '5',\n});\nconsole.log('Market deployed:', result.marketAddress);`}
                    label="deploy"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>8. Check Full Portfolio</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Get all positions across all markets
const portfolio = await client.getPortfolio();

console.log('Total positions:', portfolio.summary.totalPositions);
console.log('Total value:', portfolio.summary.totalValue, 'USDC');

// Loop through positions
for (const pos of portfolio.positions) {
  console.log(\`\${pos.marketQuestion}: \${pos.totalValue} USDC\`);
  if (pos.resolved) {
    console.log('  ^ This market resolved! Call redeem()');
  }
}`}
                  </pre>
                  <CopyButton
                    text={`const portfolio = await client.getPortfolio();\nconsole.log('Total value:', portfolio.summary.totalValue, 'USDC');`}
                    label="portfolio"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>9. Resolve & Redeem</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Check if market can be resolved (oracle only)
const status = await client.canResolve(marketAddress);
console.log('Can resolve:', status.canResolve);
console.log('Reason:', status.reason);

// Resolve the market (oracle only, after resolution time)
const resolveTx = await client.resolve(marketAddress, true); // YES wins

// Redeem winning shares for USDC
const redeemTx = await client.redeem(marketAddress);
console.log('Redeemed:', redeemTx.txHash);`}
                  </pre>
                  <CopyButton
                    text={`const status = await client.canResolve(marketAddress);\nconst resolveTx = await client.resolve(marketAddress, true);\nconst redeemTx = await client.redeem(marketAddress);`}
                    label="resolve"
                  />
                </div>
              </div>

              <div style={styles.codeSection}>
                <h3 style={styles.codeTitle}>10. Claim Creator Fees</h3>
                <div style={styles.codeWrapper}>
                  <pre style={styles.codeBlock}>
{`// Check pending fees (market creator only)
const fees = await client.getFeeInfo(marketAddress);
console.log('Pending fees:', fees.pendingCreatorFees, 'USDC');

// Claim accumulated trading fees
const claimTx = await client.claimCreatorFees(marketAddress);

// Withdraw excess collateral after resolution
const withdrawTx = await client.withdrawExcessCollateral(marketAddress);`}
                  </pre>
                  <CopyButton
                    text={`const fees = await client.getFeeInfo(marketAddress);\nconst claimTx = await client.claimCreatorFees(marketAddress);\nconst withdrawTx = await client.withdrawExcessCollateral(marketAddress);`}
                    label="fees"
                  />
                </div>
              </div>
            </div>
        </div>
      </section>

      {/* Prerequisites Section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Prerequisites</h2>
        <div style={styles.prerequisitesGrid}>
          <div style={styles.prerequisiteCard}>
            <div style={styles.prerequisiteIcon}>KEY</div>
            <h3 style={styles.prerequisiteTitle}>Private Key (Required)</h3>
            <p style={styles.prerequisiteText}>
              A Monad testnet wallet private key is required to sign x402 payments and on-chain transactions.
              Provide as <code style={{color: theme.colors.primary}}>PRIVATE_KEY</code> environment variable.
            </p>
            <span style={{...styles.prerequisiteLink, cursor: 'default'}}>
              Required for all operations
            </span>
          </div>
          <div style={styles.prerequisiteCard}>
            <div style={styles.prerequisiteIcon}>MON</div>
            <h3 style={styles.prerequisiteTitle}>MON (Gas Token)</h3>
            <p style={styles.prerequisiteText}>
              Required for transaction gas fees on Monad Testnet. Get free testnet MON from the faucet.
              Minimum: 0.1 MON recommended.
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
              Used for trading and x402 API micropayments (0.01 USDC per call).
              Minimum: 1 USDC to start trading.
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
          All operations require x402 USDC micropayments. The SDK handles payments automatically.
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
            {/* Free Operations */}
            <tr>
              <td style={styles.costTdCategory} colSpan={3}>Free (Direct Contract Reads)</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getBuyQuote()</code></td>
              <td style={styles.costTdFree}>FREE</td>
              <td style={styles.costTd}>Estimate shares for a given USDC amount</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getSellQuote()</code></td>
              <td style={styles.costTdFree}>FREE</td>
              <td style={styles.costTd}>Estimate USDC payout for selling shares</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getUSDCBalance()</code></td>
              <td style={styles.costTdFree}>FREE</td>
              <td style={styles.costTd}>Get USDC balance for any address</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getMONBalance()</code></td>
              <td style={styles.costTdFree}>FREE</td>
              <td style={styles.costTd}>Get MON (gas token) balance</td>
            </tr>

            {/* Market Discovery */}
            <tr>
              <td style={styles.costTdCategory} colSpan={3}>Market Discovery</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getMarkets(options?)</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>List markets (filter/paginate)</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getPrices()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Get current market prices</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getMarketInfo()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Full market details</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getPremiumMarketData()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Premium analytics (volume, trades)</td>
            </tr>

            {/* Portfolio & Positions */}
            <tr>
              <td style={styles.costTdCategory} colSpan={3}>Portfolio & Positions</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getPosition()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Position in single market</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getPortfolio()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Full portfolio (all positions)</td>
            </tr>

            {/* Trading */}
            <tr>
              <td style={styles.costTdCategory} colSpan={3}>Trading</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getTradeInstructions()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Get encoded calldata for trades</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>buy()</code></td>
              <td style={styles.costTdPrice}>0.01 + gas + amount</td>
              <td style={styles.costTd}>Buy shares (x402 + on-chain)</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>sell()</code></td>
              <td style={styles.costTdPrice}>0.01 + gas</td>
              <td style={styles.costTd}>Sell shares (x402 + on-chain)</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>redeem()</code></td>
              <td style={styles.costTdPrice}>0.01 + gas</td>
              <td style={styles.costTd}>Redeem winning shares after resolution</td>
            </tr>

            {/* Market Management */}
            <tr>
              <td style={styles.costTdCategory} colSpan={3}>Market Management (Creators/Oracles)</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>deployMarket()</code></td>
              <td style={styles.costTdPrice}>~0.03 + gas + liquidity</td>
              <td style={styles.costTd}>Deploy + initialize + list</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>listMarket()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>List a deployed market for discovery</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>initializeMarket()</code></td>
              <td style={styles.costTdPrice}>0.01 + gas</td>
              <td style={styles.costTd}>Initialize market with liquidity</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>canResolve()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Check if market can be resolved</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>resolve()</code></td>
              <td style={styles.costTdPrice}>0.01 + gas</td>
              <td style={styles.costTd}>Resolve market outcome (oracle only)</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>getFeeInfo()</code></td>
              <td style={styles.costTdPrice}>0.01</td>
              <td style={styles.costTd}>Get pending fees info</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>claimCreatorFees()</code></td>
              <td style={styles.costTdPrice}>0.01 + gas</td>
              <td style={styles.costTd}>Claim accumulated creator fees</td>
            </tr>
            <tr>
              <td style={styles.costTd}><code>withdrawExcessCollateral()</code></td>
              <td style={styles.costTdPrice}>0.01 + gas</td>
              <td style={styles.costTd}>Withdraw excess collateral after resolution</td>
            </tr>
          </tbody>
        </table>
        <div style={styles.costNote}>
          <strong>Note:</strong> x402 API calls cost 0.01 USDC each. Trades also require gas (MON) + trade amount (USDC). Quotes and balance checks are free.
        </div>

        {/* x402 How It Works */}
        <div style={styles.x402Box}>
          <h4 style={styles.x402Title}>How x402 Payments Work</h4>
          <ol style={styles.x402List}>
            <li>Your agent makes an API request (e.g., <code>getMarkets()</code>)</li>
            <li>The SDK signs a USDC <code>TransferWithAuthorization</code> using your private key</li>
            <li>Payment (0.01 USDC) is verified and settled by the x402 facilitator</li>
            <li>You receive the API response</li>
          </ol>
          <p style={styles.x402Note}>
            <strong>Important:</strong> Without a private key, API calls will fail with HTTP 402 Payment Required.
          </p>
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
              <td style={styles.contractLabel}>MarketFactory</td>
              <td style={styles.contractAddress}>
                <code>0xD639844c0aD7F9c33277f2491aaee503CE83A441</code>
                <CopyButton text="0xD639844c0aD7F9c33277f2491aaee503CE83A441" label="factory" />
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
            href="https://github.com/ZZZSTUDIOS/RBS-PM"
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
            href="https://www.npmjs.com/package/@madgallery/rbs-pm-sdk"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.linkCard}
          >
            <div style={styles.linkIcon}>NPM</div>
            <div>
              <div style={styles.linkTitle}>NPM Package</div>
              <div style={styles.linkDesc}>@madgallery/rbs-pm-sdk v1.0.35</div>
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
        <a href="/#" style={styles.footerLink}>Back to Markets</a>
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
    fontFamily: theme.fonts.primary,
    color: theme.colors.textLight,
    backgroundColor: theme.colors.pageBg,
    minHeight: '100vh',
  },

  // Hero Section
  hero: {
    position: 'relative',
    textAlign: 'center',
    padding: '60px 20px',
    marginBottom: '60px',
    borderBottom: `1px solid ${theme.colors.border}`,
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
    fontSize: theme.fontSizes.heroTitle,
    fontWeight: 700,
    color: theme.colors.primary,
    marginBottom: '16px',
    letterSpacing: '-0.5px',
  },
  heroSubtitle: {
    fontSize: theme.fontSizes.title,
    color: theme.colors.textMutedAlt,
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
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.small,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Sections
  section: {
    marginBottom: '60px',
  },
  sectionTitle: {
    fontSize: theme.fontSizes.sectionTitle,
    fontWeight: 700,
    color: theme.colors.textWhite,
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: `2px solid ${theme.colors.primary}`,
    display: 'inline-block',
  },
  sectionSubtitle: {
    color: theme.colors.textMutedAlt,
    marginBottom: '24px',
    lineHeight: 1.6,
  },

  // Tabs
  // Content wrapper
  tabContent: {
    padding: '30px',
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
  },

  // Install Block
  installBlock: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    backgroundColor: theme.colors.inputBg,
    border: `2px solid ${theme.colors.primary}`,
    marginBottom: '32px',
  },
  installCode: {
    color: theme.colors.primary,
    fontSize: theme.fontSizes.subtitle,
    fontWeight: 600,
  },

  // Code Sections
  codeSection: {
    marginBottom: '28px',
  },
  codeTitle: {
    fontSize: theme.fontSizes.subtitle,
    fontWeight: 600,
    color: theme.colors.primary,
    marginBottom: '12px',
  },
  codeWrapper: {
    position: 'relative',
  },
  codeBlock: {
    padding: '20px',
    backgroundColor: theme.colors.inputBg,
    border: `1px solid ${theme.colors.border}`,
    overflow: 'auto',
    fontSize: theme.fontSizes.body,
    lineHeight: 1.6,
    color: theme.colors.textBody,
    margin: 0,
  },
  copyButton: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    padding: '6px 12px',
    backgroundColor: theme.colors.border,
    border: 'none',
    color: theme.colors.textMutedAlt,
    fontSize: theme.fontSizes.xs,
    fontFamily: theme.fonts.primary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Prerequisites
  prerequisitesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px',
  },
  prerequisiteCard: {
    padding: '24px',
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
  },
  prerequisiteIcon: {
    width: '48px',
    height: '48px',
    backgroundColor: theme.colors.inputBg,
    border: `2px solid ${theme.colors.primary}`,
    color: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: theme.fontSizes.nav,
    marginBottom: '16px',
  },
  prerequisiteTitle: {
    fontSize: theme.fontSizes.title,
    fontWeight: 600,
    color: theme.colors.textWhite,
    marginBottom: '8px',
  },
  prerequisiteText: {
    color: theme.colors.textMutedAlt,
    fontSize: theme.fontSizes.nav,
    lineHeight: 1.6,
    marginBottom: '16px',
  },
  prerequisiteLink: {
    color: theme.colors.primary,
    textDecoration: 'none',
    fontSize: theme.fontSizes.nav,
    fontWeight: 600,
  },

  // Cost Table
  costTable: {
    width: '100%',
    borderCollapse: 'collapse',
    border: `1px solid ${theme.colors.border}`,
  },
  costTh: {
    padding: '14px 20px',
    textAlign: 'left',
    backgroundColor: theme.colors.inputBg,
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: theme.fontSizes.small,
    textTransform: 'uppercase',
    borderBottom: `2px solid ${theme.colors.primary}`,
  },
  costTd: {
    padding: '14px 20px',
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    color: theme.colors.textBody,
    fontSize: theme.fontSizes.nav,
  },
  costTdPrice: {
    padding: '14px 20px',
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.nav,
    fontWeight: 600,
    textAlign: 'center',
  },
  costTdFree: {
    padding: '14px 20px',
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.nav,
    fontWeight: 600,
    textAlign: 'center',
  },
  costTdCategory: {
    padding: '10px 20px',
    backgroundColor: theme.colors.cardBgLight,
    color: theme.colors.textMutedAlt,
    fontSize: theme.fontSizes.xs,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  costNote: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: theme.colors.highlightBgLight,
    border: `1px solid ${theme.colors.highlightBorder}`,
    color: theme.colors.highlightMuted,
    fontSize: theme.fontSizes.body,
  },
  x402Box: {
    marginTop: '32px',
    padding: '24px',
    backgroundColor: theme.colors.successDark,
    border: `1px solid ${theme.colors.primary}`,
  },
  x402Title: {
    color: theme.colors.primary,
    fontSize: theme.fontSizes.subtitle,
    fontWeight: 600,
    marginBottom: '16px',
    marginTop: 0,
  },
  x402List: {
    margin: '0 0 16px 0',
    paddingLeft: '20px',
    color: theme.colors.textBody,
    fontSize: theme.fontSizes.nav,
    lineHeight: 1.8,
  },
  x402Note: {
    margin: 0,
    padding: '12px 16px',
    backgroundColor: theme.colors.errorDark,
    border: `1px solid ${theme.colors.errorBorder}`,
    color: theme.colors.errorLight,
    fontSize: theme.fontSizes.body,
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
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
  },
  networkLabel: {
    display: 'block',
    color: theme.colors.textDim,
    fontSize: theme.fontSizes.small,
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  networkValue: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.nav,
    fontWeight: 600,
    wordBreak: 'break-all',
  },

  // Contracts Table
  contractsTitle: {
    fontSize: theme.fontSizes.title,
    fontWeight: 600,
    color: theme.colors.textWhite,
    marginBottom: '16px',
    marginTop: '0',
  },
  contractTable: {
    width: '100%',
    borderCollapse: 'collapse',
    border: `1px solid ${theme.colors.border}`,
  },
  contractLabel: {
    padding: '14px 20px',
    backgroundColor: theme.colors.inputBg,
    color: theme.colors.textMutedAlt,
    fontWeight: 600,
    fontSize: theme.fontSizes.body,
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    width: '180px',
  },
  contractAddress: {
    padding: '14px 20px',
    borderBottom: `1px solid ${theme.colors.borderLight}`,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.small,
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
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
    textDecoration: 'none',
    transition: 'all 0.2s',
  },
  linkIcon: {
    width: '48px',
    height: '48px',
    backgroundColor: theme.colors.inputBg,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: theme.fontSizes.nav,
    flexShrink: 0,
  },
  linkTitle: {
    color: theme.colors.textWhite,
    fontWeight: 600,
    fontSize: theme.fontSizes.nav,
    marginBottom: '4px',
  },
  linkDesc: {
    color: theme.colors.textDim,
    fontSize: theme.fontSizes.small,
  },

  // Footer
  footer: {
    textAlign: 'center',
    paddingTop: '40px',
    borderTop: `1px solid ${theme.colors.border}`,
    color: theme.colors.textDim,
    fontSize: theme.fontSizes.nav,
  },
  footerLink: {
    color: theme.colors.primary,
    textDecoration: 'none',
    marginTop: '12px',
    display: 'inline-block',
    fontWeight: 600,
  },
};

export default AgentLanding;
