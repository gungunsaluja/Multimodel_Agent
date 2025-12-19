import { Agent } from './types';

export const AGENTS: Agent[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic\'s Claude',
    icon: '🤖',
    color: 'bg-orange-500',
    borderColor: 'border-orange-500',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google\'s Gemini',
    icon: '✨',
    color: 'bg-blue-500',
    borderColor: 'border-blue-500',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    description: 'OpenAI\'s ChatGPT',
    icon: '💬',
    color: 'bg-purple-500',
    borderColor: 'border-purple-500',
  },
];

export const getAgentById = (id: string): Agent | undefined => {
  return AGENTS.find(agent => agent.id === id);
};

