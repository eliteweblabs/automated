import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '../convert-to-flow';
import { STEP_TYPE_META, TYPE_COLORS, getStepLabel } from '../types';

function LoopGroupNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as FlowNodeData;
  const step = nodeData.editorStep;
  if (!step || step.type !== 'loop') return null;

  const meta = STEP_TYPE_META.loop;
  const colors = TYPE_COLORS.loop;
  const label = getStepLabel(step);
  const IconComponent = meta.icon;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `${colors.bg}`,
        border: `2px ${selected ? 'solid' : 'dashed'} ${selected ? colors.accent : colors.border}`,
        borderRadius: 4,
        overflow: 'visible',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#94a3b8', width: 8, height: 8 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: `1px solid ${colors.border}`,
          background: `${colors.accent}10`,
          borderRadius: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 4,
            background: `${colors.accent}20`,
          }}
        >
          <IconComponent size={13} color={colors.accent} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.accent }}>
          LOOP
        </span>
        <span
          style={{
            fontSize: 12,
            color: '#5F5F5F',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {label}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#94a3b8', width: 8, height: 8 }} />
    </div>
  );
}

export const LoopGroupNode = memo(LoopGroupNodeComponent);
