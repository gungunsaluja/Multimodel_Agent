'use client';

import { AgentType } from '@/lib/types';
import { AGENTS } from '@/lib/agents';
import { useState } from 'react';

interface BottomInputBarProps {
  selectedAgents: AgentType[];
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

export default function BottomInputBar({
  selectedAgents,
  onSubmit,
  isLoading,
}: BottomInputBarProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && selectedAgents.length > 0) {
      onSubmit(prompt);
      setPrompt('');
    }
  };

  return (
    <div className="h-16 border-t border-gray-700 bg-gray-800 flex items-center px-4 gap-4">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-gray-400">TARGETS:</span>
        {selectedAgents.map(agentId => {
          const agent = AGENTS.find(a => a.id === agentId);
          return (
            <span
              key={agentId}
              className="text-xs px-2 py-1 rounded border-blue-500 border text-gray-300"
            >
              {agent?.name} x1
            </span>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-4">
        <input
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="> Enter your prompt..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
          disabled={isLoading || selectedAgents.length === 0}
        />
        <div className="text-xs text-gray-400">
          Broadcasting to {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}
        </div>
        <button
          type="submit"
          disabled={isLoading || selectedAgents.length === 0 || !prompt.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}

