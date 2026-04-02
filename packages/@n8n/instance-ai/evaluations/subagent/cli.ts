#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI for isolated sub-agent evaluation
//
// Runs builder sub-agents directly (no n8n instance required) and evaluates
// the resulting workflows with binary checks.
//
// Usage:
//   pnpm eval:subagent --verbose
//   pnpm eval:subagent --filter webhook --verbose
//   pnpm eval:subagent --timeout 180000
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

import { runSubAgent } from './runner';
import type { SubAgentTestCase, SubAgentRunnerConfig, SubAgentResult } from './types';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface CliArgs {
	filter?: string;
	verbose: boolean;
	timeoutMs: number;
	maxSteps: number;
	modelId: string;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		verbose: false,
		timeoutMs: 120_000,
		maxSteps: 20,
		modelId: process.env.N8N_INSTANCE_AI_EVAL_MODEL ?? 'anthropic/claude-sonnet-4-20250514',
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case '--verbose':
			case '-v':
				args.verbose = true;
				break;
			case '--filter':
				args.filter = argv[++i];
				break;
			case '--timeout':
				args.timeoutMs = Number(argv[++i]);
				break;
			case '--max-steps':
				args.maxSteps = Number(argv[++i]);
				break;
			case '--model':
				args.modelId = argv[++i];
				break;
			default:
				break;
		}
	}

	return args;
}

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------

const DATA_DIR = join(__dirname, '..', 'data', 'subagent');

function loadTestCases(filter?: string): SubAgentTestCase[] {
	let files: string[];
	try {
		files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
	} catch {
		console.error(`No test cases found in ${DATA_DIR}`);
		return [];
	}

	if (filter) {
		files = files.filter((f) => f.includes(filter));
	}

	return files.map((file) => {
		const raw = readFileSync(join(DATA_DIR, file), 'utf-8');
		const parsed = JSON.parse(raw) as {
			id?: string;
			prompt: string;
			tools?: string[];
			maxSteps?: number;
		};
		return {
			id: parsed.id ?? basename(file, '.json'),
			prompt: parsed.prompt,
			tools: parsed.tools,
			maxSteps: parsed.maxSteps,
		};
	});
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
	return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function printResult(result: SubAgentResult, verbose: boolean): void {
	const { testCase, capturedWorkflows, feedback, durationMs, error } = result;
	const secs = (durationMs / 1000).toFixed(1);

	const workflowCount = capturedWorkflows.length;
	const binaryPassRate = feedback.find(
		(f) => f.evaluator === 'binary-checks' && f.metric === 'pass_rate',
	);
	const produced = feedback.find((f) => f.metric === 'workflow_produced');

	const statusIcon = error ? '\u2717' : produced?.score === 1 ? '\u2713' : '\u25CB';
	const passRateStr = binaryPassRate ? `${(binaryPassRate.score * 100).toFixed(0)}%` : 'N/A';

	console.log(
		`${statusIcon} ${testCase.id} (${secs}s) — ${String(workflowCount)} workflow(s), binary checks: ${passRateStr}`,
	);

	if (error) {
		console.log(`  Error: ${truncate(error, 200)}`);
	}

	if (verbose) {
		// Show individual check results
		const checks = feedback.filter((f) => f.evaluator === 'binary-checks' && f.kind === 'metric');
		for (const check of checks) {
			const icon = check.score === 1 ? '  \u2713' : '  \u2717';
			const comment = check.comment ? ` — ${check.comment}` : '';
			console.log(`${icon} ${check.metric}${comment}`);
		}

		// Show workflow
		if (result.capturedWorkflows.length > 0) {
			console.log('  Workflow: ', result.capturedWorkflows[0].json);
		}

		// Show agent text (truncated)
		if (result.text) {
			console.log(`  Agent: ${truncate(result.text, 300)}`);
		}
		console.log('');
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const testCases = loadTestCases(args.filter);

	if (testCases.length === 0) {
		console.log('No test cases found.');
		return;
	}

	// Verify API key is set
	const apiKey = process.env.N8N_INSTANCE_AI_MODEL_API_KEY ?? process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		console.error('Error: Set N8N_INSTANCE_AI_MODEL_API_KEY or ANTHROPIC_API_KEY');
		process.exit(1);
	}

	const config: SubAgentRunnerConfig = {
		modelId: args.modelId,
		timeoutMs: args.timeoutMs,
		maxSteps: args.maxSteps,
		verbose: args.verbose,
	};

	console.log(
		`Running ${String(testCases.length)} sub-agent test case(s) with model ${config.modelId}\n`,
	);

	const results: SubAgentResult[] = [];

	for (const testCase of testCases) {
		if (args.verbose) {
			console.log(`Starting: ${testCase.id} — ${truncate(testCase.prompt, 80)}`);
		}

		const result = await runSubAgent(testCase, config);
		results.push(result);
		printResult(result, args.verbose);
	}

	// Summary
	const passed = results.filter((r) => !r.error && r.capturedWorkflows.length > 0).length;
	const failed = results.length - passed;

	console.log(`\n=== Summary ===`);
	console.log(
		`Total: ${String(results.length)}, Produced workflow: ${String(passed)}, Failed: ${String(failed)}`,
	);

	const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
	console.log(`Average duration: ${(avgDuration / 1000).toFixed(1)}s`);
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
