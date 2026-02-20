'use client';

import { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type NodeMouseHandler,
  type ReactFlowInstance,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from './nodes/nodeTypes';
import { edgeTypes } from './edges/edgeTypes';
import { useWorkflowFlow } from './use-workflow-flow';
import { AddNodeMenu } from './panels/AddNodeMenu';
import { NodeEditPanel } from './panels/NodeEditPanel';
import { toEditorStep, type StepType, type BranchLabel, type EditorStep } from './types';
import type { WorkflowStep } from '@automated/api-dtos';
import { Button } from '@chakra-ui/react';

interface WorkflowFlowEditorProps {
  initialTitle: string;
  initialSteps?: WorkflowStep[];
  onSave?: (title: string, steps: WorkflowStep[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}

interface AddMenuState {
  position: { x: number; y: number };
  parentId: string | null;
  branchLabel: BranchLabel;
  insertIndex: number;
}

function WorkflowFlowEditorInner({
  initialTitle,
  initialSteps,
  onSave,
  onDelete,
}: WorkflowFlowEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null);

  const {
    steps,
    setSteps,
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    selectedStep,
    insertStep,
    deleteStep,
    updateStep,
    changeStepType,
    getApiSteps,
  } = useWorkflowFlow(initialSteps ?? []);

  // Re-initialize when initialSteps changes
  useEffect(() => {
    if (initialSteps && initialSteps.length > 0) {
      setSteps(initialSteps.map(toEditorStep));
    }
  }, [initialSteps, setSteps]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(title, getApiSteps());
    } catch (error) {
      console.error('Failed to save workflow:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === 'addNodePlaceholder') {
        // Open add menu for placeholder
        const rect = (_event.target as HTMLElement).getBoundingClientRect();
        setAddMenu({
          position: { x: rect.left + rect.width / 2, y: rect.bottom + 4 },
          parentId: (node.data.parentId as string) ?? null,
          branchLabel: node.data.branchLabel as BranchLabel,
          insertIndex: node.data.indexInBranch as number,
        });
        return;
      }

      if (node.type === 'loopGroupNode') {
        setSelectedNodeId(node.data.editorStep ? (node.data.editorStep as EditorStep).id : null);
        return;
      }

      // Regular node - select for editing
      setSelectedNodeId(node.data.editorStep ? (node.data.editorStep as EditorStep).id : null);
    },
    [setSelectedNodeId],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setAddMenu(null);
  }, [setSelectedNodeId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onInit = useCallback((instance: ReactFlowInstance<any, any>) => {
    // Center horizontally but show from the top
    window.requestAnimationFrame(() => {
      const nodes = instance.getNodes();
      if (nodes.length === 0) return;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity;
      for (const n of nodes) {
        const w = n.width ?? n.measured?.width ?? 280;
        minX = Math.min(minX, n.position.x);
        maxX = Math.max(maxX, n.position.x + w);
        minY = Math.min(minY, n.position.y);
      }
      const graphCenterX = (minX + maxX) / 2;
      const container = document.querySelector('.react-flow') as HTMLElement | null;
      const viewportWidth = container?.clientWidth ?? window.innerWidth;
      const zoom = 1;
      const x = viewportWidth / 2 - graphCenterX * zoom;
      const y = -minY * zoom + 40;
      instance.setViewport({ x, y, zoom });
    });
  }, []);

  // Handle edge "+", placeholder, and delete button clicks via event delegation
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      // Handle delete button clicks on nodes
      const deleteButton = target.closest('[data-delete-node-id]') as HTMLElement | null;
      if (deleteButton) {
        e.stopPropagation();
        const nodeId = deleteButton.dataset.deleteNodeId;
        if (nodeId) deleteStep(nodeId);
        return;
      }

      const edgeButton = target.closest('[data-edge-id]') as HTMLElement | null;
      if (edgeButton) {
        e.stopPropagation();
        const parentId = edgeButton.dataset.parentId || null;
        const branchLabel = (edgeButton.dataset.branchLabel || 'main') as BranchLabel;
        const insertIndex = parseInt(edgeButton.dataset.insertIndex || '0', 10);
        const rect = edgeButton.getBoundingClientRect();
        setAddMenu({
          position: { x: rect.left + rect.width / 2, y: rect.bottom + 4 },
          parentId: parentId || null,
          branchLabel,
          insertIndex,
        });
        return;
      }

      // Handle placeholder clicks
      const placeholder = target.closest('[data-placeholder-id]') as HTMLElement | null;
      if (placeholder) {
        e.stopPropagation();
        const parentId = placeholder.dataset.parentId || null;
        const branchLabel = (placeholder.dataset.branchLabel || 'main') as BranchLabel;
        const index = parseInt(placeholder.dataset.index || '0', 10);
        const rect = placeholder.getBoundingClientRect();
        setAddMenu({
          position: { x: rect.left + rect.width / 2, y: rect.bottom + 4 },
          parentId: parentId || null,
          branchLabel,
          insertIndex: index,
        });
        return;
      }
    },
    [deleteStep],
  );

  const handleAddMenuSelect = useCallback(
    (type: StepType) => {
      if (!addMenu) return;
      insertStep(addMenu.parentId, addMenu.branchLabel, addMenu.insertIndex, type);
      setAddMenu(null);
    },
    [addMenu, insertStep],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid #E4E4E4',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Workflow title"
          style={{
            flex: 1,
            maxWidth: 400,
            fontSize: 18,
            fontWeight: 600,
            border: 'none',
            outline: 'none',
            color: '#0C0C0C',
            background: 'transparent',
            padding: '4px 0',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {onDelete && (
            <Button onClick={handleDelete}>{isDeleting ? 'Deleting...' : 'Delete'}</Button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '8px 20px',
              border: '1px solid #792BF8',
              borderRadius: 4,
              background: '#792BF8',
              color: '#F1F1F1',
              fontSize: 13,
              fontWeight: 600,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Save Workflow'}
          </button>
        </div>
      </div>

      {/* Canvas + Edit Panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ flex: 1, position: 'relative' }} onClick={handleCanvasClick}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodesDraggable={false}
            nodesConnectable={false}
            onInit={onInit}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#E4E4E4" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Edit Panel */}
        {selectedStep && selectedNodeId && (
          <NodeEditPanel
            step={selectedStep}
            onUpdate={(updater) => updateStep(selectedNodeId, updater)}
            onChangeType={(newType) => changeStepType(selectedNodeId, newType)}
            onDelete={() => deleteStep(selectedNodeId)}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Add Node Menu */}
      {addMenu && (
        <AddNodeMenu
          position={addMenu.position}
          onSelect={handleAddMenuSelect}
          onClose={() => setAddMenu(null)}
        />
      )}
    </div>
  );
}

export function WorkflowFlowEditor(props: WorkflowFlowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowFlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
