'use client';

import { useState, useRef, useEffect } from 'react';

interface ResizableDividerProps {
  onResize: (delta: number) => void;
  orientation?: 'vertical' | 'horizontal';
}

export default function ResizableDivider({ 
  onResize, 
  orientation = 'vertical' 
}: ResizableDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = orientation === 'vertical' ? e.clientX : e.clientY;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = orientation === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      onResize(delta);
      startPosRef.current = currentPos;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize, orientation]);

  return (
    <div
      className={`
        ${orientation === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
        bg-gray-700 hover:bg-blue-500 transition-colors
        ${isDragging ? 'bg-blue-500' : ''}
        flex-shrink-0
      `}
      onMouseDown={handleMouseDown}
      style={{ userSelect: 'none' }}
    />
  );
}

