export type AgentType = 'claude' | 'gemini' | 'chatgpt';

export interface Agent {
  id: AgentType;
  name: string;
  description: string;
  icon: string;
  color: string;
  borderColor: string;
}

export interface AgentAction {
  id: string;
  agentId: AgentType;
  type: 'message' | 'tool_call' | 'file_edit' | 'file_create' | 'file_delete' | 'command';
  timestamp: number;
  content: string;
  metadata?: {
    toolName?: string;
    toolParams?: Record<string, any>;
    fileName?: string;
    filePath?: string;
    oldContent?: string;
    newContent?: string;
    command?: string;
    status?: 'running' | 'completed' | 'failed';
    error?: string;
  };
}

export interface FileDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
  additions: number;
  deletions: number;
  status?: 'pending' | 'applied' | 'rejected'; // Status of the diff
  agentId?: AgentType; // Which agent suggested this change
}

export interface ToolCall {
  id: string;
  agentId: AgentType;
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  timestamp: number;
  duration?: number;
}

export interface PromptInput {
  text: string;
  files?: File[];
  images?: File[];
}

