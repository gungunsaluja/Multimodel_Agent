'use client';

import { useState } from 'react';
import { AgentType } from '@/lib/types';

interface PromptInputProps {
  onSubmit: (prompt: string, agentIds: AgentType[]) => void;
  selectedAgents: AgentType[];
  isLoading: boolean;
}

export default function PromptInput({
  onSubmit,
  selectedAgents,
  isLoading,
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && selectedAgents.length > 0) {
      onSubmit(prompt, selectedAgents);
      setPrompt('');
      setFiles([]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Enter your prompt
        </label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe what you want the agents to do..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                   focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   resize-none"
          rows={4}
          disabled={isLoading || selectedAgents.length === 0}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Attach files (optional)
        </label>
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          className="w-full text-sm text-gray-500 dark:text-gray-400
                   file:mr-4 file:py-2 file:px-4
                   file:rounded-lg file:border-0
                   file:text-sm file:font-semibold
                   file:bg-blue-50 file:text-blue-700
                   hover:file:bg-blue-100
                   dark:file:bg-blue-900/20 dark:file:text-blue-300"
          disabled={isLoading}
        />
        {files.length > 0 && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {files.length} file{files.length > 1 ? 's' : ''} selected
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || selectedAgents.length === 0 || !prompt.trim()}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg
                 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                 transition-colors font-medium"
      >
        {isLoading ? 'Processing...' : 'Submit to Agents'}
      </button>

      {selectedAgents.length === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Please select at least one agent
        </p>
      )}
    </form>
  );
}

