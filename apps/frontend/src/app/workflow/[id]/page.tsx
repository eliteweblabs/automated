'use client';

import { useParams } from 'next/navigation';
import { WorkflowFlowEditor } from '../../components/workflow-flow-editor';
import {
  useWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useCreateWorkflow,
} from '../../../hooks/api';
import { Navbar } from '../../components/Navbar';
import { Box, VStack, Heading, Spinner, Link as ChakraLink, Link } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import type { WorkflowStep } from '@automated/api-dtos';

export default function WorkflowPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const { data: workflow, isLoading: loading, error } = useWorkflow(id === 'new' ? null : id);
  const updateWorkflowMutation = useUpdateWorkflow();
  const createWorkflowMutation = useCreateWorkflow();
  const deleteWorkflowMutation = useDeleteWorkflow();

  const handleSave = async (title: string, steps: WorkflowStep[]) => {
    if (id && id !== 'new') {
      await updateWorkflowMutation.mutateAsync({ id, title, steps });
      router.push(`/`);
    } else {
      const newWorkflow = await createWorkflowMutation.mutateAsync({ title, steps });
      router.push(`/`);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteWorkflowMutation.mutateAsync(id);
    router.push('/');
  };

  if ((!id || id === 'new') && !loading && !workflow) {
    return (
      <VStack h="100vh" bg="app.bg" color="app.snow" align="stretch" gap={0}>
        <Navbar />
        <Box flex={1} overflow="hidden">
          <WorkflowFlowEditor initialTitle="" initialSteps={[]} onSave={handleSave} />
        </Box>
      </VStack>
    );
  }

  if (!id && !loading) {
    return (
      <VStack minH="100vh" bg="app.bg" color="app.snow" align="stretch" gap={0}>
        <Navbar />
        <VStack pt={20} align="center" justify="center">
          <VStack textAlign="center">
            <Heading size="xl" fontWeight="semibold" mb={4} color="app.snow">
              No Workflow ID provided
            </Heading>
            <Link href="/record">
              <ChakraLink color="app.primary" _hover={{ textDecoration: 'underline' }}>
                Go to Recording
              </ChakraLink>
            </Link>
          </VStack>
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack h="100vh" bg="app.bg" color="app.snow" align="stretch" gap={0}>
      <Navbar />
      <Box flex={1} overflow="hidden">
        {loading && (
          <VStack py={12} align="center" justify="center">
            <Spinner size="lg" color="app.primary" />
          </VStack>
        )}

        {!loading && workflow && (
          <WorkflowFlowEditor
            initialTitle={workflow.title || 'Untitled Workflow'}
            initialSteps={workflow.steps}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        )}
      </Box>
    </VStack>
  );
}
