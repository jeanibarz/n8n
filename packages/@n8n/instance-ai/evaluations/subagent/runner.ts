// ---------------------------------------------------------------------------
// Isolated sub-agent runner
//
// Instantiates a builder sub-agent with a real LLM and stubbed services,
// runs it to completion, and evaluates the resulting workflow with binary checks.
// ---------------------------------------------------------------------------

import type { ToolsInput } from '@mastra/core/agent';

import { createSubAgent } from '../../src/agent/sub-agent-factory';
import { BUILDER_AGENT_PROMPT } from '../../src/tools/orchestration/build-workflow-agent.prompt';
import { createAllTools } from '../../src/tools/index';
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

// ---------------------------------------------------------------------------
// Default builder tool set (tool-mode, no sandbox)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sub-agent type definitions
// ---------------------------------------------------------------------------

interface SubAgentTypeConfig {
	/** System prompt key to load from build-workflow-agent.prompt */
	promptKey: 'BUILDER_AGENT_PROMPT';
	/** Default tools when test case doesn't specify */
	defaultTools: string[];
}

const SUBAGENT_TYPES: Record<string, SubAgentTypeConfig> = {
	builder: {
		promptKey: 'BUILDER_AGENT_PROMPT',
		defaultTools: [
			'build-workflow',
			'search-nodes',
			'get-suggested-nodes',
			'get-node-type-definition',
			'list-workflows',
			'get-workflow-as-code',
			'ask-user',
		],
	},
};

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
	const subagentType = testCase.subagent ?? 'builder';

	const typeConfig = SUBAGENT_TYPES[subagentType];
	if (!typeConfig) {
		const available = Object.keys(SUBAGENT_TYPES).join(', ');
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
					comment: `Unknown sub-agent type "${subagentType}". Available: ${available}`,
				},
			],
			durationMs: Date.now() - startMs,
			error: `Unknown sub-agent type "${subagentType}"`,
		};
	}

	const toolNames = testCase.tools ?? typeConfig.defaultTools;

	try {
		// 1. Build stubbed context and tools
		const { context, capture } = createStubContext();
		const allTools = createAllTools(context);

		const tools: ToolsInput = {};
		const allToolsRecord = allTools as Record<string, ToolsInput[string]>;
		for (const name of toolNames) {
			if (name in allToolsRecord) {
				tools[name] = allToolsRecord[name];
			}
		}

		// 2. Create the sub-agent (same factory the orchestrator uses)
		const promptMap: Record<string, string> = { BUILDER_AGENT_PROMPT };
		const instructions = testCase.systemPrompt ?? promptMap[typeConfig.promptKey];

		const agent = createSubAgent({
			agentId: `eval-${subagentType}-${testCase.id}`,
			role: subagentType,
			instructions,
			tools,
			modelId: config.modelId,
		});

		// 3. Run with timeout
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

		// 4. Evaluate captured workflows
		const feedback = await evaluateCapturedWorkflows(
			capture.workflows,
			testCase.prompt,
			config.modelId,
		);

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

async function evaluateCapturedWorkflows(
	captured: CapturedWorkflow[],
	prompt: string,
	modelId: string,
): Promise<Feedback[]> {
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
	const ctx: BinaryCheckContext = { prompt, modelId };
	const binaryFeedback = await runBinaryChecks(workflowResponse, ctx);
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
			typeVersion: n.typeVersion,
			parameters: n.parameters as Record<string, unknown> | undefined,
			disabled: (n as { disabled?: boolean }).disabled,
			credentials: n.credentials as Record<string, unknown> | undefined,
		})),
		connections: (json.connections ?? {}) as Record<string, unknown>,
	};
}
