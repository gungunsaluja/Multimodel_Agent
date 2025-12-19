'use client';

import { ToolCall } from '@/lib/types';
import { getAgentById } from '@/lib/agents';

interface ToolCallInspectorProps {
  toolCalls: ToolCall[];
}

export default function ToolCallInspector({ toolCalls }: ToolCallInspectorProps) {
  const getStatusColor = (status: ToolCall['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'executing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'pending':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (toolCalls.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No tool calls yet</p>
          <p className="text-sm">Tool calls will appear here as agents execute them</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {toolCalls.map(toolCall => {
        const agent = getAgentById(toolCall.agentId);
        return (
          <div
            key={toolCall.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4
                     bg-white dark:bg-gray-800 shadow-sm"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    agent?.color || 'bg-gray-500'
                  } text-white`}
                >
                  {agent?.name || toolCall.agentId}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(toolCall.timestamp)}
                </span>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                  toolCall.status
                )}`}
              >
                {toolCall.status}
              </span>
            </div>

            <div className="mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Tool: <code className="text-blue-600 dark:text-blue-400">{toolCall.toolName}</code>
              </h3>
            </div>

            <div className="mb-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Parameters:
              </h4>
              <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(toolCall.parameters, null, 2)}
              </pre>
            </div>

            {toolCall.result && (
              <div className="mb-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Result:
                </h4>
                <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(toolCall.result, null, 2)}
                </pre>
              </div>
            )}

            {toolCall.duration && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Duration: {toolCall.duration}ms
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

