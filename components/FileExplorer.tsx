'use client';

import { useState, useEffect, useRef } from 'react';

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
  onWorkspaceCleared?: () => void;
}

export default function FileExplorer({
  rootPath = './',
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onWorkspaceCleared,
}: FileExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadTargetPath, setUploadTargetPath] = useState<string>(rootPath);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async (path: string = rootPath, force: boolean = false) => {
    try {
      if (force) {
        setLoadedPaths(prev => {
          const newSet = new Set(prev);
          newSet.delete(path);
          return newSet;
        });
      }
      
      setLoading(true);
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      
      if (data.success) {
        if (path === rootPath || path === './' || path === '') {
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
      if (!loadedPaths.has(path)) {
        await loadFiles(path);
      }
    }
    setExpandedPaths(newExpanded);
  };

  // const normalizePath = (path: string): string => {
  //   // If it's the root path, return empty string (files go in workspace root)
  //   if (path === './' || path === '' || path === rootPath) {
  //     return '';
  //   }
    
  //   // Remove trailing slashes
  //   let normalized = path.replace(/\/$/, '');
    
  //   // Remove rootPath prefix
  //   if (rootPath && normalized.startsWith(rootPath)) {
  //     if (normalized === rootPath) {
  //       return '';
  //     }
  //     // Remove rootPath and any leading slash
  //     normalized = normalized.substring(rootPath.length).replace(/^\//, '');
  //   }
    
  //   // Remove leading ./ if present
  //   normalized = normalized.replace(/^\.\//, '');
    
  //   return normalized;
  // };

  // const handleCreateFile = async (parentPath: string) => {
  //   const fileName = prompt('Enter file name:');
  //   if (!fileName || !fileName.trim()) return;
    
  //   const normalizedParent = normalizePath(parentPath);
  //   const filePath = normalizedParent 
  //     ? `${normalizedParent}/${fileName.trim()}`
  //     : fileName.trim();
    
  //   try {
  //     const response = await fetch('/api/files', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ path: filePath, type: 'file', content: '' }),
  //     });
      
  //     const data = await response.json();
      
  //     if (response.ok && data.success) {
  //       // Expand parent directory if not already expanded
  //       const pathToExpand = parentPath === rootPath || parentPath === './' || parentPath === '' 
  //         ? rootPath 
  //         : parentPath;
        
  //       if (!expandedPaths.has(pathToExpand)) {
  //         setExpandedPaths(prev => new Set([...prev, pathToExpand]));
  //       }
        
  //       // Force reload the parent directory to show the new file
  //       await loadFiles(pathToExpand, true);
        
  //       onCreateFile?.(filePath);
  //     } else {
  //       alert(`Error: ${data.error || 'Failed to create file'}`);
  //     }
  //   } catch (error) {
  //     console.error('Error creating file:', error);
  //     alert('Failed to create file');
  //   }
  // };

  // const handleCreateFolder = async (parentPath: string) => {
  //   const folderName = prompt('Enter folder name:');
  //   if (!folderName || !folderName.trim()) return;
    
  //   const normalizedParent = normalizePath(parentPath);
  //   const folderPath = normalizedParent 
  //     ? `${normalizedParent}/${folderName.trim()}`
  //     : folderName.trim();
    
  //   try {
  //     const response = await fetch('/api/files', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ path: folderPath, type: 'directory' }),
  //     });
      
  //     const data = await response.json();
      
  //     if (response.ok && data.success) {
  //       // Expand parent directory if not already expanded
  //       const pathToExpand = parentPath === rootPath || parentPath === './' || parentPath === '' 
  //         ? rootPath 
  //         : parentPath;
        
  //       if (!expandedPaths.has(pathToExpand)) {
  //         setExpandedPaths(prev => new Set([...prev, pathToExpand]));
  //       }
        
  //       // Force reload the parent directory to show the new folder
  //       await loadFiles(pathToExpand, true);
        
  //       onCreateFolder?.(folderPath);
  //     } else {
  //       alert(`Error: ${data.error || 'Failed to create folder'}`);
  //     }
  //   } catch (error) {
  //     console.error('Error creating folder:', error);
  //     alert('Failed to create folder');
  //   }
  // };

  const handleFileUpload = async (files: FileList | null, targetPath: string) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    
    // Clear the file list if uploading to root (workspace will be cleared on server)
    const isRootUpload = targetPath === rootPath || targetPath === './' || targetPath === '';
    if (isRootUpload) {
      setFiles([]);
      setExpandedPaths(new Set());
      setLoadedPaths(new Set());
    }
    
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });
      formData.append('targetPath', targetPath);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Reload the target directory to show uploaded files
        const pathToReload = targetPath === rootPath || targetPath === './' || targetPath === '' 
          ? rootPath 
          : targetPath;
        
        if (!expandedPaths.has(pathToReload)) {
          setExpandedPaths(prev => new Set([...prev, pathToReload]));
        }
        
        await loadFiles(pathToReload, true);
        
        if (data.errors && data.errors.length > 0) {
          alert(`Upload completed with some errors:\n${data.errors.join('\n')}`);
        } else {
          alert(`Successfully uploaded ${data.uploaded.length} file(s)`);
        }
      } else {
        alert(`Error: ${data.error || 'Failed to upload files'}`);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Failed to upload files');
    } finally {
      setUploading(false);
      // Reset file inputs
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files, uploadTargetPath);
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files, uploadTargetPath);
  };

  const triggerFileUpload = () => {
    setUploadTargetPath(rootPath);
    fileInputRef.current?.click();
  };

  const triggerFolderUpload = () => {
    setUploadTargetPath(rootPath);
    folderInputRef.current?.click();
  };

  const handleClearWorkspace = async () => {
    if (!confirm('Are you sure you want to clear the entire workspace? This will delete all files and folders.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/files', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setFiles([]);
        setExpandedPaths(new Set());
        setLoadedPaths(new Set());
        onWorkspaceCleared?.();
        alert('Workspace cleared successfully');
      } else {
        alert(`Error: ${data.error || 'Failed to clear workspace'}`);
      }
    } catch (error) {
      console.error('Error clearing workspace:', error);
      alert('Failed to clear workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadToDirectory = (dirPath: string) => {
    setUploadTargetPath(dirPath);
    fileInputRef.current?.click();
  };

  const renderFile = (file: FileNode, level: number = 0) => {
    const isExpanded = expandedPaths.has(file.path);
    const indent = level * 16;

    return (
      <div key={file.path}>
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-700/50 cursor-pointer text-sm rounded-md transition-colors group`}
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
            <svg className={`w-4 h-4 text-amber-500/70 flex-shrink-0 ${isExpanded ? '' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-blue-400/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          <span className="text-gray-300 flex-1 truncate group-hover:text-white transition-colors">{file.name}</span>
          {file.type === 'directory' && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUploadToDirectory(file.path);
                }}
                className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded"
                title="Upload to this folder"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
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
    <div className="h-full w-full border-r border-gray-700/50 bg-gray-800/95 backdrop-blur-sm flex flex-col">
      <div className="p-2 sm:p-3 md:p-4 border-b border-gray-700/50 bg-gray-800/50 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <h2 className="text-xs sm:text-sm font-semibold text-white truncate hidden sm:block">Workspace</h2>
        </div>
        <div className="flex gap-0.5 sm:gap-1 md:gap-1.5 flex-row flex-shrink-0">
          <button
            onClick={handleClearWorkspace}
            disabled={loading || uploading}
            className="p-1.5 sm:p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md disabled:text-gray-600 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-all flex items-center justify-center flex-shrink-0"
            title="Clear workspace"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            id="file-upload"
            disabled={uploading}
          />
          <input
            type="file"
            ref={folderInputRef}
            {...({ webkitdirectory: '' } as any)}
            multiple
            onChange={handleFolderInputChange}
            className="hidden"
            id="folder-upload"
            disabled={uploading}
          />
          <button
            onClick={triggerFileUpload}
            disabled={uploading}
            className="p-1.5 sm:p-2 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-md disabled:text-gray-600 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0"
            title="Upload files"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </button>
          <button
            onClick={triggerFolderUpload}
            disabled={uploading}
            className="p-1.5 sm:p-2 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-md disabled:text-gray-600 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0"
            title="Upload folder"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
        </div>
      </div>
      {uploading && (
        <div className="px-4 py-2.5 bg-blue-500/10 border-b border-blue-500/20 text-xs text-blue-400 flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Uploading files...
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="text-center text-gray-400 text-sm py-8 flex flex-col items-center gap-2">
            <svg className="w-5 h-5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center text-gray-400 py-12 flex flex-col items-center gap-3">
            <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-300">Workspace is empty</p>
            <p className="text-xs text-gray-500">Upload files or folders to get started</p>
          </div>
        ) : (
          files.map(file => renderFile(file))
        )}
      </div>
    </div>
  );
}

