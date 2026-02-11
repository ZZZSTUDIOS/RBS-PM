// Edge Function: indexer
// Syncs on-chain events to database

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Monad Testnet configuration
const CHAIN_ID = 10143;
const RPC_URL = "https://testnet-rpc.monad.xyz";
const BLOCKS_PER_BATCH = 100; // Monad RPC limit

// LS-LMSR Event signatures (keccak256 hashes)
const EVENT_SIGNATURES = {
  SharesPurchased: "0x" + "e6f6b9be7d57af2f7e5c5c3e8a3d3a1e4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d", // Placeholder
  SharesSold: "0x" + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  Redeemed: "0x" + "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  MarketResolved: "0x" + "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
};

// Helper to make RPC calls
async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }
  return data.result;
}

// Get current block number
async function getBlockNumber(): Promise<number> {
  const result = await rpcCall("eth_blockNumber", []);
  return parseInt(result as string, 16);
}

// Get logs for a block range
async function getLogs(
  fromBlock: number,
  toBlock: number,
  addresses: string[]
): Promise<Array<{
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}>> {
  const result = await rpcCall("eth_getLogs", [
    {
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "0x" + toBlock.toString(16),
      address: addresses.length === 1 ? addresses[0] : addresses,
    },
  ]);
  return result as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
  }>;
}

// Parse event data
function parseEventData(data: string): { values: bigint[] } {
  // Remove 0x prefix and split into 64-char chunks (32 bytes each)
  const hex = data.slice(2);
  const values: bigint[] = [];
  for (let i = 0; i < hex.length; i += 64) {
    values.push(BigInt("0x" + hex.slice(i, i + 64)));
  }
  return { values };
}

// Format bigint to decimal string (18 decimals)
function formatDecimal(value: bigint): string {
  const str = value.toString();
  if (str.length <= 18) {
    return "0." + "0".repeat(18 - str.length) + str;
  }
  return str.slice(0, -18) + "." + str.slice(-18);
}

serve(async (req: Request) => {
  // Handle CORS preflight
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already syncing
    if (stateData.is_syncing) {
      const syncStarted = new Date(stateData.sync_started_at);
      const minutesSinceSync = (Date.now() - syncStarted.getTime()) / 1000 / 60;

      // If syncing for more than 5 minutes, reset the lock
      if (minutesSinceSync < 5) {
        return new Response(
          JSON.stringify({ message: "Sync already in progress" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Set syncing flag
    await supabase
      .from("indexer_state")
      .update({ is_syncing: true, sync_started_at: new Date().toISOString() })
      .eq("chain_id", CHAIN_ID);

    try {
      // Get current block
      const currentBlock = await getBlockNumber();
      const fromBlock = stateData.last_indexed_block + 1;
      const toBlock = Math.min(fromBlock + BLOCKS_PER_BATCH - 1, currentBlock);

      if (fromBlock > currentBlock) {
        // Already synced
        await supabase
          .from("indexer_state")
          .update({ is_syncing: false, last_indexed_at: new Date().toISOString() })
          .eq("chain_id", CHAIN_ID);

        return new Response(
          JSON.stringify({ message: "Already synced", current_block: currentBlock }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get all tracked market addresses
      const { data: markets, error: marketsError } = await supabase
        .from("markets")
        .select("id, address")
        .eq("status", "ACTIVE");

      if (marketsError) {
        throw new Error(`Failed to get markets: ${marketsError.message}`);
      }

      const marketAddresses = markets?.map((m) => m.address) || [];
      const addressToId: Record<string, string> = {};
      markets?.forEach((m) => {
        addressToId[m.address.toLowerCase()] = m.id;
      });

      let processedEvents = 0;
      let errors: string[] = [];

      if (marketAddresses.length > 0) {
        // Fetch logs
        const logs = await getLogs(fromBlock, toBlock, marketAddresses);

        for (const log of logs) {
          const marketId = addressToId[log.address.toLowerCase()];
          if (!marketId) continue;

          const topic0 = log.topics[0];
          const blockNumber = parseInt(log.blockNumber, 16);
          const txHash = log.transactionHash;

          try {
            // Determine event type and process
            // Note: In production, use proper ABI decoding
            const eventData = parseEventData(log.data);

            // For SharesPurchased: topics[1] = buyer (indexed)
            // data = [isYes (bool as uint256), shares, cost]
            if (log.topics.length >= 2 && eventData.values.length >= 3) {
              const buyer = "0x" + log.topics[1].slice(26); // Extract address from topic
              const isYes = eventData.values[0] === 1n;
              const shares = formatDecimal(eventData.values[1]);
              const cost = formatDecimal(eventData.values[2]);

              // Get or create user
              const { data: userData } = await supabase.rpc("get_or_create_user", {
                p_wallet_address: buyer.toLowerCase(),
              });

              const userId = userData?.[0]?.id;
              if (!userId) continue;

              // Insert trade
              await supabase.from("trades").upsert(
                {
                  market_id: marketId,
                  user_id: userId,
                  trade_type: "BUY", // Simplified - need proper event detection
                  outcome: isYes ? "YES" : "NO",
                  shares: shares,
                  amount: cost,
                  tx_hash: txHash,
                  block_number: blockNumber,
                },
                { onConflict: "tx_hash,outcome" }
              );

              processedEvents++;
            }
          } catch (err) {
            errors.push(`Error processing log ${log.transactionHash}: ${err}`);
          }
        }

        // Update market prices from chain
        for (const market of markets || []) {
          try {
            // Call getMarketInfo on each market
            const result = await rpcCall("eth_call", [
              {
                to: market.address,
                data: "0x" + "22a62d1e", // getMarketInfo() selector
              },
              "latest",
            ]);

            // Parse result (simplified - need proper ABI decoding)
            if (result && typeof result === "string" && result.length > 2) {
              // In production, properly decode the tuple response
              // For now, just create a snapshot
              await supabase.from("market_snapshots").insert({
                market_id: market.id,
                yes_price: "0.5", // Placeholder
                no_price: "0.5",
                yes_shares: "0",
                no_shares: "0",
                total_collateral: "0",
                block_number: toBlock,
              });
            }
          } catch (err) {
            errors.push(`Error updating market ${market.address}: ${err}`);
          }
        }
      }

      // Update indexer state
      await supabase
        .from("indexer_state")
        .update({
          last_indexed_block: toBlock,
          last_indexed_at: new Date().toISOString(),
          is_syncing: false,
          last_error: errors.length > 0 ? errors.join("; ") : null,
          consecutive_errors: errors.length > 0 ? stateData.consecutive_errors + 1 : 0,
        })
        .eq("chain_id", CHAIN_ID);

      return new Response(
        JSON.stringify({
          success: true,
          from_block: fromBlock,
          to_block: toBlock,
          current_block: currentBlock,
          blocks_processed: toBlock - fromBlock + 1,
          events_processed: processedEvents,
          markets_tracked: marketAddresses.length,
          errors: errors.length > 0 ? errors : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
