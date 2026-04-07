# Port Binary Checks: `expressions_reference_existing_nodes` + `fulfills_user_request`

## Goal

Port two binary checks from `@n8n/ai-workflow-builder.ee/evaluations` to `@n8n/instance-ai/evaluations/binaryChecks/`, and add LLM check support to the existing binary checks infrastructure.

## Changes

### 1. Make binary checks async and add LLM support

**`types.ts`** changes:

- `BinaryCheck.run()` becomes async: `run(workflow, ctx) => Promise<BinaryCheckResult>`
- Add `kind: 'deterministic' | 'llm'` to `BinaryCheck`
- Extend `BinaryCheckContext` with optional LLM fields:
  ```ts
  export interface BinaryCheckContext {
    prompt: string;
    modelId?: string;      // e.g. 'anthropic/claude-sonnet-4-6'
    timeoutMs?: number;
  }
  ```

**`index.ts`** changes:

- `runBinaryChecks()` becomes async, awaits each check via `Promise.allSettled()`
- Separate `CHECKS` (deterministic) and `LLM_CHECKS` registries merged at run time
- LLM checks skipped when `ctx.modelId` is not provided

### 2. `createLlmCheck()` factory

New file: `checks/create-llm-check.ts`

Uses `createEvalAgent` from `src/utils/eval-agents` (existing pattern, no new dependencies). The factory:

1. Appends a "reasoning first" suffix to the system prompt
2. Skips (returns `pass: true`) if no `modelId` in context
3. Creates an eval agent with the system prompt
4. Sends the human template (with `{userPrompt}` and `{generatedWorkflow}` interpolated) as the user message
5. Parses the response for a JSON object `{ reasoning: string, pass: boolean }`
6. Returns `{ pass, comment: reasoning }`

The response parsing follows the same pattern as `checklist/verifier.ts`: extract a JSON object from the LLM text response (checking fenced blocks first, then raw JSON).

### 3. Port `expressions_reference_existing_nodes`

New file: `checks/expressions-reference-existing-nodes.ts`

Direct port of the deterministic check. Adapts from `SimpleWorkflow` to `WorkflowResponse`. Logic:

- Extract node names into a Set
- Recursively walk parameters for expression strings (`=` prefix or `jsCode` key)
- Match node references via regex (`$('Name')`, `$node["Name"]`, `$items("Name")`, `$node.Name`)
- Report non-existent references

### 4. Port `fulfills_user_request`

New file: `checks/fulfills-user-request.ts`

Uses `createLlmCheck()` with the same system prompt and human template from the source. The system prompt instructs the LLM to verify each requested feature has a correctly-typed and correctly-configured node.

### 5. Runner integration

**`subagent/runner.ts`**: Pass `modelId` from `SubAgentRunnerConfig` through to `BinaryCheckContext` so LLM checks can run during sub-agent evaluation.

**`subagent/types.ts`**: No changes needed -- `modelId` already exists on `SubAgentRunnerConfig`.

**`subagent/cli.ts`**: Pass `modelId` through when constructing context.

## Files touched

| File | Action |
|------|--------|
| `evaluations/binaryChecks/types.ts` | Modify: async run, add kind, extend context |
| `evaluations/binaryChecks/index.ts` | Modify: async runner, merge check registries |
| `evaluations/binaryChecks/checks/index.ts` | Modify: add new checks, export LLM_CHECKS |
| `evaluations/binaryChecks/checks/create-llm-check.ts` | New: LLM check factory |
| `evaluations/binaryChecks/checks/expressions-reference-existing-nodes.ts` | New: deterministic check |
| `evaluations/binaryChecks/checks/fulfills-user-request.ts` | New: LLM check |
| `evaluations/binaryChecks/checks/has-nodes.ts` | Modify: add `kind` field |
| `evaluations/binaryChecks/checks/has-trigger.ts` | Modify: add `kind` field |
| `evaluations/binaryChecks/checks/all-nodes-connected.ts` | Modify: add `kind` field |
| `evaluations/binaryChecks/checks/no-empty-set-nodes.ts` | Modify: add `kind` field |
| `evaluations/binaryChecks/checks/no-disabled-nodes.ts` | Modify: add `kind` field |
| `evaluations/subagent/runner.ts` | Modify: pass modelId to context, await runBinaryChecks |

## Out of scope

- Porting any other checks beyond these two
- Adding LangChain as a dependency
- Structured output binding (we parse JSON from text instead)
