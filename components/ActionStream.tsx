'use client';

import { AgentAction } from '@/lib/types';
import { getAgentById } from '@/lib/agents';

interface ActionStreamProps {
  actions: AgentAction[];
  isLoading: boolean;
}

export default function ActionStream({ actions, isLoading }: ActionStreamProps) {
  const getActionIcon = (type: AgentAction['type']) => {
    switch (type) {
      case 'message':
        return '💬';
      case 'tool_call':
        return '🔧';
      case 'file_edit':
        return '📝';
      case 'file_create':
        return '✨';
      case 'file_delete':
        return '🗑️';
      case 'command':
        return '⚡';
      default:
        return '📋';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (actions.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No actions yet</p>
          <p className="text-sm">Submit a prompt to see agent actions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {actions.map(action => {
        const agent = getAgentById(action.agentId);
        return (
          <div
            key={action.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4
                     bg-white dark:bg-gray-800 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">{getActionIcon(action.type)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      agent?.color || 'bg-gray-500'
                    } text-white`}
                  >
                    {agent?.name || action.agentId}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTimestamp(action.timestamp)}
                  </span>
                  <span className="px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {action.type}
                  </span>
                </div>
                <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                  {action.content}
                </p>
                {action.metadata && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm">
                    {action.metadata.toolName && (
                      <div className="mb-2">
                        <span className="font-medium">Tool:</span>{' '}
                        <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                          {action.metadata.toolName}
                        </code>
                      </div>
                    )}
                    {action.metadata.fileName && (
                      <div className="mb-2">
                        <span className="font-medium">File:</span>{' '}
                        <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                          {action.metadata.fileName}
                        </code>
                      </div>
                    )}
                    {action.metadata.command && (
                      <div>
                        <span className="font-medium">Command:</span>{' '}
                        <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                          {action.metadata.command}
                        </code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  );
}

