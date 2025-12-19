'use client';

import { AgentType } from '@/lib/types';
import { AGENTS } from '@/lib/agents';

interface ChatSidebarProps {
  selectedAgents: AgentType[];
  onAgentToggle: (agentId: AgentType) => void;
}

export default function ChatSidebar({
  selectedAgents,
  onAgentToggle,
}: ChatSidebarProps) {
  return (
    <div className="w-64 border-r border-gray-700 bg-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Agents</h2>
        <div className="space-y-2">
          {AGENTS.map(agent => {
            const isSelected = selectedAgents.includes(agent.id);
            return (
              <div
                key={agent.id}
                onClick={() => onAgentToggle(agent.id)}
                className={`
                  p-3 rounded-lg cursor-pointer transition-all
                  ${
                    isSelected
                      ? 'bg-gray-700 border-2 ' + agent.borderColor
                      : 'bg-gray-800 border-2 border-transparent hover:bg-gray-750'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${agent.color} flex items-center justify-center text-sm`}>
                    {agent.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{agent.name}</div>
                    <div className="text-xs text-gray-400">{agent.description}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="text-sm text-gray-400 mb-2">Selected:</div>
        <div className="space-y-1">
          {selectedAgents.map(agentId => {
            const agent = AGENTS.find(a => a.id === agentId);
            return (
              <div
                key={agentId}
                className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 inline-block mr-1"
              >
                {agent?.name} x{selectedAgents.filter(id => id === agentId).length}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

