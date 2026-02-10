// ERC-8004 Agent Identity Hook
// Manages on-chain agent registration and reputation on Monad Testnet

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { decodeEventLog } from 'viem';
import {
  ERC8004_ADDRESSES,
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  type OnChainAgent,
  type ReputationDetails,
  type AgentMetadata,
} from '../config/erc8004';
import { supabase } from '../lib/supabase';

interface UseERC8004Return {
  // Agent identity
  agentTokenId: bigint | null;
  agent: OnChainAgent | null;
  isRegisteredAgent: boolean;
  isLoadingAgent: boolean;

  // Reputation
  reputation: bigint | null;
  reputationDetails: ReputationDetails | null;

  // Actions
  registerAgent: (name: string, metadata?: Partial<AgentMetadata>) => Promise<bigint | null>;
  updateAgentMetadata: (metadataURI: string) => Promise<boolean>;
  isRegistering: boolean;
  registrationError: string | null;

  // Sync
  syncAgentToSupabase: () => Promise<void>;
}

export function useERC8004(): UseERC8004Return {
  const { address, isConnected } = useAccount();
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | undefined>();

  // Check if wallet has an agent identity
  const { data: agentTokenId, isLoading: isLoadingTokenId, refetch: refetchTokenId } = useReadContract({
    address: ERC8004_ADDRESSES.identityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'getAgentByOwner',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
    },
  });

  // Get agent details if we have a token ID
  const { data: agentData, isLoading: isLoadingAgent } = useReadContract({
    address: ERC8004_ADDRESSES.identityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'getAgent',
    args: agentTokenId && agentTokenId > 0n ? [agentTokenId] : undefined,
    query: {
      enabled: !!agentTokenId && agentTokenId > 0n,
    },
  });

  // Get reputation score
  const { data: reputation } = useReadContract({
    address: ERC8004_ADDRESSES.reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'getReputation',
    args: agentTokenId && agentTokenId > 0n ? [agentTokenId] : undefined,
    query: {
      enabled: !!agentTokenId && agentTokenId > 0n,
    },
  });

  // Get reputation details
  const { data: reputationDetails } = useReadContract({
    address: ERC8004_ADDRESSES.reputationRegistry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'getReputationDetails',
    args: agentTokenId && agentTokenId > 0n ? [agentTokenId] : undefined,
    query: {
      enabled: !!agentTokenId && agentTokenId > 0n,
    },
  });

  // Write contract hooks
  const { writeContractAsync } = useWriteContract();

  // Wait for transaction receipt
  const { data: txReceipt } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
  });

  // Handle transaction receipt
  useEffect(() => {
    if (txReceipt && pendingTxHash) {
      // Parse AgentRegistered event to get token ID
      for (const log of txReceipt.logs) {
        try {
          const event = decodeEventLog({
            abi: IDENTITY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (event.eventName === 'AgentRegistered') {
            console.log('Agent registered with token ID:', event.args.tokenId);
            refetchTokenId();
          }
        } catch {
          // Not our event, continue
        }
      }
      setPendingTxHash(undefined);
      setIsRegistering(false);
    }
  }, [txReceipt, pendingTxHash, refetchTokenId]);

  // Register a new agent
  const registerAgent = useCallback(
    async (name: string, metadata?: Partial<AgentMetadata>): Promise<bigint | null> => {
      if (!address) {
        setRegistrationError('Wallet not connected');
        return null;
      }

      setIsRegistering(true);
      setRegistrationError(null);

      try {
        // Build metadata object
        const fullMetadata: AgentMetadata = {
          name,
          type: 'trader',
          ...metadata,
        };

        // For now, use a simple data URI. In production, upload to IPFS
        const metadataURI = `data:application/json;base64,${btoa(JSON.stringify(fullMetadata))}`;

        // Call registerAgent on the identity registry
        const hash = await writeContractAsync({
          address: ERC8004_ADDRESSES.identityRegistry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'registerAgent',
          args: [name, metadataURI],
        });

        console.log('Agent registration tx:', hash);
        setPendingTxHash(hash);

        // The token ID will be extracted from the event in the useEffect above
        // For now, return null and let the UI update via refetch
        return null;
      } catch (error) {
        console.error('Failed to register agent:', error);
        setRegistrationError(error instanceof Error ? error.message : 'Registration failed');
        setIsRegistering(false);
        return null;
      }
    },
    [address, writeContractAsync]
  );

  // Update agent metadata
  const updateAgentMetadata = useCallback(
    async (metadataURI: string): Promise<boolean> => {
      if (!agentTokenId || agentTokenId === 0n) {
        return false;
      }

      try {
        const hash = await writeContractAsync({
          address: ERC8004_ADDRESSES.identityRegistry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'updateMetadata',
          args: [agentTokenId, metadataURI],
        });

        console.log('Metadata update tx:', hash);
        return true;
      } catch (error) {
        console.error('Failed to update metadata:', error);
        return false;
      }
    },
    [agentTokenId, writeContractAsync]
  );

  // Sync agent to Supabase
  const syncAgentToSupabase = useCallback(async () => {
    if (!agentTokenId || agentTokenId === 0n || !address) {
      return;
    }

    try {
      const { error } = await supabase.rpc('get_or_create_agent_erc8004', {
        p_identity_token_id: Number(agentTokenId),
        p_controller_address: address.toLowerCase(),
        p_name: agentData?.name || null,
      });

      if (error) {
        console.error('Failed to sync agent to Supabase:', error);
      } else {
        console.log('Agent synced to Supabase');
      }
    } catch (err) {
      console.error('Error syncing agent:', err);
    }
  }, [agentTokenId, address, agentData]);

  // Auto-sync when agent is loaded
  useEffect(() => {
    if (agentTokenId && agentTokenId > 0n && address) {
      syncAgentToSupabase();
    }
  }, [agentTokenId, address, syncAgentToSupabase]);

  // Parse agent data
  const agent: OnChainAgent | null = agentData
    ? {
        tokenId: agentData.tokenId,
        owner: agentData.owner,
        name: agentData.name,
        metadataURI: agentData.metadataURI,
        registeredAt: agentData.registeredAt,
      }
    : null;

  // Parse reputation details
  const parsedReputationDetails: ReputationDetails | null = reputationDetails
    ? {
        totalScore: reputationDetails.totalScore,
        positiveActions: reputationDetails.positiveActions,
        negativeActions: reputationDetails.negativeActions,
        lastActionAt: reputationDetails.lastActionAt,
      }
    : null;

  return {
    // Agent identity
    agentTokenId: agentTokenId && agentTokenId > 0n ? agentTokenId : null,
    agent,
    isRegisteredAgent: !!agentTokenId && agentTokenId > 0n,
    isLoadingAgent: isLoadingTokenId || isLoadingAgent,

    // Reputation
    reputation: reputation ?? null,
    reputationDetails: parsedReputationDetails,

    // Actions
    registerAgent,
    updateAgentMetadata,
    isRegistering,
    registrationError,

    // Sync
    syncAgentToSupabase,
  };
}

export default useERC8004;
