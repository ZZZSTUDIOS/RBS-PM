import React, { useState, useEffect } from 'react';

// Brutalist Admin UI for Doppler Prediction Markets on Monad
export default function DopplerAdmin() {
  const [activeTab, setActiveTab] = useState('connect');
  const [wallet, setWallet] = useState({ connected: false, address: '', balance: '0' });
  const [logs, setLogs] = useState([]);
  const [markets, setMarkets] = useState([]);
  
  // Token Creation State
  const [tokenConfig, setTokenConfig] = useState({
    yesName: 'ETH10K-YES',
    yesSymbol: 'YES',
    noName: 'ETH10K-NO', 
    noSymbol: 'NO',
    totalSupply: '1000000000',
    tokensToSell: '900000000',
    tokenURI: 'https://api.example.com/metadata.json'
  });

  // Market Creation State
  const [marketConfig, setMarketConfig] = useState({
    question: 'Will ETH hit $10,000 by end of 2026?',
    resolutionDate: '2026-12-31',
    oracle: '',
    yesToken: '',
    noToken: '',
    collateralAmount: '100'
  });

  // Curve Config
  const [curves, setCurves] = useState([
    { startMcap: 1000, endMcap: 10000, positions: 5, shares: 0.3 },
    { startMcap: 10000, endMcap: 100000, positions: 10, shares: 0.5 },
    { startMcap: 100000, endMcap: 0, positions: 5, shares: 0.2 }
  ]);

  // Quote State
  const [quoteParams, setQuoteParams] = useState({
    tokenAddress: '',
    amount: '1',
    direction: 'buy'
  });
  const [quoteResult, setQuoteResult] = useState(null);

  // Resolution State
  const [resolution, setResolution] = useState({
    marketAddress: '',
    outcome: 'YES'
  });

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    setLogs(prev => [...prev, { timestamp, msg, type }].slice(-50));
  };

  const connectWallet = async () => {
    addLog('Connecting to wallet...', 'pending');
    // Simulate connection
    setTimeout(() => {
      const addr = '0x' + Math.random().toString(16).slice(2, 10) + '...';
      setWallet({ connected: true, address: addr, balance: '420.69' });
      addLog(`Connected: ${addr}`, 'success');
    }, 500);
  };

  const generateCode = (type) => {
    if (type === 'token') {
      return `import { DopplerSDK } from '@whetstone-research/doppler-sdk';
import { parseEther } from 'viem';

const sdk = new DopplerSDK({ publicClient, walletClient, chainId: 10143 });
const WMON = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';

// Create YES Token
const yesParams = sdk.buildMulticurveAuction()
  .tokenConfig({
    name: '${tokenConfig.yesName}',
    symbol: '${tokenConfig.yesSymbol}',
    tokenURI: '${tokenConfig.tokenURI}'
  })
  .saleConfig({
    initialSupply: parseEther('${tokenConfig.totalSupply}'),
    numTokensToSell: parseEther('${tokenConfig.tokensToSell}'),
    numeraire: WMON
  })
  .withCurves({
    numerairePrice: 1,
    curves: [
${curves.map(c => `      { marketCap: { start: ${c.startMcap}, end: ${c.endMcap || "'max'"} }, numPositions: ${c.positions}, shares: parseEther('${c.shares}') }`).join(',\n')}
    ]
  })
  .withGovernance({ type: 'noOp' })
  .withMigration({ type: 'noOp' })
  .withUserAddress(account.address)
  .build();

const yesResult = await sdk.factory.createMulticurve(yesParams);
console.log('YES Token:', yesResult.tokenAddress);`;
    }
    
    if (type === 'market') {
      return `// Deploy Prediction Market
const { marketAddress, txHash } = await pmSdk.createMarket(
  '${marketConfig.yesToken || '0x...YES_TOKEN'}',
  '${marketConfig.noToken || '0x...NO_TOKEN'}',
  '${marketConfig.question}',
  new Date('${marketConfig.resolutionDate}'),
  '${marketConfig.oracle || wallet.address}'
);

// Fund with collateral
await pmSdk.depositCollateral(marketAddress, parseEther('${marketConfig.collateralAmount}'));`;
    }

    if (type === 'quote') {
      return `const quoter = new Quoter(publicClient, 10143);

const quote = await quoter.quoteExactInputV4({
  poolKey: {
    currency0: WMON,
    currency1: '${quoteParams.tokenAddress || '0x...TOKEN'}',
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: 8,
    hooks: hookAddress
  },
  zeroForOne: ${quoteParams.direction === 'buy'},
  exactAmount: parseEther('${quoteParams.amount}'),
  hookData: '0x'
});

console.log('Expected output:', formatEther(quote.amountOut));`;
    }

    if (type === 'resolve') {
      return `// Resolve Market (Oracle Only)
await pmSdk.resolveMarket(
  '${resolution.marketAddress || '0x...MARKET'}',
  Outcome.${resolution.outcome}
);

// Users can now redeem winning tokens
const balance = await getTokenBalance(winningToken, userAddress);
await pmSdk.redeem(marketAddress, balance);`;
    }
  };

  const executeAction = (action) => {
    addLog(`Executing: ${action}...`, 'pending');
    setTimeout(() => {
      if (Math.random() > 0.1) {
        addLog(`${action} completed successfully`, 'success');
        if (action === 'Create Market') {
          const newMarket = {
            id: markets.length + 1,
            question: marketConfig.question,
            yesToken: '0x' + Math.random().toString(16).slice(2, 10),
            noToken: '0x' + Math.random().toString(16).slice(2, 10),
            status: 'ACTIVE',
            resolution: marketConfig.resolutionDate
          };
          setMarkets(prev => [...prev, newMarket]);
        }
      } else {
        addLog(`${action} failed: Insufficient gas`, 'error');
      }
    }, 1000);
  };

  const tabs = [
    { id: 'connect', label: 'WALLET' },
    { id: 'tokens', label: 'TOKENS' },
    { id: 'curves', label: 'CURVES' },
    { id: 'market', label: 'MARKET' },
    { id: 'quote', label: 'QUOTE' },
    { id: 'resolve', label: 'RESOLVE' },
    { id: 'markets', label: 'MARKETS' }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      color: '#00ff00',
      fontFamily: '"IBM Plex Mono", "Courier New", monospace',
      fontSize: '13px',
      padding: '0'
    }}>
      {/* Header */}
      <header style={{
        borderBottom: '3px solid #00ff00',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#000'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            fontSize: '24px',
            fontWeight: 'bold',
            letterSpacing: '4px',
            textTransform: 'uppercase'
          }}>
            ◈ DOPPLER
          </div>
          <div style={{
            padding: '4px 12px',
            border: '2px solid #00ff00',
            fontSize: '11px',
            letterSpacing: '2px'
          }}>
            PREDICTION MARKETS
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            padding: '4px 12px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            fontSize: '11px'
          }}>
            MONAD TESTNET [10143]
          </div>
          {wallet.connected && (
            <div style={{
              padding: '4px 12px',
              backgroundColor: '#001a00',
              border: '1px solid #00ff00'
            }}>
              {wallet.address} | {wallet.balance} MON
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav style={{
        display: 'flex',
        borderBottom: '2px solid #333',
        backgroundColor: '#0d0d0d'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              backgroundColor: activeTab === tab.id ? '#00ff00' : 'transparent',
              color: activeTab === tab.id ? '#000' : '#00ff00',
              border: 'none',
              borderRight: '1px solid #333',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '12px',
              fontWeight: 'bold',
              letterSpacing: '2px',
              transition: 'all 0.1s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div style={{ display: 'flex', height: 'calc(100vh - 120px)' }}>
        {/* Main Content */}
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          
          {/* WALLET TAB */}
          {activeTab === 'connect' && (
            <div>
              <SectionHeader>WALLET CONNECTION</SectionHeader>
              <div style={{ marginTop: '24px' }}>
                {!wallet.connected ? (
                  <button onClick={connectWallet} style={buttonStyle}>
                    [ CONNECT WALLET ]
                  </button>
                ) : (
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <InfoRow label="STATUS" value="● CONNECTED" valueColor="#00ff00" />
                    <InfoRow label="ADDRESS" value={wallet.address} />
                    <InfoRow label="BALANCE" value={`${wallet.balance} MON`} />
                    <InfoRow label="NETWORK" value="MONAD TESTNET (10143)" />
                    <div style={{ marginTop: '16px' }}>
                      <button onClick={() => setWallet({ connected: false, address: '', balance: '0' })} 
                        style={{ ...buttonStyle, backgroundColor: '#1a0000', borderColor: '#ff0000', color: '#ff0000' }}>
                        [ DISCONNECT ]
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div style={{ marginTop: '32px' }}>
                <SectionHeader>CONTRACT ADDRESSES</SectionHeader>
                <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
                  <InfoRow label="WMON" value="0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701" mono />
                  <InfoRow label="DOPPLER AIRLOCK" value="Check docs.doppler.lol" mono />
                  <InfoRow label="FACTORY" value="Deploy via Foundry" mono />
                </div>
              </div>
            </div>
          )}

          {/* TOKENS TAB */}
          {activeTab === 'tokens' && (
            <div>
              <SectionHeader>CREATE OUTCOME TOKENS</SectionHeader>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                Launch YES and NO tokens via Doppler's multicurve bonding curves
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={cardStyle}>
                  <div style={{ color: '#00ff00', fontWeight: 'bold', marginBottom: '16px' }}>YES TOKEN</div>
                  <InputField label="NAME" value={tokenConfig.yesName} 
                    onChange={v => setTokenConfig(p => ({...p, yesName: v}))} />
                  <InputField label="SYMBOL" value={tokenConfig.yesSymbol}
                    onChange={v => setTokenConfig(p => ({...p, yesSymbol: v}))} />
                </div>
                <div style={cardStyle}>
                  <div style={{ color: '#ff6600', fontWeight: 'bold', marginBottom: '16px' }}>NO TOKEN</div>
                  <InputField label="NAME" value={tokenConfig.noName}
                    onChange={v => setTokenConfig(p => ({...p, noName: v}))} />
                  <InputField label="SYMBOL" value={tokenConfig.noSymbol}
                    onChange={v => setTokenConfig(p => ({...p, noSymbol: v}))} />
                </div>
              </div>

              <div style={{ ...cardStyle, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>SUPPLY CONFIG</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <InputField label="TOTAL SUPPLY" value={tokenConfig.totalSupply}
                    onChange={v => setTokenConfig(p => ({...p, totalSupply: v}))} />
                  <InputField label="TOKENS TO SELL" value={tokenConfig.tokensToSell}
                    onChange={v => setTokenConfig(p => ({...p, tokensToSell: v}))} />
                  <InputField label="TOKEN URI" value={tokenConfig.tokenURI}
                    onChange={v => setTokenConfig(p => ({...p, tokenURI: v}))} />
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <button onClick={() => executeAction('Create YES Token')} style={buttonStyle}>
                  [ DEPLOY YES TOKEN ]
                </button>
                <button onClick={() => executeAction('Create NO Token')} 
                  style={{ ...buttonStyle, marginLeft: '16px', borderColor: '#ff6600', color: '#ff6600' }}>
                  [ DEPLOY NO TOKEN ]
                </button>
              </div>

              <CodePreview code={generateCode('token')} />
            </div>
          )}

          {/* CURVES TAB */}
          {activeTab === 'curves' && (
            <div>
              <SectionHeader>BONDING CURVE CONFIG</SectionHeader>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                Configure price discovery curves for your outcome tokens
              </p>

              {curves.map((curve, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontWeight: 'bold' }}>CURVE {i + 1}</span>
                    <span style={{ color: '#666' }}>{(curve.shares * 100).toFixed(0)}% of supply</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    <InputField label="START MCAP ($)" value={curve.startMcap}
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].startMcap = Number(v);
                        setCurves(newCurves);
                      }} />
                    <InputField label="END MCAP ($)" value={curve.endMcap || 'MAX'}
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].endMcap = v === 'MAX' ? 0 : Number(v);
                        setCurves(newCurves);
                      }} />
                    <InputField label="POSITIONS" value={curve.positions}
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].positions = Number(v);
                        setCurves(newCurves);
                      }} />
                    <InputField label="SHARES" value={curve.shares}
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].shares = Number(v);
                        setCurves(newCurves);
                      }} />
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                <button onClick={() => setCurves([...curves, { startMcap: 0, endMcap: 0, positions: 5, shares: 0.1 }])}
                  style={{ ...buttonStyle, flex: 1 }}>
                  [ + ADD CURVE ]
                </button>
                {curves.length > 1 && (
                  <button onClick={() => setCurves(curves.slice(0, -1))}
                    style={{ ...buttonStyle, borderColor: '#ff0000', color: '#ff0000' }}>
                    [ - REMOVE ]
                  </button>
                )}
              </div>

              {/* Visual Curve Preview */}
              <div style={{ ...cardStyle, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>CURVE VISUALIZATION</div>
                <div style={{ 
                  height: '120px', 
                  display: 'flex', 
                  alignItems: 'flex-end', 
                  gap: '4px',
                  padding: '16px',
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #333'
                }}>
                  {curves.map((curve, i) => (
                    <div key={i} style={{
                      flex: curve.shares,
                      height: `${20 + (i * 30)}%`,
                      backgroundColor: i === 0 ? '#004400' : i === 1 ? '#006600' : '#00ff00',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      border: '1px solid #00ff00'
                    }}>
                      {(curve.shares * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#666', fontSize: '11px' }}>
                  <span>$1k</span>
                  <span>$10k</span>
                  <span>$100k</span>
                  <span>MAX</span>
                </div>
              </div>
            </div>
          )}

          {/* MARKET TAB */}
          {activeTab === 'market' && (
            <div>
              <SectionHeader>CREATE PREDICTION MARKET</SectionHeader>
              
              <div style={cardStyle}>
                <InputField label="QUESTION" value={marketConfig.question}
                  onChange={v => setMarketConfig(p => ({...p, question: v}))} fullWidth />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <InputField label="RESOLUTION DATE" value={marketConfig.resolutionDate} type="date"
                    onChange={v => setMarketConfig(p => ({...p, resolutionDate: v}))} />
                  <InputField label="ORACLE ADDRESS" value={marketConfig.oracle} placeholder={wallet.address || '0x...'}
                    onChange={v => setMarketConfig(p => ({...p, oracle: v}))} />
                </div>
              </div>

              <div style={{ ...cardStyle, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>TOKEN ADDRESSES</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <InputField label="YES TOKEN" value={marketConfig.yesToken} placeholder="0x..."
                    onChange={v => setMarketConfig(p => ({...p, yesToken: v}))} />
                  <InputField label="NO TOKEN" value={marketConfig.noToken} placeholder="0x..."
                    onChange={v => setMarketConfig(p => ({...p, noToken: v}))} />
                </div>
              </div>

              <div style={{ ...cardStyle, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>COLLATERAL</div>
                <InputField label="INITIAL COLLATERAL (WMON)" value={marketConfig.collateralAmount}
                  onChange={v => setMarketConfig(p => ({...p, collateralAmount: v}))} />
              </div>

              <div style={{ marginTop: '24px' }}>
                <button onClick={() => executeAction('Create Market')} style={{ ...buttonStyle, width: '100%', padding: '16px' }}>
                  [ DEPLOY PREDICTION MARKET ]
                </button>
              </div>

              <CodePreview code={generateCode('market')} />
            </div>
          )}

          {/* QUOTE TAB */}
          {activeTab === 'quote' && (
            <div>
              <SectionHeader>GET PRICE QUOTE</SectionHeader>
              
              <div style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                  <InputField label="TOKEN ADDRESS" value={quoteParams.tokenAddress} placeholder="0x..."
                    onChange={v => setQuoteParams(p => ({...p, tokenAddress: v}))} />
                  <InputField label="AMOUNT (WMON)" value={quoteParams.amount}
                    onChange={v => setQuoteParams(p => ({...p, amount: v}))} />
                  <div>
                    <label style={{ display: 'block', color: '#666', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px' }}>
                      DIRECTION
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => setQuoteParams(p => ({...p, direction: 'buy'}))}
                        style={{
                          ...buttonStyle,
                          flex: 1,
                          backgroundColor: quoteParams.direction === 'buy' ? '#00ff00' : 'transparent',
                          color: quoteParams.direction === 'buy' ? '#000' : '#00ff00'
                        }}>
                        BUY
                      </button>
                      <button 
                        onClick={() => setQuoteParams(p => ({...p, direction: 'sell'}))}
                        style={{
                          ...buttonStyle,
                          flex: 1,
                          backgroundColor: quoteParams.direction === 'sell' ? '#ff6600' : 'transparent',
                          color: quoteParams.direction === 'sell' ? '#000' : '#ff6600',
                          borderColor: '#ff6600'
                        }}>
                        SELL
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button onClick={() => {
                addLog('Fetching quote...', 'pending');
                setTimeout(() => {
                  const mockOutput = (parseFloat(quoteParams.amount) * (Math.random() * 1000 + 500)).toFixed(2);
                  setQuoteResult({
                    input: quoteParams.amount,
                    output: mockOutput,
                    price: (parseFloat(quoteParams.amount) / parseFloat(mockOutput)).toFixed(8),
                    impact: (Math.random() * 2).toFixed(2)
                  });
                  addLog('Quote received', 'success');
                }, 500);
              }} style={{ ...buttonStyle, marginTop: '24px' }}>
                [ GET QUOTE ]
              </button>

              {quoteResult && (
                <div style={{ ...cardStyle, marginTop: '24px', backgroundColor: '#001a00' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '16px', color: '#00ff00' }}>QUOTE RESULT</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <InfoRow label="INPUT" value={`${quoteResult.input} WMON`} />
                    <InfoRow label="OUTPUT" value={`${quoteResult.output} TOKENS`} />
                    <InfoRow label="PRICE" value={`${quoteResult.price} WMON/TOKEN`} />
                    <InfoRow label="PRICE IMPACT" value={`${quoteResult.impact}%`} 
                      valueColor={parseFloat(quoteResult.impact) > 1 ? '#ff6600' : '#00ff00'} />
                  </div>
                </div>
              )}

              <CodePreview code={generateCode('quote')} />
            </div>
          )}

          {/* RESOLVE TAB */}
          {activeTab === 'resolve' && (
            <div>
              <SectionHeader>RESOLVE MARKET</SectionHeader>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                Oracle-only function to set the final outcome
              </p>
              
              <div style={cardStyle}>
                <InputField label="MARKET ADDRESS" value={resolution.marketAddress} placeholder="0x..."
                  onChange={v => setResolution(p => ({...p, marketAddress: v}))} fullWidth />
                
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px' }}>
                    OUTCOME
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {['YES', 'NO', 'INVALID'].map(outcome => (
                      <button 
                        key={outcome}
                        onClick={() => setResolution(p => ({...p, outcome}))}
                        style={{
                          ...buttonStyle,
                          backgroundColor: resolution.outcome === outcome ? 
                            (outcome === 'YES' ? '#00ff00' : outcome === 'NO' ? '#ff6600' : '#666') : 'transparent',
                          color: resolution.outcome === outcome ? '#000' : 
                            (outcome === 'YES' ? '#00ff00' : outcome === 'NO' ? '#ff6600' : '#666'),
                          borderColor: outcome === 'YES' ? '#00ff00' : outcome === 'NO' ? '#ff6600' : '#666'
                        }}>
                        {outcome}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                <button onClick={() => executeAction('Resolve Market')} 
                  style={{ ...buttonStyle, flex: 1, backgroundColor: '#1a0000', borderColor: '#ff0000', color: '#ff0000' }}>
                  [ ⚠ RESOLVE MARKET ]
                </button>
              </div>

              <div style={{ ...cardStyle, marginTop: '24px', borderColor: '#ff6600' }}>
                <div style={{ color: '#ff6600', fontWeight: 'bold', marginBottom: '8px' }}>⚠ WARNING</div>
                <div style={{ color: '#999', fontSize: '12px' }}>
                  This action is irreversible. Only the designated oracle can resolve.
                  Ensure the outcome is correct before confirming.
                </div>
              </div>

              <CodePreview code={generateCode('resolve')} />
            </div>
          )}

          {/* MARKETS TAB */}
          {activeTab === 'markets' && (
            <div>
              <SectionHeader>DEPLOYED MARKETS</SectionHeader>
              
              {markets.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: '48px', color: '#666' }}>
                  No markets deployed yet
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {markets.map(market => (
                    <div key={market.id} style={cardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{market.question}</div>
                          <div style={{ color: '#666', marginTop: '8px', fontSize: '11px' }}>
                            Resolution: {market.resolution}
                          </div>
                        </div>
                        <div style={{
                          padding: '4px 12px',
                          backgroundColor: market.status === 'ACTIVE' ? '#001a00' : '#1a1a00',
                          border: `1px solid ${market.status === 'ACTIVE' ? '#00ff00' : '#ffff00'}`,
                          color: market.status === 'ACTIVE' ? '#00ff00' : '#ffff00',
                          fontSize: '11px'
                        }}>
                          {market.status}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
                        <div style={{ color: '#666', fontSize: '11px' }}>
                          YES: <span style={{ color: '#00ff00' }}>{market.yesToken}</span>
                        </div>
                        <div style={{ color: '#666', fontSize: '11px' }}>
                          NO: <span style={{ color: '#ff6600' }}>{market.noToken}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Logs Sidebar */}
        <aside style={{
          width: '320px',
          borderLeft: '2px solid #333',
          backgroundColor: '#050505',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #333',
            fontWeight: 'bold',
            letterSpacing: '2px',
            fontSize: '11px'
          }}>
            TRANSACTION LOG
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {logs.length === 0 ? (
              <div style={{ color: '#333', padding: '16px', textAlign: 'center', fontSize: '11px' }}>
                Waiting for actions...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{
                  padding: '8px',
                  marginBottom: '4px',
                  backgroundColor: '#0a0a0a',
                  borderLeft: `3px solid ${
                    log.type === 'success' ? '#00ff00' : 
                    log.type === 'error' ? '#ff0000' : 
                    log.type === 'pending' ? '#ffff00' : '#666'
                  }`,
                  fontSize: '11px'
                }}>
                  <div style={{ color: '#666' }}>{log.timestamp}</div>
                  <div style={{ 
                    color: log.type === 'success' ? '#00ff00' : 
                           log.type === 'error' ? '#ff0000' : 
                           log.type === 'pending' ? '#ffff00' : '#fff',
                    marginTop: '4px'
                  }}>
                    {log.msg}
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{
            padding: '8px',
            borderTop: '1px solid #333'
          }}>
            <button onClick={() => setLogs([])} style={{ 
              ...buttonStyle, 
              width: '100%', 
              fontSize: '10px',
              padding: '8px',
              backgroundColor: 'transparent',
              borderColor: '#333',
              color: '#666'
            }}>
              CLEAR LOGS
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Shared Styles
const buttonStyle = {
  padding: '12px 24px',
  backgroundColor: 'transparent',
  border: '2px solid #00ff00',
  color: '#00ff00',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: '12px',
  fontWeight: 'bold',
  letterSpacing: '1px',
  cursor: 'pointer',
  transition: 'all 0.1s'
};

const cardStyle = {
  padding: '20px',
  backgroundColor: '#111',
  border: '1px solid #333'
};

// Components
const SectionHeader = ({ children }) => (
  <div style={{
    fontSize: '18px',
    fontWeight: 'bold',
    letterSpacing: '4px',
    paddingBottom: '12px',
    borderBottom: '2px solid #00ff00',
    marginBottom: '24px'
  }}>
    {children}
  </div>
);

const InputField = ({ label, value, onChange, placeholder, type = 'text', fullWidth }) => (
  <div style={{ marginBottom: fullWidth ? 0 : undefined }}>
    <label style={{ 
      display: 'block', 
      color: '#666', 
      fontSize: '11px', 
      marginBottom: '8px',
      letterSpacing: '1px'
    }}>
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '10px 12px',
        backgroundColor: '#0a0a0a',
        border: '1px solid #333',
        color: '#00ff00',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '13px',
        outline: 'none'
      }}
    />
  </div>
);

const InfoRow = ({ label, value, valueColor = '#fff', mono }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a1a' }}>
    <span style={{ color: '#666' }}>{label}</span>
    <span style={{ color: valueColor, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
  </div>
);

const CodePreview = ({ code }) => (
  <div style={{ marginTop: '32px' }}>
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 12px',
      backgroundColor: '#1a1a1a',
      borderTop: '1px solid #333',
      borderLeft: '1px solid #333',
      borderRight: '1px solid #333'
    }}>
      <span style={{ color: '#666', fontSize: '11px', letterSpacing: '1px' }}>GENERATED CODE</span>
      <button 
        onClick={() => navigator.clipboard?.writeText(code)}
        style={{
          padding: '4px 12px',
          backgroundColor: 'transparent',
          border: '1px solid #444',
          color: '#666',
          fontSize: '10px',
          cursor: 'pointer',
          fontFamily: 'inherit'
        }}>
        COPY
      </button>
    </div>
    <pre style={{
      margin: 0,
      padding: '16px',
      backgroundColor: '#0d0d0d',
      border: '1px solid #333',
      overflow: 'auto',
      maxHeight: '300px',
      fontSize: '11px',
      lineHeight: '1.6',
      color: '#888'
    }}>
      {code}
    </pre>
  </div>
);
