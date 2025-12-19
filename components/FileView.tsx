'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FileViewProps {
  filePath: string | null;
}

export default function FileView({ filePath }: FileViewProps) {
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
  }, [filePath]);

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
      <div className="h-full w-full border-r border-gray-700 bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">File View</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Select a file to view its contents
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
    <div className="h-full w-full border-r border-gray-700 bg-gray-800 flex flex-col">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white truncate" title={filePath || ''}>
            {filePath ? filePath.split('/').pop() : 'File View'}
          </h2>
          <p className="text-xs text-gray-400 truncate" title={filePath || ''}>
            {filePath || 'No file selected'}
          </p>
        </div>
        {filePath && saveStatus && (
          <div className={`text-xs ${getSaveStatusColor()} ml-2`}>
            {getSaveStatusText()}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="p-4 text-red-400 text-sm">
            {error}
          </div>
        ) : filePath ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="flex-1 w-full p-4 text-sm text-gray-300 font-mono bg-gray-900 border-0 resize-none focus:outline-none focus:ring-0"
            style={{
              fontFamily: 'monospace',
              lineHeight: '1.5',
              tabSize: 2,
            }}
            spellCheck={false}
            placeholder="Start typing..."
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Select a file to view and edit
          </div>
        )}
      </div>
    </div>
  );
}

