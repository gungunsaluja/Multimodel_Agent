'use client';

import { FileDiff } from '@/lib/types';
import { computeDiff } from '@/lib/diffUtils';
import { useState } from 'react';

interface FileDiffViewerProps {
  fileDiffs: FileDiff[];
}

export default function FileDiffViewer({ fileDiffs }: FileDiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  const renderDiff = (diff: FileDiff) => {
    const changes = computeDiff(diff.oldContent, diff.newContent);
    return (
      <div className="font-mono text-sm">
        {changes.map((change, index) => {
          const lines = change.value.split('\n');
          return (
            <div key={index}>
              {lines.map((line, lineIndex) => {
                if (line === '' && lineIndex === lines.length - 1) return null;
                const bgColor = change.added
                  ? 'bg-green-100 dark:bg-green-900/20'
                  : change.removed
                  ? 'bg-red-100 dark:bg-red-900/20'
                  : 'bg-transparent';
                const textColor = change.added
                  ? 'text-green-800 dark:text-green-300'
                  : change.removed
                  ? 'text-red-800 dark:text-red-300'
                  : 'text-gray-900 dark:text-gray-100';
                const prefix = change.added ? '+' : change.removed ? '-' : ' ';

                return (
                  <div
                    key={`${index}-${lineIndex}`}
                    className={`${bgColor} ${textColor} px-4 py-0.5 flex`}
                  >
                    <span className="w-8 text-gray-500 dark:text-gray-400 select-none">
                      {prefix}
                    </span>
                    <span className="flex-1">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  if (fileDiffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No file changes yet</p>
          <p className="text-sm">File diffs will appear here as agents edit files</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {fileDiffs.map(diff => {
        const isExpanded = expandedFiles.has(diff.filePath);
        return (
          <div
            key={diff.filePath}
            className="border border-gray-200 dark:border-gray-700 rounded-lg
                     bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
          >
            <div
              onClick={() => toggleFile(diff.filePath)}
              className="px-4 py-3 bg-gray-50 dark:bg-gray-900 cursor-pointer
                       hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <svg
                  className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <code className="font-semibold text-gray-900 dark:text-gray-100">
                  {diff.filePath}
                </code>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600 dark:text-green-400">
                  +{diff.additions}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  -{diff.deletions}
                </span>
              </div>
            </div>
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
                {renderDiff(diff)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

