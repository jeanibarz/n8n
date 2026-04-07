# Port Binary Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `expressions_reference_existing_nodes` (deterministic) and `fulfills_user_request` (LLM) checks from ai-workflow-builder.ee to instance-ai, adding async + LLM support to the binary checks infrastructure.

**Architecture:** Extend the existing `BinaryCheck` interface to support async `run()` and a `kind` discriminator. LLM checks use `createEvalAgent` from `src/utils/eval-agents.ts` (existing `@n8n/agents` pattern) with JSON text parsing — no new dependencies.

**Tech Stack:** TypeScript, `@n8n/agents` (Agent class), existing eval-agent utilities.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `evaluations/binaryChecks/types.ts` | Modify | Add `kind`, make `run` async, extend context |
| `evaluations/binaryChecks/checks/has-nodes.ts` | Modify | Add `kind: 'deterministic'` |
| `evaluations/binaryChecks/checks/has-trigger.ts` | Modify | Add `kind: 'deterministic'` |
| `evaluations/binaryChecks/checks/all-nodes-connected.ts` | Modify | Add `kind: 'deterministic'` |
| `evaluations/binaryChecks/checks/no-empty-set-nodes.ts` | Modify | Add `kind: 'deterministic'` |
| `evaluations/binaryChecks/checks/no-disabled-nodes.ts` | Modify | Add `kind: 'deterministic'` |
| `evaluations/binaryChecks/checks/expressions-reference-existing-nodes.ts` | Create | Deterministic check: expressions reference existing nodes |
| `evaluations/binaryChecks/checks/create-llm-check.ts` | Create | Factory for LLM-based binary checks |
| `evaluations/binaryChecks/checks/fulfills-user-request.ts` | Create | LLM check: workflow fulfills user request |
| `evaluations/binaryChecks/checks/index.ts` | Modify | Register new checks, export LLM_CHECKS |
| `evaluations/binaryChecks/index.ts` | Modify | Make runner async, merge check registries |
| `evaluations/subagent/runner.ts` | Modify | Pass modelId to context, await runBinaryChecks |

---

### Task 1: Update types to support async + LLM checks

**Files:**
- Modify: `evaluations/binaryChecks/types.ts`

- [ ] **Step 1: Update the types file**

Replace the full contents of `evaluations/binaryChecks/types.ts` with:

```ts
// ---------------------------------------------------------------------------
// Binary check types for instance-ai workflow evaluation
//
// Binary checks are pass/fail assertions on a built workflow.
// Deterministic checks run without LLM calls; LLM checks call an eval agent.
// Each produces a Feedback item with score 0 or 1.
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
 * Deterministic checks only need `prompt`. LLM checks additionally need
 * `modelId` to create an eval agent. Add fields here only when a check
 * genuinely needs external context.
 */
export interface BinaryCheckContext {
	/** The original user prompt that triggered the build */
	prompt: string;
	/** Anthropic model ID for LLM checks (e.g. 'anthropic/claude-sonnet-4-6'). LLM checks are skipped when absent. */
	modelId?: string;
	/** Timeout in ms for LLM checks. Defaults to 30_000. */
	timeoutMs?: number;
}

/**
 * A single check that inspects a workflow and returns pass/fail.
 */
export interface BinaryCheck {
	/** Unique identifier used as the Feedback metric name */
	name: string;
	/** Human-readable description for reports */
	description: string;
	/** Whether this check requires an LLM call */
	kind: 'deterministic' | 'llm';
	run(workflow: WorkflowResponse, ctx: BinaryCheckContext): Promise<BinaryCheckResult>;
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/ben/Projects/n8n/master/packages/@n8n/instance-ai && npx tsc --noEmit --pretty 2>&1 | tail -30`

Expected: Type errors in existing check files (they don't have `kind` yet and `run` is sync). That's expected — we fix them in Task 2.

- [ ] **Step 3: Commit**

```bash
git add evaluations/binaryChecks/types.ts
git commit -m "feat(instance-ai): extend BinaryCheck types for async + LLM support"
```

---

### Task 2: Add `kind` field to all existing checks

**Files:**
- Modify: `evaluations/binaryChecks/checks/has-nodes.ts`
- Modify: `evaluations/binaryChecks/checks/has-trigger.ts`
- Modify: `evaluations/binaryChecks/checks/all-nodes-connected.ts`
- Modify: `evaluations/binaryChecks/checks/no-empty-set-nodes.ts`
- Modify: `evaluations/binaryChecks/checks/no-disabled-nodes.ts`

Each existing check needs two changes: add `kind: 'deterministic'` and make `run` async.

- [ ] **Step 1: Update `has-nodes.ts`**

```ts
import type { BinaryCheck } from '../types';

export const hasNodes: BinaryCheck = {
	name: 'has_nodes',
	description: 'Workflow contains at least one node',
	kind: 'deterministic',
	async run(workflow) {
		const count = (workflow.nodes ?? []).length;
		return {
			pass: count > 0,
			...(count === 0 ? { comment: 'Workflow has no nodes' } : {}),
		};
	},
};
```

- [ ] **Step 2: Update `has-trigger.ts`**

Add `kind: 'deterministic'` after the `description` line and change `run(workflow)` to `async run(workflow)`. The rest stays the same.

- [ ] **Step 3: Update `all-nodes-connected.ts`**

Add `kind: 'deterministic'` after the `description` line and change `run(workflow: WorkflowResponse)` to `async run(workflow: WorkflowResponse)`. The rest stays the same.

- [ ] **Step 4: Update `no-empty-set-nodes.ts`**

Add `kind: 'deterministic'` after the `description` line and change `run(workflow)` to `async run(workflow)`. The rest stays the same.

- [ ] **Step 5: Update `no-disabled-nodes.ts`**

Add `kind: 'deterministic'` after the `description` line and change `run(workflow)` to `async run(workflow)`. The rest stays the same.

- [ ] **Step 6: Verify types compile**

Run: `cd /Users/ben/Projects/n8n/master/packages/@n8n/instance-ai && npx tsc --noEmit --pretty 2>&1 | tail -30`

Expected: Errors in `index.ts` because `runBinaryChecks` still calls `check.run()` synchronously. That's expected — fixed in Task 5.

- [ ] **Step 7: Commit**

```bash
git add evaluations/binaryChecks/checks/has-nodes.ts evaluations/binaryChecks/checks/has-trigger.ts evaluations/binaryChecks/checks/all-nodes-connected.ts evaluations/binaryChecks/checks/no-empty-set-nodes.ts evaluations/binaryChecks/checks/no-disabled-nodes.ts
git commit -m "feat(instance-ai): add kind field and async run to existing binary checks"
```

---

### Task 3: Create `expressions_reference_existing_nodes` check

**Files:**
- Create: `evaluations/binaryChecks/checks/expressions-reference-existing-nodes.ts`

- [ ] **Step 1: Create the check file**

Create `evaluations/binaryChecks/checks/expressions-reference-existing-nodes.ts`:

```ts
import type { BinaryCheck } from '../types';

/**
 * Regex patterns to extract node names from n8n expression syntaxes.
 *
 * Quoted patterns capture at group index 2; dot-notation captures at group index 1.
 */
const QUOTED_NODE_REFS: RegExp[] = [
	/\$\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g, // $('Node Name')
	/\$node\[\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\]/g, // $node["Node Name"]
	/\$items\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*[,)]/g, // $items("Node Name") or $items("Node Name", 0)
];

/** Legacy dot-notation: $node.NodeName.json... — name is a JS identifier after $node. */
const DOT_NODE_REF = /\$node\.(\w+)\./g;

/** Remove backslash escapes from a captured node name (e.g. `Node\'s` -> `Node's`). */
function unescapeNodeName(raw: string): string {
	return raw.replace(/\\(.)/g, '$1');
}

/** Collect all matches from a global regex, returning captured groups at the given index. */
function collectMatches(pattern: RegExp, text: string, groupIndex: number): string[] {
	return Array.from(text.matchAll(pattern), (m) => m[groupIndex]);
}

/** Extract all referenced node names from an expression string. */
function extractNodeNamesFromExpression(expression: string): string[] {
	const names: string[] = [];

	for (const pattern of QUOTED_NODE_REFS) {
		for (const raw of collectMatches(pattern, expression, 2)) {
			names.push(unescapeNodeName(raw));
		}
	}

	for (const name of collectMatches(DOT_NODE_REF, expression, 1)) {
		names.push(name);
	}

	return names;
}

/** Recursively extract all expression strings from node parameters. */
function extractExpressionsFromParams(value: unknown, key?: string): string[] {
	if (typeof value === 'string') {
		if (value.charAt(0) === '=' || key === 'jsCode') {
			return [value];
		}
		return [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((item) => extractExpressionsFromParams(item));
	}

	if (typeof value === 'object' && value !== null) {
		return Object.entries(value).flatMap(([k, v]) => extractExpressionsFromParams(v, k));
	}

	return [];
}

export const expressionsReferenceExistingNodes: BinaryCheck = {
	name: 'expressions_reference_existing_nodes',
	description: 'Expressions only reference nodes that exist in the workflow',
	kind: 'deterministic',
	async run(workflow) {
		const nodes = workflow.nodes ?? [];
		if (nodes.length === 0) return { pass: true };

		const existingNodeNames = new Set(nodes.map((n) => n.name));
		const invalid: string[] = [];

		for (const node of nodes) {
			if (!node.parameters) continue;

			const expressions = extractExpressionsFromParams(node.parameters);
			for (const expr of expressions) {
				const referencedNames = extractNodeNamesFromExpression(expr);
				for (const refName of referencedNames) {
					if (!existingNodeNames.has(refName)) {
						invalid.push(`"${refName}" (in node "${node.name}")`);
					}
				}
			}
		}

		const unique = [...new Set(invalid)];

		return {
			pass: unique.length === 0,
			...(unique.length > 0
				? { comment: `Expressions reference non-existent nodes: ${unique.join(', ')}` }
				: {}),
		};
	},
};
```

- [ ] **Step 2: Commit**

```bash
git add evaluations/binaryChecks/checks/expressions-reference-existing-nodes.ts
git commit -m "feat(instance-ai): add expressions_reference_existing_nodes binary check"
```

---

### Task 4: Create `createLlmCheck` factory and `fulfills_user_request` check

**Files:**
- Create: `evaluations/binaryChecks/checks/create-llm-check.ts`
- Create: `evaluations/binaryChecks/checks/fulfills-user-request.ts`

- [ ] **Step 1: Create the LLM check factory**

Create `evaluations/binaryChecks/checks/create-llm-check.ts`:

```ts
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
	return (
		typeof value === 'object' &&
		value !== null &&
		'pass' in value &&
		typeof (value as Record<string, unknown>).pass === 'boolean' &&
		'reasoning' in value &&
		typeof (value as Record<string, unknown>).reasoning === 'string'
	);
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

			const result = await Promise.race([
				resultPromise,
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`LLM check "${options.name}" timed out after ${String(timeoutMs)}ms`)),
						timeoutMs,
					),
				),
			]);

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
```

- [ ] **Step 2: Create the fulfills-user-request check**

Create `evaluations/binaryChecks/checks/fulfills-user-request.ts`:

```ts
import { createLlmCheck } from './create-llm-check';

export const fulfillsUserRequest = createLlmCheck({
	name: 'fulfills_user_request',
	description: 'Workflow fulfills every feature the user explicitly requested',
	systemPrompt: `You are a strict evaluator checking whether an n8n workflow fulfills a user's request.

For each feature the user explicitly asked for, check:
1. Is there a node of the correct TYPE for that feature? (e.g., YouTube node for YouTube operations)
2. Is that node configured with the correct RESOURCE and OPERATION? (e.g., resource: "caption" for fetching captions, not resource: "video")
3. Is the node actually CONNECTED in the workflow flow?

A node that exists but is misconfigured does NOT count as fulfilling the requirement.
For example, a YouTube node with resource: "video" does NOT fulfill a request to "fetch captions" — captions require resource: "caption".

Be binary: pass ONLY if every explicitly requested feature has a correctly-typed AND correctly-configured node.
Do NOT pass just because a node with the right name exists — verify its actual parameters.`,
	humanTemplate: `User Request: {userPrompt}

Generated Workflow:
{generatedWorkflow}

For each feature the user requested, is there a correctly configured node? List each requirement and whether it's met.`,
});
```

- [ ] **Step 3: Commit**

```bash
git add evaluations/binaryChecks/checks/create-llm-check.ts evaluations/binaryChecks/checks/fulfills-user-request.ts
git commit -m "feat(instance-ai): add createLlmCheck factory and fulfills_user_request check"
```

---

### Task 5: Update check registry and make runner async

**Files:**
- Modify: `evaluations/binaryChecks/checks/index.ts`
- Modify: `evaluations/binaryChecks/index.ts`

- [ ] **Step 1: Update the check registry**

Replace `evaluations/binaryChecks/checks/index.ts`:

```ts
// ---------------------------------------------------------------------------
// Registry of all binary checks
// ---------------------------------------------------------------------------

import type { BinaryCheck } from '../types';
import { allNodesConnected } from './all-nodes-connected';
import { expressionsReferenceExistingNodes } from './expressions-reference-existing-nodes';
import { fulfillsUserRequest } from './fulfills-user-request';
import { hasNodes } from './has-nodes';
import { hasTrigger } from './has-trigger';
import { noDisabledNodes } from './no-disabled-nodes';
import { noEmptySetNodes } from './no-empty-set-nodes';

export const DETERMINISTIC_CHECKS: BinaryCheck[] = [
	hasNodes,
	hasTrigger,
	allNodesConnected,
	noEmptySetNodes,
	noDisabledNodes,
	expressionsReferenceExistingNodes,
];

export const LLM_CHECKS: BinaryCheck[] = [fulfillsUserRequest];
```

- [ ] **Step 2: Update the runner to be async and merge registries**

Replace `evaluations/binaryChecks/index.ts`:

```ts
// ---------------------------------------------------------------------------
// Binary checks evaluator for instance-ai
//
// Runs all registered checks against a built workflow and
// returns Feedback[] compatible with the existing harness.
// ---------------------------------------------------------------------------

import type { Feedback } from '../subagent/types';
import type { WorkflowResponse } from '../clients/n8n-client';
import { DETERMINISTIC_CHECKS, LLM_CHECKS } from './checks/index';
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
 *
 * LLM checks are automatically skipped when `ctx.modelId` is not set.
 */
export async function runBinaryChecks(
	workflow: WorkflowResponse,
	ctx: BinaryCheckContext,
	options?: BinaryChecksOptions,
): Promise<Feedback[]> {
	const selected = resolveChecks(options?.only, ctx);

	const results = await Promise.allSettled(
		selected.map(async (check) => {
			const result = await check.run(workflow, ctx);
			return {
				evaluator: EVALUATOR_NAME,
				metric: check.name,
				score: result.pass ? 1 : 0,
				kind: 'metric' as const,
				...(result.comment ? { comment: result.comment } : {}),
			};
		}),
	);

	const feedback: Feedback[] = results.map((settled, i) => {
		if (settled.status === 'fulfilled') return settled.value;

		const message =
			settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
		return {
			evaluator: EVALUATOR_NAME,
			metric: selected[i].name,
			score: 0,
			kind: 'metric' as const,
			comment: `Error: ${message}`,
		};
	});

	// Overall pass rate as the evaluator-level score
	const totalChecks = feedback.length;
	const passCount = feedback.filter((f) => f.score === 1).length;
	const passRate = totalChecks > 0 ? passCount / totalChecks : 0;

	feedback.push({
		evaluator: EVALUATOR_NAME,
		metric: 'pass_rate',
		score: passRate,
		kind: 'score',
		comment: `${String(passCount)}/${String(totalChecks)} checks passed`,
	});

	return feedback;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveChecks(only: string[] | undefined, ctx: BinaryCheckContext): BinaryCheck[] {
	const allChecks = [...DETERMINISTIC_CHECKS, ...LLM_CHECKS];

	// Filter out LLM checks when no modelId is available
	const eligible = ctx.modelId ? allChecks : DETERMINISTIC_CHECKS;

	if (!only || only.length === 0) return eligible;

	const validNames = new Set(eligible.map((c) => c.name));
	const unknown = only.filter((name) => !validNames.has(name));
	if (unknown.length > 0) {
		const available = Array.from(validNames).join(', ');
		throw new Error(`Unknown binary check(s): ${unknown.join(', ')}. Available: ${available}`);
	}

	return eligible.filter((c) => only.includes(c.name));
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/ben/Projects/n8n/master/packages/@n8n/instance-ai && npx tsc --noEmit --pretty 2>&1 | tail -30`

Expected: Error in `subagent/runner.ts` because `runBinaryChecks` is now async but the caller doesn't `await` it. That's expected — fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add evaluations/binaryChecks/checks/index.ts evaluations/binaryChecks/index.ts
git commit -m "feat(instance-ai): async binary checks runner with deterministic + LLM registries"
```

---

### Task 6: Update subagent runner to await binary checks and pass modelId

**Files:**
- Modify: `evaluations/subagent/runner.ts:174-198`

- [ ] **Step 1: Make `evaluateCapturedWorkflows` async and pass modelId**

In `evaluations/subagent/runner.ts`, change the `evaluateCapturedWorkflows` function and its call site.

Change the function signature from:
```ts
function evaluateCapturedWorkflows(captured: CapturedWorkflow[], prompt: string): Feedback[] {
```
to:
```ts
async function evaluateCapturedWorkflows(
	captured: CapturedWorkflow[],
	prompt: string,
	modelId: string,
): Promise<Feedback[]> {
```

Change the `runBinaryChecks` call from:
```ts
const ctx: BinaryCheckContext = { prompt };
const binaryFeedback = runBinaryChecks(workflowResponse, ctx);
```
to:
```ts
const ctx: BinaryCheckContext = { prompt, modelId };
const binaryFeedback = await runBinaryChecks(workflowResponse, ctx);
```

Change the call site (line ~140) from:
```ts
const feedback = evaluateCapturedWorkflows(capture.workflows, testCase.prompt);
```
to:
```ts
const feedback = await evaluateCapturedWorkflows(capture.workflows, testCase.prompt, config.modelId);
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/ben/Projects/n8n/master/packages/@n8n/instance-ai && npx tsc --noEmit --pretty 2>&1 | tail -30`

Expected: Clean — no errors.

- [ ] **Step 3: Commit**

```bash
git add evaluations/subagent/runner.ts
git commit -m "feat(instance-ai): wire modelId through subagent runner for LLM binary checks"
```
