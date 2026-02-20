import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '../convert-to-flow';
import { STEP_TYPE_META, TYPE_COLORS, getStepLabel } from '../types';

function WorkflowNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as FlowNodeData;
  const step = nodeData.editorStep;
  if (!step) return null;

  const meta = STEP_TYPE_META[step.type];
  const colors = TYPE_COLORS[step.type];
  const label = getStepLabel(step);
  const isConditional = step.type === 'conditional';
  const IconComponent = meta.icon;

  return (
    <div
      style={{
        position: 'relative',
        background: colors.bg,
        border: `2px solid ${selected ? colors.accent : colors.border}`,
        borderRadius: 4,
        padding: '12px 16px',
        minWidth: 240,
        maxWidth: 280,
        boxShadow: selected ? `0 0 0 1px ${colors.accent}40` : 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#94a3b8', width: 8, height: 8 }} />

      {/* Delete button - visible when selected */}
      {selected && (
        <button
          type="button"
          data-delete-node-id={step.id}
          className="nodrag"
          style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: 22,
            height: 22,
            borderRadius: 4,
            border: '1px solid #7F1D1D',
            background: '#EFEFEF',
            color: '#F87171',
            fontSize: 13,
            lineHeight: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            boxShadow: 'none',
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#FDECEC';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#EFEFEF';
          }}
        >
          ×
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 4,
            background: `${colors.accent}18`,
          }}
        >
          <IconComponent size={14} color={colors.accent} />
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: colors.accent,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {meta.label}
        </span>
      </div>

      <div
        style={{
          fontSize: 13,
          color: '#0C0C0C',
          lineHeight: '1.4',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>

      {isConditional ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="handle-true"
            style={{
              background: '#38a169',
              width: 8,
              height: 8,
              left: '30%',
            }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="handle-false"
            style={{
              background: '#e53e3e',
              width: 8,
              height: 8,
              left: '70%',
            }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: '#94a3b8', width: 8, height: 8 }}
        />
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
