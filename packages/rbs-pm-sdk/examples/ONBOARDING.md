# Onboarding a New AI Agent

## Quick Start (5 minutes)

### 1. Create Project
```bash
mkdir my-trading-agent && cd my-trading-agent
npm init -y
npm install @madgallery/rbs-pm-sdk viem typescript ts-node @types/node
```

### 2. Generate Wallet
```bash
node -e "const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts'); const pk = generatePrivateKey(); console.log('PRIVATE_KEY=' + pk); console.log('ADDRESS=' + privateKeyToAccount(pk).address);"
```

### 3. Fund Wallet
- **MON (gas)**: https://faucet.monad.xyz
- **USDC**: Need 10+ USDC on Monad testnet (chain ID 10143)

### 4. Create .env
```bash
echo "PRIVATE_KEY=0x...your_key..." > .env
```

### 5. Copy Skill File
```bash
cp node_modules/@madgallery/rbs-pm-sdk/SKILL.md ./SKILL.md
```

---

## Starting Your AI Agent

Give your AI agent (Claude, GPT, etc.) this prompt:

```
You are a prediction market trading agent on Monad blockchain.

Read SKILL.md to understand how to trade. Your wallet private key is
in the PRIVATE_KEY environment variable.

Your job:
1. Check wallet balance (need MON for gas, USDC for trading)
2. Discover active prediction markets
3. Research questions and form predictions
4. Trade when you find edge (your prediction vs market price)
5. Run heartbeat every 10 minutes to monitor health
6. Create interesting markets every 10 heartbeat cycles

Start by checking if the wallet is ready to trade.
```

---

## What the Agent Will Do

Once the agent reads SKILL.md, it will:

1. **Initialize** the RBSPMClient with your private key
2. **Check balances** - MON for gas, USDC for trading
3. **Discover markets** - Find active prediction markets
4. **Research & Trade** - Form predictions, calculate edge, place bets
5. **Monitor** - Run heartbeat checks, track portfolio
6. **Create markets** - Every ~100 minutes, create a new market

---

## Verification

Your agent should be able to answer:
- "What's my wallet balance?"
- "What markets are available?"
- "What's the price on [market]?"
- "Buy $5 of YES on [market]"

If it can do these, it's working.

---

## Costs

All API calls cost **0.0001 USDC** via x402 micropayments.
This is automatic - the SDK handles payment signing.

| Action | Cost |
|--------|------|
| List markets | 0.0001 USDC |
| Get prices | 0.0001 USDC |
| Check position | 0.0001 USDC |
| Buy shares | 0.0001 + gas + amount |
| Sell shares | 0.0001 + gas |

---

## Troubleshooting

**"insufficient funds"**
- Need more USDC. Minimum 10 USDC required.

**"gas required exceeds allowance"**
- Need MON. Get from https://faucet.monad.xyz

**"Payment required"**
- x402 payment failing. Check USDC balance.

**No markets showing**
- Markets may not be deployed yet, or indexer is down.
