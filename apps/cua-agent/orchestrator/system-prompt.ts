/**
 * Builds the system prompt for the browser automation agent.
 */
import type { LoopContext } from '../types';

export function buildSystemPrompt(
  extractedVariables: Record<string, string>,
  context?: LoopContext,
): string {
  const sections: string[] = [];

  sections.push(
    `You are a helpful assistant that can use a web browser. Do not ask follow up questions, the user will trust your judgement.`,
  );

  if (Object.keys(extractedVariables).length > 0) {
    sections.push('');
    sections.push('## Extracted Variables');
    for (const [key, value] of Object.entries(extractedVariables)) {
      sections.push(`- **${key}**: ${value}`);
    }
  }

  if (context && context.item != null) {
    sections.push('');
    sections.push('## Item of Interest');
    sections.push(`- **Index**: ${context.itemIndex ?? ''}`);
    sections.push(`- **Item**: ${JSON.stringify(context.item)}`);
  }

  return sections.join('\n');
}
