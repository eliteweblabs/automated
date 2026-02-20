import { WorkflowNode } from './WorkflowNode';
import { LoopGroupNode } from './LoopGroupNode';
import { AddNodePlaceholder } from './AddNodePlaceholder';

export const nodeTypes = {
  workflowNode: WorkflowNode,
  loopGroupNode: LoopGroupNode,
  addNodePlaceholder: AddNodePlaceholder,
} as const;
