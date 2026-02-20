export interface ParsedWorkflow {
  title: string;
  steps: { stepNumber: number; description: string }[];
}

export function parseWorkflowText(text: string): ParsedWorkflow {
  const titleMatch = text.match(/Title:\s*(.+)/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Workflow';

  const steps: { stepNumber: number; description: string }[] = [];
  const workflowMatch = text.match(/Workflow:([\s\S]*)/i);

  if (workflowMatch) {
    const workflowSection = workflowMatch[1];
    const stepRegex = /^\s*(\d+)\.\s*(.+)/gm;
    let match;

    while ((match = stepRegex.exec(workflowSection)) !== null) {
      steps.push({
        stepNumber: parseInt(match[1], 10),
        description: match[2].trim(),
      });
    }
  }

  return { title, steps };
}
