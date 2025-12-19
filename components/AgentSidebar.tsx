'use client';

import { AgentType } from '@/lib/types';
import { AGENTS } from '@/lib/agents';

interface AgentSidebarProps {
  selectedAgents: AgentType[];
  onSelectionChange: (agents: AgentType[]) => void;
}

export default function AgentSidebar({
  selectedAgents,
  onSelectionChange,
}: AgentSidebarProps) {
  const toggleAgent = (agentId: AgentType) => {
    if (selectedAgents.includes(agentId)) {
      onSelectionChange(selectedAgents.filter(id => id !== agentId));
    } else {
      onSelectionChange([...selectedAgents, agentId]);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Select Agents
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Choose one or more agents to work with
      </p>
      <div className="space-y-2">
        {AGENTS.map(agent => {
          const isSelected = selectedAgents.includes(agent.id);
          return (
            <div
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              className={`
                p-4 rounded-lg border-2 cursor-pointer transition-all
                ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-xl
                    ${agent.color} text-white
                  `}
                >
                  {agent.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {agent.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {agent.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selectedAgents.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {selectedAgents.length} agent{selectedAgents.length > 1 ? 's' : ''} selected
          </p>
        </div>
      )}
    </div>
  );
}

