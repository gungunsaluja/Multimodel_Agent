'use client';

import { useState, useEffect, useRef } from 'react';
import StatusBar from '@/components/StatusBar';
import FileExplorer from '@/components/FileExplorer';
import FileView from '@/components/FileView';
import AgentPanel from '@/components/AgentPanel';
import BottomInputBar from '@/components/BottomInputBar';
import ResizableDivider from '@/components/ResizableDivider';
import { AgentType, AgentAction, FileDiff } from '@/lib/types';
import { computeDiff } from '@/lib/diffUtils';
export default function Home() {
  const [selectedAgents] = useState<AgentType[]>(['claude', 'gemini', 'chatgpt']);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);

  const [fileExplorerPercent, setFileExplorerPercent] = useState(10);
  const [fileViewPercent, setFileViewPercent] = useState(30);
  const [agentPanel1Width, setAgentPanel1Width] = useState(400);
  const [agentPanel2Width, setAgentPanel2Width] = useState(400);
  const [agentPanel3Width, setAgentPanel3Width] = useState(400);

  interface ConversationTurn {
    id: string;
    prompt: string;
    timestamp: number;
    actions: AgentAction[];
    status: 'streaming' | 'error' | 'completed' | 'paused';
    error?: string;
  }

  const STORAGE_KEY = 'multi-agent-conversations';

  const loadFromStorage = (): Record<AgentType, {
    conversations: ConversationTurn[];
    fileDiffs: FileDiff[];
    currentStatus: 'idle' | 'streaming' | 'error' | 'completed' | 'paused';
    currentError?: string;
  }> => {
    if (typeof window === 'undefined') {
      return {
        claude: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
        gemini: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
        chatgpt: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
      };
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        
        const validateConversation = (c: any): c is ConversationTurn => {
          return c && 
                 typeof c.id === 'string' &&
                 typeof c.prompt === 'string' &&
                 typeof c.timestamp === 'number' &&
                 Array.isArray(c.actions) &&
                 (c.status === 'completed' || c.status === 'error' || c.status === 'streaming' || c.status === 'paused');
        };
        
        const validateFileDiff = (f: any): f is FileDiff => {
          return f &&
                 typeof f.filePath === 'string' &&
                 typeof f.oldContent === 'string' &&
                 typeof f.newContent === 'string';
        };
        
        const loaded = {
          claude: {
            conversations: Array.isArray(parsed.claude?.conversations) 
              ? parsed.claude.conversations.filter(validateConversation)
              : [],
            fileDiffs: Array.isArray(parsed.claude?.fileDiffs)
              ? parsed.claude.fileDiffs.filter(validateFileDiff)
              : [],
            currentStatus: 'idle' as const,
            currentError: undefined,
          },
          gemini: {
            conversations: Array.isArray(parsed.gemini?.conversations)
              ? parsed.gemini.conversations.filter(validateConversation)
              : [],
            fileDiffs: Array.isArray(parsed.gemini?.fileDiffs)
              ? parsed.gemini.fileDiffs.filter(validateFileDiff)
              : [],
            currentStatus: 'idle' as const,
            currentError: undefined,
          },
          chatgpt: {
            conversations: Array.isArray(parsed.chatgpt?.conversations)
              ? parsed.chatgpt.conversations.filter(validateConversation)
              : [],
            fileDiffs: Array.isArray(parsed.chatgpt?.fileDiffs)
              ? parsed.chatgpt.fileDiffs.filter(validateFileDiff)
              : [],
            currentStatus: 'idle' as const,
            currentError: undefined,
          },
        };
        
        const totalConversations = loaded.claude.conversations.length + 
                                   loaded.gemini.conversations.length + 
                                   loaded.chatgpt.conversations.length;
        
        console.log('[LOCALSTORAGE] Loaded conversations:', {
          claude: loaded.claude.conversations.length,
          gemini: loaded.gemini.conversations.length,
          chatgpt: loaded.chatgpt.conversations.length,
          total: totalConversations,
        });
        
        if (totalConversations > 0) {
          console.log('[LOCALSTORAGE] Sample conversation IDs:', {
            claude: loaded.claude.conversations[0]?.id,
            gemini: loaded.gemini.conversations[0]?.id,
            chatgpt: loaded.chatgpt.conversations[0]?.id,
          });
        }
        
        return loaded;
      } else {
        console.log('[LOCALSTORAGE] No stored data found');
      }
    } catch (error) {
      console.error('[LOCALSTORAGE] Error loading from localStorage:', error);
      if (error instanceof SyntaxError) {
        console.warn('[LOCALSTORAGE] Corrupted data detected, clearing storage');
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (clearError) {
          console.error('[LOCALSTORAGE] Failed to clear corrupted data:', clearError);
        }
      }
    }

    return {
      claude: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
      gemini: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
      chatgpt: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
    };
  };

  const saveToStorage = (states: Record<AgentType, {
    conversations: ConversationTurn[];
    fileDiffs: FileDiff[];
    currentStatus: 'idle' | 'streaming' | 'error' | 'completed' | 'paused';
    currentError?: string;
  }>) => {
    if (typeof window === 'undefined') return;

    try {
      const shouldSaveConversation = (c: ConversationTurn): boolean => {
        if (c.status === 'completed' || c.status === 'error' || c.status === 'paused') {
          return true;
        }
        if (c.status === 'streaming' && c.actions.length > 0) {
          const hasContent = c.actions.some(a => 
            a.content && a.content.trim().length > 0
          );
          return hasContent;
        }
        return false;
      };

      const toSave = {
        claude: {
          conversations: states.claude.conversations
            .filter(shouldSaveConversation)
            .map(c => ({
              ...c,
              status: c.status === 'streaming' ? 'completed' as const : c.status,
            })),
          fileDiffs: states.claude.fileDiffs,
        },
        gemini: {
          conversations: states.gemini.conversations
            .filter(shouldSaveConversation)
            .map(c => ({
              ...c,
              status: c.status === 'streaming' ? 'completed' as const : c.status,
            })),
          fileDiffs: states.gemini.fileDiffs,
        },
        chatgpt: {
          conversations: states.chatgpt.conversations
            .filter(shouldSaveConversation)
            .map(c => ({
              ...c,
              status: c.status === 'streaming' ? 'completed' as const : c.status,
            })),
          fileDiffs: states.chatgpt.fileDiffs,
        },
      };

      const hasData = toSave.claude.conversations.length > 0 || 
                      toSave.gemini.conversations.length > 0 || 
                      toSave.chatgpt.conversations.length > 0 ||
                      toSave.claude.fileDiffs.length > 0 ||
                      toSave.gemini.fileDiffs.length > 0 ||
                      toSave.chatgpt.fileDiffs.length > 0;

      if (hasData) {
        const serialized = JSON.stringify(toSave);
        localStorage.setItem(STORAGE_KEY, serialized);
        console.log('[LOCALSTORAGE] Saved conversations:', {
          claude: toSave.claude.conversations.length,
          gemini: toSave.gemini.conversations.length,
          chatgpt: toSave.chatgpt.conversations.length,
          totalSize: serialized.length,
        });
      } else {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[LOCALSTORAGE] No data to save, removed from storage');
      }
    } catch (error) {
      console.error('[LOCALSTORAGE] Error saving to localStorage:', error);
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('[LOCALSTORAGE] Quota exceeded. Consider clearing old data.');
        try {
          const oldestConversations = Object.values(states).flatMap(s => s.conversations)
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(0, Math.floor(Object.values(states).flatMap(s => s.conversations).length / 2));
          
          const trimmedStates = { ...states };
          Object.keys(trimmedStates).forEach(agentId => {
            const agentState = trimmedStates[agentId as AgentType];
            trimmedStates[agentId as AgentType] = {
              ...agentState,
              conversations: agentState.conversations.filter(
                c => !oldestConversations.some(old => old.id === c.id)
              ),
            };
          });
          
          saveToStorage(trimmedStates);
        } catch (retryError) {
          console.error('[LOCALSTORAGE] Failed to trim and retry save:', retryError);
        }
      }
    }
  };

  const [agentStates, setAgentStates] = useState<Record<AgentType, {
    conversations: ConversationTurn[];
    fileDiffs: FileDiff[];
    currentStatus: 'idle' | 'streaming' | 'error' | 'completed' | 'paused';
    currentError?: string;
  }>>({
    claude: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
    gemini: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
    chatgpt: { conversations: [], fileDiffs: [], currentStatus: 'idle' },
  });

  const [isHydrated, setIsHydrated] = useState(false);

  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

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

  const agentStatesRef = useRef(agentStates);

  useEffect(() => {
    setIsHydrated(true);
    const loaded = loadFromStorage();
    setAgentStates(loaded);
    agentStatesRef.current = loaded;
  }, []);

  useEffect(() => {
    agentStatesRef.current = agentStates;
  }, [agentStates]);


  useEffect(() => {
    const handleBeforeUnload = () => {
      saveToStorage(agentStatesRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.hidden && isHydrated) {
        saveToStorage(agentStatesRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (isHydrated) {
        saveToStorage(agentStatesRef.current);
      }
      Object.values(abortControllersRef.current).forEach(controller => {
        if (controller) {
          controller.abort();
        }
      });
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    
    const timeoutId = setTimeout(() => {
      saveToStorage(agentStates);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [agentStates, isHydrated]);

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

        const updated = {
          ...prev,
          [agentId]: {
            conversations,
            fileDiffs: newFileDiffs,
            currentStatus: agentState.currentStatus,
            currentError: agentState.currentError,
          },
        };
        
        if (isHydrated && action.content && action.content.trim().length > 100) {
          setTimeout(() => {
            agentStatesRef.current = updated;
            saveToStorage(updated);
          }, 100);
        }
        
        return updated;
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
        const updated = {
          ...prev,
          [message.agentId!]: {
            conversations,
            fileDiffs: [...agentState.fileDiffs],
            currentStatus: 'error',
            currentError: message.error || 'An error occurred',
          },
        };
        
        if (isHydrated) {
          agentStatesRef.current = updated;
          saveToStorage(updated);
        }
        
        return updated;
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
        
        if (isHydrated) {
          agentStatesRef.current = updated;
          saveToStorage(updated);
        }
        
        return updated;
      });
      return;
    }
  };

  const handlePromptSubmit = async (prompt: string, images?: File[]) => {
    setCurrentPrompt(prompt);
    setIsLoading(true);
    setIsPaused(false);

    requestIdRef.current = `request-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setAgentStates(prev => {
      const baseTimestamp = Date.now();
      const claudeId = `${requestIdRef.current}-claude`;
      const geminiId = `${requestIdRef.current}-gemini`;
      const chatgptId = `${requestIdRef.current}-chatgpt`;
      
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

    const convertImagesToBase64 = async (files: File[]): Promise<string[]> => {
      const base64Promises = files.map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });
      return Promise.all(base64Promises);
    };

    const imageBase64s = images ? await convertImagesToBase64(images) : [];

    for (const agentId of selectedAgents) {
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
          images: imageBase64s.length > 0 ? imageBase64s : undefined,
        }),
        signal: abortController.signal,
      })
        .then(response => {
          if (abortController.signal.aborted) {
            return;
          }

          setIsConnected(true);

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

              if (error instanceof TypeError && error.message.includes('fetch')) {
                setIsConnected(false);
              } else if (error instanceof Error && (error.message.includes('network') || error.message.includes('Failed to fetch'))) {
                setIsConnected(false);
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

          if (error instanceof TypeError && error.message.includes('fetch')) {
            setIsConnected(false);
          } else if (error instanceof Error && !error.message.includes('Abort')) {
            setIsConnected(false);
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
    }
  };

  const handleKeepDiff = async (diff: FileDiff) => {
    try {
      // Normalize file path (remove ./workspace/ prefix if present)
      let normalizedPath = diff.filePath;
      if (normalizedPath.startsWith('./workspace/')) {
        normalizedPath = normalizedPath.replace('./workspace/', '');
      } else if (normalizedPath.startsWith('workspace/')) {
        normalizedPath = normalizedPath.replace('workspace/', '');
      } else if (normalizedPath.startsWith('./')) {
        normalizedPath = normalizedPath.replace('./', '');
      }

      const response = await fetch('/api/files/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: normalizedPath,
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

        // Refresh FileView if this file is currently selected
        // Normalize selectedFile for comparison
        const normalizeForComparison = (path: string) => {
          let normalized = path;
          if (normalized.startsWith('./workspace/')) {
            normalized = normalized.replace('./workspace/', '');
          } else if (normalized.startsWith('workspace/')) {
            normalized = normalized.replace('workspace/', '');
          } else if (normalized.startsWith('./')) {
            normalized = normalized.replace('./', '');
          }
          return normalized;
        };
        
        const normalizedSelected = selectedFile ? normalizeForComparison(selectedFile) : null;
        const shouldRefresh = normalizedSelected === normalizedPath || normalizedSelected === normalizeForComparison(diff.filePath);
        
        if (shouldRefresh) {
          // Force FileView to reload by incrementing refresh key
          // Add a small delay to ensure file is written to disk
          setTimeout(() => {
            setFileRefreshKey(prev => prev + 1);
          }, 100);
        }
        
        // Also refresh FileExplorer to show any new files that might have been created
        // This is handled automatically when files are written, but we ensure it happens
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


  const handleClearHistory = () => {
    if (typeof window === 'undefined') return;
    
    const emptyState = {
      claude: { conversations: [], fileDiffs: [], currentStatus: 'idle' as const },
      gemini: { conversations: [], fileDiffs: [], currentStatus: 'idle' as const },
      chatgpt: { conversations: [], fileDiffs: [], currentStatus: 'idle' as const },
    };
    
    try {
      localStorage.removeItem(STORAGE_KEY);
      setAgentStates(emptyState);
      agentStatesRef.current = emptyState;
      console.log('[LOCALSTORAGE] Cleared all chat history');
    } catch (error) {
      console.error('[LOCALSTORAGE] Error clearing history:', error);
    }
  };

  const handlePause = () => {
    if (isPaused) {
      setIsPaused(false);
      return;
    }

    setIsPaused(true);
    setIsLoading(false);

    const agentsToAbort: AgentType[] = [];
    
    Object.entries(abortControllersRef.current).forEach(([agentId, controller]) => {
      if (controller && !controller.signal.aborted) {
        controller.abort();
        abortControllersRef.current[agentId as AgentType] = null;
        agentsToAbort.push(agentId as AgentType);
      }
    });

    if (agentsToAbort.length > 0) {
      setAgentStates(prev => {
        const updated = { ...prev };
        
        agentsToAbort.forEach(agentId => {
          const agentState = prev[agentId];
          if (!agentState) return;
          
          const updatedConversations = agentState.conversations.map(c => {
            if (c.status === 'streaming') {
              return {
                ...c,
                status: 'paused' as const,
                error: 'Paused by user',
                actions: [...c.actions],
              };
            }
            return { ...c, actions: [...c.actions] };
          });
          
          updated[agentId] = {
            conversations: updatedConversations,
            fileDiffs: [...agentState.fileDiffs],
            currentStatus: 'paused' as const,
            currentError: 'Paused by user',
          };
        });
        
        return updated;
      });

      if (isHydrated) {
        setTimeout(() => {
          saveToStorage(agentStatesRef.current);
        }, 100);
      }

      console.log('[PAUSE] Aborted requests for agents:', agentsToAbort);
    } else {
      console.log('[PAUSE] No active requests to abort');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 text-white">
      <StatusBar
        activeAgents={selectedAgents.length}
        totalTokens={0}
        totalTools={0}
        onPause={handlePause}
        onClear={handleClearHistory}
        isPaused={isPaused}
        isConnected={isConnected}
      />

      <div className="flex flex-1 overflow-hidden">
        <div style={{
          width: `${fileExplorerPercent}%`,
          minWidth: '200px',
          maxWidth: '30%',
          flexShrink: 0
        }}>
          <FileExplorer
            rootPath="./workspace"
            onFileSelect={(path) => setSelectedFile(path)}
            onCreateFile={(path) => console.log('File created:', path)}
            onCreateFolder={(path) => console.log('Folder created:', path)}
            onWorkspaceCleared={() => {
              setSelectedFile(null);
              setFileRefreshKey(prev => prev + 1);
            }}
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
              const minPercent = container ? (200 / container.clientWidth) * 100 : 5;
              const constrained = Math.max(minPercent, Math.min(30, newPercent));
              const adjustment = constrained - newPercent;
              
              setFileViewPercent(prevView => {
                const newViewPercent = prevView - adjustment;
                const minViewPercent = container ? (350 / container.clientWidth) * 100 : 15;
                return Math.max(minViewPercent, Math.min(50, newViewPercent));
              });
              
              return constrained;
            });
          }} 
        />

        <div style={{
          width: `${fileViewPercent}%`,
          minWidth: '350px',
          maxWidth: '50%',
          flexShrink: 0
        }}>
          <FileView key={fileRefreshKey} filePath={selectedFile} refreshKey={fileRefreshKey} />
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
              const minViewPercent = container ? (350 / container.clientWidth) * 100 : 15;
              const constrained = Math.max(minViewPercent, Math.min(50, newPercent));
              return constrained;
            });
          }} 
        />

        <div className="flex overflow-x-auto" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            width: `${agentPanel1Width}px`,
            minWidth: '400px',
            flexShrink: 0,
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
              setAgentPanel1Width(prev => {
                const newWidth = prev + delta;
                const constrained = Math.max(400, Math.min(800, newWidth));
                const adjustment = constrained - newWidth;
                
                setAgentPanel2Width(prevPanel => {
                  const newPanel2 = prevPanel - adjustment;
                  return Math.max(400, Math.min(800, newPanel2));
                });
                
                return constrained;
              });
            }}
          />
          
          <div style={{ 
            width: `${agentPanel2Width}px`,
            minWidth: '400px',
            flexShrink: 0,
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
              setAgentPanel2Width(prev => {
                const newWidth = prev + delta;
                const constrained = Math.max(400, Math.min(800, newWidth));
                const adjustment = constrained - newWidth;
                
                setAgentPanel3Width(prevPanel => {
                  const newPanel3 = prevPanel - adjustment;
                  return Math.max(400, Math.min(800, newPanel3));
                });
                
                return constrained;
              });
            }}
          />
          
          <div style={{ 
            width: `${agentPanel3Width}px`,
            minWidth: '400px',
            flexShrink: 0,
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
