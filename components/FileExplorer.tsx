'use client';

import { useState, useEffect } from 'react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  expanded?: boolean;
}

interface FileExplorerProps {
  rootPath?: string;
  onFileSelect?: (path: string) => void;
  onCreateFile?: (path: string) => void;
  onCreateFolder?: (path: string) => void;
}

export default function FileExplorer({
  rootPath = './',
  onFileSelect,
  onCreateFile,
  onCreateFolder,
}: FileExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());

  const loadFiles = async (path: string = rootPath) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      
      if (data.success) {
        if (path === rootPath || path === './') {
          setFiles(data.files);
        } else {
          // Update nested files
          setFiles(prev => updateFileChildren(prev, path, data.files));
        }
        setLoadedPaths(prev => new Set([...prev, path]));
      }
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateFileChildren = (fileList: FileNode[], targetPath: string, children: FileNode[]): FileNode[] => {
    return fileList.map(file => {
      if (file.path === targetPath && file.type === 'directory') {
        return { ...file, children };
      }
      if (file.children) {
        return { ...file, children: updateFileChildren(file.children, targetPath, children) };
      }
      return file;
    });
  };

  useEffect(() => {
    loadFiles();
  }, [rootPath]);

  const toggleExpand = async (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      // Load children if not already loaded
      if (!loadedPaths.has(path)) {
        await loadFiles(path);
      }
    }
    setExpandedPaths(newExpanded);
  };

  const handleCreateFile = async (parentPath: string) => {
    const fileName = prompt('Enter file name:');
    if (!fileName || !fileName.trim()) return;
    
    // Normalize parent path
    const normalizedParent = parentPath === './' || parentPath === '' ? '' : parentPath.replace(/\/$/, '');
    const filePath = normalizedParent ? `${normalizedParent}/${fileName.trim()}` : fileName.trim();
    
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, type: 'file', content: '' }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Reload the parent directory to show the new file
        await loadFiles(normalizedParent || './');
        onCreateFile?.(filePath);
      } else {
        alert(`Error: ${data.error || 'Failed to create file'}`);
      }
    } catch (error) {
      console.error('Error creating file:', error);
      alert('Failed to create file');
    }
  };

  const handleCreateFolder = async (parentPath: string) => {
    const folderName = prompt('Enter folder name:');
    if (!folderName || !folderName.trim()) return;
    
    // Normalize parent path
    const normalizedParent = parentPath === './' || parentPath === '' ? '' : parentPath.replace(/\/$/, '');
    const folderPath = normalizedParent ? `${normalizedParent}/${folderName.trim()}` : folderName.trim();
    
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath, type: 'directory' }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Reload the parent directory to show the new folder
        await loadFiles(normalizedParent || './');
        onCreateFolder?.(folderPath);
      } else {
        alert(`Error: ${data.error || 'Failed to create folder'}`);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Failed to create folder');
    }
  };

  const renderFile = (file: FileNode, level: number = 0) => {
    const isExpanded = expandedPaths.has(file.path);
    const indent = level * 16;

    return (
      <div key={file.path}>
        <div
          className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-700 cursor-pointer text-sm`}
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => {
            if (file.type === 'directory') {
              toggleExpand(file.path);
            } else {
              onFileSelect?.(file.path);
            }
          }}
        >
          {file.type === 'directory' ? (
            <span className="text-gray-400">
              {isExpanded ? '📂' : '📁'}
            </span>
          ) : (
            <span className="text-gray-500">📄</span>
          )}
          <span className="text-gray-300 flex-1">{file.name}</span>
          {file.type === 'directory' && (
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateFile(file.path);
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
                title="Create file"
              >
                +
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateFolder(file.path);
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
                title="Create folder"
              >
                📁
              </button>
            </div>
          )}
        </div>
        {file.type === 'directory' && isExpanded && (
          <div>
            {file.children && file.children.length > 0 ? (
              file.children.map(child => renderFile(child, level + 1))
            ) : (
              <div className="text-xs text-gray-500 px-2 py-1" style={{ paddingLeft: `${24 + indent}px` }}>
                (empty)
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full w-full border-r border-gray-700 bg-gray-800 flex flex-col">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Files</h2>
        <div className="flex gap-1">
          <button
            onClick={() => handleCreateFile(rootPath)}
            className="text-xs text-gray-400 hover:text-gray-300"
            title="Create file"
          >
            + File
          </button>
          <button
            onClick={() => handleCreateFolder(rootPath)}
            className="text-xs text-gray-400 hover:text-gray-300"
            title="Create folder"
          >
            + Folder
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-4">Loading...</div>
        ) : files.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-4">No files</div>
        ) : (
          files.map(file => renderFile(file))
        )}
      </div>
    </div>
  );
}

