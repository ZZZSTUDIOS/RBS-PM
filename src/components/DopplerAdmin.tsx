'use client';

import React, { useState, useEffect } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useBalance,
  useChainId,
  useSwitchChain,
} from 'wagmi';
import { formatEther, parseEther, type Address } from 'viem';
import {
  useTransactionLog,
  useDopplerTokenCreate,
  useDopplerQuote,
  useDopplerSwap,
  usePredictionMarket,
  useTokenBalance,
  type TokenConfig,
  type CurveConfig,
  type MarketConfig,
  type QuoteResult,
} from '../hooks/useDoppler';
import { ADDRESSES, monadTestnet } from '../config/wagmi';

export default function DopplerAdmin() {
  const [activeTab, setActiveTab] = useState('connect');
  const [deployedTokens, setDeployedTokens] = useState<{ yes?: Address; no?: Address }>({});
  const [markets, setMarkets] = useState<Array<{
    id: number;
    address: Address;
    question: string;
    status: string;
    yesToken: Address;
    noToken: Address;
    resolution: string;
  }>>([]);

  // Wallet hooks
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address });

  // Custom hooks
  const { logs, addLog, clearLogs } = useTransactionLog();
  const { createToken, isLoading: isCreatingToken } = useDopplerTokenCreate();
  const { getQuote, isLoading: isQuoting } = useDopplerQuote();
  const { executeSwap, isLoading: isSwapping } = useDopplerSwap();
  const { createMarket, resolveMarket, redeemTokens, isLoading: isMarketLoading } = usePredictionMarket();

  // Token Creation State
  const [tokenConfig, setTokenConfig] = useState<{
    yesName: string;
    yesSymbol: string;
    noName: string;
    noSymbol: string;
    totalSupply: string;
    tokensToSell: string;
    tokenURI: string;
  }>({
    yesName: 'ETH10K-YES',
    yesSymbol: 'YES',
    noName: 'ETH10K-NO',
    noSymbol: 'NO',
    totalSupply: '1000000000',
    tokensToSell: '900000000',
    tokenURI: 'https://api.example.com/metadata.json',
  });

  // Curve Config
  const [curves, setCurves] = useState<CurveConfig[]>([
    { startMcap: 1000, endMcap: 10000, positions: 5, shares: 0.3 },
    { startMcap: 10000, endMcap: 100000, positions: 10, shares: 0.5 },
    { startMcap: 100000, endMcap: 0, positions: 5, shares: 0.2 },
  ]);

  // Market Creation State
  const [marketConfig, setMarketConfig] = useState<MarketConfig>({
    question: 'Will ETH hit $10,000 by end of 2026?',
    resolutionDate: '2026-12-31',
    oracle: '',
    yesToken: '',
    noToken: '',
    collateralAmount: '100',
  });

  // Quote State
  const [quoteParams, setQuoteParams] = useState({
    tokenAddress: '',
    hookAddress: '',
    amount: '1',
    direction: 'buy' as 'buy' | 'sell',
  });
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);

  // Resolution State
  const [resolution, setResolution] = useState({
    marketAddress: '',
    outcome: 'YES' as 'YES' | 'NO' | 'INVALID',
  });

  // Check chain and prompt switch
  useEffect(() => {
    if (isConnected && chainId !== monadTestnet.id) {
      addLog(`Wrong network. Please switch to Monad Testnet`, 'error');
    }
  }, [isConnected, chainId, addLog]);

  // Update market config when tokens are deployed
  useEffect(() => {
    if (deployedTokens.yes) {
      setMarketConfig(prev => ({ ...prev, yesToken: deployedTokens.yes! }));
    }
    if (deployedTokens.no) {
      setMarketConfig(prev => ({ ...prev, noToken: deployedTokens.no! }));
    }
  }, [deployedTokens]);

  // Handlers
  const handleConnect = async (connector: any) => {
    try {
      addLog(`Connecting via ${connector.name}...`, 'pending');
      await connect({ connector });
    } catch (err: any) {
      addLog(`Connection failed: ${err.message}`, 'error');
    }
  };

  const handleSwitchChain = async () => {
    try {
      addLog('Switching to Monad Testnet...', 'pending');
      await switchChain({ chainId: monadTestnet.id });
      addLog('Switched to Monad Testnet', 'success');
    } catch (err: any) {
      addLog(`Failed to switch: ${err.message}`, 'error');
    }
  };

  const handleCreateToken = async (type: 'yes' | 'no') => {
    const config: TokenConfig = {
      name: type === 'yes' ? tokenConfig.yesName : tokenConfig.noName,
      symbol: type === 'yes' ? tokenConfig.yesSymbol : tokenConfig.noSymbol,
      tokenURI: tokenConfig.tokenURI,
      initialSupply: tokenConfig.totalSupply,
      numTokensToSell: tokenConfig.tokensToSell,
    };

    const result = await createToken(config, curves, addLog);
    
    if (result) {
      setDeployedTokens(prev => ({
        ...prev,
        [type]: result.tokenAddress,
      }));
    }
  };

  const handleGetQuote = async () => {
    if (!quoteParams.tokenAddress) {
      addLog('Please enter token address', 'error');
      return;
    }

    const result = await getQuote(
      quoteParams.tokenAddress as Address,
      (quoteParams.hookAddress || quoteParams.tokenAddress) as Address,
      quoteParams.amount,
      quoteParams.direction === 'buy',
      addLog
    );

    if (result) {
      setQuoteResult(result);
    }
  };

  const handleCreateMarket = async () => {
    if (!marketConfig.yesToken || !marketConfig.noToken) {
      addLog('Please deploy YES and NO tokens first', 'error');
      return;
    }

    const marketAddress = await createMarket(marketConfig, addLog);

    if (marketAddress) {
      setMarkets(prev => [
        ...prev,
        {
          id: prev.length + 1,
          address: marketAddress,
          question: marketConfig.question,
          status: 'ACTIVE',
          yesToken: marketConfig.yesToken as Address,
          noToken: marketConfig.noToken as Address,
          resolution: marketConfig.resolutionDate,
        },
      ]);
    }
  };

  const handleResolveMarket = async () => {
    if (!resolution.marketAddress) {
      addLog('Please enter market address', 'error');
      return;
    }

    const outcomeMap = { YES: 1, NO: 2, INVALID: 3 };
    await resolveMarket(
      resolution.marketAddress as Address,
      outcomeMap[resolution.outcome],
      addLog
    );
  };

  // Tabs configuration
  const tabs = [
    { id: 'connect', label: 'WALLET' },
    { id: 'tokens', label: 'TOKENS' },
    { id: 'curves', label: 'CURVES' },
    { id: 'market', label: 'MARKET' },
    { id: 'quote', label: 'QUOTE' },
    { id: 'swap', label: 'SWAP' },
    { id: 'resolve', label: 'RESOLVE' },
    { id: 'markets', label: 'MARKETS' },
  ];

  const isWrongChain = isConnected && chainId !== monadTestnet.id;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>◈ DOPPLER</div>
          <div style={styles.badge}>PREDICTION MARKETS</div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.networkBadge}>
            {isWrongChain ? (
              <span style={{ color: '#ff6600' }}>⚠ WRONG NETWORK</span>
            ) : (
              `MONAD TESTNET [${monadTestnet.id}]`
            )}
          </div>
          {isConnected && address && (
            <div style={styles.walletBadge}>
              {address.slice(0, 6)}...{address.slice(-4)} | {balance ? parseFloat(formatEther(balance.value)).toFixed(4) : '0'} MON
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.navButton,
              backgroundColor: activeTab === tab.id ? '#00ff00' : 'transparent',
              color: activeTab === tab.id ? '#000' : '#00ff00',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div style={styles.mainContainer}>
        {/* Main Content */}
        <main style={styles.main}>
          {/* WALLET TAB */}
          {activeTab === 'connect' && (
            <div>
              <SectionHeader>WALLET CONNECTION</SectionHeader>
              
              {!isConnected ? (
                <div style={styles.card}>
                  <div style={{ marginBottom: '16px', color: '#666' }}>
                    Select a wallet to connect:
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {connectors.map(connector => (
                      <button
                        key={connector.uid}
                        onClick={() => handleConnect(connector)}
                        disabled={isConnecting}
                        style={{
                          ...styles.button,
                          opacity: isConnecting ? 0.5 : 1,
                        }}
                      >
                        [ {isConnecting ? 'CONNECTING...' : `CONNECT ${connector.name.toUpperCase()}`} ]
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {isWrongChain && (
                    <div style={{ ...styles.card, borderColor: '#ff6600', marginBottom: '24px' }}>
                      <div style={{ color: '#ff6600', fontWeight: 'bold', marginBottom: '12px' }}>
                        ⚠ WRONG NETWORK
                      </div>
                      <p style={{ color: '#999', marginBottom: '16px' }}>
                        Please switch to Monad Testnet to continue.
                      </p>
                      <button onClick={handleSwitchChain} style={styles.button}>
                        [ SWITCH TO MONAD TESTNET ]
                      </button>
                    </div>
                  )}

                  <div style={styles.card}>
                    <InfoRow label="STATUS" value="● CONNECTED" valueColor="#00ff00" />
                    <InfoRow label="ADDRESS" value={address || ''} mono />
                    <InfoRow label="BALANCE" value={`${balance ? parseFloat(formatEther(balance.value)).toFixed(4) : '0'} MON`} />
                    <InfoRow label="CHAIN ID" value={chainId?.toString() || ''} />
                    <div style={{ marginTop: '16px' }}>
                      <button
                        onClick={() => {
                          disconnect();
                          addLog('Disconnected', 'info');
                        }}
                        style={{ ...styles.button, borderColor: '#ff0000', color: '#ff0000' }}
                      >
                        [ DISCONNECT ]
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '32px' }}>
                <SectionHeader>CONTRACT ADDRESSES</SectionHeader>
                <div style={{ ...styles.card, marginTop: '16px' }}>
                  <InfoRow label="WMON" value={ADDRESSES.WMON} mono />
                  <InfoRow label="DOPPLER AIRLOCK" value={ADDRESSES.DOPPLER.airlock || 'Not configured'} mono />
                  <InfoRow label="PREDICTION FACTORY" value={ADDRESSES.PREDICTION_FACTORY || 'Not deployed'} mono />
                  {deployedTokens.yes && <InfoRow label="YES TOKEN" value={deployedTokens.yes} mono valueColor="#00ff00" />}
                  {deployedTokens.no && <InfoRow label="NO TOKEN" value={deployedTokens.no} mono valueColor="#ff6600" />}
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
                <div style={styles.card}>
                  <div style={{ color: '#00ff00', fontWeight: 'bold', marginBottom: '16px' }}>
                    YES TOKEN {deployedTokens.yes && '✓'}
                  </div>
                  <InputField
                    label="NAME"
                    value={tokenConfig.yesName}
                    onChange={v => setTokenConfig(p => ({ ...p, yesName: v }))}
                  />
                  <InputField
                    label="SYMBOL"
                    value={tokenConfig.yesSymbol}
                    onChange={v => setTokenConfig(p => ({ ...p, yesSymbol: v }))}
                  />
                  {deployedTokens.yes && (
                    <div style={{ marginTop: '12px', fontSize: '11px', color: '#00ff00' }}>
                      Deployed: {deployedTokens.yes.slice(0, 10)}...
                    </div>
                  )}
                </div>
                <div style={styles.card}>
                  <div style={{ color: '#ff6600', fontWeight: 'bold', marginBottom: '16px' }}>
                    NO TOKEN {deployedTokens.no && '✓'}
                  </div>
                  <InputField
                    label="NAME"
                    value={tokenConfig.noName}
                    onChange={v => setTokenConfig(p => ({ ...p, noName: v }))}
                  />
                  <InputField
                    label="SYMBOL"
                    value={tokenConfig.noSymbol}
                    onChange={v => setTokenConfig(p => ({ ...p, noSymbol: v }))}
                  />
                  {deployedTokens.no && (
                    <div style={{ marginTop: '12px', fontSize: '11px', color: '#ff6600' }}>
                      Deployed: {deployedTokens.no.slice(0, 10)}...
                    </div>
                  )}
                </div>
              </div>

              <div style={{ ...styles.card, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>SUPPLY CONFIG</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <InputField
                    label="TOTAL SUPPLY"
                    value={tokenConfig.totalSupply}
                    onChange={v => setTokenConfig(p => ({ ...p, totalSupply: v }))}
                  />
                  <InputField
                    label="TOKENS TO SELL"
                    value={tokenConfig.tokensToSell}
                    onChange={v => setTokenConfig(p => ({ ...p, tokensToSell: v }))}
                  />
                  <InputField
                    label="TOKEN URI"
                    value={tokenConfig.tokenURI}
                    onChange={v => setTokenConfig(p => ({ ...p, tokenURI: v }))}
                  />
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', gap: '16px' }}>
                <button
                  onClick={() => handleCreateToken('yes')}
                  disabled={isCreatingToken || !isConnected || isWrongChain}
                  style={{
                    ...styles.button,
                    opacity: isCreatingToken || !isConnected || isWrongChain ? 0.5 : 1,
                  }}
                >
                  [ {isCreatingToken ? 'DEPLOYING...' : 'DEPLOY YES TOKEN'} ]
                </button>
                <button
                  onClick={() => handleCreateToken('no')}
                  disabled={isCreatingToken || !isConnected || isWrongChain}
                  style={{
                    ...styles.button,
                    borderColor: '#ff6600',
                    color: '#ff6600',
                    opacity: isCreatingToken || !isConnected || isWrongChain ? 0.5 : 1,
                  }}
                >
                  [ {isCreatingToken ? 'DEPLOYING...' : 'DEPLOY NO TOKEN'} ]
                </button>
              </div>
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
                <div key={i} style={{ ...styles.card, marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <span style={{ fontWeight: 'bold' }}>CURVE {i + 1}</span>
                    <span style={{ color: '#666' }}>{(curve.shares * 100).toFixed(0)}% of supply</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    <InputField
                      label="START MCAP ($)"
                      value={curve.startMcap.toString()}
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].startMcap = Number(v) || 0;
                        setCurves(newCurves);
                      }}
                    />
                    <InputField
                      label="END MCAP ($)"
                      value={curve.endMcap === 0 ? '' : curve.endMcap.toString()}
                      placeholder="MAX"
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].endMcap = Number(v) || 0;
                        setCurves(newCurves);
                      }}
                    />
                    <InputField
                      label="POSITIONS"
                      value={curve.positions.toString()}
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].positions = Number(v) || 1;
                        setCurves(newCurves);
                      }}
                    />
                    <InputField
                      label="SHARES"
                      value={curve.shares.toString()}
                      onChange={v => {
                        const newCurves = [...curves];
                        newCurves[i].shares = Number(v) || 0;
                        setCurves(newCurves);
                      }}
                    />
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  onClick={() => setCurves([...curves, { startMcap: 0, endMcap: 0, positions: 5, shares: 0.1 }])}
                  style={{ ...styles.button, flex: 1 }}
                >
                  [ + ADD CURVE ]
                </button>
                {curves.length > 1 && (
                  <button
                    onClick={() => setCurves(curves.slice(0, -1))}
                    style={{ ...styles.button, borderColor: '#ff0000', color: '#ff0000' }}
                  >
                    [ - REMOVE ]
                  </button>
                )}
              </div>

              {/* Curve Visualization */}
              <div style={{ ...styles.card, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>CURVE VISUALIZATION</div>
                <div
                  style={{
                    height: '120px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '4px',
                    padding: '16px',
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                  }}
                >
                  {curves.map((curve, i) => (
                    <div
                      key={i}
                      style={{
                        flex: curve.shares,
                        height: `${20 + i * 30}%`,
                        backgroundColor: i === 0 ? '#004400' : i === 1 ? '#006600' : '#00ff00',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        border: '1px solid #00ff00',
                      }}
                    >
                      {(curve.shares * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#666', fontSize: '11px' }}>
                  <span>${curves[0]?.startMcap.toLocaleString()}</span>
                  <span>→ Price Discovery →</span>
                  <span>MAX</span>
                </div>
              </div>
            </div>
          )}

          {/* MARKET TAB */}
          {activeTab === 'market' && (
            <div>
              <SectionHeader>CREATE PREDICTION MARKET</SectionHeader>

              <div style={styles.card}>
                <InputField
                  label="QUESTION"
                  value={marketConfig.question}
                  onChange={v => setMarketConfig(p => ({ ...p, question: v }))}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <InputField
                    label="RESOLUTION DATE"
                    value={marketConfig.resolutionDate}
                    type="date"
                    onChange={v => setMarketConfig(p => ({ ...p, resolutionDate: v }))}
                  />
                  <InputField
                    label="ORACLE ADDRESS"
                    value={marketConfig.oracle}
                    placeholder={address || '0x...'}
                    onChange={v => setMarketConfig(p => ({ ...p, oracle: v }))}
                  />
                </div>
              </div>

              <div style={{ ...styles.card, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>TOKEN ADDRESSES</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <InputField
                    label="YES TOKEN"
                    value={marketConfig.yesToken}
                    placeholder="0x..."
                    onChange={v => setMarketConfig(p => ({ ...p, yesToken: v }))}
                  />
                  <InputField
                    label="NO TOKEN"
                    value={marketConfig.noToken}
                    placeholder="0x..."
                    onChange={v => setMarketConfig(p => ({ ...p, noToken: v }))}
                  />
                </div>
                {(!marketConfig.yesToken || !marketConfig.noToken) && (
                  <div style={{ marginTop: '12px', color: '#ff6600', fontSize: '11px' }}>
                    ⚠ Deploy tokens in the TOKENS tab first, or enter existing addresses
                  </div>
                )}
              </div>

              <div style={{ ...styles.card, marginTop: '24px' }}>
                <InputField
                  label="INITIAL COLLATERAL (WMON)"
                  value={marketConfig.collateralAmount}
                  onChange={v => setMarketConfig(p => ({ ...p, collateralAmount: v }))}
                />
              </div>

              <button
                onClick={handleCreateMarket}
                disabled={isMarketLoading || !isConnected || isWrongChain || !marketConfig.yesToken || !marketConfig.noToken}
                style={{
                  ...styles.button,
                  width: '100%',
                  marginTop: '24px',
                  padding: '16px',
                  opacity: isMarketLoading || !isConnected || isWrongChain || !marketConfig.yesToken || !marketConfig.noToken ? 0.5 : 1,
                }}
              >
                [ {isMarketLoading ? 'DEPLOYING...' : 'DEPLOY PREDICTION MARKET'} ]
              </button>
            </div>
          )}

          {/* QUOTE TAB */}
          {activeTab === 'quote' && (
            <div>
              <SectionHeader>GET PRICE QUOTE</SectionHeader>

              <div style={styles.card}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                  <InputField
                    label="TOKEN ADDRESS"
                    value={quoteParams.tokenAddress}
                    placeholder="0x..."
                    onChange={v => setQuoteParams(p => ({ ...p, tokenAddress: v }))}
                  />
                  <InputField
                    label="AMOUNT (WMON)"
                    value={quoteParams.amount}
                    onChange={v => setQuoteParams(p => ({ ...p, amount: v }))}
                  />
                </div>
                <InputField
                  label="HOOK ADDRESS (optional)"
                  value={quoteParams.hookAddress}
                  placeholder="Same as token if empty"
                  onChange={v => setQuoteParams(p => ({ ...p, hookAddress: v }))}
                />
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px' }}>
                    DIRECTION
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setQuoteParams(p => ({ ...p, direction: 'buy' }))}
                      style={{
                        ...styles.button,
                        flex: 1,
                        backgroundColor: quoteParams.direction === 'buy' ? '#00ff00' : 'transparent',
                        color: quoteParams.direction === 'buy' ? '#000' : '#00ff00',
                      }}
                    >
                      BUY
                    </button>
                    <button
                      onClick={() => setQuoteParams(p => ({ ...p, direction: 'sell' }))}
                      style={{
                        ...styles.button,
                        flex: 1,
                        backgroundColor: quoteParams.direction === 'sell' ? '#ff6600' : 'transparent',
                        color: quoteParams.direction === 'sell' ? '#000' : '#ff6600',
                        borderColor: '#ff6600',
                      }}
                    >
                      SELL
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleGetQuote}
                disabled={isQuoting || !quoteParams.tokenAddress}
                style={{
                  ...styles.button,
                  marginTop: '24px',
                  opacity: isQuoting || !quoteParams.tokenAddress ? 0.5 : 1,
                }}
              >
                [ {isQuoting ? 'FETCHING...' : 'GET QUOTE'} ]
              </button>

              {quoteResult && (
                <div style={{ ...styles.card, marginTop: '24px', backgroundColor: '#001a00', borderColor: '#00ff00' }}>
                  <div style={{ fontWeight: 'bold', color: '#00ff00', marginBottom: '16px' }}>QUOTE RESULT</div>
                  <InfoRow label="INPUT" value={`${quoteResult.amountIn} WMON`} />
                  <InfoRow label="OUTPUT" value={`${quoteResult.amountOut} TOKENS`} />
                  <InfoRow label="PRICE" value={`${quoteResult.pricePerToken} WMON/TKN`} />
                  <InfoRow
                    label="PRICE IMPACT"
                    value={`${quoteResult.priceImpact}%`}
                    valueColor={parseFloat(quoteResult.priceImpact) > 1 ? '#ff6600' : '#00ff00'}
                  />
                </div>
              )}
            </div>
          )}

          {/* SWAP TAB */}
          {activeTab === 'swap' && (
            <div>
              <SectionHeader>EXECUTE SWAP</SectionHeader>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                Trade outcome tokens via Doppler bonding curves
              </p>

              <div style={{ ...styles.card, borderColor: '#ff6600' }}>
                <div style={{ color: '#ff6600', fontWeight: 'bold', marginBottom: '8px' }}>⚠ COMING SOON</div>
                <div style={{ color: '#999', fontSize: '12px' }}>
                  Swap functionality requires Universal Router integration.
                  Use the QUOTE tab to preview trades, then execute via the Doppler UI.
                </div>
              </div>
            </div>
          )}

          {/* RESOLVE TAB */}
          {activeTab === 'resolve' && (
            <div>
              <SectionHeader>RESOLVE MARKET</SectionHeader>
              <p style={{ color: '#666', marginBottom: '24px' }}>Oracle-only function to set the final outcome</p>

              <div style={styles.card}>
                <InputField
                  label="MARKET ADDRESS"
                  value={resolution.marketAddress}
                  placeholder="0x..."
                  onChange={v => setResolution(p => ({ ...p, marketAddress: v }))}
                />
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px' }}>
                    OUTCOME
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {(['YES', 'NO', 'INVALID'] as const).map(outcome => (
                      <button
                        key={outcome}
                        onClick={() => setResolution(p => ({ ...p, outcome }))}
                        style={{
                          ...styles.button,
                          backgroundColor: resolution.outcome === outcome
                            ? outcome === 'YES' ? '#00ff00' : outcome === 'NO' ? '#ff6600' : '#666'
                            : 'transparent',
                          color: resolution.outcome === outcome
                            ? '#000'
                            : outcome === 'YES' ? '#00ff00' : outcome === 'NO' ? '#ff6600' : '#666',
                          borderColor: outcome === 'YES' ? '#00ff00' : outcome === 'NO' ? '#ff6600' : '#666',
                        }}
                      >
                        {outcome}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleResolveMarket}
                disabled={isMarketLoading || !resolution.marketAddress || !isConnected || isWrongChain}
                style={{
                  ...styles.button,
                  width: '100%',
                  marginTop: '24px',
                  backgroundColor: '#1a0000',
                  borderColor: '#ff0000',
                  color: '#ff0000',
                  padding: '16px',
                  opacity: isMarketLoading || !resolution.marketAddress || !isConnected || isWrongChain ? 0.5 : 1,
                }}
              >
                [ {isMarketLoading ? 'RESOLVING...' : '⚠ RESOLVE MARKET'} ]
              </button>

              <div style={{ ...styles.card, marginTop: '24px', borderColor: '#ff6600' }}>
                <div style={{ color: '#ff6600', fontWeight: 'bold', marginBottom: '8px' }}>⚠ WARNING</div>
                <div style={{ color: '#999', fontSize: '12px' }}>
                  This action is irreversible. Only the designated oracle can resolve.
                  Ensure the outcome is correct before confirming.
                </div>
              </div>
            </div>
          )}

          {/* MARKETS TAB */}
          {activeTab === 'markets' && (
            <div>
              <SectionHeader>DEPLOYED MARKETS</SectionHeader>

              {markets.length === 0 ? (
                <div style={{ ...styles.card, textAlign: 'center', padding: '48px', color: '#666' }}>
                  No markets deployed yet. Create one in the MARKET tab.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {markets.map(market => (
                    <div key={market.id} style={styles.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{market.question}</div>
                          <div style={{ color: '#666', marginTop: '8px', fontSize: '11px' }}>
                            Resolution: {market.resolution}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: '4px 12px',
                            backgroundColor: market.status === 'ACTIVE' ? '#001a00' : '#1a1a00',
                            border: `1px solid ${market.status === 'ACTIVE' ? '#00ff00' : '#ffff00'}`,
                            color: market.status === 'ACTIVE' ? '#00ff00' : '#ffff00',
                            fontSize: '11px',
                          }}
                        >
                          {market.status}
                        </div>
                      </div>
                      <div style={{ marginTop: '12px', fontSize: '11px' }}>
                        <div style={{ color: '#666' }}>
                          Contract: <span style={{ color: '#fff' }}>{market.address}</span>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                        <div style={{ color: '#666', fontSize: '11px' }}>
                          YES: <span style={{ color: '#00ff00' }}>{market.yesToken.slice(0, 10)}...</span>
                        </div>
                        <div style={{ color: '#666', fontSize: '11px' }}>
                          NO: <span style={{ color: '#ff6600' }}>{market.noToken.slice(0, 10)}...</span>
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
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>TRANSACTION LOG</div>
          <div style={styles.logsContainer}>
            {logs.length === 0 ? (
              <div style={{ color: '#333', padding: '16px', textAlign: 'center', fontSize: '11px' }}>
                Waiting for actions...
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.logEntry,
                    borderLeftColor:
                      log.type === 'success' ? '#00ff00' :
                      log.type === 'error' ? '#ff0000' :
                      log.type === 'pending' ? '#ffff00' : '#666',
                  }}
                >
                  <div style={{ color: '#666' }}>{log.timestamp}</div>
                  <div
                    style={{
                      color:
                        log.type === 'success' ? '#00ff00' :
                        log.type === 'error' ? '#ff0000' :
                        log.type === 'pending' ? '#ffff00' : '#fff',
                      marginTop: '4px',
                      wordBreak: 'break-all',
                    }}
                  >
                    {log.msg}
                  </div>
                  {log.txHash && (
                    <a
                      href={`${monadTestnet.blockExplorers.default.url}/tx/${log.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#00ff00', fontSize: '10px', marginTop: '4px', display: 'block' }}
                    >
                      View TX →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
          <div style={styles.sidebarFooter}>
            <button onClick={clearLogs} style={styles.clearButton}>
              CLEAR LOGS
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#00ff00',
    fontFamily: '"IBM Plex Mono", "Courier New", monospace',
    fontSize: '13px',
  },
  header: {
    borderBottom: '3px solid #00ff00',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    letterSpacing: '4px',
    textTransform: 'uppercase',
  },
  badge: {
    padding: '4px 12px',
    border: '2px solid #00ff00',
    fontSize: '11px',
    letterSpacing: '2px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  networkBadge: {
    padding: '4px 12px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    fontSize: '11px',
  },
  walletBadge: {
    padding: '4px 12px',
    backgroundColor: '#001a00',
    border: '1px solid #00ff00',
  },
  nav: {
    display: 'flex',
    borderBottom: '2px solid #333',
    backgroundColor: '#0d0d0d',
  },
  navButton: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    color: '#00ff00',
    border: 'none',
    borderRight: '1px solid #333',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
    fontWeight: 'bold',
    letterSpacing: '2px',
    transition: 'all 0.1s',
  },
  mainContainer: {
    display: 'flex',
    height: 'calc(100vh - 120px)',
  },
  main: {
    flex: 1,
    padding: '24px',
    overflowY: 'auto',
  },
  card: {
    padding: '20px',
    backgroundColor: '#111',
    border: '1px solid #333',
  },
  button: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: '2px solid #00ff00',
    color: '#00ff00',
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: '12px',
    fontWeight: 'bold',
    letterSpacing: '1px',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  sidebar: {
    width: '320px',
    borderLeft: '2px solid #333',
    backgroundColor: '#050505',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #333',
    fontWeight: 'bold',
    letterSpacing: '2px',
    fontSize: '11px',
  },
  logsContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  logEntry: {
    padding: '8px',
    marginBottom: '4px',
    backgroundColor: '#0a0a0a',
    borderLeft: '3px solid #666',
    fontSize: '11px',
  },
  sidebarFooter: {
    padding: '8px',
    borderTop: '1px solid #333',
  },
  clearButton: {
    width: '100%',
    padding: '8px',
    backgroundColor: 'transparent',
    border: '1px solid #333',
    color: '#666',
    fontFamily: 'inherit',
    fontSize: '10px',
    cursor: 'pointer',
  },
};

// Components
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '18px',
        fontWeight: 'bold',
        letterSpacing: '4px',
        paddingBottom: '12px',
        borderBottom: '2px solid #00ff00',
        marginBottom: '24px',
      }}
    >
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label
        style={{
          display: 'block',
          color: '#666',
          fontSize: '11px',
          marginBottom: '8px',
          letterSpacing: '1px',
        }}
      >
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
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueColor = '#fff',
  mono,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid #1a1a1a',
      }}
    >
      <span style={{ color: '#666' }}>{label}</span>
      <span
        style={{
          color: valueColor,
          fontFamily: mono ? 'monospace' : 'inherit',
          wordBreak: 'break-all',
          textAlign: 'right',
          maxWidth: '60%',
        }}
      >
        {value}
      </span>
    </div>
  );
}
