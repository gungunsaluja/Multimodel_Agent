'use client';

import { useState, useEffect, useRef } from 'react';
import StatusBar from '@/components/StatusBar';
import FileExplorer from '@/components/FileExplorer';
import FileView from '@/components/FileView';
import AgentPanel from '@/components/AgentPanel';
import BottomInputBar from '@/components/BottomInputBar';
import ResizableDivider from '@/components/ResizableDivider';
import { AgentType, AgentAction, FileDiff } from '@/lib/types';
import { AGENTS } from '@/lib/agents';
import { computeDiff } from '@/lib/diffUtils';

export default function Home() {
  const [selectedAgents] = useState<AgentType[]>(['claude', 'gemini', 'chatgpt']);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const [fileExplorerPercent, setFileExplorerPercent] = useState(10);
  const [fileViewPercent, setFileViewPercent] = useState(30);
  const [agentPanel1Percent, setAgentPanel1Percent] = useState(20);
  const [agentPanel2Percent, setAgentPanel2Percent] = useState(20);
  const [agentPanel3Percent, setAgentPanel3Percent] = useState(20);

  interface ConversationTurn {
    id: string;
    prompt: string;
    timestamp: number;
    actions: AgentAction[];
    status: 'streaming' | 'error' | 'completed';
    error?: string;
  }

  const [agentStates, setAgentStates] = useState<Record<AgentType, {
    conversations: ConversationTurn[];
    fileDiffs: FileDiff[];
    currentStatus: 'idle' | 'streaming' | 'error' | 'completed';
    currentError?: string;
  }>>({
    claude: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
    gemini: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
    chatgpt: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
  });

  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const abortControllersRef = useRef<Record<AgentType, AbortController | null>>({
    claude: null,
    gemini: null,
    chatgpt: null,
  });
  const requestIdRef = useRef<string>('');

  interface SSEResponse {
    type: 'action' | 'error' | 'done' | 'status';
    agentId?: AgentType;
    requestId?: string;
    action?: AgentAction;
    error?: string;
    code?: string;
    status?: 'streaming' | 'completed' | 'error' | 'paused';
  }

  useEffect(() => {
    return () => {
      Object.values(abortControllersRef.current).forEach(controller => {
        if (controller) {
          controller.abort();
        }
      });
    };
  }, []);

  /**
   * Handle SSE messages from the server
   * Processes different message types and updates agent state accordingly
   */
  const handleSSEMessage = (message: SSEResponse, expectedAgentId: AgentType): void => {
    if (!message.agentId || message.agentId !== expectedAgentId) {
      console.warn(`[SSE] Ignoring message for wrong agent. Expected: ${expectedAgentId}, Got: ${message.agentId}`);
      return;
    }
    
    if (message.type === 'status' && message.agentId && message.requestId === requestIdRef.current) {
      setAgentStates(prev => {
        const agentState = prev[message.agentId!];
        const expectedId = `${requestIdRef.current}-${message.agentId}`;
        const status = message.status === 'streaming' || message.status === 'error' || message.status === 'completed' 
          ? message.status 
          : 'streaming';
        const conversations = agentState.conversations.map(c => 
          c.id === expectedId 
            ? { ...c, status, error: undefined, actions: [...c.actions] }
            : { ...c, actions: [...c.actions] }
        );
        return {
          ...prev,
          [message.agentId!]: {
            conversations,
            fileDiffs: [...agentState.fileDiffs],
            currentStatus: status,
            currentError: agentState.currentError,
          },
        };
      });
      return;
    }

    if (message.type === 'action' && message.agentId && message.action && message.requestId === requestIdRef.current) {
      const { agentId, action } = message;
      
      if (action.agentId && action.agentId !== agentId) {
        console.error(`[CRITICAL] Action agentId mismatch! Message agentId: ${agentId}, Action agentId: ${action.agentId}`);
        return;
      }
      
      const actionWithAgentId = { ...action, agentId };
      
      setAgentStates(prev => {
        const agentState = prev[agentId];
        if (!agentState) {
          console.error(`[CRITICAL] No agent state found for agentId: ${agentId}`);
          return prev;
        }
        
        const expectedId = `${requestIdRef.current}-${agentId}`;
        let foundConversation = false;
        const conversations = agentState.conversations.map((c) => {
          if (c.id === expectedId) {
            foundConversation = true;
            const existingIndex = c.actions.findIndex(a => a.id === actionWithAgentId.id && a.agentId === agentId);
            let newActions: typeof c.actions;
            
            if (existingIndex >= 0) {
              newActions = c.actions.map((a, i) => i === existingIndex ? actionWithAgentId : { ...a });
            } else {
              newActions = [...c.actions, actionWithAgentId];
            }
            
            console.log(`[ACTION UPDATE] Agent: ${agentId}, Conversation ID: ${c.id}, Action ID: ${actionWithAgentId.id}, Content length: ${actionWithAgentId.content?.length || 0}, Total actions: ${newActions.length}`);
            
            return {
              ...c,
              actions: newActions
            };
          }
          return { ...c, actions: [...c.actions] };
        });
        
        if (!foundConversation) {
          console.error(`[CRITICAL] Conversation not found for agent ${agentId}! Expected ID: ${expectedId}, Available IDs:`, agentState.conversations.map(c => c.id));
        }
        
        let newFileDiffs = [...agentState.fileDiffs];
        if (action.type === 'file_edit' && action.metadata?.oldContent && action.metadata?.newContent) {
          const diff = computeDiff(action.metadata.oldContent, action.metadata.newContent);
          const stats = diff.reduce(
            (acc, change) => {
              const lines = change.value.split('\n').filter(l => l);
              if (change.added) acc.additions += lines.length;
              if (change.removed) acc.deletions += lines.length;
              return acc;
            },
            { additions: 0, deletions: 0 }
          );

          const fileDiff: FileDiff = {
            filePath: action.metadata.filePath || action.metadata.fileName || 'unknown',
            oldContent: action.metadata.oldContent,
            newContent: action.metadata.newContent,
            additions: stats.additions,
            deletions: stats.deletions,
            status: 'pending',
            agentId: agentId,
          };

          const existingDiffIndex = newFileDiffs.findIndex(f => f.filePath === fileDiff.filePath);
          if (existingDiffIndex >= 0) {
            newFileDiffs[existingDiffIndex] = fileDiff;
          } else {
            newFileDiffs.push(fileDiff);
          }
        }

        return {
          ...prev,
          [agentId]: {
            conversations,
            fileDiffs: newFileDiffs,
            currentStatus: agentState.currentStatus,
            currentError: agentState.currentError,
          },
        };
      });
      return;
    }

    if (message.type === 'error' && message.agentId && message.requestId === requestIdRef.current) {
      setAgentStates(prev => {
        const agentState = prev[message.agentId!];
        const expectedId = `${requestIdRef.current}-${message.agentId}`;
        const conversations = agentState.conversations.map(c => 
          c.id === expectedId
            ? { ...c, status: 'error' as const, error: message.error || 'An error occurred', actions: [...c.actions] }
            : { ...c, actions: [...c.actions] }
        );
        return {
          ...prev,
          [message.agentId!]: {
            conversations,
            fileDiffs: [...agentState.fileDiffs],
            currentStatus: 'error',
            currentError: message.error || 'An error occurred',
          },
        };
      });
      return;
    }

    if (message.type === 'done' && message.agentId && message.requestId === requestIdRef.current) {
      setAgentStates(prev => {
        const agentState = prev[message.agentId!];
        const expectedId = `${requestIdRef.current}-${message.agentId}`;
        const conversations = agentState.conversations.map(c => 
          c.id === expectedId
            ? { ...c, status: 'completed' as const, actions: [...c.actions] }
            : { ...c, actions: [...c.actions] }
        );
        
        const updated = {
          ...prev,
          [message.agentId!]: {
            conversations,
            fileDiffs: [...agentState.fileDiffs],
            currentStatus: 'completed' as const,
            currentError: agentState.currentError,
          },
        };
        
        const allDone = selectedAgents.every(agentId => 
          updated[agentId].currentStatus === 'completed' || updated[agentId].currentStatus === 'error'
        );
        if (allDone) {
          setIsLoading(false);
        }
        
        return updated;
      });
      return;
    }
  };

  const handlePromptSubmit = async (prompt: string) => {
    setCurrentPrompt(prompt);
    setIsLoading(true);
    setIsPaused(false);

    requestIdRef.current = `request-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setAgentStates(prev => {
      const baseTimestamp = Date.now();
      const claudeId = `${requestIdRef.current}-claude`;
      const geminiId = `${requestIdRef.current}-gemini`;
      const chatgptId = `${requestIdRef.current}-chatgpt`;
      
      console.log(`[CONVERSATION CREATE] Request ID: ${requestIdRef.current}`);
      console.log(`[CONVERSATION CREATE] Claude ID: ${claudeId}`);
      console.log(`[CONVERSATION CREATE] Gemini ID: ${geminiId}`);
      console.log(`[CONVERSATION CREATE] ChatGPT ID: ${chatgptId}`);
      
      return {
        claude: {
          ...prev.claude,
          conversations: [...prev.claude.conversations, {
            id: claudeId,
            prompt: prompt,
            timestamp: baseTimestamp,
            actions: [],
            status: 'streaming',
          }],
          currentStatus: 'streaming',
        },
        gemini: {
          ...prev.gemini,
          conversations: [...prev.gemini.conversations, {
            id: geminiId,
            prompt: prompt,
            timestamp: baseTimestamp + 1,
            actions: [],
            status: 'streaming',
          }],
          currentStatus: 'streaming',
        },
        chatgpt: {
          ...prev.chatgpt,
          conversations: [...prev.chatgpt.conversations, {
            id: chatgptId,
            prompt: prompt,
            timestamp: baseTimestamp + 2,
            actions: [],
            status: 'streaming',
          }],
          currentStatus: 'streaming',
        },
      };
    });

    selectedAgents.forEach((agentId) => {
      if (abortControllersRef.current[agentId]) {
        abortControllersRef.current[agentId]?.abort();
        abortControllersRef.current[agentId] = null;
      }

      const abortController = new AbortController();
      abortControllersRef.current[agentId] = abortController;

      fetch('/api/agents/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId,
          prompt,
          requestId: requestIdRef.current,
        }),
        signal: abortController.signal,
      })
        .then(response => {
          if (abortController.signal.aborted) {
            return;
          }

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          if (!reader) {
            throw new Error('No response body');
          }

          let buffer = '';

          const readStream = async () => {
            try {
              while (true) {
                if (abortController.signal.aborted) {
                  try {
                    reader.cancel();
                  } catch (e) {
                  }
                  break;
                }

                const { done, value } = await reader.read();

                if (done) {
                  break;
                }

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = line.slice(6).trim();
                      if (data && data !== '[DONE]') {
                        const message: SSEResponse = JSON.parse(data);
                        handleSSEMessage(message, agentId);
                      }
                    } catch (e) {
                      if (process.env.NODE_ENV === 'development') {
                        console.warn('Error parsing SSE message:', e, line);
                      }
                    }
                  } else if (line.trim() === '') {
                    continue;
                  }
                }
              }
              
              if (buffer.trim() && !abortController.signal.aborted) {
                const lines = buffer.split(/\r?\n/);
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = line.slice(6).trim();
                      if (data && data !== '[DONE]') {
                        const message: SSEResponse = JSON.parse(data);
                        handleSSEMessage(message, agentId);
                      }
                    } catch (e) {
                    }
                  }
                }
              }
            } catch (error: unknown) {
              if (error instanceof Error && (error.name === 'AbortError' || abortController.signal.aborted)) {
                return;
              }

              const errorMessage = error instanceof Error 
                ? error.message 
                : 'Stream error occurred';

              console.error(`Error reading stream for ${agentId}:`, error);
              setAgentStates(prev => {
                const agentState = prev[agentId];
                const expectedId = `${requestIdRef.current}-${agentId}`;
                const conversations = agentState.conversations.map(c => 
                  c.id === expectedId
                    ? { ...c, status: 'error' as const, error: errorMessage, actions: [...c.actions] }
                    : { ...c, actions: [...c.actions] }
                );
                return {
                  ...prev,
                  [agentId]: {
                    conversations,
                    fileDiffs: [...agentState.fileDiffs],
                    currentStatus: 'error',
                    currentError: errorMessage,
                  },
                };
              });
            } finally {
              if (abortControllersRef.current[agentId] === abortController) {
                abortControllersRef.current[agentId] = null;
              }
            }
          };

          readStream();
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }

          const errorMessage = error instanceof Error
            ? error.message
            : 'Failed to start stream';

          console.error(`Error starting stream for ${agentId}:`, error);
          setAgentStates(prev => {
            const agentState = prev[agentId];
            const expectedId = `${requestIdRef.current}-${agentId}`;
            const conversations = agentState.conversations.map(c => 
              c.id === expectedId
                ? { ...c, status: 'error' as const, error: errorMessage, actions: [...c.actions] }
                : { ...c, actions: [...c.actions] }
            );
            return {
              ...prev,
              [agentId]: {
                conversations,
                fileDiffs: [...agentState.fileDiffs],
                currentStatus: 'error',
                currentError: errorMessage,
              },
            };
          });
          
          if (abortControllersRef.current[agentId] === abortController) {
            abortControllersRef.current[agentId] = null;
          }
        });
    });
  };

  const handleKeepDiff = async (diff: FileDiff) => {
    try {
      const response = await fetch('/api/files/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: diff.filePath,
          content: diff.newContent,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAgentStates(prev => {
          const agentState = prev[diff.agentId!];
          const updatedDiffs = agentState.fileDiffs.map(d =>
            d.filePath === diff.filePath ? { ...d, status: 'applied' as const } : d
          );
          return {
            ...prev,
            [diff.agentId!]: {
              ...agentState,
              fileDiffs: updatedDiffs,
            },
          };
        });
      } else {
        const errorMessage = data.error?.message || 'Unknown error';
        console.error('Failed to apply changes:', errorMessage);
        alert(`Failed to apply changes: ${errorMessage}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to apply changes';
      console.error('Error applying changes:', error);
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleUndoDiff = async (diff: FileDiff) => {
    try {
      const response = await fetch('/api/files/apply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: diff.filePath,
          oldContent: diff.oldContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error?.message || errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: { message?: string } };
      if (data.success) {
        setAgentStates(prev => {
          const agentState = prev[diff.agentId!];
          const updatedDiffs = agentState.fileDiffs.map(d =>
            d.filePath === diff.filePath ? { ...d, status: 'rejected' as const } : d
          );
          return {
            ...prev,
            [diff.agentId!]: {
              ...agentState,
              fileDiffs: updatedDiffs,
            },
          };
        });
      } else {
        const errorMessage = data.error?.message || 'Unknown error';
        console.error('Failed to undo changes:', errorMessage);
        alert(`Failed to undo changes: ${errorMessage}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to undo changes';
      console.error('Error undoing changes:', error);
      alert(`Error: ${errorMessage}`);
    }
  };

  const totalTokens = Object.values(agentStates).reduce(
    (acc, state) => acc + state.conversations.reduce(
      (sum, conv) => sum + conv.actions.reduce((s, a) => s + a.content.length / 4, 0),
      0
    ),
    0
  );
  const totalTools = Object.values(agentStates).reduce(
    (acc, state) => acc + state.conversations.reduce(
      (sum, conv) => sum + conv.actions.filter(a => a.type === 'tool_call').length,
      0
    ),
    0
  );

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <StatusBar
        activeAgents={selectedAgents.length}
        totalTokens={Math.round(totalTokens)}
        totalTools={totalTools}
        onPause={() => setIsPaused(!isPaused)}
        isPaused={isPaused}
      />

      <div className="flex flex-1 overflow-hidden">
        <div style={{
          width: `${fileExplorerPercent}%`,
          minWidth: '150px',
          maxWidth: '30%',
          flexShrink: 0
        }}>
          <FileExplorer
            rootPath="./workspace"
            onFileSelect={(path) => setSelectedFile(path)}
            onCreateFile={(path) => console.log('File created:', path)}
            onCreateFolder={(path) => console.log('Folder created:', path)}
          />
        </div>

        <ResizableDivider 
          onResize={(delta) => {
            const container = document.querySelector('.flex.flex-1.overflow-hidden') as HTMLElement;
            if (!container) return;
            const containerWidth = container.clientWidth;
            const deltaPercent = (delta / containerWidth) * 100;
            
            setFileExplorerPercent(prev => {
              const newPercent = prev + deltaPercent;
              const container = document.querySelector('.flex.flex-1.overflow-hidden') as HTMLElement;
              const minPercent = container ? (150 / container.clientWidth) * 100 : 5;
              const constrained = Math.max(minPercent, Math.min(30, newPercent));
              const adjustment = constrained - newPercent;
              
              setFileViewPercent(prevView => {
                const newViewPercent = prevView - adjustment;
                const minViewPercent = container ? (250 / container.clientWidth) * 100 : 15;
                return Math.max(minViewPercent, Math.min(50, newViewPercent));
              });
              
              return constrained;
            });
          }} 
        />

        <div style={{
          width: `${fileViewPercent}%`,
          minWidth: '250px',
          maxWidth: '50%',
          flexShrink: 0
        }}>
          <FileView filePath={selectedFile} />
        </div>

        <ResizableDivider
          onResize={(delta) => {
            const container = document.querySelector('.flex.flex-1.overflow-hidden') as HTMLElement;
            if (!container) return;
            const containerWidth = container.clientWidth;
            const deltaPercent = (delta / containerWidth) * 100;

            setFileViewPercent(prev => {
              const newPercent = prev + deltaPercent;
              const container = document.querySelector('.flex.flex-1.overflow-hidden') as HTMLElement;
              const minViewPercent = container ? (250 / container.clientWidth) * 100 : 15;
              const constrained = Math.max(minViewPercent, Math.min(50, newPercent));
              const adjustment = constrained - newPercent;

              const totalAgentPercent = agentPanel1Percent + agentPanel2Percent + agentPanel3Percent;
              if (totalAgentPercent > 0) {
                const minAgentPercent = container ? (200 / container.clientWidth) * 100 : 10;
                setAgentPanel1Percent(prevPanel => {
                  const panelAdjustment = (adjustment * prevPanel) / totalAgentPercent;
                  const newPanelPercent = prevPanel - panelAdjustment;
                  return Math.max(minAgentPercent, Math.min(35, newPanelPercent));
                });
                setAgentPanel2Percent(prevPanel => {
                  const panelAdjustment = (adjustment * prevPanel) / totalAgentPercent;
                  const newPanelPercent = prevPanel - panelAdjustment;
                  return Math.max(minAgentPercent, Math.min(35, newPanelPercent));
                });
                setAgentPanel3Percent(prevPanel => {
                  const panelAdjustment = (adjustment * prevPanel) / totalAgentPercent;
                  const newPanelPercent = prevPanel - panelAdjustment;
                  return Math.max(minAgentPercent, Math.min(35, newPanelPercent));
                });
              }

              return constrained;
            });
          }} 
        />

        <div className="flex overflow-hidden" style={{ flex: 1, minWidth: 0, width: 0 }}>
          <div style={{ 
            flex: `0 0 ${agentPanel1Percent}%`,
            minWidth: '200px',
            maxWidth: '35%',
            height: '100%'
          }}>
            <AgentPanel
              agentId={selectedAgents[0]}
              conversations={agentStates[selectedAgents[0]].conversations}
              fileDiffs={agentStates[selectedAgents[0]].fileDiffs}
              isLoading={isLoading && agentStates[selectedAgents[0]].currentStatus === 'streaming'}
              currentStatus={agentStates[selectedAgents[0]].currentStatus}
              currentError={agentStates[selectedAgents[0]].currentError}
              onKeepDiff={handleKeepDiff}
              onUndoDiff={handleUndoDiff}
            />
          </div>
          
          <ResizableDivider
            onResize={(delta) => {
              const mainContainer = document.querySelector('.flex.flex-1.overflow-hidden') as HTMLElement;
              if (!mainContainer) return;
              const containerWidth = mainContainer.clientWidth;
              const deltaPercent = (delta / containerWidth) * 100;
              
              setAgentPanel1Percent(prev => {
                const newPercent = prev + deltaPercent;
                const minAgentPercent = (200 / containerWidth) * 100;
                const constrained = Math.max(minAgentPercent, Math.min(35, newPercent));
                const adjustment = constrained - newPercent;
                
                setAgentPanel2Percent(prevPanel => {
                  const newPanel2 = prevPanel - adjustment;
                  return Math.max(minAgentPercent, Math.min(35, newPanel2));
                });
                
                return constrained;
              });
            }}
          />
          
          <div style={{ 
            flex: `0 0 ${agentPanel2Percent}%`,
            minWidth: '200px',
            maxWidth: '35%',
            height: '100%'
          }}>
            <AgentPanel
              agentId={selectedAgents[1]}
              conversations={agentStates[selectedAgents[1]].conversations}
              fileDiffs={agentStates[selectedAgents[1]].fileDiffs}
              isLoading={isLoading && agentStates[selectedAgents[1]].currentStatus === 'streaming'}
              currentStatus={agentStates[selectedAgents[1]].currentStatus}
              currentError={agentStates[selectedAgents[1]].currentError}
              onKeepDiff={handleKeepDiff}
              onUndoDiff={handleUndoDiff}
            />
          </div>
          
          <ResizableDivider
            onResize={(delta) => {
              const mainContainer = document.querySelector('.flex.flex-1.overflow-hidden') as HTMLElement;
              if (!mainContainer) return;
              const containerWidth = mainContainer.clientWidth;
              const deltaPercent = (delta / containerWidth) * 100;
              
              setAgentPanel2Percent(prev => {
                const newPercent = prev + deltaPercent;
                const minAgentPercent = (200 / containerWidth) * 100;
                const constrained = Math.max(minAgentPercent, Math.min(35, newPercent));
                const adjustment = constrained - newPercent;
                
                setAgentPanel3Percent(prevPanel => {
                  const newPanel3 = prevPanel - adjustment;
                  return Math.max(minAgentPercent, Math.min(35, newPanel3));
                });
                
                return constrained;
              });
            }}
          />
          
          <div style={{ 
            flex: `0 0 ${agentPanel3Percent}%`,
            minWidth: '200px',
            maxWidth: '35%',
            height: '100%'
          }}>
            <AgentPanel
              agentId={selectedAgents[2]}
              conversations={agentStates[selectedAgents[2]].conversations}
              fileDiffs={agentStates[selectedAgents[2]].fileDiffs}
              isLoading={isLoading && agentStates[selectedAgents[2]].currentStatus === 'streaming'}
              currentStatus={agentStates[selectedAgents[2]].currentStatus}
              currentError={agentStates[selectedAgents[2]].currentError}
              onKeepDiff={handleKeepDiff}
              onUndoDiff={handleUndoDiff}
            />
          </div>
        </div>
      </div>

      <BottomInputBar
        selectedAgents={selectedAgents}
        onSubmit={handlePromptSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
