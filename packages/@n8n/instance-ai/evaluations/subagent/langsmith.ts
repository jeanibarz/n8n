// ---------------------------------------------------------------------------
// LangSmith integration helpers for sub-agent evaluation
// ---------------------------------------------------------------------------

import type { Example, Run } from 'langsmith/schemas';

import type { Feedback, SubAgentTestCase } from './types';

// ---------------------------------------------------------------------------
// Feedback conversion
// ---------------------------------------------------------------------------

const LANGSMITH_SCORE_MAX = 99_999.9999;
const LANGSMITH_SCORE_MIN = -99_999.9999;

function clampScore(score: number): number {
	if (!Number.isFinite(score)) return 0;
	return Math.max(LANGSMITH_SCORE_MIN, Math.min(LANGSMITH_SCORE_MAX, score));
}

/**
 * Convert a Feedback item to the format LangSmith's evaluate() expects
 * from an evaluator function: { key, score, comment? }.
 */
export function toLangsmithFeedback(fb: Feedback): {
	key: string;
	score: number;
	comment?: string;
} {
	return {
		key: `${fb.evaluator}.${fb.metric}`,
		score: clampScore(fb.score),
		...(fb.comment ? { comment: fb.comment } : {}),
	};
}

// ---------------------------------------------------------------------------
// Feedback extractor (used as a LangSmith evaluator)
// ---------------------------------------------------------------------------

/**
 * Create a LangSmith evaluator that extracts pre-computed feedback from the
 * target function's outputs. The target stores feedback in `outputs.feedback`.
 *
 * Uses the destructured `{ run, outputs }` evaluator signature so the SDK
 * passes outputs directly instead of relying on the Run object's `.outputs`
 * property which may not be populated yet due to async timing in traceable.
 */
export function createFeedbackExtractor(): (args: {
	run: Run;
	example: Example;
	inputs: Record<string, unknown>;
	outputs: Record<string, unknown>;
	referenceOutputs?: Record<string, unknown>;
}) => { results: { key: string; score: number; comment?: string }[] } {
	return ({ outputs }) => {
		if (!outputs) {
			return { results: [{ key: 'error', score: 0, comment: 'No outputs from run' }] };
		}

		const feedback = outputs.feedback;
		if (!Array.isArray(feedback)) {
			return { results: [{ key: 'error', score: 0, comment: 'No feedback in outputs' }] };
		}

		return { results: (feedback as Feedback[]).map(toLangsmithFeedback) };
	};
}

// ---------------------------------------------------------------------------
// Dataset example mapping
// ---------------------------------------------------------------------------

/**
 * Map a LangSmith dataset example's inputs to a SubAgentTestCase.
 *
 * Expected inputs format:
 * {
 *   prompt: string,         // required
 *   subagent?: string,      // optional, defaults to 'builder'
 *   system_prompt?: string, // optional, overrides built-in system prompt
 *   tools?: string[],       // optional
 *   maxSteps?: number,      // optional
 * }
 */
export function mapExampleToTestCase(
	inputs: Record<string, unknown>,
	exampleId?: string,
): SubAgentTestCase {
	const prompt = inputs.prompt;
	if (typeof prompt !== 'string' || prompt.length === 0) {
		throw new Error(
			`Dataset example${exampleId ? ` (${exampleId})` : ''} missing required "prompt" field`,
		);
	}

	return {
		id: exampleId ?? `ls-${Date.now()}`,
		prompt,
		subagent: typeof inputs.subagent === 'string' ? inputs.subagent : undefined,
		systemPrompt: typeof inputs.system_prompt === 'string' ? inputs.system_prompt : undefined,
		tools: Array.isArray(inputs.tools)
			? (inputs.tools as unknown[]).filter((t): t is string => typeof t === 'string')
			: undefined,
		maxSteps: typeof inputs.maxSteps === 'number' ? inputs.maxSteps : undefined,
	};
}
