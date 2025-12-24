'use client';

import { AgentType } from '@/lib/types';
import { AGENTS } from '@/lib/agents';
import { useState, useRef, useEffect, useCallback } from 'react';

interface FileMention {
  path: string;
  name: string;
}

interface BottomInputBarProps {
  selectedAgents: AgentType[];
  onSubmit: (prompt: string, images?: File[]) => void;
  isLoading: boolean;
}

export default function BottomInputBar({
  selectedAgents,
  onSubmit,
  isLoading,
}: BottomInputBarProps) {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileMention[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionFiles, setMentionFiles] = useState<Array<{ name: string; path: string }>>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      const newImages = [...images, ...imageFiles];
      setImages(newImages);
      
      imageFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const removeFile = (path: string) => {
    setSelectedFiles(prev => prev.filter(f => f.path !== path));
    // Remove the mention from prompt text
    const mentionRegex = new RegExp(`@${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'g');
    setPrompt(prev => prev.replace(mentionRegex, '').trim());
  };

  // Search files for mention autocomplete
  const searchFiles = useCallback(async (query: string) => {
    try {
      const response = await fetch(`/api/files/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data.success) {
        setMentionFiles(data.files);
      }
    } catch (error) {
      console.error('Error searching files:', error);
      setMentionFiles([]);
    }
  }, []);

  // Extract file mentions from prompt text
  const extractFileMentions = (text: string): FileMention[] => {
    const mentions: FileMention[] = [];
    const mentionRegex = /@([^\s@\n]+)/g;
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
      const path = match[1];
      // Accept any non-empty path (workspace files should have valid paths)
      if (path.length > 0) {
        const name = path.split('/').pop() || path;
        if (!mentions.find(m => m.path === path)) {
          mentions.push({ path, name });
        }
      }
    }
    
    return mentions;
  };

  // Handle prompt input change and detect '@' mentions
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setPrompt(value);

    // Extract and sync file mentions
    const mentions = extractFileMentions(value);
    setSelectedFiles(mentions);

    // Check if '@' was just typed
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // Check if there's a space after @ (meaning mention is complete)
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        // Show mention dropdown
        const query = textAfterAt;
        setMentionQuery(query);
        setShowMentionDropdown(true);
        setSelectedMentionIndex(0);
        
        // Update dropdown position
        if (promptInputRef.current) {
          const rect = promptInputRef.current.getBoundingClientRect();
          const lineHeight = 20; // Approximate line height
          const lines = textBeforeCursor.split('\n').length;
          setMentionPosition({
            top: rect.top + (lines * lineHeight) + 5,
            left: rect.left + 10,
          });
        }
        
        // Search files
        searchFiles(query);
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  // Handle mention selection
  const selectMention = (file: { name: string; path: string }) => {
    const textBeforeCursor = prompt.substring(0, promptInputRef.current?.selectionStart || 0);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      const newPrompt = 
        prompt.substring(0, lastAtIndex) + 
        `@${file.path} ` + 
        prompt.substring(lastAtIndex + 1 + textAfterAt.length);
      
      setPrompt(newPrompt);
      setShowMentionDropdown(false);
      
      // Focus back on input
      setTimeout(() => {
        promptInputRef.current?.focus();
        const newCursorPos = lastAtIndex + file.path.length + 2; // +2 for @ and space
        promptInputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  // Handle keyboard navigation in mention dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionDropdown && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < mentionFiles.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        selectMention(mentionFiles[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionDropdown(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(event.target as Node) &&
        promptInputRef.current &&
        !promptInputRef.current.contains(event.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Send button clicked - Key event:', e);
    if ((prompt.trim() || images.length > 0) && selectedAgents.length > 0) {
      console.log('Submitting prompt:', prompt);
      console.log('Selected agents:', selectedAgents);
      console.log('Images:', images);
      console.log('File mentions:', selectedFiles);
      onSubmit(prompt, images.length > 0 ? images : undefined);
      setPrompt('');
      setImages([]);
      setImagePreviews([]);
      setSelectedFiles([]);
    }
  };

  return (
    <div className="border-t border-gray-700/50 bg-gray-800/95 backdrop-blur-sm shadow-lg">
      {imagePreviews.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700 flex gap-2 overflow-x-auto">
          {imagePreviews.map((preview, index) => (
            <div key={index} className="relative flex-shrink-0">
              <img
                src={preview}
                alt={`Preview ${index + 1}`}
                className="h-16 w-16 object-cover rounded border border-gray-600"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="min-h-16 flex items-center px-6 gap-4 py-3">
        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          <span className="text-xs font-medium text-gray-400 whitespace-nowrap uppercase tracking-wide">Targets</span>
          <div className="flex items-center gap-1 flex-wrap max-w-xs">
            {selectedFiles.length > 0 ? (
              selectedFiles.map((file) => (
                <span
                  key={file.path}
                  className="text-xs px-2 py-1 rounded border-blue-500 border text-gray-300 flex items-center gap-1 group"
                >
                  <span className="truncate max-w-[120px]" title={file.path}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.path)}
                    className="text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove file"
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500 italic">Type @ to add files</span>
            )}
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-4 relative">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
            id="image-upload"
            disabled={isLoading || selectedAgents.length === 0}
          />
          <label
            htmlFor="image-upload"
            className="px-3.5 py-2 bg-gray-700/50 text-gray-200 rounded-md text-sm font-medium hover:bg-gray-600/50 disabled:bg-gray-800/50 disabled:text-gray-500 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 flex-shrink-0 border border-gray-600/50 hover:border-gray-500/50 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Image
          </label>
          <div className="flex-1 relative">
            <textarea
              ref={promptInputRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter your prompt... (Type @ to mention files)"
              className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none min-h-[44px] max-h-[120px] transition-all"
              disabled={isLoading || selectedAgents.length === 0}
              rows={1}
              style={{ 
                height: 'auto',
                minHeight: '40px',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
            {showMentionDropdown && mentionFiles.length > 0 && (
              <div
                ref={mentionDropdownRef}
                className="absolute z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1 min-w-[300px]"
                style={{
                  top: '100%',
                  left: 0,
                }}
              >
                {mentionFiles.map((file, index) => (
                  <div
                    key={file.path}
                    onClick={() => selectMention(file)}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-700 ${
                      index === selectedMentionIndex ? 'bg-gray-700' : ''
                    }`}
                  >
                    <div className="text-sm text-white font-medium">{file.name}</div>
                    <div className="text-xs text-gray-400 truncate">{file.path}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 px-2">
            {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}
          </div>
          <button
            type="submit"
            disabled={isLoading || selectedAgents.length === 0 || (!prompt.trim() && images.length === 0)}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-700/50 disabled:text-gray-500 disabled:cursor-not-allowed flex-shrink-0 flex items-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 transition-all disabled:shadow-none"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

