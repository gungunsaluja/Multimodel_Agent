'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FileViewProps {
  filePath: string | null;
  refreshKey?: number;
}

export default function FileView({ filePath, refreshKey }: FileViewProps) {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');

  // Load file content
  useEffect(() => {
    if (!filePath) {
      setContent('');
      setOriginalContent('');
      setError(null);
      setSaveStatus(null);
      return;
    }

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      setSaveStatus(null);
      try {
        const response = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
        const data = await response.json();
        
        if (data.success) {
          setContent(data.content);
          setOriginalContent(data.content);
          lastSavedContentRef.current = data.content;
        } else {
          setError(data.error || 'Failed to load file');
          setContent('');
          setOriginalContent('');
        }
      } catch (err) {
        setError('Failed to load file');
        setContent('');
        setOriginalContent('');
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [filePath, refreshKey]);

  // Auto-save function
  const saveFile = useCallback(async (contentToSave: string) => {
    if (!filePath || contentToSave === lastSavedContentRef.current) {
      return;
    }

    setSaving(true);
    setSaveStatus('saving');

    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          path: filePath, 
          type: 'file', 
          content: contentToSave 
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        lastSavedContentRef.current = contentToSave;
        setSaveStatus('saved');
        // Clear saved status after 2 seconds
        setTimeout(() => {
          setSaveStatus(prev => prev === 'saved' ? null : prev);
        }, 2000);
      } else {
        setError(data.error || 'Failed to save file');
        setSaveStatus('unsaved');
      }
    } catch (err) {
      setError('Failed to save file');
      setSaveStatus('unsaved');
    } finally {
      setSaving(false);
    }
  }, [filePath]);

  // Handle content changes with debounced auto-save
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setSaveStatus('unsaved');

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (1 second delay)
    saveTimeoutRef.current = setTimeout(() => {
      saveFile(newContent);
    }, 1000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save on Ctrl+S or Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (filePath && content !== lastSavedContentRef.current) {
          saveFile(content);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filePath, content, saveFile]);

  if (!filePath) {
    return (
      <div className="h-full w-full border-r border-gray-700/50 bg-gray-800/95 backdrop-blur-sm flex flex-col">
        <div className="p-4 border-b border-gray-700/50 bg-gray-800/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-white">Editor</h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm flex-col gap-2">
          <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>Select a file to view and edit</p>
        </div>
      </div>
    );
  }

  // Determine file extension for syntax highlighting
  const getFileExtension = (path: string) => {
    const parts = path.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  };

  const extension = filePath ? getFileExtension(filePath) : '';
  const isCodeFile = ['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'md', 'txt'].includes(extension);

  const getSaveStatusText = () => {
    if (saveStatus === 'saving') return 'Saving...';
    if (saveStatus === 'saved') return 'Saved';
    if (saveStatus === 'unsaved') return 'Unsaved';
    return null;
  };

  const getSaveStatusColor = () => {
    if (saveStatus === 'saving') return 'text-yellow-400';
    if (saveStatus === 'saved') return 'text-green-400';
    if (saveStatus === 'unsaved') return 'text-gray-400';
    return 'text-gray-500';
  };

  return (
    <div className="h-full w-full border-r border-gray-700/50 bg-gray-800/95 backdrop-blur-sm flex flex-col">
      <div className="p-4 border-b border-gray-700/50 bg-gray-800/50 flex items-center justify-between">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white truncate" title={filePath || ''}>
              {filePath ? filePath.split('/').pop() : 'Editor'}
            </h2>
            <p className="text-xs text-gray-400 truncate" title={filePath || ''}>
              {filePath || 'No file selected'}
            </p>
          </div>
        </div>
        {filePath && saveStatus && (
          <div className={`text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5 ${getSaveStatusColor()} ${
            saveStatus === 'saving' ? 'bg-yellow-500/10' :
            saveStatus === 'saved' ? 'bg-emerald-500/10' :
            'bg-gray-700/50'
          }`}>
            {saveStatus === 'saving' && (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {saveStatus === 'saved' && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {getSaveStatusText()}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm flex-col gap-2">
            <svg className="w-5 h-5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading...</span>
          </div>
        ) : error ? (
          <div className="p-4 text-red-400 text-sm bg-red-500/10 border-l-2 border-red-500/50 m-4 rounded">
            {error}
          </div>
        ) : filePath ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="flex-1 w-full p-5 text-sm text-gray-200 font-mono bg-gray-900/50 border-0 resize-none focus:outline-none focus:ring-0"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
              lineHeight: '1.6',
              tabSize: 2,
            }}
            spellCheck={false}
            placeholder="Start typing..."
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a file to view and edit
          </div>
        )}
      </div>
    </div>
  );
}

