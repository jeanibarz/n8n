import { createEvalAgent, extractText } from '../../../src/utils/eval-agents';
import type { BinaryCheck, BinaryCheckContext } from '../types';
import type { WorkflowResponse } from '../../clients/n8n-client';

const DEFAULT_TIMEOUT_MS = 30_000;

const REASONING_FIRST_SUFFIX = `

IMPORTANT: Write your full reasoning FIRST. Only AFTER completing your analysis, decide on pass or fail based on what you wrote. Do not decide pass/fail before reasoning.

Respond with a JSON object (inside a markdown code fence) with exactly two fields:
- "reasoning": your step-by-step analysis
- "pass": true or false`;

interface LlmCheckOptions {
	name: string;
	description: string;
	systemPrompt: string;
	humanTemplate: string;
}

/**
 * Parse a `{ reasoning: string, pass: boolean }` object from LLM text output.
 * Tries fenced JSON first, then raw JSON extraction.
 */
function parseJudgeResult(text: string): { reasoning: string; pass: boolean } | undefined {
	const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
	const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

	try {
		const parsed: unknown = JSON.parse(jsonStr);
		if (isJudgeResult(parsed)) return parsed;
	} catch {
		// Try finding JSON object anywhere in text
		const objectMatch = text.match(/\{[\s\S]*\}/);
		if (objectMatch) {
			try {
				const parsed: unknown = JSON.parse(objectMatch[0]);
				if (isJudgeResult(parsed)) return parsed;
			} catch {
				// fall through
			}
		}
	}

	return undefined;
}

function isJudgeResult(value: unknown): value is { reasoning: string; pass: boolean } {
	if (typeof value !== 'object' || value === null) return false;
	if (!('pass' in value) || !('reasoning' in value)) return false;
	return typeof value.pass === 'boolean' && typeof value.reasoning === 'string';
}

export function createLlmCheck(options: LlmCheckOptions): BinaryCheck {
	const systemPrompt = options.systemPrompt + REASONING_FIRST_SUFFIX;

	return {
		name: options.name,
		description: options.description,
		kind: 'llm',
		async run(workflow: WorkflowResponse, ctx: BinaryCheckContext) {
			if (!ctx.modelId) {
				return { pass: true, comment: 'Skipped: no modelId in context' };
			}

			const userMessage = options.humanTemplate
				.replace('{userPrompt}', ctx.prompt)
				.replace('{generatedWorkflow}', JSON.stringify(workflow, null, 2));

			const agent = createEvalAgent(`eval-binary-${options.name}`, {
				model: ctx.modelId,
				instructions: systemPrompt,
				cache: true,
			});

			const timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS;

			const resultPromise = agent.generate(userMessage, {
				providerOptions: { anthropic: { maxTokens: 4_096 } },
			});

			let timeoutId: ReturnType<typeof setTimeout>;

			const result = await Promise.race([
				resultPromise,
				new Promise<never>((_, reject) => {
					timeoutId = setTimeout(
						() =>
							reject(
								new Error(`LLM check "${options.name}" timed out after ${String(timeoutMs)}ms`),
							),
						timeoutMs,
					);
				}),
			]).finally(() => {
				clearTimeout(timeoutId);
			});

			const text = extractText(result);
			const parsed = parseJudgeResult(text);

			if (!parsed) {
				return {
					pass: false,
					comment: `Failed to parse LLM response. Raw (first 500 chars): ${text.slice(0, 500)}`,
				};
			}

			return { pass: parsed.pass, comment: parsed.reasoning };
		},
	};
}
