// ListMarket Component
// UI for listing a deployed market in the discovery index via x402 payment

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useX402, type MarketListingParams } from '../hooks/useX402';

interface ListMarketProps {
  defaultAddress?: string;
  defaultQuestion?: string;
  defaultOracle?: string;
  defaultResolutionTime?: number;
  defaultYesToken?: string;
  defaultNoToken?: string;
  onSuccess?: (result: { market: { id: string; address: string } }) => void;
}

export function ListMarket({
  defaultAddress = '',
  defaultQuestion = '',
  defaultOracle = '',
  defaultResolutionTime,
  defaultYesToken = '',
  defaultNoToken = '',
  onSuccess,
}: ListMarketProps) {
  const { address: walletAddress, isConnected } = useAccount();
  const { listMarket, isProcessing, error, isReady, prices } = useX402();

  const [formData, setFormData] = useState<MarketListingParams>({
    address: defaultAddress,
    question: defaultQuestion,
    resolutionTime: defaultResolutionTime || Math.floor(Date.now() / 1000) + 86400 * 30,
    oracle: defaultOracle || walletAddress || '',
    yesTokenAddress: defaultYesToken,
    noTokenAddress: defaultNoToken,
    category: 'general',
    tags: [],
  });

  const [tagsInput, setTagsInput] = useState('');
  const [result, setResult] = useState<{ market: { id: string; address: string } } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const params: MarketListingParams = {
        ...formData,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      };

      const res = await listMarket(params);
      setResult(res);
      onSuccess?.(res);
    } catch (err) {
      console.error('Failed to list market:', err);
    }
  };

  if (!isConnected) {
    return (
      <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">List Market</h2>
        <p className="text-gray-400">Connect your wallet to list a market.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="p-6 bg-green-900/20 rounded-lg border border-green-600">
        <h2 className="text-xl font-bold text-green-400 mb-4">Market Listed!</h2>
        <div className="space-y-2 text-sm">
          <p className="text-gray-300">
            <span className="text-gray-500">Market ID:</span> {result.market.id}
          </p>
          <p className="text-gray-300">
            <span className="text-gray-500">Address:</span>{' '}
            <code className="text-xs bg-gray-800 px-1 rounded">{result.market.address}</code>
          </p>
        </div>
        <button
          onClick={() => setResult(null)}
          className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
        >
          List Another Market
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">List Market</h2>
        <span className="text-sm text-yellow-400 bg-yellow-900/30 px-2 py-1 rounded">
          Fee: {prices.listMarket}
        </span>
      </div>

      <p className="text-gray-400 text-sm mb-4">
        After deploying a market contract, list it here so other traders can discover it.
        Listing requires a {prices.listMarket} fee paid via x402.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Contract Address *</label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="0x..."
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm font-mono"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Question *</label>
          <input
            type="text"
            value={formData.question}
            onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            placeholder="Will X happen by Y date?"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Resolution Time *</label>
            <input
              type="datetime-local"
              value={new Date(formData.resolutionTime * 1000).toISOString().slice(0, 16)}
              onChange={(e) => setFormData({
                ...formData,
                resolutionTime: Math.floor(new Date(e.target.value).getTime() / 1000),
              })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Oracle Address *</label>
            <input
              type="text"
              value={formData.oracle}
              onChange={(e) => setFormData({ ...formData, oracle: e.target.value })}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm font-mono"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">YES Token (optional)</label>
            <input
              type="text"
              value={formData.yesTokenAddress || ''}
              onChange={(e) => setFormData({ ...formData, yesTokenAddress: e.target.value })}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">NO Token (optional)</label>
            <input
              type="text"
              value={formData.noTokenAddress || ''}
              onChange={(e) => setFormData({ ...formData, noTokenAddress: e.target.value })}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
            >
              <option value="general">General</option>
              <option value="crypto">Crypto</option>
              <option value="sports">Sports</option>
              <option value="politics">Politics</option>
              <option value="entertainment">Entertainment</option>
              <option value="science">Science</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="bitcoin, price, prediction"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-600 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isProcessing || !isReady}
          className={`w-full py-3 rounded font-medium text-white transition-colors ${
            isProcessing || !isReady
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing Payment...
            </span>
          ) : (
            `List Market (${prices.listMarket})`
          )}
        </button>

        {!isReady && isConnected && (
          <p className="text-yellow-400 text-xs text-center">
            Initializing x402 payment client...
          </p>
        )}
      </form>
    </div>
  );
}

export default ListMarket;
