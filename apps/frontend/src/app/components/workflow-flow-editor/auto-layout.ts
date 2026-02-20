import type { Node, Edge } from '@xyflow/react';
import type { FlowNodeData, FlowEdgeData } from './convert-to-flow';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 80;
const PLACEHOLDER_SIZE = 40;
const LOOP_PADDING = 40;
const LOOP_HEADER = 50;
const GAP_Y = 60;
const GAP_X = 80;

interface SubtreeSize {
  width: number;
  height: number;
}

export function layoutNodes(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
): Node<FlowNodeData>[] {
  const nodeMap = new Map<string, Node<FlowNodeData>>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Separate loop group nodes and their children
  const loopGroupIds = new Set(
    nodes.filter((n) => n.type === 'loopGroupNode').map((n) => n.id),
  );

  // Layout children inside each loop group first
  for (const groupId of loopGroupIds) {
    const childNodes = nodes.filter((n) => n.parentId === groupId);
    if (childNodes.length === 0) continue;

    const childNodeIds = new Set(childNodes.map((n) => n.id));
    const childEdges = edges.filter(
      (e) => childNodeIds.has(e.source) && childNodeIds.has(e.target),
    );

    const targets = new Set(childEdges.map((e) => e.target));
    const roots = childNodes.filter((n) => !targets.has(n.id));
    const rootId = roots.length > 0 ? roots[0].id : childNodes[0].id;

    const result = layoutTree(rootId, nodeMap, childEdges, LOOP_PADDING, LOOP_HEADER);

    // Resize the group node
    const groupNode = nodeMap.get(groupId);
    if (groupNode) {
      const gw = Math.max(result.width + LOOP_PADDING * 2, 360);
      const gh = Math.max(result.height + LOOP_HEADER + LOOP_PADDING, 200);
      groupNode.style = { ...groupNode.style, width: gw, height: gh };
      groupNode.width = gw;
      groupNode.height = gh;

      // Center a single placeholder child within the loop group
      if (childNodes.length === 1 && childNodes[0].type === 'addNodePlaceholder') {
        const child = childNodes[0];
        const childW = child.width ?? PLACEHOLDER_SIZE;
        const childH = child.height ?? PLACEHOLDER_SIZE;
        child.position = {
          x: (gw - childW) / 2,
          y: LOOP_HEADER + (gh - LOOP_HEADER - childH) / 2,
        };
      }
    }
  }

  // Layout top-level nodes
  const topLevelNodes = nodes.filter((n) => !n.parentId);
  if (topLevelNodes.length > 0) {
    const topLevelNodeIds = new Set(topLevelNodes.map((n) => n.id));
    const topLevelEdges = edges.filter(
      (e) => topLevelNodeIds.has(e.source) && topLevelNodeIds.has(e.target),
    );

    const targets = new Set(topLevelEdges.map((e) => e.target));
    const roots = topLevelNodes.filter((n) => !targets.has(n.id));
    const rootId = roots.length > 0 ? roots[0].id : topLevelNodes[0].id;

    layoutTree(rootId, nodeMap, topLevelEdges, 0, 0);
  }

  return nodes;
}

/**
 * Recursive tree layout that properly handles conditional branching.
 *
 * Each node's subtree width is computed bottom-up, then positions are
 * assigned top-down, centering each node over its subtree.
 *
 * For conditionals: the true and false branches are laid out side-by-side,
 * and the conditional node is centered above both.
 */
function layoutTree(
  rootId: string,
  nodeMap: Map<string, Node<FlowNodeData>>,
  edges: Edge<FlowEdgeData>[],
  offsetX: number,
  offsetY: number,
): SubtreeSize {
  type AdjEntry = { target: string; handle?: string };
  // Build adjacency: source -> [{target, handleId}]
  const adj = new Map<string, AdjEntry[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push({ target: e.target, handle: e.sourceHandle ?? undefined });
  }

  function getAdj(nodeId: string): AdjEntry[] {
    return adj.get(nodeId) ?? [];
  }

  // Phase 1: compute subtree widths bottom-up
  const subtreeWidth = new Map<string, number>();
  const subtreeHeight = new Map<string, number>();
  const visited = new Set<string>();

  function computeSize(nodeId: string): SubtreeSize {
    if (visited.has(nodeId)) {
      return { width: subtreeWidth.get(nodeId) ?? 0, height: subtreeHeight.get(nodeId) ?? 0 };
    }
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    const nodeW = getNodeWidth(node);
    const nodeH = getNodeHeight(node);
    const children = getAdj(nodeId);

    if (children.length === 0) {
      subtreeWidth.set(nodeId, nodeW);
      subtreeHeight.set(nodeId, nodeH);
      return { width: nodeW, height: nodeH };
    }

    // Check if this is a conditional (has handle-true and handle-false children)
    const trueChild = children.find((c) => c.handle === 'handle-true');
    const falseChild = children.find((c) => c.handle === 'handle-false');
    const isConditional = trueChild && falseChild;

    if (isConditional) {
      // Compute both branch subtrees
      const trueSize = computeChainSize(trueChild.target);
      const falseSize = computeChainSize(falseChild.target);

      const branchW = Math.max(trueSize.width, falseSize.width);
      const totalChildWidth = branchW + GAP_X + branchW;
      const w = Math.max(nodeW, totalChildWidth);
      const h = nodeH + GAP_Y + Math.max(trueSize.height, falseSize.height);

      subtreeWidth.set(nodeId, w);
      subtreeHeight.set(nodeId, h);
      return { width: w, height: h };
    }

    // Single child (sequential chain) — follow the chain
    const childSize = computeChainSize(children[0].target);
    const w = Math.max(nodeW, childSize.width);
    const h = nodeH + GAP_Y + childSize.height;

    subtreeWidth.set(nodeId, w);
    subtreeHeight.set(nodeId, h);
    return { width: w, height: h };
  }

  // Compute size of a chain starting at nodeId, following single-child links
  // but expanding at conditionals
  function computeChainSize(startId: string): SubtreeSize {
    let totalHeight = 0;
    let maxWidth = 0;
    let currentId: string | null = startId;

    while (currentId) {
      const size = computeSize(currentId);
      // For conditionals, the subtree size already includes children
      const children = getAdj(currentId);
      const trueChild = children.find((c) => c.handle === 'handle-true');
      const falseChild = children.find((c) => c.handle === 'handle-false');
      const isConditional = trueChild && falseChild;

      if (isConditional) {
        // This node's subtree width includes branches
        maxWidth = Math.max(maxWidth, size.width);
        totalHeight += size.height;
        // Conditional's children are already accounted for in its subtree
        // But we need to check if there's a reconvergence node after the branches
        // In our graph model, reconvergence appears as a node that has edges from
        // both branch endpoints. We stop here since the chain continues after
        // the conditional's subtree in the parent iteration.
        break;
      }

      const nodeH = getNodeHeight(nodeMap.get(currentId));
      maxWidth = Math.max(maxWidth, getNodeWidth(nodeMap.get(currentId)));
      totalHeight += nodeH;

      if (children.length === 1) {
        totalHeight += GAP_Y;
        currentId = children[0].target;
      } else {
        currentId = null;
      }
    }

    return { width: maxWidth, height: totalHeight };
  }

  computeSize(rootId);

  // Phase 2: position nodes top-down
  function positionNode(nodeId: string, cx: number, y: number): void {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const nodeW = getNodeWidth(node);
    const nodeH = getNodeHeight(node);

    // Center node at cx
    node.position = {
      x: cx - nodeW / 2,
      y: y,
    };

    const children = getAdj(nodeId);
    if (children.length === 0) return;

    const trueChild = children.find((c) => c.handle === 'handle-true');
    const falseChild = children.find((c) => c.handle === 'handle-false');
    const isConditional = trueChild && falseChild;

    if (isConditional) {
      const trueW = subtreeWidth.get(trueChild.target) ?? getNodeWidth(nodeMap.get(trueChild.target));
      const falseW = subtreeWidth.get(falseChild.target) ?? getNodeWidth(nodeMap.get(falseChild.target));
      // Use equal width for both sides so branches are symmetric
      const branchW = Math.max(trueW, falseW);
      const totalW = branchW + GAP_X + branchW;

      const startX = cx - totalW / 2;
      const childY = y + nodeH + GAP_Y;

      // True branch: centered in the left portion
      positionChain(trueChild.target, startX + branchW / 2, childY);
      // False branch: centered in the right portion
      positionChain(falseChild.target, startX + branchW + GAP_X + branchW / 2, childY);
      return;
    }

    // Single child
    if (children.length === 1) {
      positionChain(children[0].target, cx, y + nodeH + GAP_Y);
    }
  }

  function positionChain(startId: string, cx: number, y: number): void {
    let currentId: string | null = startId;
    let currentY = y;

    while (currentId) {
      const node = nodeMap.get(currentId);
      if (!node) break;

      const children = getAdj(currentId);
      const trueChild = children.find((c) => c.handle === 'handle-true');
      const falseChild = children.find((c) => c.handle === 'handle-false');
      const isConditional = trueChild && falseChild;

      if (isConditional) {
        // Position the conditional and let it handle its children
        positionNode(currentId, cx, currentY);
        break;
      }

      const nodeW = getNodeWidth(node);
      const nodeH = getNodeHeight(node);

      node.position = {
        x: cx - nodeW / 2,
        y: currentY,
      };

      if (children.length === 1) {
        currentY += nodeH + GAP_Y;
        currentId = children[0].target;
      } else {
        currentId = null;
      }
    }
  }

  // Start layout
  const rootW = subtreeWidth.get(rootId) ?? NODE_WIDTH;
  positionNode(rootId, offsetX + rootW / 2, offsetY);

  return {
    width: subtreeWidth.get(rootId) ?? NODE_WIDTH,
    height: subtreeHeight.get(rootId) ?? NODE_HEIGHT,
  };
}

function getNodeWidth(node: Node<FlowNodeData> | undefined): number {
  if (!node) return NODE_WIDTH;
  if (node.type === 'addNodePlaceholder') return PLACEHOLDER_SIZE;
  if (node.type === 'loopGroupNode') {
    return typeof node.style?.width === 'number' ? node.style.width : 360;
  }
  return NODE_WIDTH;
}

function getNodeHeight(node: Node<FlowNodeData> | undefined): number {
  if (!node) return NODE_HEIGHT;
  if (node.type === 'addNodePlaceholder') return PLACEHOLDER_SIZE;
  if (node.type === 'loopGroupNode') {
    return typeof node.style?.height === 'number' ? node.style.height : 200;
  }
  return NODE_HEIGHT;
}
