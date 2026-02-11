// Edge Function: indexer
// Syncs on-chain events to database using Envio HyperSync
// Scheduled via pg_cron every minute

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Monad Testnet configuration
const CHAIN_ID = 10143;
const RPC_URL = "https://testnet-rpc.monad.xyz";
const HYPERSYNC_URL = "https://monad-testnet.hypersync.xyz";

// Event signatures (keccak256 hashes) — from LSLMSR_ERC20 contract
const EVENT_SIGS = {
  SharesPurchased:
    "0x9bd054fb950acb82b978a4ba93668286e2c3fa8c43589f21061c8520068ba80c",
  SharesSold:
    "0xcf06b88583ec57d4cf2f6795931fe9057d95a86052efc8d8b3a4cad0e885d5e9",
  Redeemed:
    "0xf3a670cd3af7d64b488926880889d08a8585a138ff455227af6737339a1ec262",
  MarketResolved:
    "0xf528f3b02f5c2503827fc677c9d0cb54ffbf11ed32cb659f73243b70dea7cf0e",
} as const;

// Fee rate: 0.5% on BUY trades
const FEE_RATE = 0.005;

// Parse hex to decimal string with proper decimals
function hexToDecimalString(hex: string, decimals: number): string {
  const value = BigInt(hex);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole}.${fractionStr}`;
}

interface HyperSyncLog {
  address: string;
  topics: string[];
  data: string;
  block_number: number;
  transaction_hash: string;
  log_index: number;
}

interface HyperSyncRawLog {
  address?: string;
  topic0?: string;
  topic1?: string;
  topic2?: string;
  topic3?: string;
  data?: string;
  block_number?: number;
  transaction_hash?: string;
  log_index?: number;
}

interface HyperSyncResponse {
  data: Array<{ logs?: HyperSyncRawLog[] }>;
  next_block?: number;
}

interface ParsedTrade {
  tradeType: "BUY" | "SELL" | "REDEEM";
  trader: string;
  outcome: "YES" | "NO";
  shares: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  marketAddress: string;
}

// Build headers for HyperSync (only include auth if token provided)
function hyperSyncHeaders(bearerToken: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

// Fetch current chain height from HyperSync
async function getChainHeight(bearerToken: string): Promise<number> {
  const resp = await fetch(`${HYPERSYNC_URL}/height`, {
    headers: hyperSyncHeaders(bearerToken),
  });
  if (!resp.ok) throw new Error(`HyperSync /height failed: ${resp.status}`);
  const result = await resp.json();
  // Response is either a number or { height: number }
  return typeof result === "number" ? result : result.height;
}

// Query HyperSync for logs with pagination
async function queryHyperSync(
  fromBlock: number,
  toBlock: number,
  addresses: string[],
  bearerToken: string
): Promise<HyperSyncLog[]> {
  const allLogs: HyperSyncLog[] = [];
  let currentFrom = fromBlock;

  while (currentFrom <= toBlock) {
    const query = {
      from_block: currentFrom,
      to_block: toBlock + 1, // HyperSync uses exclusive upper bound
      logs: [
        {
          address: addresses,
          topics: [
            [
              EVENT_SIGS.SharesPurchased,
              EVENT_SIGS.SharesSold,
              EVENT_SIGS.Redeemed,
              EVENT_SIGS.MarketResolved,
            ],
          ],
        },
      ],
      field_selection: {
        log: [
          "address",
          "topic0",
          "topic1",
          "topic2",
          "topic3",
          "data",
          "block_number",
          "transaction_hash",
          "log_index",
        ],
      },
    };

    const resp = await fetch(`${HYPERSYNC_URL}/query`, {
      method: "POST",
      headers: hyperSyncHeaders(bearerToken, true),
      body: JSON.stringify(query),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HyperSync /query failed: ${resp.status} - ${text}`);
    }

    const result: HyperSyncResponse = await resp.json();

    // Flatten nested structure: data is array of batches, each with a logs array
    // Normalize topics from separate fields (topic0..topic3) into topics array
    for (const batch of result.data || []) {
      for (const raw of batch.logs || []) {
        allLogs.push({
          address: raw.address || "",
          topics: [raw.topic0, raw.topic1, raw.topic2, raw.topic3].filter(
            Boolean
          ) as string[],
          data: raw.data || "0x",
          block_number: raw.block_number || 0,
          transaction_hash: raw.transaction_hash || "",
          log_index: raw.log_index || 0,
        });
      }
    }

    // Paginate: if next_block is returned and within range, continue
    if (result.next_block && result.next_block <= toBlock) {
      currentFrom = result.next_block;
    } else {
      break;
    }
  }

  return allLogs;
}

// Parse a single log into a trade
function parseLog(log: HyperSyncLog): ParsedTrade | null {
  const topic0 = log.topics[0];

  if (topic0 === EVENT_SIGS.SharesPurchased) {
    // SharesPurchased(address indexed buyer, bool isYes, uint256 shares, uint256 cost)
    const trader = "0x" + log.topics[1].slice(26);
    const data = log.data.slice(2);
    const isYes = BigInt("0x" + data.slice(0, 64)) !== 0n;
    const sharesHex = "0x" + data.slice(64, 128);
    const costHex = "0x" + data.slice(128, 192);

    return {
      tradeType: "BUY",
      trader,
      outcome: isYes ? "YES" : "NO",
      shares: hexToDecimalString(sharesHex, 18),
      amount: hexToDecimalString(costHex, 6),
      txHash: log.transaction_hash,
      blockNumber: log.block_number,
      marketAddress: log.address.toLowerCase(),
    };
  }

  if (topic0 === EVENT_SIGS.SharesSold) {
    // SharesSold(address indexed seller, bool isYes, uint256 shares, uint256 payout)
    const trader = "0x" + log.topics[1].slice(26);
    const data = log.data.slice(2);
    const isYes = BigInt("0x" + data.slice(0, 64)) !== 0n;
    const sharesHex = "0x" + data.slice(64, 128);
    const payoutHex = "0x" + data.slice(128, 192);

    return {
      tradeType: "SELL",
      trader,
      outcome: isYes ? "YES" : "NO",
      shares: hexToDecimalString(sharesHex, 18),
      amount: hexToDecimalString(payoutHex, 6),
      txHash: log.transaction_hash,
      blockNumber: log.block_number,
      marketAddress: log.address.toLowerCase(),
    };
  }

  if (topic0 === EVENT_SIGS.Redeemed) {
    // Redeemed(address indexed user, uint256 shares, uint256 payout)
    const trader = "0x" + log.topics[1].slice(26);
    const data = log.data.slice(2);
    const sharesHex = "0x" + data.slice(0, 64);
    const payoutHex = "0x" + data.slice(64, 128);

    return {
      tradeType: "REDEEM",
      trader,
      outcome: "YES", // Redeem doesn't specify outcome
      shares: hexToDecimalString(sharesHex, 18),
      amount: hexToDecimalString(payoutHex, 6),
      txHash: log.transaction_hash,
      blockNumber: log.block_number,
      marketAddress: log.address.toLowerCase(),
    };
  }

  // MarketResolved is handled separately (not a trade)
  return null;
}

// RPC batch call helper
async function rpcBatch(
  calls: Array<{ to: string; data: string }>
): Promise<string[]> {
  const batch = calls.map((c, i) => ({
    jsonrpc: "2.0",
    id: i + 1,
    method: "eth_call",
    params: [{ to: c.to, data: c.data }, "latest"],
  }));

  const resp = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  const results = await resp.json();
  // Sort by id and return results
  const sorted = (results as Array<{ id: number; result?: string }>).sort(
    (a, b) => a.id - b.id
  );
  return sorted.map((r) => r.result || "0x");
}

// Update market prices via RPC getMarketInfo + backfill token addresses
async function updateMarketPrices(
  supabase: ReturnType<typeof createClient>,
  marketId: string,
  marketAddress: string
): Promise<void> {
  // Check if token addresses need backfilling
  const { data: existing } = await supabase
    .from("markets")
    .select("yes_token_address, no_token_address")
    .eq("id", marketId)
    .single();

  const needsTokens =
    !existing?.yes_token_address || !existing?.no_token_address;

  // Batch: getMarketInfo + optionally yesToken() + noToken()
  const calls: Array<{ to: string; data: string }> = [
    { to: marketAddress, data: "0x23341a05" }, // getMarketInfo
  ];
  if (needsTokens) {
    calls.push({ to: marketAddress, data: "0xf0d9bb20" }); // yesToken()
    calls.push({ to: marketAddress, data: "0x11a9f10a" }); // noToken()
  }

  const results = await rpcBatch(calls);
  const marketInfoResult = results[0];

  if (!marketInfoResult || marketInfoResult === "0x") return;

  const d = marketInfoResult.slice(2);
  // Offsets: yesPrice at slot 3 (192), noPrice at 4 (256),
  // yesShares at 7 (448), noShares at 8 (512), totalCollateral at 9 (576),
  // resolved at 12 (768), yesWins at 13 (832)
  const yesPrice = Number(BigInt("0x" + d.slice(192, 256))) / 1e18;
  const noPrice = Number(BigInt("0x" + d.slice(256, 320))) / 1e18;
  const resolved = BigInt("0x" + d.slice(768, 832)) !== 0n;
  const yesWins = BigInt("0x" + d.slice(832, 896)) !== 0n;

  const update: Record<string, unknown> = {
    yes_price: yesPrice,
    no_price: noPrice,
    yes_shares: hexToDecimalString("0x" + d.slice(448, 512), 18),
    no_shares: hexToDecimalString("0x" + d.slice(512, 576), 18),
    total_collateral: hexToDecimalString("0x" + d.slice(576, 640), 6),
    resolved,
    yes_wins: yesWins,
    status: resolved ? "RESOLVED" : "ACTIVE",
    updated_at: new Date().toISOString(),
  };

  // Backfill token addresses if missing
  if (needsTokens && results.length >= 3) {
    const yesTokenResult = results[1];
    const noTokenResult = results[2];
    if (yesTokenResult && yesTokenResult.length >= 66) {
      update.yes_token_address =
        "0x" + yesTokenResult.slice(26).toLowerCase();
    }
    if (noTokenResult && noTokenResult.length >= 66) {
      update.no_token_address =
        "0x" + noTokenResult.slice(26).toLowerCase();
    }
  }

  await supabase.from("markets").update(update).eq("id", marketId);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify API key authentication
    const apiKey = Deno.env.get("INDEXER_API_KEY");
    const authHeader = req.headers.get("authorization");
    if (!apiKey || !authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const bearerToken = Deno.env.get("HYPERSYNC_BEARER_TOKEN") || "";

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get indexer state
    const { data: stateData, error: stateError } = await supabase
      .from("indexer_state")
      .select("*")
      .eq("chain_id", CHAIN_ID)
      .single();

    if (stateError) {
      console.error("Failed to get indexer state:", stateError);
      return new Response(
        JSON.stringify({ error: "Failed to get indexer state" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check sync lock (5-min timeout)
    if (stateData.is_syncing) {
      const syncStarted = new Date(stateData.sync_started_at);
      const minutesSinceSync = (Date.now() - syncStarted.getTime()) / 1000 / 60;
      if (minutesSinceSync < 5) {
        return new Response(
          JSON.stringify({ message: "Sync already in progress" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Set syncing flag
    await supabase
      .from("indexer_state")
      .update({
        is_syncing: true,
        sync_started_at: new Date().toISOString(),
      })
      .eq("chain_id", CHAIN_ID);

    try {
      // Get current chain height from HyperSync
      const currentBlock = await getChainHeight(bearerToken);
      const fromBlock = stateData.last_indexed_block + 1;

      if (fromBlock > currentBlock) {
        await supabase
          .from("indexer_state")
          .update({
            is_syncing: false,
            last_indexed_at: new Date().toISOString(),
          })
          .eq("chain_id", CHAIN_ID);

        return new Response(
          JSON.stringify({
            message: "Already synced",
            current_block: currentBlock,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get all tracked market addresses
      const { data: marketsData, error: marketsError } = await supabase
        .from("markets")
        .select("id, address");

      if (marketsError) {
        throw new Error(`Failed to get markets: ${marketsError.message}`);
      }

      const marketsList = marketsData || [];
      const marketAddresses = marketsList.map((m) => m.address.toLowerCase());
      const addressToId: Record<string, string> = {};
      for (const m of marketsList) {
        addressToId[m.address.toLowerCase()] = m.id;
      }

      let processedEvents = 0;
      let resolvedMarkets = 0;
      const affectedMarketIds = new Set<string>();
      const errors: string[] = [];

      if (marketAddresses.length > 0) {
        // Query HyperSync for all events
        const logs = await queryHyperSync(
          fromBlock,
          currentBlock,
          marketAddresses,
          bearerToken
        );

        console.log(
          `HyperSync returned ${logs.length} logs from block ${fromBlock} to ${currentBlock}`
        );

        // Separate MarketResolved events from trade events
        const resolveEvents: HyperSyncLog[] = [];
        const tradeEvents: ParsedTrade[] = [];

        for (const log of logs) {
          const marketAddr = log.address.toLowerCase();
          const marketId = addressToId[marketAddr];
          if (!marketId) continue;

          if (log.topics[0] === EVENT_SIGS.MarketResolved) {
            resolveEvents.push(log);
            affectedMarketIds.add(marketId);
          } else {
            const parsed = parseLog(log);
            if (parsed) {
              tradeEvents.push(parsed);
              affectedMarketIds.add(marketId);
            }
          }
        }

        // Process MarketResolved events
        for (const log of resolveEvents) {
          const marketAddr = log.address.toLowerCase();
          const marketId = addressToId[marketAddr];
          if (!marketId) continue;

          try {
            const data = log.data.slice(2);
            const yesWins = BigInt("0x" + data.slice(0, 64)) !== 0n;

            await supabase
              .from("markets")
              .update({
                resolved: true,
                yes_wins: yesWins,
                status: "RESOLVED",
                resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", marketId);

            resolvedMarkets++;
          } catch (err) {
            errors.push(`Error processing MarketResolved for ${marketAddr}: ${err}`);
          }
        }

        // Process trade events in batches
        for (const trade of tradeEvents) {
          const marketId = addressToId[trade.marketAddress];
          if (!marketId) continue;

          try {
            // Get or create user
            const { data: userData } = await supabase.rpc(
              "get_or_create_user",
              { p_wallet_address: trade.trader.toLowerCase() }
            );

            const userId = userData?.[0]?.id;
            if (!userId) {
              errors.push(`Failed to get/create user for ${trade.trader}`);
              continue;
            }

            // Calculate fees
            const amount = parseFloat(trade.amount);
            const shares = parseFloat(trade.shares);
            let tradingFee = 0;
            let creatorFee = 0;
            if (trade.tradeType === "BUY") {
              tradingFee = amount * FEE_RATE;
              creatorFee = tradingFee;
            }

            const priceAtTrade = shares > 0 ? amount / shares : null;

            // Upsert trade (idempotent on tx_hash + outcome)
            const { error: tradeError } = await supabase.from("trades").upsert(
              {
                market_id: marketId,
                user_id: userId,
                trade_type: trade.tradeType,
                outcome: trade.outcome,
                shares: trade.shares,
                amount: trade.amount,
                price_at_trade: priceAtTrade,
                trading_fee: tradingFee,
                protocol_fee: 0,
                creator_fee: creatorFee,
                tx_hash: trade.txHash.toLowerCase(),
                block_number: trade.blockNumber,
              },
              { onConflict: "tx_hash,outcome" }
            );

            if (tradeError) {
              errors.push(
                `Trade upsert error for ${trade.txHash}: ${tradeError.message}`
              );
            } else {
              processedEvents++;
            }
          } catch (err) {
            errors.push(`Error processing trade ${trade.txHash}: ${err}`);
          }
        }

        // Update prices only for markets that had events
        for (const marketId of affectedMarketIds) {
          const market = marketsList.find((m) => m.id === marketId);
          if (!market) continue;

          try {
            await updateMarketPrices(supabase, marketId, market.address);
          } catch (err) {
            errors.push(`Error updating prices for ${market.address}: ${err}`);
          }
        }
      }

      // Backfill token addresses for any markets missing them
      const { data: missingTokens } = await supabase
        .from("markets")
        .select("id, address")
        .or(
          "yes_token_address.is.null,yes_token_address.eq.,no_token_address.is.null,no_token_address.eq."
        )
        .limit(5); // batch 5 per run to avoid timeout

      for (const m of missingTokens || []) {
        try {
          await updateMarketPrices(supabase, m.id, m.address);
        } catch (err) {
          errors.push(`Token backfill error for ${m.address}: ${err}`);
        }
      }

      // Update indexer state
      await supabase
        .from("indexer_state")
        .update({
          last_indexed_block: currentBlock,
          last_indexed_at: new Date().toISOString(),
          is_syncing: false,
          last_error: errors.length > 0 ? errors.join("; ") : null,
          consecutive_errors: errors.length > 0
            ? stateData.consecutive_errors + 1
            : 0,
        })
        .eq("chain_id", CHAIN_ID);

      return new Response(
        JSON.stringify({
          success: true,
          from_block: fromBlock,
          to_block: currentBlock,
          blocks_indexed: currentBlock - fromBlock + 1,
          events_processed: processedEvents,
          markets_resolved: resolvedMarkets,
          markets_price_updated: affectedMarketIds.size,
          markets_tracked: marketAddresses.length,
          errors: errors.length > 0 ? errors : undefined,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      // Reset sync flag on error
      await supabase
        .from("indexer_state")
        .update({
          is_syncing: false,
          last_error: String(err),
          consecutive_errors: stateData.consecutive_errors + 1,
        })
        .eq("chain_id", CHAIN_ID);

      throw err;
    }
  } catch (err) {
    console.error("Indexer error:", err);
    return new Response(
      JSON.stringify({ error: "Indexer failed", details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
