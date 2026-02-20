import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: path.join(__dirname, '../../../.env') });

import {
  generateWorkflowFromUserParts,
  WorkflowSchema,
  WORKFLOW_SYSTEM_PROMPT,
  buildWorkflowSchemaPrompt,
} from '../src/app/workflow/workflow-generation.shared';

async function main() {
  const interactionFile = process.argv[2];

  if (!interactionFile) {
    console.log('Usage: npx tsx scripts/test-workflow-generation.ts <interaction-file>');
    console.log('\nAvailable interaction files:');
    const logsDir = path.join(__dirname, '../logs');
    const files = await fs.readdir(logsDir);
    files.filter((f) => f.endsWith('.json')).forEach((f) => console.log(`  logs/${f}`));
    process.exit(1);
  }

  const filePath = path.isAbsolute(interactionFile)
    ? interactionFile
    : path.join(__dirname, '..', interactionFile);

  console.log(`Reading interaction file: ${filePath}`);
  const content = await fs.readFile(filePath, 'utf-8');
  const userParts = JSON.parse(content);

  console.log(`Loaded ${userParts.length} user parts`);
  console.log('\n--- System Prompt ---');
  console.log(WORKFLOW_SYSTEM_PROMPT);
  console.log('\n--- Schema Prompt ---');
  console.log(buildWorkflowSchemaPrompt());

  console.log('\n--- Generating workflow ---');
  try {
    const result = await generateWorkflowFromUserParts({ userParts });
    console.log('\n--- Raw Response ---');
    console.log(result.rawResponse);
    console.log('\n--- Parsed Workflow ---');
    console.log(JSON.stringify(result.workflow, null, 2));
    console.log('\n--- Usage ---');
    console.log(result.usage);
  } catch (error) {
    console.error('\n--- Error ---');
    console.error(error);

    // If it's a parse error, let's see what the raw response looked like
    if (error instanceof Error && error.message.includes('ZodError')) {
      console.log('\n--- Likely cause: LLM returned array instead of object ---');
      console.log(
        'The LLM returned an array of steps instead of { name: string, steps: [...] }',
      );
    }
  }
}

main();
