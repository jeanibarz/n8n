// ---------------------------------------------------------------------------
// Binary check types for instance-ai workflow evaluation
//
// Binary checks are deterministic pass/fail assertions on a built workflow.
// They run without LLM calls and produce a Feedback item with score 0 or 1.
// ---------------------------------------------------------------------------

import type { WorkflowResponse } from '../clients/n8n-client';

/**
 * Result of a single binary check.
 */
export interface BinaryCheckResult {
	pass: boolean;
	comment?: string;
}

/**
 * Context available to every binary check.
 *
 * Kept intentionally lean — checks should be fast and deterministic.
 * Add fields here only when a check genuinely needs external context.
 */
export interface BinaryCheckContext {
	/** The original user prompt that triggered the build */
	prompt: string;
}

/**
 * A single deterministic check that inspects a workflow and returns pass/fail.
 */
export interface BinaryCheck {
	/** Unique identifier used as the Feedback metric name */
	name: string;
	/** Human-readable description for reports */
	description: string;
	run(workflow: WorkflowResponse, ctx: BinaryCheckContext): BinaryCheckResult;
}
