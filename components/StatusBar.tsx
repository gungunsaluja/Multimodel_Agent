'use client';

import { AgentType } from '@/lib/types';

interface StatusBarProps {
  activeAgents: number;
  totalTokens: number;
  totalTools: number;
  onPause?: () => void;
  isPaused: boolean;
}

export default function StatusBar({
  activeAgents,
  totalTokens,
  totalTools,
  onPause,
  isPaused,
}: StatusBarProps) {
  return (
    <div className="h-12 border-b border-gray-700 bg-gray-800 flex items-center justify-between px-4">
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-semibold text-white">Agent Control</h1>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>{activeAgents} active</span>
          <span>{totalTokens.toLocaleString()} tokens</span>
          <span>{totalTools} tools</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1 text-xs rounded ${
            !isPaused
              ? 'bg-green-500/20 text-green-400'
              : 'bg-gray-700 text-gray-400'
          }`}
        >
          Active
        </button>
        <button className="px-3 py-1 text-xs rounded bg-gray-700 text-gray-400">
          Empty
        </button>
        <button className="px-3 py-1 text-xs rounded bg-gray-700 text-gray-400">
          Loading
        </button>
        <button
          onClick={onPause}
          className={`px-3 py-1 text-xs rounded ${
            isPaused
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          Pause
        </button>
      </div>
    </div>
  );
}

