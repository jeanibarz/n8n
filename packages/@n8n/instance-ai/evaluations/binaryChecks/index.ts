// ---------------------------------------------------------------------------
// Binary checks evaluator for instance-ai
//
// Runs all registered deterministic checks against a built workflow and
// returns Feedback[] compatible with the existing harness.
// ---------------------------------------------------------------------------

import type { Feedback } from '../types';
import type { WorkflowResponse } from '../clients/n8n-client';
import { CHECKS } from './checks/index';
import type { BinaryCheck, BinaryCheckContext } from './types';

const EVALUATOR_NAME = 'binary-checks';

export interface BinaryChecksOptions {
	/** Run only the checks whose names appear in this list. Runs all if omitted. */
	only?: string[];
}

/**
 * Run binary checks against a workflow and return Feedback items.
 *
 * Each check produces one Feedback with score 0 (fail) or 1 (pass).
 * An overall score (pass rate) is emitted with kind 'score'.
 */
export function runBinaryChecks(
	workflow: WorkflowResponse,
	ctx: BinaryCheckContext,
	options?: BinaryChecksOptions,
): Feedback[] {
	const selected = resolveChecks(options?.only);

	const feedback: Feedback[] = selected.map((check) => {
		try {
			const result = check.run(workflow, ctx);
			return {
				evaluator: EVALUATOR_NAME,
				metric: check.name,
				score: result.pass ? 1 : 0,
				kind: 'metric' as const,
				...(result.comment ? { comment: result.comment } : {}),
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				evaluator: EVALUATOR_NAME,
				metric: check.name,
				score: 0,
				kind: 'metric' as const,
				comment: `Error: ${message}`,
			};
		}
	});

	// Overall pass rate as the evaluator-level score
	const passCount = feedback.filter((f) => f.score === 1).length;
	const passRate = feedback.length > 0 ? passCount / feedback.length : 0;

	feedback.push({
		evaluator: EVALUATOR_NAME,
		metric: 'pass_rate',
		score: passRate,
		kind: 'score',
		comment: `${String(passCount)}/${String(feedback.length - 1)} checks passed`,
	});

	return feedback;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveChecks(only?: string[]): BinaryCheck[] {
	if (!only || only.length === 0) return CHECKS;

	const validNames = new Set(CHECKS.map((c) => c.name));
	const unknown = only.filter((name) => !validNames.has(name));
	if (unknown.length > 0) {
		const available = Array.from(validNames).join(', ');
		throw new Error(`Unknown binary check(s): ${unknown.join(', ')}. Available: ${available}`);
	}

	return CHECKS.filter((c) => only.includes(c.name));
}
