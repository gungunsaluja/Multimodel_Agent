'use client';

import { AgentType, AgentAction, FileDiff } from '@/lib/types';
import { getAgentById } from '@/lib/agents';
import { computeDiff } from '@/lib/diffUtils';
import { useState, useEffect, useRef } from 'react';

interface ConversationTurn {
  id: string;
  prompt: string;
  timestamp: number;
  actions: AgentAction[];
  status: 'streaming' | 'error' | 'completed';
  error?: string;
}

interface AgentPanelProps {
  agentId: AgentType;
  conversations: ConversationTurn[];
  fileDiffs: FileDiff[];
  isLoading: boolean;
  currentStatus: 'idle' | 'streaming' | 'error' | 'completed';
  currentError?: string;
  onKeepDiff?: (diff: FileDiff) => void;
  onUndoDiff?: (diff: FileDiff) => void;
}

export default function AgentPanel({
  agentId,
  conversations,
  fileDiffs,
  isLoading,
  currentStatus,
  currentError,
  onKeepDiff,
  onUndoDiff,
}: AgentPanelProps) {
  const agent = getAgentById(agentId);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const allActions = conversations.flatMap(conv => conv.actions);
  const metrics = {
    time: allActions.length > 0 ? ((Date.now() - allActions[0].timestamp) / 1000).toFixed(1) + 's' : '0s',
    tokens: allActions.reduce((acc, a) => acc + (a.content.length / 4), 0).toFixed(1) + 'k',
    tools: allActions.filter(a => a.type === 'tool_call').length,
    files: fileDiffs.length,
  };

  useEffect(() => {
    if (scrollContainerRef.current && (isLoading || currentStatus === 'streaming')) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [conversations, isLoading, currentStatus]);

  const toggleFile = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  const renderDiff = (diff: FileDiff) => {
    const changes = computeDiff(diff.oldContent, diff.newContent);
    return (
      <div className="font-mono text-xs">
        {changes.map((change, index) => {
          const lines = change.value.split('\n');
          return (
            <div key={index}>
              {lines.map((line, lineIndex) => {
                if (line === '' && lineIndex === lines.length - 1) return null;
                const bgColor = change.added
                  ? 'bg-green-900/30'
                  : change.removed
                  ? 'bg-red-900/30'
                  : '';
                const textColor = change.added
                  ? 'text-green-300'
                  : change.removed
                  ? 'text-red-300'
                  : 'text-gray-300';
                const prefix = change.added ? '+' : change.removed ? '-' : ' ';

                return (
                  <div
                    key={`${index}-${lineIndex}`}
                    className={`${bgColor} ${textColor} px-2 py-0.5 flex`}
                  >
                    <span className="w-6 text-gray-500 select-none">{prefix}</span>
                    <span className="flex-1">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const getStatusTag = () => {
    if (currentStatus === 'streaming') {
      return <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">STREAMING</span>;
    }
    if (currentStatus === 'error') {
      return <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">ERROR</span>;
    }
    if (currentStatus === 'completed') {
      return <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">COMPLETED</span>;
    }
    return null;
  };

  return (
    <div className={`h-full w-full border-r border-gray-700 ${agent?.borderColor || 'border-gray-700'} border-l-2 flex flex-col bg-gray-900`}>
      {/* Header */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-white">{agent?.name || agentId}</h3>
            <p className="text-xs text-gray-400">dev/project-{agentId}</p>
          </div>
          {getStatusTag()}
        </div>
        <div className="flex gap-4 text-xs text-gray-400">
          <span>{metrics.time}</span>
          <span>{metrics.tokens}</span>
          <span>{metrics.tools} tools</span>
          <span>{metrics.files} files</span>
        </div>
      </div>

      {/* Conversation History - Scrollable */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {conversations.length === 0 && !isLoading && (
          <div className="text-center text-gray-500 py-8 px-3">
            <p>No conversations yet. Send a prompt to get started.</p>
          </div>
        )}

        {conversations.map((conversation, convIndex) => (
          <div key={conversation.id} className="border-b border-gray-800">
            {/* Prompt */}
            <div className="p-3 bg-gray-800/50 border-b border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-200">Prompt:</p>
                <span className="text-xs text-gray-500">
                  {new Date(conversation.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-gray-300">{conversation.prompt}</p>
            </div>

            {/* Actions for this conversation */}
            <div className="p-3 space-y-3">
              {conversation.actions.length === 0 && conversation.status === 'streaming' && (
                <div className="text-xs text-gray-500">
                  <span className="text-gray-500">&gt;</span> THINKING...
                </div>
              )}

              {conversation.actions.map(action => {
          if (action.type === 'message') {
            return (
              <div key={action.id} className="text-sm text-gray-300 whitespace-pre-wrap mb-2">
                {action.content}
              </div>
            );
          }

          if (action.type === 'tool_call') {
            const isFailed = action.metadata?.status === 'failed';
            const duration = action.metadata?.status === 'completed' ? 
              (action.metadata?.toolParams?.path?.includes('jwt') ? '200ms' : 
               action.metadata?.toolParams?.path?.includes('index') ? '300ms' : 
               action.metadata?.toolParams?.path?.includes('list') ? '200ms' : '500ms') : '';
            const toolPath = action.metadata?.toolParams?.path || action.metadata?.toolParams?.command || '';
            
            if (isFailed) {
              return (
                <div key={action.id} className="mb-2">
                  <div className="text-xs text-gray-400 font-mono mb-2">
                    <span className="text-gray-500">&gt;</span> {action.metadata?.toolName || 'tool'}{' '}
                    {toolPath && <span className="text-gray-500">{toolPath}</span>}
                  </div>
                  <div className="border border-red-500/50 bg-red-900/20 rounded p-3">
                    <div className="text-red-400 font-semibold text-sm mb-2">
                      {action.metadata?.error?.split(':')[0] || 'ERROR'}
                    </div>
                    <div className="text-red-300 text-sm mb-2">
                      {action.metadata?.error?.split(':').slice(1).join(':').trim() || 'An error occurred'}
                    </div>
                    <button className="px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded hover:bg-red-500/30">
                      Retry
                    </button>
                  </div>
                </div>
              );
            }
            
            return (
              <div key={action.id} className="text-xs text-gray-400 font-mono mb-2">
                <span className="text-gray-500">&gt;</span> {action.metadata?.toolName || 'tool'}{' '}
                {toolPath && <span className="text-gray-500">{toolPath}</span>}{' '}
                {duration && <span className="text-gray-600">{duration}</span>}
              </div>
            );
          }

          if (action.type === 'file_edit' && action.metadata?.fileName) {
            const diff = fileDiffs.find(d => d.filePath === action.metadata?.fileName);
            if (diff) {
              const isExpanded = expandedFiles.has(diff.filePath);
              const isPending = !diff.status || diff.status === 'pending';
              const isApplied = diff.status === 'applied';
              const isRejected = diff.status === 'rejected';

              return (
                <div key={action.id} className="border border-gray-700 rounded overflow-hidden">
                  <div
                    onClick={() => toggleFile(diff.filePath)}
                    className="px-3 py-2 bg-gray-800 cursor-pointer hover:bg-gray-750 flex items-center justify-between"
                  >
                    <code className="text-xs text-gray-300">{diff.filePath}</code>
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <>
                          <span className="text-yellow-400 text-xs">+{diff.additions} Pending</span>
                          <span className="text-yellow-400 text-xs">⏳</span>
                        </>
                      )}
                      {isApplied && (
                        <>
                          <span className="text-green-400 text-xs">+{diff.additions} Applied</span>
                          <span className="text-green-400 text-xs">✓</span>
                        </>
                      )}
                      {isRejected && (
                        <>
                          <span className="text-gray-400 text-xs">Rejected</span>
                          <span className="text-gray-400 text-xs">✗</span>
                        </>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="bg-gray-950">
                      <div className="max-h-64 overflow-auto">
                        {renderDiff(diff)}
                      </div>
                      {isPending && (
                        <div className="border-t border-gray-700 px-3 py-2 flex gap-2 bg-gray-900">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onKeepDiff) {
                                onKeepDiff(diff);
                              }
                            }}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium"
                          >
                            Keep Changes
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onUndoDiff) {
                                onUndoDiff(diff);
                              }
                            }}
                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded font-medium"
                          >
                            Undo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
          }

                return null;
              })}

              {conversation.status === 'error' && conversation.error && (
                <div className="border border-red-500/50 bg-red-900/20 rounded p-3">
                  <div className="text-red-400 font-semibold text-sm mb-2">ERROR</div>
                  <div className="text-red-300 text-sm">{conversation.error}</div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Current error if any */}
        {currentError && currentStatus === 'error' && (
          <div className="p-3 border-t border-gray-700">
            <div className="border border-red-500/50 bg-red-900/20 rounded p-3">
              <div className="text-red-400 font-semibold text-sm mb-2">ERROR</div>
              <div className="text-red-300 text-sm">{currentError}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

