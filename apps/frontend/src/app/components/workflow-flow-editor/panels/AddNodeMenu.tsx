'use client';

import { useRef, useEffect } from 'react';
import { STEP_TYPE_OPTIONS, type StepType } from '../types';

interface AddNodeMenuProps {
  position: { x: number; y: number };
  onSelect: (type: StepType) => void;
  onClose: () => void;
}

export function AddNodeMenu({ position, onSelect, onClose }: AddNodeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing immediately on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: '#EFEFEF',
        border: '1px solid #E4E4E4',
        borderRadius: 4,
        padding: 6,
        boxShadow: 'none',
        minWidth: 200,
      }}
    >
      <div style={{ padding: '4px 10px', fontSize: 11, color: '#5F5F5F', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Add step
      </div>
      {STEP_TYPE_OPTIONS.map((option) => {
        const IconComponent = option.icon;
        return (
          <button
            key={option.type}
            type="button"
            onClick={() => onSelect(option.type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 10px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: 4,
              fontSize: 13,
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#E8E8E8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 4,
                background: '#E8E8E8',
                border: '1px solid #E4E4E4',
              }}
            >
              <IconComponent size={14} color="#5F5F5F" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#0C0C0C' }}>{option.label}</div>
              <div style={{ fontSize: 11, color: '#5F5F5F' }}>{option.hint}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
