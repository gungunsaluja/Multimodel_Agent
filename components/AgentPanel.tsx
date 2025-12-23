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
  status: 'streaming' | 'error' | 'completed' | 'paused';
  error?: string;
}

interface AgentPanelProps {
  agentId: AgentType;
  conversations: ConversationTurn[];
  fileDiffs: FileDiff[];
  isLoading: boolean;
  currentStatus: 'idle' | 'streaming' | 'error' | 'completed' | 'paused';
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
      <div className="font-mono text-xs overflow-x-hidden">
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
                    className={`${bgColor} ${textColor} px-2 py-0.5 flex overflow-x-hidden`}
                  >
                    <span className="w-6 text-gray-500 select-none flex-shrink-0">{prefix}</span>
                    <span className="flex-1 break-all min-w-0">{line || ' '}</span>
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
      return (
        <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-400 text-xs font-medium rounded-md border border-emerald-500/30 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
          Streaming
        </span>
      );
    }
    if (currentStatus === 'paused') {
      return (
        <span className="px-2.5 py-1 bg-amber-500/15 text-amber-400 text-xs font-medium rounded-md border border-amber-500/30">
          Paused
        </span>
      );
    }
    if (currentStatus === 'error') {
      return (
        <span className="px-2.5 py-1 bg-red-500/15 text-red-400 text-xs font-medium rounded-md border border-red-500/30">
          Error
        </span>
      );
    }
    if (currentStatus === 'completed') {
      return (
        <span className="px-2.5 py-1 bg-blue-500/15 text-blue-400 text-xs font-medium rounded-md border border-blue-500/30 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Done
        </span>
      );
    }
    return null;
  };

  return (
    <div className={`h-full w-full border-r border-gray-700/50 ${agent?.borderColor || 'border-gray-700/50'} border-l-2 flex flex-col bg-gray-900/95 backdrop-blur-sm overflow-x-hidden`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50 bg-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${agent?.color || 'bg-gray-500'}`}></div>
            <h3 className="font-semibold text-white text-sm">{agent?.name || agentId}</h3>
          </div>
          {getStatusTag()}
        </div>
      </div>

      {/* Conversation History - Scrollable */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {conversations.length === 0 && !isLoading && (
          <div className="text-center text-gray-400 py-12 px-3 flex flex-col items-center gap-2">
            <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs text-gray-500">Send a prompt to get started</p>
          </div>
        )}

        {conversations.map((conversation, convIndex) => (
          <div key={conversation.id} className="border-b border-gray-800">
            {/* Prompt */}
            <div className="p-4 bg-gray-800/30 border-b border-gray-700/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Prompt</p>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(conversation.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-gray-200 leading-relaxed break-words">{conversation.prompt}</p>
            </div>

            {/* Actions for this conversation */}
            <div className="p-3 space-y-3 overflow-x-hidden">
              {conversation.actions.length === 0 && conversation.status === 'streaming' && (
                <div className="text-xs text-gray-500">
                  <span className="text-gray-500">&gt;</span> THINKING...
                </div>
              )}

              {conversation.actions.map(action => {
          if (action.type === 'message') {
            return (
              <div key={action.id} className="text-sm text-gray-300 whitespace-pre-wrap break-words mb-2">
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
                    <code className="text-xs text-gray-300 break-all">{diff.filePath}</code>
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

              {conversation.status === 'paused' && (
                <div className="text-gray-400 text-sm py-2">
                  Paused by user
                </div>
              )}
              {conversation.status === 'error' && conversation.error && (
                <div className="border border-red-500/50 bg-red-900/20 rounded p-3">
                  <div className="text-red-400 font-semibold text-sm mb-2">ERROR</div>
                  <div className="text-red-300 text-sm">
                    {conversation.error.includes('image input') || conversation.error.includes('vision') ? (
                      <div>
                        <div className="mb-2">{conversation.error}</div>
                        <div className="text-xs text-yellow-400 mt-2">
                          💡 Tip: The free models currently in use don't support image input. Please use text-only prompts, or upgrade to vision-capable models.
                        </div>
                      </div>
                    ) : (
                      conversation.error
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Current paused/error status */}
        {currentStatus === 'paused' && (
          <div className="p-3 border-t border-gray-700">
            <div className="text-gray-400 text-sm">
              Paused by user
            </div>
          </div>
        )}
        {currentError && currentStatus === 'error' && (
          <div className="p-3 border-t border-gray-700">
            <div className="border border-red-500/50 bg-red-900/20 rounded p-3">
              <div className="text-red-400 font-semibold text-sm mb-2">ERROR</div>
              <div className="text-red-300 text-sm">
                {currentError.includes('image input') || currentError.includes('vision') ? (
                  <div>
                    <div className="mb-2">{currentError}</div>
                    <div className="text-xs text-yellow-400 mt-2">
                      💡 Tip: The free models currently in use don't support image input. Please use text-only prompts, or upgrade to vision-capable models.
                    </div>
                  </div>
                ) : (
                  currentError
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

