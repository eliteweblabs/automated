import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '../convert-to-flow';

function AddNodePlaceholderComponent({ data, id }: NodeProps) {
  const nodeData = data as unknown as FlowNodeData;

  return (
    <div
      data-placeholder-id={id}
      data-parent-id={nodeData.parentId ?? ''}
      data-branch-label={nodeData.branchLabel}
      data-index={nodeData.indexInBranch}
      style={{
        width: 36,
        height: 36,
        borderRadius: 4,
        border: '1px dashed #CFCFCF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        background: '#EFEFEF',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = '#792BF8';
        el.style.transform = 'scale(1.1)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = '#CFCFCF';
        el.style.transform = 'scale(1)';
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1v12M1 7h12" stroke="#5F5F5F" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />
    </div>
  );
}

export const AddNodePlaceholder = memo(AddNodePlaceholderComponent);
