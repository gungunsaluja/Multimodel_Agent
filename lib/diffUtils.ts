import { diffLines, Change } from 'diff';
import { FileDiff } from './types';

export function computeDiff(oldContent: string, newContent: string): Change[] {
  return diffLines(oldContent, newContent);
}

export function formatDiffForDisplay(changes: Change[]): string {
  return changes
    .map(change => {
      const prefix = change.added ? '+' : change.removed ? '-' : ' ';
      const lines = change.value.split('\n').filter(line => line !== '');
      return lines.map(line => `${prefix} ${line}`).join('\n');
    })
    .join('\n');
}

export function getDiffStats(oldContent: string, newContent: string): {
  additions: number;
  deletions: number;
} {
  const changes = diffLines(oldContent, newContent);
  let additions = 0;
  let deletions = 0;

  changes.forEach(change => {
    const lines = change.value.split('\n').filter(line => line !== '');
    if (change.added) {
      additions += lines.length;
    } else if (change.removed) {
      deletions += lines.length;
    }
  });

  return { additions, deletions };
}

