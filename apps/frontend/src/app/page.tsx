'use client';

import { useEffect, useState, useRef } from 'react';
import { useOptionalAuth, useOptionalClerk, clerkEnabled } from '../providers/auth-provider';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import {
  useUserWorkflows,
  useWorkflowExecutionStatuses,
  useWorkflowRuns,
  useWorkflowRunOutput,
  useStartWorkflowExecution,
  useStopWorkflowExecution,
  useWorkflowTriggerEmail,
  WorkflowExecutionState,
} from '../hooks/api';
import { Navbar } from './components/Navbar';
import { AppModal } from './components/AppModal';
import { WorkflowScheduleModal } from './components/WorkflowScheduleModal';
import { WorkflowInputsModal } from './components/WorkflowInputsModal';
import { downloadWorkflowOutput, sanitizeFileName } from './utils/workflowOutputDownload';
import { LuCheck, LuCopy, LuPlus } from 'react-icons/lu';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Spinner,
  Card,
  Flex,
  Button,
  Badge,
  Skeleton,
} from '@chakra-ui/react';

export default function WorkflowsPage() {
  const { isLoaded, isSignedIn } = useOptionalAuth();
  const { redirectToSignIn } = useOptionalClerk();
  const router = useRouter();

  const [pendingWorkflow, setPendingWorkflow] = useState(false);
  const pendingTimestampRef = useRef<number | null>(null);

  const { data: workflows, isLoading, refetch } = useUserWorkflows();
  const { data: executionStatuses } = useWorkflowExecutionStatuses();
  const { data: workflowRuns } = useWorkflowRuns();
  const workflowRunOutput = useWorkflowRunOutput();
  const startExecution = useStartWorkflowExecution();
  const stopExecution = useStopWorkflowExecution();
  const workflowTriggerEmail = useWorkflowTriggerEmail();
  // Track workflows that were just started (to show Watch Live immediately)
  const [justStartedWorkflows, setJustStartedWorkflows] = useState<Set<string>>(new Set());
  const [hoveredStartWorkflowId, setHoveredStartWorkflowId] = useState<string | null>(null);
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);
  const [emailModalState, setEmailModalState] = useState<{
    workflowId: string;
    workflowTitle: string;
    email: string | null;
    error: string | null;
  } | null>(null);
  const [scheduleModalState, setScheduleModalState] = useState<{
    workflowId: string;
    workflowTitle: string;
    hasExistingSchedule: boolean;
  } | null>(null);
  const [inputsModalState, setInputsModalState] = useState<{
    workflowId: string;
    workflowTitle: string;
    inputs: string[];
  } | null>(null);
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  const emailCopiedTimeoutRef = useRef<number | null>(null);

  // Check for pending workflow on mount
  useEffect(() => {
    const pending = sessionStorage.getItem('pendingWorkflowTimestamp');
    if (pending) {
      setPendingWorkflow(true);
      pendingTimestampRef.current = parseInt(pending, 10);
      // Auto-clear skeleton after 120s as a safety net
      const timeout = setTimeout(() => {
        setPendingWorkflow(false);
        sessionStorage.removeItem('pendingWorkflowTimestamp');
        pendingTimestampRef.current = null;
      }, 120000);
      return () => clearTimeout(timeout);
    }
  }, []);

  // Detect new workflow arrival by checking if any workflow was created after the pending timestamp
  useEffect(() => {
    if (pendingWorkflow && workflows && pendingTimestampRef.current !== null) {
      const hasNewWorkflow = workflows.some(
        (w) => new Date(w.createdAt).getTime() >= pendingTimestampRef.current!,
      );
      if (hasNewWorkflow) {
        setPendingWorkflow(false);
        sessionStorage.removeItem('pendingWorkflowTimestamp');
        pendingTimestampRef.current = null;
      }
    }
  }, [pendingWorkflow, workflows]);

  // Poll more frequently when waiting for a new workflow
  useEffect(() => {
    if (!pendingWorkflow) return;
    const interval = setInterval(() => refetch(), 2000);
    return () => clearInterval(interval);
  }, [pendingWorkflow, refetch]);

  const getWorkflowStatus = (workflowId: string): WorkflowExecutionState => {
    return executionStatuses?.[workflowId] || { status: 'idle', currentStep: 0, totalSteps: 0 };
  };

  // Clean up justStartedWorkflows when execution status confirms running with sessionId
  // or when workflow stops/completes/fails
  useEffect(() => {
    if (justStartedWorkflows.size === 0 || !executionStatuses) return;

    const toRemove: string[] = [];
    justStartedWorkflows.forEach((workflowId) => {
      const state = executionStatuses[workflowId];
      if (!state) return;

      // Clear if workflow has sessionId (browser is ready)
      if (state.status === 'running' && state.sessionId) {
        toRemove.push(workflowId);
      }
      // Clear if workflow stopped/completed/failed
      if (state.status === 'completed' || state.status === 'failed' || state.status === 'stopped') {
        toRemove.push(workflowId);
      }
    });

    if (toRemove.length > 0) {
      setJustStartedWorkflows((prev) => {
        const next = new Set(prev);
        toRemove.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [executionStatuses, justStartedWorkflows]);

  const handleStartClick = (e: React.MouseEvent, workflowId: string) => {
    e.stopPropagation();
    setHoveredStartWorkflowId(null);

    // Check if workflow has inputs that need to be filled
    const workflow = workflows?.find((w) => w.id === workflowId);
    if (workflow?.inputs && workflow.inputs.length > 0) {
      setInputsModalState({
        workflowId,
        workflowTitle: workflow.title,
        inputs: workflow.inputs,
      });
      return;
    }

    // Track workflow started event
    posthog.capture('workflow_started', {
      workflowId,
      workflowTitle: workflow?.title,
      hasInputs: false,
      trigger: 'manual',
    });

    setJustStartedWorkflows((prev) => new Set(prev).add(workflowId));
    startExecution.mutate({ workflowId });
  };

  const handleInputsSubmit = (inputValues: Record<string, string>) => {
    if (!inputsModalState) return;
    const { workflowId, workflowTitle } = inputsModalState;

    // Track workflow started event with inputs
    posthog.capture('workflow_started', {
      workflowId,
      workflowTitle,
      hasInputs: true,
      inputCount: Object.keys(inputValues).length,
      trigger: 'manual',
    });

    setJustStartedWorkflows((prev) => new Set(prev).add(workflowId));
    startExecution.mutate(
      { workflowId, inputValues },
      {
        onSettled: () => {
          setInputsModalState(null);
        },
      },
    );
  };

  const handleStopClick = (e: React.MouseEvent, workflowId: string) => {
    e.stopPropagation();
    stopExecution.mutate(workflowId);
  };

  const handleEmailToStartClick = (
    e: React.MouseEvent,
    workflowId: string,
    workflowTitle: string,
  ) => {
    e.stopPropagation();
    setHoveredStartWorkflowId(null);
    if (emailCopiedTimeoutRef.current) {
      window.clearTimeout(emailCopiedTimeoutRef.current);
      emailCopiedTimeoutRef.current = null;
    }
    setIsEmailCopied(false);
    setEmailModalState({
      workflowId,
      workflowTitle,
      email: null,
      error: null,
    });

    workflowTriggerEmail.mutate(workflowId, {
      onSuccess: (data, requestedWorkflowId) => {
        setEmailModalState((prev) => {
          if (!prev || prev.workflowId !== requestedWorkflowId) {
            return prev;
          }
          return { ...prev, email: data.email, error: null };
        });
      },
      onError: (_, requestedWorkflowId) => {
        setEmailModalState((prev) => {
          if (!prev || prev.workflowId !== requestedWorkflowId) {
            return prev;
          }
          return { ...prev, error: 'Unable to load trigger email right now.' };
        });
      },
    });
  };

  const handleCreateScheduleClick = (
    e: React.MouseEvent,
    workflowId: string,
    workflowTitle: string,
    hasExistingSchedule: boolean,
  ) => {
    e.stopPropagation();
    setHoveredStartWorkflowId(null);
    const workflow = workflows?.find((w) => w.id === workflowId);
    if (workflow?.inputs && workflow.inputs.length > 0) {
      return;
    }
    setScheduleModalState({
      workflowId,
      workflowTitle,
      hasExistingSchedule,
    });
  };

  const handleDownloadOutputClick = async (
    e: React.MouseEvent,
    workflowId: string,
    workflowTitle: string,
    runId: string,
  ) => {
    e.stopPropagation();
    if (downloadingRunId === runId) return;

    setDownloadingRunId(runId);
    try {
      const result = await workflowRunOutput.mutateAsync({ workflowId, runId });
      const content = result.output;
      if (!content?.trim()) {
        return;
      }

      const safeTitle = sanitizeFileName(workflowTitle || 'workflow-output');
      await downloadWorkflowOutput({
        content,
        outputExtension: result.outputExtension,
        fileNameBase: `${safeTitle || 'workflow-output'}-${runId}`,
      });
    } catch (error) {
      console.error('[WORKFLOWS] Failed to download workflow output', error);
    } finally {
      setDownloadingRunId((current) => (current === runId ? null : current));
    }
  };

  const closeEmailModal = () => {
    if (emailCopiedTimeoutRef.current) {
      window.clearTimeout(emailCopiedTimeoutRef.current);
      emailCopiedTimeoutRef.current = null;
    }
    setIsEmailCopied(false);
    setEmailModalState(null);
  };

  const handleCopyTriggerEmail = async () => {
    const email = emailModalState?.email;
    if (!email || workflowTriggerEmail.isPending || emailModalState?.error) {
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      setIsEmailCopied(true);

      if (emailCopiedTimeoutRef.current) {
        window.clearTimeout(emailCopiedTimeoutRef.current);
      }
      emailCopiedTimeoutRef.current = window.setTimeout(() => {
        setIsEmailCopied(false);
        emailCopiedTimeoutRef.current = null;
      }, 1500);
    } catch (error) {
      console.error('[WORKFLOWS] Failed to copy trigger email', error);
    }
  };

  if (!isLoaded || isLoading) {
    return (
      <VStack minH="100vh" bg="app.bg" color="app.snow" align="center" justify="center">
        <Spinner size="lg" color="app.primary" />
      </VStack>
    );
  }

  if (!isSignedIn && clerkEnabled) {
    redirectToSignIn({ redirectUrl: '/' });
    return null;
  }

  const hasWorkflows = !isLoading && workflows && workflows.length > 0;

  return (
    <>
      <Navbar />

      <Box display="flex" flexDir="column" alignItems="center" gap={4} bg="app.bg" color="app.snow">
        <Box w="full" maxW="3xl" mt={18}>
          <Box display="flex" justifyContent="space-between" alignItems="end" mb={4}>
            <Text fontSize="3xl" fontWeight="bold">
              Your Workflows
            </Text>

            <Button
              onClick={() => router.push('/record')}
              gap={2}
              bg="app.primary"
              color="app.onPrimary"
              border="1px solid"
              borderColor="app.primary"
              _hover={{ bg: 'app.primaryAlt', borderColor: 'app.primaryAlt' }}
            >
              <LuPlus size={16} /> New Workflow
            </Button>
          </Box>

          {!hasWorkflows && !pendingWorkflow && (
            <Box maxW="4xl" mx="auto" p={8}>
              <VStack gap={4}>
                <Text color="app.muted" textAlign="center" fontSize="lg">
                  No workflows yet. Start by creating one.
                </Text>
              </VStack>
            </Box>
          )}

          {(hasWorkflows || pendingWorkflow) && (
            <VStack gap={4} w="full" align="stretch">
              {pendingWorkflow && (
                <Card.Root
                  bg="app.bgAlt"
                  borderWidth="1px"
                  borderColor="app.border"
                  borderRadius="sm"
                  overflow="hidden"
                >
                  <Card.Body p={6}>
                    <Flex justify="space-between" align="flex-start">
                      <VStack align="stretch" gap={3} flex={1}>
                        <Skeleton height="28px" width="60%" borderRadius="md" />
                        <Skeleton height="14px" width="40%" borderRadius="md" />
                        <Skeleton height="24px" width="80px" borderRadius="md" />
                      </VStack>
                      <Skeleton height="32px" width="64px" borderRadius="md" />
                    </Flex>
                  </Card.Body>
                </Card.Root>
              )}
              {workflows?.map((workflow) => {
                const executionState = getWorkflowStatus(workflow.id);
                const latestRun = workflowRuns?.[workflow.id] ?? null;
                // Prefer real-time execution state over latestRun (which may be stale)
                // If executionState is idle but latestRun says "running", the run was orphaned
                // (e.g., server restarted), so treat it as idle
                const status =
                  executionState.status !== 'idle'
                    ? executionState.status
                    : latestRun?.status === 'running'
                      ? 'idle'
                      : (latestRun?.status ?? 'idle');
                const wasJustStarted = justStartedWorkflows.has(workflow.id);
                const isRunning = status === 'running' || wasJustStarted;
                const isCompleted = status === 'completed';
                const isFailed = status === 'failed';
                const isStopped = status === 'stopped';
                const canDownloadOutput =
                  isCompleted && Boolean(latestRun?.id && latestRun?.hasOutput);
                const isDownloadingOutput = downloadingRunId === latestRun?.id;
                const hasWorkflowInputs = Boolean(workflow.inputs && workflow.inputs.length > 0);

                return (
                  <Card.Root
                    key={workflow.id}
                    onClick={() => router.push(`/workflow/${workflow.id}`)}
                    position="relative"
                    zIndex={hoveredStartWorkflowId === workflow.id ? 30 : 1}
                    cursor="pointer"
                    bg="app.bgAlt"
                    borderWidth="1px"
                    borderColor="app.border"
                    borderRadius="sm"
                    overflow="visible"
                    transition="all 0.2s"
                    _hover={{
                      transform: 'translateY(-2px)',
                      borderColor: 'app.primaryAlt',
                      zIndex: 20,
                    }}
                  >
                    <Card.Body p={6}>
                      <Flex justify="space-between" align="flex-start">
                        <VStack align="stretch" gap={3} flex={1}>
                          <Heading size="lg" fontWeight="semibold" color="app.snow">
                            {workflow.title}
                          </Heading>
                          <Text fontSize="xs" color="app.muted">
                            Created on: {new Date(workflow.createdAt).toLocaleDateString()}
                          </Text>

                          <HStack gap={2}>
                            <Badge
                              colorPalette={
                                isRunning
                                  ? 'green'
                                  : isCompleted
                                    ? 'blue'
                                    : isFailed
                                      ? 'red'
                                      : isStopped
                                        ? 'orange'
                                        : 'gray'
                              }
                              size="lg"
                              px={3}
                              py={1}
                            >
                              {isRunning
                                ? 'Running'
                                : isCompleted
                                  ? 'Completed'
                                  : isFailed
                                    ? 'Failed'
                                    : isStopped
                                      ? 'Stopped'
                                      : 'Idle'}
                            </Badge>
                            {canDownloadOutput && latestRun?.id && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={(e) =>
                                  handleDownloadOutputClick(
                                    e,
                                    workflow.id,
                                    workflow.title,
                                    latestRun.id,
                                  )
                                }
                                loading={isDownloadingOutput}
                              >
                                Download output
                              </Button>
                            )}
                          </HStack>
                        </VStack>
                        <HStack gap={3} align="center">
                          {isRunning ? (
                            <>
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/workflow/${workflow.id}/watch`);
                                }}
                              >
                                Watch live
                              </Button>
                              <Button
                                size="sm"
                                colorPalette="red"
                                variant="outline"
                                onClick={(e) => handleStopClick(e, workflow.id)}
                                loading={stopExecution.isPending}
                              >
                                Stop
                              </Button>
                            </>
                          ) : (
                            <Box
                              position="relative"
                              onMouseEnter={() => setHoveredStartWorkflowId(workflow.id)}
                              onMouseLeave={() =>
                                setHoveredStartWorkflowId((prev) =>
                                  prev === workflow.id ? null : prev,
                                )
                              }
                            >
                              <Button
                                size="sm"
                                bg="app.primary"
                                color="app.onPrimary"
                                _hover={{ bg: 'app.primaryAlt' }}
                                onClick={(e) => handleStartClick(e, workflow.id)}
                              >
                                Start
                              </Button>

                              {hoveredStartWorkflowId === workflow.id && (
                                <Box
                                  position="absolute"
                                  right={0}
                                  top="calc(100% + 2px)"
                                  minW="170px"
                                  bg="app.bgAlt"
                                  borderWidth="1px"
                                  borderColor="app.border"
                                  borderRadius="sm"
                                  p={2}
                                  zIndex={20}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <VStack gap={1} align="stretch">
                                    <Button
                                      variant="ghost"
                                      color="app.snow"
                                      _hover={{ bg: 'appSurface' }}
                                      justifyContent="flex-start"
                                      size="sm"
                                      onClick={(e) => handleStartClick(e, workflow.id)}
                                    >
                                      Start Now
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      color="app.snow"
                                      _hover={{ bg: 'appSurface' }}
                                      justifyContent="flex-start"
                                      size="sm"
                                      onClick={(e) =>
                                        handleEmailToStartClick(e, workflow.id, workflow.title)
                                      }
                                    >
                                      Email To Start
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      color="app.snow"
                                      _hover={{ bg: 'appSurface' }}
                                      justifyContent="flex-start"
                                      size="sm"
                                      disabled={hasWorkflowInputs}
                                      title={
                                        hasWorkflowInputs
                                          ? 'Scheduling is unavailable for workflows with inputs.'
                                          : undefined
                                      }
                                      onClick={(e) =>
                                        handleCreateScheduleClick(
                                          e,
                                          workflow.id,
                                          workflow.title,
                                          Boolean(workflow.hasSchedule),
                                        )
                                      }
                                    >
                                      {hasWorkflowInputs
                                        ? 'Schedule Unavailable'
                                        : workflow.hasSchedule
                                          ? 'Update Schedule'
                                          : 'Create Schedule'}
                                    </Button>
                                  </VStack>
                                </Box>
                              )}
                            </Box>
                          )}
                        </HStack>
                      </Flex>
                    </Card.Body>
                  </Card.Root>
                );
              })}
            </VStack>
          )}
        </Box>
      </Box>

      <AppModal
        isOpen={!!emailModalState}
        onClose={closeEmailModal}
        title="Email To Start"
        size="xl"
        footer={
          <Button
            size="sm"
            variant="outline"
            borderColor="app.border"
            color="app.snow"
            _hover={{ bg: 'appSurface', borderColor: 'app.border' }}
            onClick={closeEmailModal}
          >
            Close
          </Button>
        }
      >
        <VStack align="stretch" gap={4}>
          <Text color="app.muted" fontSize="sm">
            Send an email to this address to trigger{' '}
            <Text as="span" fontWeight="semibold" color="app.snow">
              {emailModalState?.workflowTitle ?? 'this workflow'}
            </Text>
            .
          </Text>

          <Box position="relative">
            <Box
              borderWidth="1px"
              borderColor="app.border"
              pl={3}
              pr={20}
              py={2}
              bg="app.bg"
              fontFamily="mono"
              fontSize="sm"
              color={emailModalState?.error ? 'red.300' : 'app.snow'}
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
              title={emailModalState?.email ?? undefined}
            >
              {workflowTriggerEmail.isPending
                ? 'Loading email address...'
                : emailModalState?.error
                  ? emailModalState.error
                  : (emailModalState?.email ?? 'Email unavailable')}
            </Box>
            <Button
              size="xs"
              variant="ghost"
              color="app.snow"
              _hover={{ bg: 'appSurface' }}
              position="absolute"
              top="50%"
              right={2}
              transform="translateY(-50%)"
              onClick={handleCopyTriggerEmail}
              disabled={
                workflowTriggerEmail.isPending ||
                Boolean(emailModalState?.error || !emailModalState?.email)
              }
              aria-label={isEmailCopied ? 'Email copied' : 'Copy email'}
            >
              {isEmailCopied ? (
                <>
                  <LuCheck />
                  Copied
                </>
              ) : (
                <>
                  <LuCopy />
                  Copy
                </>
              )}
            </Button>
          </Box>

          <VStack align="stretch" gap={1}>
            <Text fontSize="sm" color="app.muted">
              1. Send from the same email address as your account.
            </Text>
            <Text fontSize="sm" color="app.muted">
              2. Subject and body are optional.
            </Text>
            <Text fontSize="sm" color="app.muted">
              3. Each email starts one workflow run.
            </Text>
          </VStack>
        </VStack>
      </AppModal>

      <WorkflowScheduleModal
        isOpen={!!scheduleModalState}
        workflowId={scheduleModalState?.workflowId ?? null}
        workflowTitle={scheduleModalState?.workflowTitle ?? null}
        hasExistingSchedule={scheduleModalState?.hasExistingSchedule ?? false}
        onClose={() => setScheduleModalState(null)}
      />

      <WorkflowInputsModal
        isOpen={!!inputsModalState}
        onClose={() => setInputsModalState(null)}
        workflowTitle={inputsModalState?.workflowTitle ?? ''}
        inputs={inputsModalState?.inputs ?? []}
        onSubmit={handleInputsSubmit}
        isSubmitting={startExecution.isPending}
      />
    </>
  );
}
