// ---------------------------------------------------------------------------
// Isolated sub-agent runner
//
// Instantiates a builder sub-agent with a real LLM and stubbed services,
// runs it to completion, and evaluates the resulting workflow with binary checks.
//
// Heavy deps (@mastra/core) are loaded via dynamic import() to avoid
// ESM resolution issues with tsx at the top level.
// ---------------------------------------------------------------------------

import type { ToolsInput } from '@mastra/core/agent';

import { runBinaryChecks } from '../binaryChecks/index';
import type { BinaryCheckContext } from '../binaryChecks/types';
import type { WorkflowResponse } from '../clients/n8n-client';
import { createStubContext } from './stub-context';
import type {
	Feedback,
	SubAgentTestCase,
	SubAgentResult,
	SubAgentRunnerConfig,
	CapturedWorkflow,
} from './types';

/**
 * Load modules that pull in @mastra/core.
 *
 * At runtime, mastra is preloaded via preload-mastra.cjs so CJS require()
 * resolves correctly. We use require() here to avoid tsx/ESM resolution issues.
 */
function loadAgentDeps() {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { createSubAgent } =
		require('../../src/agent/sub-agent-factory') as typeof import('../../src/agent/sub-agent-factory');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { BUILDER_AGENT_PROMPT } =
		require('../../src/tools/orchestration/build-workflow-agent.prompt') as typeof import('../../src/tools/orchestration/build-workflow-agent.prompt');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { createAllTools } =
		require('../../src/tools/index') as typeof import('../../src/tools/index');
	return { createSubAgent, BUILDER_AGENT_PROMPT, createAllTools };
}

// ---------------------------------------------------------------------------
// Default builder tool set (tool-mode, no sandbox)
// ---------------------------------------------------------------------------

const DEFAULT_BUILDER_TOOLS = [
	'build-workflow',
	'search-nodes',
	'get-suggested-nodes',
	'get-node-type-definition',
	'list-workflows',
	'get-workflow-as-code',
	'ask-user',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a single sub-agent test case in isolation.
 *
 * Creates a builder sub-agent with the real LLM and stubbed n8n services,
 * streams it to completion, then evaluates captured workflows with binary checks.
 */
export async function runSubAgent(
	testCase: SubAgentTestCase,
	config: SubAgentRunnerConfig,
): Promise<SubAgentResult> {
	const startMs = Date.now();
	const maxSteps = testCase.maxSteps ?? config.maxSteps ?? 20;
	const timeoutMs = config.timeoutMs ?? 120_000;
	const toolNames = testCase.tools ?? DEFAULT_BUILDER_TOOLS;

	try {
		// 1. Load mastra-dependent modules (preloaded via preload-mastra.cjs)
		const { createSubAgent, BUILDER_AGENT_PROMPT, createAllTools } = loadAgentDeps();

		// 2. Build stubbed context and tools
		const { context, capture } = createStubContext();
		const allTools = createAllTools(context);

		const tools: ToolsInput = {};
		const allToolsRecord = allTools as Record<string, ToolsInput[string]>;
		for (const name of toolNames) {
			if (name in allToolsRecord) {
				tools[name] = allToolsRecord[name];
			}
		}

		// 3. Create the sub-agent (same factory the orchestrator uses)
		const agent = createSubAgent({
			agentId: `eval-builder-${testCase.id}`,
			role: 'workflow-builder',
			instructions: BUILDER_AGENT_PROMPT,
			tools,
			modelId: config.modelId,
		});

		// 4. Run with timeout
		const abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			abortController.abort(new Error(`Sub-agent timed out after ${String(timeoutMs)}ms`));
		}, timeoutMs);

		let text: string;
		try {
			const stream = await agent.stream(testCase.prompt, {
				maxSteps,
				abortSignal: abortController.signal,
			});
			text = await stream.text;
		} finally {
			clearTimeout(timeoutId);
		}

		// 5. Evaluate captured workflows
		const feedback = evaluateCapturedWorkflows(capture.workflows, testCase.prompt);

		return {
			testCase,
			text,
			capturedWorkflows: capture.workflows,
			feedback,
			durationMs: Date.now() - startMs,
		};
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			testCase,
			text: '',
			capturedWorkflows: [],
			feedback: [
				{
					evaluator: 'subagent-runner',
					metric: 'run_error',
					score: 0,
					kind: 'score',
					comment: message,
				},
			],
			durationMs: Date.now() - startMs,
			error: message,
		};
	}
}

// ---------------------------------------------------------------------------
// Internal: evaluate captured workflows
// ---------------------------------------------------------------------------

function evaluateCapturedWorkflows(captured: CapturedWorkflow[], prompt: string): Feedback[] {
	const feedback: Feedback[] = [];

	// Did the agent produce any workflow?
	feedback.push({
		evaluator: 'subagent-runner',
		metric: 'workflow_produced',
		score: captured.length > 0 ? 1 : 0,
		kind: 'score',
		comment:
			captured.length > 0
				? `${String(captured.length)} workflow(s) produced`
				: 'Agent did not produce any workflow',
	});

	if (captured.length === 0) return feedback;

	// Run binary checks on the last captured workflow (final version)
	const last = captured[captured.length - 1];
	const workflowResponse = toWorkflowResponse(last);
	const ctx: BinaryCheckContext = { prompt };
	const binaryFeedback = runBinaryChecks(workflowResponse, ctx);
	feedback.push(...binaryFeedback);

	return feedback;
}

/**
 * Convert a CapturedWorkflow (WorkflowJSON from SDK) to a WorkflowResponse
 * (the shape our binary checks expect).
 */
function toWorkflowResponse(captured: CapturedWorkflow): WorkflowResponse {
	const json = captured.json;
	return {
		id: 'eval-wf',
		name: json.name ?? 'Unnamed',
		active: false,
		nodes: (json.nodes ?? []).map((n) => ({
			name: n.name ?? '',
			type: n.type,
			parameters: n.parameters as Record<string, unknown> | undefined,
			disabled: (n as { disabled?: boolean }).disabled,
			credentials: n.credentials as Record<string, unknown> | undefined,
		})),
		connections: (json.connections ?? {}) as Record<string, unknown>,
	};
}
