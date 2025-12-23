'use client';

import { AgentType } from '@/lib/types';

interface StatusBarProps {
  activeAgents: number;
  totalTokens: number;
  totalTools: number;
  onPause?: () => void;
  onClear?: () => void;
  isPaused: boolean;
  isConnected?: boolean;
}

export default function StatusBar({
  activeAgents,
  totalTokens,
  totalTools,
  onPause,
  onClear,
  isPaused,
  isConnected = true,
}: StatusBarProps) {
  return (
    <div className="h-14 border-b border-gray-700/50 bg-gradient-to-r from-gray-800 to-gray-850 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
        <h1 className="text-lg font-semibold text-white tracking-tight">Agent Control</h1>
      </div>
      <div className="flex items-center gap-2">
        {/* <button
          className={`px-4 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 ${
            isConnected && !isPaused
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : isConnected
              ? 'bg-gray-700/50 text-gray-400 border border-gray-600/50'
              : 'bg-red-500/15 text-red-400 border border-red-500/30'
          }`}
          title={isConnected ? (isPaused ? 'Paused' : 'Connected') : 'Server disconnected'}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${
            isConnected && !isPaused ? 'bg-emerald-400 animate-pulse' : 
            isConnected ? 'bg-gray-400' : 'bg-red-400'
          }`}></div>
          {isConnected ? (isPaused ? 'Paused' : 'Active') : 'Disconnected'}
        </button> */}
        <button
          onClick={onClear}
          className="px-4 py-1.5 text-xs font-medium rounded-md bg-gray-700/50 text-gray-300 hover:bg-red-500/15 hover:text-red-400 border border-gray-600/50 hover:border-red-500/30 transition-all"
          title="Clear all chat history"
        >
          Clear
        </button>
        <button
          onClick={onPause}
          className={`px-4 py-1.5 text-xs font-medium rounded-md border transition-all ${
            isPaused
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-gray-600/50'
          }`}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  );
}

