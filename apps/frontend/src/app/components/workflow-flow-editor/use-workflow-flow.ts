import { useState, useCallback, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  type EditorStep,
  type StepType,
  type BranchLabel,
  type ApiStep,
  createNewStep,
  changeStepType as changeStepTypeFn,
  toEditorStep,
  toApiStep,
} from './types';
import { convertToFlow, type FlowNodeData, type FlowEdgeData } from './convert-to-flow';
import { layoutNodes } from './auto-layout';

function findAndUpdate(
  steps: EditorStep[],
  stepId: string,
  updater: (step: EditorStep) => EditorStep | null,
): EditorStep[] {
  const result: EditorStep[] = [];
  for (const step of steps) {
    if (step.id === stepId) {
      const updated = updater(step);
      if (updated !== null) {
        result.push(updated);
      }
      // null means delete
      continue;
    }

    if (step.type === 'loop') {
      result.push({
        ...step,
        steps: findAndUpdate(step.steps, stepId, updater),
      });
    } else if (step.type === 'conditional') {
      result.push({
        ...step,
        trueSteps: findAndUpdate(step.trueSteps, stepId, updater),
        falseSteps: findAndUpdate(step.falseSteps, stepId, updater),
      });
    } else {
      result.push(step);
    }
  }
  return result;
}

/**
 * Splice a new step into an array. If the new step is a conditional or loop,
 * absorb all subsequent siblings into its true branch / loop body so the
 * graph stays connected.
 */
function spliceAndAbsorb(arr: EditorStep[], index: number, newStep: EditorStep): EditorStep[] {
  const before = arr.slice(0, index);
  const after = arr.slice(index);

  if (newStep.type === 'conditional' && after.length > 0) {
    return [...before, { ...newStep, trueSteps: [...newStep.trueSteps, ...after] }];
  }
  if (newStep.type === 'loop' && after.length > 0) {
    return [...before, { ...newStep, steps: [...newStep.steps, ...after] }];
  }
  return [...before, newStep, ...after];
}

function insertIntoTree(
  steps: EditorStep[],
  parentId: string | null,
  branchLabel: BranchLabel,
  index: number,
  newStep: EditorStep,
): EditorStep[] {
  if (parentId === null && branchLabel === 'main') {
    return spliceAndAbsorb(steps, index, newStep);
  }

  return steps.map((step) => {
    if (step.id === parentId) {
      if (step.type === 'loop' && branchLabel === 'loop') {
        return { ...step, steps: spliceAndAbsorb(step.steps, index, newStep) };
      }
      if (step.type === 'conditional') {
        if (branchLabel === 'true') {
          return { ...step, trueSteps: spliceAndAbsorb(step.trueSteps, index, newStep) };
        }
        if (branchLabel === 'false') {
          return { ...step, falseSteps: spliceAndAbsorb(step.falseSteps, index, newStep) };
        }
      }
    }

    if (step.type === 'loop') {
      return {
        ...step,
        steps: insertIntoTree(step.steps, parentId, branchLabel, index, newStep),
      };
    }
    if (step.type === 'conditional') {
      return {
        ...step,
        trueSteps: insertIntoTree(step.trueSteps, parentId, branchLabel, index, newStep),
        falseSteps: insertIntoTree(step.falseSteps, parentId, branchLabel, index, newStep),
      };
    }
    return step;
  });
}

/**
 * When changing a step to 'conditional' or 'loop', absorb all subsequent
 * sibling steps into the true branch (conditional) or loop body (loop)
 * so the graph stays connected.
 */
function findAndChangeType(
  steps: EditorStep[],
  stepId: string,
  newType: StepType,
): EditorStep[] {
  // Check if the target step is at this level
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx !== -1) {
    const converted = changeStepTypeFn(steps[idx], newType);
    const remaining = steps.slice(idx + 1);
    const result = [...steps.slice(0, idx)];

    if (converted.type === 'conditional' && remaining.length > 0) {
      result.push({ ...converted, trueSteps: [...converted.trueSteps, ...remaining] });
    } else if (converted.type === 'loop' && remaining.length > 0) {
      result.push({ ...converted, steps: [...converted.steps, ...remaining] });
    } else {
      result.push(converted);
    }
    return result;
  }

  // Recurse into nested structures
  return steps.map((step) => {
    if (step.type === 'loop') {
      return { ...step, steps: findAndChangeType(step.steps, stepId, newType) };
    }
    if (step.type === 'conditional') {
      return {
        ...step,
        trueSteps: findAndChangeType(step.trueSteps, stepId, newType),
        falseSteps: findAndChangeType(step.falseSteps, stepId, newType),
      };
    }
    return step;
  });
}

function findStep(steps: EditorStep[], stepId: string): EditorStep | null {
  for (const step of steps) {
    if (step.id === stepId) return step;
    if (step.type === 'loop') {
      const found = findStep(step.steps, stepId);
      if (found) return found;
    }
    if (step.type === 'conditional') {
      const foundTrue = findStep(step.trueSteps, stepId);
      if (foundTrue) return foundTrue;
      const foundFalse = findStep(step.falseSteps, stepId);
      if (foundFalse) return foundFalse;
    }
  }
  return null;
}

export function useWorkflowFlow(initialSteps: ApiStep[]) {
  const [steps, setSteps] = useState<EditorStep[]>(() =>
    initialSteps.map(toEditorStep),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const { nodes: rawNodes, edges: rawEdges } = convertToFlow(steps);
    const layoutedNodes = layoutNodes(rawNodes, rawEdges);
    return { nodes: layoutedNodes, edges: rawEdges };
  }, [steps]);

  const selectedStep = useMemo(() => {
    if (!selectedNodeId) return null;
    return findStep(steps, selectedNodeId);
  }, [steps, selectedNodeId]);

  const insertStep = useCallback(
    (parentId: string | null, branchLabel: BranchLabel, index: number, type: StepType) => {
      const newStep = createNewStep(type);
      setSteps((prev) => insertIntoTree(prev, parentId, branchLabel, index, newStep));
      setSelectedNodeId(newStep.id);
    },
    [],
  );

  const deleteStep = useCallback(
    (stepId: string) => {
      setSteps((prev) => findAndUpdate(prev, stepId, () => null));
      if (selectedNodeId === stepId) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId],
  );

  const updateStep = useCallback(
    (stepId: string, updater: (step: EditorStep) => EditorStep) => {
      setSteps((prev) => findAndUpdate(prev, stepId, updater));
    },
    [],
  );

  const changeStepType = useCallback(
    (stepId: string, newType: StepType) => {
      setSteps((prev) =>
        findAndChangeType(prev, stepId, newType),
      );
    },
    [],
  );

  const getApiSteps = useCallback((): ApiStep[] => {
    return steps.map(toApiStep);
  }, [steps]);

  return {
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
  };
}
