import { memo } from 'react';
import {
  getSmoothStepPath,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  type EdgeProps,
} from '@xyflow/react';
import type { FlowEdgeData } from '../convert-to-flow';

function InsertableEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
  selected,
}: EdgeProps) {
  const isBranchEdge = label === 'True' || label === 'False';
  const [edgePath, labelX, labelY] = isBranchEdge
    ? getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      })
    : getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8,
      });

  const edgeData = data as unknown as FlowEdgeData;
  const hideInsertButton = edgeData?.targetIsPlaceholder === true;

  // Hide reconvergence edges (branch endpoints → next step) to avoid horizontal lines
  if (edgeData?.isReconvergence) {
    return null;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#7756C4' : '#CFCFCF',
          strokeWidth: 2,
        }}
      />
      <EdgeLabelRenderer>
        {label && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.3}px, ${sourceY + (targetY - sourceY) * 0.2}px)`,
              fontSize: 11,
              fontWeight: 600,
              color: label === 'True' ? '#38a169' : '#e53e3e',
              background: '#EFEFEF',
              border: '1px solid #E4E4E4',
              padding: '1px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        )}
        {!hideInsertButton && <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            data-edge-id={id}
            data-parent-id={edgeData?.parentId ?? ''}
            data-branch-label={edgeData?.branchLabel ?? 'main'}
            data-insert-index={edgeData?.insertIndex ?? 0}
            type="button"
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              border: '1px solid #CFCFCF',
              background: '#EFEFEF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 14,
              color: '#5F5F5F',
              lineHeight: 1,
              padding: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '#792BF8';
              el.style.color = '#792BF8';
              el.style.transform = 'scale(1.15)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '#CFCFCF';
              el.style.color = '#5F5F5F';
              el.style.transform = 'scale(1)';
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>}
      </EdgeLabelRenderer>
    </>
  );
}

export const InsertableEdge = memo(InsertableEdgeComponent);
