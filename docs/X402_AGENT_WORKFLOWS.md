# x402 Agent Workflows Schematic

## Overview

All API endpoints are protected by x402 micropayments (0.0001 USDC per call).
The SDK handles payment signing automatically when initialized with a private key.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        x402 PAYMENT FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Agent                    API Server              x402 Facilitator     │
│     │                          │                          │             │
│     │─── 1. Request ──────────▶│                          │             │
│     │                          │                          │             │
│     │◀── 2. 402 + Payment ────│                          │             │
│     │       Required Header    │                          │             │
│     │                          │                          │             │
│     │─── 3. Request + ────────▶│                          │             │
│     │    Signed Payment        │                          │             │
│     │                          │─── 4. Verify ───────────▶│             │
│     │                          │◀── 5. Valid ─────────────│             │
│     │                          │                          │             │
│     │                          │─── 6. Settle ───────────▶│             │
│     │                          │◀── 7. Settled ───────────│             │
│     │                          │                          │             │
│     │◀── 8. Response ─────────│                          │             │
│     │                          │                          │             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Endpoints by Category

### 1. Market Discovery (Read-Only)

| Endpoint | SDK Method | Cost | Description |
|----------|------------|------|-------------|
| `x402-markets` | `getMarkets()` | 0.0001 USDC | List all active markets |
| `x402-prices` | `getPrices(market)` | 0.0001 USDC | Get YES/NO prices |
| `x402-market-info` | `getMarketInfo(market)` | 0.0001 USDC | Full market details |
| `x402-market-data` | `getPremiumMarketData(market)` | 0.0001 USDC | Premium analytics |

```
┌─────────────────────────────────────────────────────────────────┐
│                    MARKET DISCOVERY FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────────┐     │
│   │  Agent   │───▶│ getMarkets() │───▶│ List of Markets  │     │
│   └──────────┘    └──────────────┘    └──────────────────┘     │
│        │                                       │                │
│        │         ┌──────────────┐              │                │
│        └────────▶│ getPrices()  │◀─────────────┘                │
│                  └──────────────┘                               │
│                         │                                       │
│                         ▼                                       │
│                  ┌──────────────┐                               │
│                  │ YES: 54.10%  │                               │
│                  │ NO:  45.90%  │                               │
│                  └──────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Portfolio Management

| Endpoint | SDK Method | Cost | Description |
|----------|------------|------|-------------|
| `x402-position` | `getPosition(market)` | 0.0001 USDC | Position in single market |
| `x402-portfolio` | `getPortfolio()` | 0.0001 USDC | All positions + summary |

```
┌─────────────────────────────────────────────────────────────────┐
│                    PORTFOLIO FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    ┌───────────────┐    ┌──────────────────┐    │
│   │  Agent   │───▶│ getPortfolio()│───▶│ All Positions    │    │
│   └──────────┘    └───────────────┘    │ + Total Value    │    │
│                                        │ + Unrealized PnL │    │
│                                        └──────────────────┘    │
│                                                                 │
│   Response:                                                     │
│   {                                                             │
│     positions: [                                                │
│       { market, yesShares, noShares, value, pnl }              │
│     ],                                                          │
│     summary: {                                                  │
│       totalPositions: 3,                                        │
│       totalValue: "15.50",                                      │
│       unrealizedPnL: "+2.30"                                    │
│     }                                                           │
│   }                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Trading

| Endpoint | SDK Method | Cost | Description |
|----------|------------|------|-------------|
| `x402-agent-trade` | `getTradeInstructions()` | 0.0001 USDC | Get encoded calldata |
| - | `buy(market, isYes, amount)` | 0.0001 + gas + amount | Execute buy trade |
| - | `sell(market, isYes, shares)` | 0.0001 + gas | Execute sell trade |

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRADING FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐                                                  │
│   │  Agent   │                                                  │
│   └────┬─────┘                                                  │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────────────┐                                          │
│   │ 1. Check prices │ ◀─── x402: 0.0001 USDC                   │
│   └────────┬────────┘                                          │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────┐                                          │
│   │ 2. Approve USDC │ ◀─── Gas only (if needed)                │
│   └────────┬────────┘                                          │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────┐                                          │
│   │ 3. Execute buy()│ ◀─── x402: 0.0001 USDC                   │
│   │    on-chain     │      + Gas                                │
│   └────────┬────────┘      + Trade Amount                      │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────┐                                          │
│   │ 4. Receive      │                                          │
│   │    shares       │                                          │
│   └─────────────────┘                                          │
│                                                                 │
│   Total Cost = 0.0002 USDC (API) + Gas + Trade Amount          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Market Creation

| Endpoint | SDK Method | Cost | Description |
|----------|------------|------|-------------|
| `x402-deploy-market` | `deployMarket()` | 0.0001 USDC + gas | Deploy new market |
| `x402-create-market` | `listMarket()` | 0.0001 USDC | List market for discovery |
| `x402-initialize` | `initializeMarket()` | 0.0001 USDC + gas | Initialize with liquidity |

```
┌─────────────────────────────────────────────────────────────────┐
│                   MARKET CREATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐                                                  │
│   │  Agent   │                                                  │
│   └────┬─────┘                                                  │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────────────────┐                                      │
│   │ 1. deployMarket()   │ ◀─── x402 + Gas + Liquidity          │
│   │    - question       │                                       │
│   │    - resolutionTime │                                       │
│   │    - initialLiq     │                                       │
│   └────────┬────────────┘                                      │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────────┐                                      │
│   │ 2. Contract deployed│                                      │
│   │    to: 0xABC...     │                                       │
│   └────────┬────────────┘                                      │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────────┐                                      │
│   │ 3. Auto-initialized │                                      │
│   │    with liquidity   │                                       │
│   └────────┬────────────┘                                      │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────────┐                                      │
│   │ 4. Auto-listed      │                                      │
│   │    for discovery    │                                       │
│   └─────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Resolution & Redemption

| Endpoint | SDK Method | Cost | Description |
|----------|------------|------|-------------|
| `x402-resolve` | `resolve(market, yesWins)` | 0.0001 USDC + gas | Resolve market (oracle only) |
| `x402-redeem` | `redeem(market)` | 0.0001 USDC + gas | Redeem winning shares |
| `x402-claim-fees` | `claimCreatorFees(market)` | 0.0001 USDC + gas | Claim accumulated fees |

```
┌─────────────────────────────────────────────────────────────────┐
│                  RESOLUTION & REDEMPTION FLOW                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   [Before Resolution]          [After Resolution]               │
│                                                                 │
│   ┌──────────┐                 ┌──────────┐                    │
│   │  Oracle  │                 │  Trader  │                    │
│   └────┬─────┘                 └────┬─────┘                    │
│        │                            │                          │
│        ▼                            │                          │
│   ┌──────────────┐                  │                          │
│   │ resolve()    │                  │                          │
│   │ yesWins=true │                  │                          │
│   └──────────────┘                  │                          │
│        │                            │                          │
│        ▼                            ▼                          │
│   ┌──────────────┐           ┌──────────────┐                  │
│   │ Market       │           │ redeem()     │                  │
│   │ RESOLVED     │──────────▶│ YES shares   │                  │
│   │ YES wins     │           │ → USDC       │                  │
│   └──────────────┘           └──────────────┘                  │
│                                                                 │
│   Payout: 1 USDC per winning share                             │
│   (minus any fees)                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Complete Agent Trading Session

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE AGENT SESSION                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. INITIALIZATION                                                     │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │ const client = new RBSPMClient({ privateKey: PK });         │      │
│   └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
│   2. DISCOVERY (0.0002 USDC)                                           │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │ const markets = await client.getMarkets();                  │      │
│   │ const prices = await client.getPrices(market);              │      │
│   └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
│   3. ANALYSIS                                                           │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │ if (prices.yes < 0.40 && myModel.predictYes > 0.60) {       │      │
│   │   // Opportunity detected!                                   │      │
│   │ }                                                            │      │
│   └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
│   4. TRADE (0.0001 USDC + gas + amount)                                │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │ const result = await client.buy(market, true, '10');        │      │
│   │ console.log('Bought shares:', result.sharesReceived);       │      │
│   └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
│   5. MONITOR (0.0001 USDC per check)                                   │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │ const portfolio = await client.getPortfolio();              │      │
│   │ console.log('Position value:', portfolio.summary.totalValue);│      │
│   └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
│   6. EXIT (after resolution)                                           │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │ await client.redeem(market);                                │      │
│   │ // Winning shares → USDC                                    │      │
│   └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Cost Summary

| Operation | x402 Cost | Gas | Other |
|-----------|-----------|-----|-------|
| Read endpoints | 0.0001 USDC | - | - |
| Buy shares | 0.0001 USDC | ~0.01 MON | Trade amount |
| Sell shares | 0.0001 USDC | ~0.01 MON | - |
| Deploy market | 0.0001 USDC | ~0.5 MON | Initial liquidity |
| Resolve | 0.0001 USDC | ~0.01 MON | - |
| Redeem | 0.0001 USDC | ~0.01 MON | - |

**Typical Trading Session Cost:**
- Discovery: 0.0002 USDC (markets + prices)
- Trade: 0.0001 USDC + gas + amount
- Monitor: 0.0001 USDC per check
- **Total API fees for basic session: ~0.0005 USDC**

---

## Network Configuration

```
Network:     Monad Testnet
Chain ID:    10143
RPC:         https://testnet-rpc.monad.xyz
USDC:        0x534b2f3A21130d7a60830c2Df862319e593943A3
Facilitator: https://x402-facilitator.molandak.org
```

---

## Test Results (2026-02-10)

| Endpoint | Status | Notes |
|----------|--------|-------|
| getMarkets() | ✅ | Returns all active markets |
| getPrices() | ✅ | Returns YES/NO prices |
| getMarketInfo() | ✅ | Full market details |
| getPremiumMarketData() | ✅ | Volume, trades, analytics |
| getPosition() | ✅ | User's position in market |
| getPortfolio() | ✅ | All positions + summary |
| buy() | ✅ | Executed trade, prices updated |
| getFeeInfo() | ✅ | Pending fees info |

**Total spent in testing: 0.0417 USDC** (including 0.1 USDC trade)
