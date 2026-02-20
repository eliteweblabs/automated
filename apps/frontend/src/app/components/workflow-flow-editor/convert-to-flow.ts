import type { Node, Edge } from '@xyflow/react';
import type { EditorStep, BranchLabel } from './types';

export interface FlowNodeData {
  editorStep?: EditorStep;
  parentId?: string;
  branchLabel: BranchLabel;
  indexInBranch: number;
  isPlaceholder?: boolean;
  loopId?: string;
  [key: string]: unknown;
}

export interface FlowEdgeData {
  parentId: string | null;
  branchLabel: BranchLabel;
  insertIndex: number;
  targetIsPlaceholder?: boolean;
  isReconvergence?: boolean;
  [key: string]: unknown;
}

interface ConversionContext {
  nodes: Node<FlowNodeData>[];
  edges: Edge<FlowEdgeData>[];
}

const NODE_WIDTH = 280;
const NODE_HEIGHT = 80;
const CONDITIONAL_NODE_HEIGHT = 100;
const PLACEHOLDER_SIZE = 40;

function processStepList(
  steps: EditorStep[],
  parentId: string | null,
  branchLabel: BranchLabel,
  ctx: ConversionContext,
  loopId?: string,
): { firstNodeId: string | null; lastNodeIds: string[] } {
  if (steps.length === 0) {
    // Add a terminal placeholder
    const placeholderId = `placeholder-${parentId ?? 'root'}-${branchLabel}`;
    ctx.nodes.push({
      id: placeholderId,
      type: 'addNodePlaceholder',
      position: { x: 0, y: 0 },
      data: {
        parentId: parentId ?? undefined,
        branchLabel,
        indexInBranch: 0,
        isPlaceholder: true,
        loopId,
      },
      width: PLACEHOLDER_SIZE,
      height: PLACEHOLDER_SIZE,
      ...(loopId ? { parentId: loopId, extent: 'parent' as const } : {}),
    });
    return { firstNodeId: placeholderId, lastNodeIds: [placeholderId] };
  }

  let previousNodeId: string | null = null;
  let firstNodeId: string | null = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const result = processStep(step, parentId, branchLabel, i, ctx, loopId);

    if (i === 0) {
      firstNodeId = result.firstNodeId;
    }

    // Connect previous node to this one
    if (previousNodeId && result.firstNodeId) {
      const edgeId = `edge-${previousNodeId}-${result.firstNodeId}`;
      ctx.edges.push({
        id: edgeId,
        source: previousNodeId,
        target: result.firstNodeId,
        type: 'insertableEdge',
        data: {
          parentId,
          branchLabel,
          insertIndex: i,
        },
      });
    }

    // The last node IDs from the current step become our "previous" for the next sequential step
    // For conditionals, we need to handle reconvergence
    if (i < steps.length - 1) {
      // If step is conditional, both branch ends reconnect to next step
      if (step.type === 'conditional') {
        // We'll connect all lastNodeIds to the next step below
        previousNodeId = null; // handled specially
        const nextStep = steps[i + 1];
        const nextResult = processStep(nextStep, parentId, branchLabel, i + 1, ctx, loopId);
        if (i + 1 === 1 && !firstNodeId) firstNodeId = nextResult.firstNodeId;

        for (const lastId of result.lastNodeIds) {
          if (nextResult.firstNodeId) {
            const edgeId = `edge-${lastId}-${nextResult.firstNodeId}`;
            ctx.edges.push({
              id: edgeId,
              source: lastId,
              target: nextResult.firstNodeId,
              type: 'insertableEdge',
              data: {
                parentId,
                branchLabel,
                insertIndex: i + 1,
                isReconvergence: true,
              },
            });
          }
        }

        previousNodeId = nextResult.lastNodeIds.length === 1 ? nextResult.lastNodeIds[0] : null;
        if (nextResult.lastNodeIds.length > 1) {
          // Skip ahead; this case shouldn't happen for sequential steps after conditional
        }
        i++; // skip the next step since we already processed it
        if (i === steps.length - 1) {
          // Add terminal placeholder after the last step
          const placeholderId = `placeholder-${parentId ?? 'root'}-${branchLabel}-end`;
          ctx.nodes.push({
            id: placeholderId,
            type: 'addNodePlaceholder',
            position: { x: 0, y: 0 },
            data: {
              parentId: parentId ?? undefined,
              branchLabel,
              indexInBranch: steps.length,
              isPlaceholder: true,
              loopId,
            },
            width: PLACEHOLDER_SIZE,
            height: PLACEHOLDER_SIZE,
            ...(loopId ? { parentId: loopId, extent: 'parent' as const } : {}),
          });

          for (const lastId of nextResult.lastNodeIds) {
            ctx.edges.push({
              id: `edge-${lastId}-${placeholderId}`,
              source: lastId,
              target: placeholderId,
              type: 'insertableEdge',
              data: {
                parentId,
                branchLabel,
                insertIndex: steps.length,
                targetIsPlaceholder: true,
                isReconvergence: true,
              },
            });
          }

          return { firstNodeId: firstNodeId!, lastNodeIds: [placeholderId] };
        }
        continue;
      }
      previousNodeId = result.lastNodeIds[0] ?? null;
    } else {
      // Last step — if it's a conditional, the branch placeholders are sufficient;
      // don't add a redundant third placeholder after the conditional.
      if (step.type === 'conditional') {
        return { firstNodeId: firstNodeId!, lastNodeIds: result.lastNodeIds };
      }

      // Last step - add terminal placeholder
      const placeholderId = `placeholder-${parentId ?? 'root'}-${branchLabel}-end`;
      ctx.nodes.push({
        id: placeholderId,
        type: 'addNodePlaceholder',
        position: { x: 0, y: 0 },
        data: {
          parentId: parentId ?? undefined,
          branchLabel,
          indexInBranch: steps.length,
          isPlaceholder: true,
          loopId,
        },
        width: PLACEHOLDER_SIZE,
        height: PLACEHOLDER_SIZE,
        ...(loopId ? { parentId: loopId, extent: 'parent' as const } : {}),
      });

      for (const lastId of result.lastNodeIds) {
        ctx.edges.push({
          id: `edge-${lastId}-${placeholderId}`,
          source: lastId,
          target: placeholderId,
          type: 'insertableEdge',
          data: {
            parentId,
            branchLabel,
            insertIndex: steps.length,
            targetIsPlaceholder: true,
          },
        });
      }

      return { firstNodeId: firstNodeId!, lastNodeIds: [placeholderId] };
    }
  }

  return { firstNodeId: firstNodeId!, lastNodeIds: previousNodeId ? [previousNodeId] : [] };
}

function processStep(
  step: EditorStep,
  parentId: string | null,
  branchLabel: BranchLabel,
  indexInBranch: number,
  ctx: ConversionContext,
  loopId?: string,
): { firstNodeId: string; lastNodeIds: string[] } {
  const nodeId = step.id;

  if (step.type === 'conditional') {
    // Create the conditional node
    ctx.nodes.push({
      id: nodeId,
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        editorStep: step,
        parentId: parentId ?? undefined,
        branchLabel,
        indexInBranch,
        loopId,
      },
      width: NODE_WIDTH,
      height: CONDITIONAL_NODE_HEIGHT,
      ...(loopId ? { parentId: loopId, extent: 'parent' as const } : {}),
    });

    // Process true branch
    const trueResult = processStepList(step.trueSteps, nodeId, 'true', ctx, loopId);
    // Process false branch
    const falseResult = processStepList(step.falseSteps, nodeId, 'false', ctx, loopId);

    // Connect conditional to true branch
    if (trueResult.firstNodeId) {
      const trueTargetIsPlaceholder = trueResult.firstNodeId.startsWith('placeholder-');
      ctx.edges.push({
        id: `edge-${nodeId}-true-${trueResult.firstNodeId}`,
        source: nodeId,
        sourceHandle: 'handle-true',
        target: trueResult.firstNodeId,
        type: 'insertableEdge',
        label: 'True',
        data: {
          parentId: nodeId,
          branchLabel: 'true',
          insertIndex: 0,
          targetIsPlaceholder: trueTargetIsPlaceholder,
        },
      });
    }

    // Connect conditional to false branch
    if (falseResult.firstNodeId) {
      const falseTargetIsPlaceholder = falseResult.firstNodeId.startsWith('placeholder-');
      ctx.edges.push({
        id: `edge-${nodeId}-false-${falseResult.firstNodeId}`,
        source: nodeId,
        sourceHandle: 'handle-false',
        target: falseResult.firstNodeId,
        type: 'insertableEdge',
        label: 'False',
        data: {
          parentId: nodeId,
          branchLabel: 'false',
          insertIndex: 0,
          targetIsPlaceholder: falseTargetIsPlaceholder,
        },
      });
    }

    // Collect all end-of-branch node IDs
    const lastNodeIds = [...trueResult.lastNodeIds, ...falseResult.lastNodeIds];
    return { firstNodeId: nodeId, lastNodeIds };
  }

  if (step.type === 'loop') {
    // Create group node for loop
    const groupId = `loop-group-${nodeId}`;
    ctx.nodes.push({
      id: groupId,
      type: 'loopGroupNode',
      position: { x: 0, y: 0 },
      data: {
        editorStep: step,
        parentId: parentId ?? undefined,
        branchLabel,
        indexInBranch,
        loopId,
      },
      style: { width: 360, height: 300 },
      ...(loopId ? { parentId: loopId, extent: 'parent' as const } : {}),
    });

    // Process child steps inside the loop group
    processStepList(step.steps, nodeId, 'loop', ctx, groupId);

    return { firstNodeId: groupId, lastNodeIds: [groupId] };
  }

  // Regular step node
  ctx.nodes.push({
    id: nodeId,
    type: 'workflowNode',
    position: { x: 0, y: 0 },
    data: {
      editorStep: step,
      parentId: parentId ?? undefined,
      branchLabel,
      indexInBranch,
      loopId,
    },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    ...(loopId ? { parentId: loopId, extent: 'parent' as const } : {}),
  });

  return { firstNodeId: nodeId, lastNodeIds: [nodeId] };
}

export function convertToFlow(steps: EditorStep[]): { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } {
  const ctx: ConversionContext = { nodes: [], edges: [] };
  processStepList(steps, null, 'main', ctx);
  return { nodes: ctx.nodes, edges: ctx.edges };
}
