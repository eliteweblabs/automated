import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Workflow } from './types';
import { OrchestratorAgent } from './orchestrator';

dotenv.config();

function getWorkflowFileArg(): string | undefined {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      return arg.slice('--file='.length);
    }
    if (arg === '--file') {
      const index = args.indexOf(arg);
      return args[index + 1];
    }
  }
  return undefined;
}

async function loadWorkflowFromFile(filePath: string): Promise<Workflow> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const fileContents = await fs.readFile(resolvedPath, 'utf8');
  const parsed = JSON.parse(fileContents);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Workflow file must contain a JSON object.');
  }
  if (typeof parsed.name !== 'string' || typeof parsed.startingUrl !== 'string') {
    throw new Error('Workflow file must include "name" and "startingUrl" fields.');
  }
  if (!Array.isArray(parsed.steps)) {
    throw new Error('Workflow file must include a "steps" array.');
  }

  return parsed as Workflow;
}

async function main() {
  const workflowFile = getWorkflowFileArg() ?? process.env.CUA_WORKFLOW_FILE;
  if (!workflowFile) {
    console.error('Usage: nx serve cua-agent --file=path/to/workflow.json');
    console.error('Or set CUA_WORKFLOW_FILE=/path/to/workflow.json');
    process.exit(1);
  }

  const workflow = await loadWorkflowFromFile(workflowFile);
  const orchestrator = new OrchestratorAgent();
  const result = await orchestrator.runWorkflow(workflow);

  console.log('\n--- Workflow Results ---');
  console.log(`Workflow: ${result.workflowName}`);
  console.log(`Success: ${result.success}`);
  console.log(`Steps completed: ${result.stepResults.length}`);

  console.log(result.globalState);

  if (result.stepResults.some((r) => !r.success)) {
    console.log('\n--- Failed Steps ---');
    for (const step of result.stepResults) {
      if (!step.success) {
        console.log(`  [${step.instruction}]: ${step.error || 'unknown error'}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
