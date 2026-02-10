// ERC-8004 Trustless Agents Configuration
// On-chain agent identity and reputation for Monad Testnet

// Contract addresses from Monad Testnet
export const ERC8004_ADDRESSES = {
  // Agent identity registry - stores agent NFTs
  identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  // Reputation registry - tracks agent reputation scores
  reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as `0x${string}`,
} as const;

// Identity Registry ABI - ERC-721 with agent-specific extensions
export const IDENTITY_REGISTRY_ABI = [
  // Agent Registration
  {
    name: 'registerAgent',
    type: 'function',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // Get agent by token ID
  {
    name: 'getAgent',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'agent',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'owner', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'metadataURI', type: 'string' },
          { name: 'registeredAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  // Get agent token ID by owner address
  {
    name: 'getAgentByOwner',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'view',
  },
  // Check if address has an agent
  {
    name: 'hasAgent',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  // Update agent metadata
  {
    name: 'updateMetadata',
    type: 'function',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ERC-721 standard functions
  {
    name: 'ownerOf',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'tokenURI',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  // Events
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MetadataUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'metadataURI', type: 'string', indexed: false },
    ],
  },
] as const;

// Reputation Registry ABI - tracks on-chain reputation
export const REPUTATION_REGISTRY_ABI = [
  // Get reputation score for an agent
  {
    name: 'getReputation',
    type: 'function',
    inputs: [{ name: 'agentTokenId', type: 'uint256' }],
    outputs: [{ name: 'score', type: 'int256' }],
    stateMutability: 'view',
  },
  // Get detailed reputation breakdown
  {
    name: 'getReputationDetails',
    type: 'function',
    inputs: [{ name: 'agentTokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'details',
        type: 'tuple',
        components: [
          { name: 'totalScore', type: 'int256' },
          { name: 'positiveActions', type: 'uint256' },
          { name: 'negativeActions', type: 'uint256' },
          { name: 'lastActionAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  // Record a reputation action (called by authorized contracts)
  {
    name: 'recordAction',
    type: 'function',
    inputs: [
      { name: 'agentTokenId', type: 'uint256' },
      { name: 'actionType', type: 'string' },
      { name: 'delta', type: 'int256' },
      { name: 'metadata', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Check if contract is authorized to record actions
  {
    name: 'isAuthorized',
    type: 'function',
    inputs: [{ name: 'contract_', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  // Events
  {
    type: 'event',
    name: 'ReputationUpdated',
    inputs: [
      { name: 'agentTokenId', type: 'uint256', indexed: true },
      { name: 'actionType', type: 'string', indexed: false },
      { name: 'delta', type: 'int256', indexed: false },
      { name: 'newScore', type: 'int256', indexed: false },
    ],
  },
] as const;

// Agent metadata structure (stored off-chain, URI points to this)
export interface AgentMetadata {
  name: string;
  description?: string;
  image?: string;
  type?: 'trader' | 'oracle' | 'market-maker' | 'general';
  capabilities?: string[];
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

// On-chain agent structure
export interface OnChainAgent {
  tokenId: bigint;
  owner: `0x${string}`;
  name: string;
  metadataURI: string;
  registeredAt: bigint;
}

// Reputation details structure
export interface ReputationDetails {
  totalScore: bigint;
  positiveActions: bigint;
  negativeActions: bigint;
  lastActionAt: bigint;
}

// Reputation action types for prediction markets
export const REPUTATION_ACTIONS = {
  TRADE_EXECUTED: 'TRADE_EXECUTED',
  CORRECT_PREDICTION: 'CORRECT_PREDICTION',
  INCORRECT_PREDICTION: 'INCORRECT_PREDICTION',
  MARKET_CREATED: 'MARKET_CREATED',
  LIQUIDITY_PROVIDED: 'LIQUIDITY_PROVIDED',
} as const;

// Reputation deltas for each action
export const REPUTATION_DELTAS = {
  [REPUTATION_ACTIONS.TRADE_EXECUTED]: 1n,
  [REPUTATION_ACTIONS.CORRECT_PREDICTION]: 10n,
  [REPUTATION_ACTIONS.INCORRECT_PREDICTION]: -2n,
  [REPUTATION_ACTIONS.MARKET_CREATED]: 5n,
  [REPUTATION_ACTIONS.LIQUIDITY_PROVIDED]: 3n,
} as const;
