// ---------------------------------------------------------------------------
// Stub InstanceAiContext for isolated sub-agent evaluation
//
// Provides minimal service implementations so domain tools can be created
// without a running n8n instance. The workflow service captures
// createFromWorkflowJSON calls so we can evaluate the built workflow.
// ---------------------------------------------------------------------------

import type { WorkflowJSON } from '@n8n/workflow-sdk';

import type {
	InstanceAiContext,
	InstanceAiWorkflowService,
	InstanceAiExecutionService,
	InstanceAiCredentialService,
	InstanceAiNodeService,
	InstanceAiDataTableService,
	WorkflowDetail,
} from '../../src/types';
import type { CapturedWorkflow } from './types';

// ---------------------------------------------------------------------------
// Captured workflow accumulator
// ---------------------------------------------------------------------------

export interface WorkflowCapture {
	workflows: CapturedWorkflow[];
}

// ---------------------------------------------------------------------------
// Stub workflow service
// ---------------------------------------------------------------------------

function createStubWorkflowService(capture: WorkflowCapture): InstanceAiWorkflowService {
	let nextId = 1;

	return {
		async list() {
			return [];
		},
		async get(workflowId) {
			throw new Error(`[stub] Workflow ${workflowId} not found`);
		},
		async getAsWorkflowJSON(workflowId) {
			throw new Error(`[stub] Workflow ${workflowId} not found`);
		},
		async createFromWorkflowJSON(json: WorkflowJSON) {
			const id = `eval-wf-${String(nextId++)}`;
			capture.workflows.push({ json, success: true });
			return makeWorkflowDetail(id, json);
		},
		async updateFromWorkflowJSON(workflowId: string, json: WorkflowJSON) {
			capture.workflows.push({ json, success: true });
			return makeWorkflowDetail(workflowId, json);
		},
		async archive() {},
		async delete() {},
		async publish(workflowId) {
			return { activeVersionId: `v-${workflowId}` };
		},
		async unpublish() {},
	};
}

function makeWorkflowDetail(id: string, json: WorkflowJSON): WorkflowDetail {
	return {
		id,
		name: json.name ?? 'Eval Workflow',
		versionId: 'v1',
		activeVersionId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		nodes: (json.nodes ?? []).map((n) => ({
			name: n.name ?? '',
			type: n.type,
			parameters: n.parameters as Record<string, unknown> | undefined,
			position: (n.position as number[]) ?? [0, 0],
		})) as WorkflowDetail['nodes'],
		connections: (json.connections ?? {}) as Record<string, unknown>,
	};
}

// ---------------------------------------------------------------------------
// Stub services (return empty / no-op)
// ---------------------------------------------------------------------------

function createStubExecutionService(): InstanceAiExecutionService {
	return {
		async list() {
			return [];
		},
		async run() {
			return { executionId: 'exec-stub', status: 'success' };
		},
		async getStatus() {
			return { executionId: 'exec-stub', status: 'success' };
		},
		async getResult() {
			return { executionId: 'exec-stub', status: 'success' };
		},
		async stop() {
			return { success: true, message: 'stopped' };
		},
		async getDebugInfo() {
			return { executionId: 'exec-stub', nodeErrors: [], rawData: {} } as unknown as Awaited<
				ReturnType<InstanceAiExecutionService['getDebugInfo']>
			>;
		},
		async getNodeOutput() {
			return { data: [] } as unknown as Awaited<
				ReturnType<InstanceAiExecutionService['getNodeOutput']>
			>;
		},
	};
}

function createStubCredentialService(): InstanceAiCredentialService {
	return {
		async list() {
			return [];
		},
		async get() {
			throw new Error('[stub] No credentials');
		},
		async delete() {},
		async test() {
			return { success: true };
		},
	};
}

function createStubNodeService(): InstanceAiNodeService {
	return {
		async listAvailable() {
			return [];
		},
		async getDescription(nodeType) {
			return {
				type: nodeType,
				displayName: nodeType,
				description: '',
				properties: [],
			} as unknown as Awaited<ReturnType<InstanceAiNodeService['getDescription']>>;
		},
		async listSearchable() {
			return [];
		},
	};
}

function createStubDataTableService(): InstanceAiDataTableService {
	return {
		async list() {
			return [];
		},
		async create(name) {
			return { id: 'dt-stub', name, createdAt: '', updatedAt: '' } as unknown as Awaited<
				ReturnType<InstanceAiDataTableService['create']>
			>;
		},
		async delete() {},
		async getSchema() {
			return [];
		},
		async addColumn(_id, col) {
			return { id: 'col-stub', name: col.name, type: col.type } as unknown as Awaited<
				ReturnType<InstanceAiDataTableService['addColumn']>
			>;
		},
		async deleteColumn() {},
		async renameColumn() {},
		async queryRows() {
			return { count: 0, data: [] };
		},
		async insertRows() {
			return { insertedCount: 0, data: [] } as unknown as Awaited<
				ReturnType<InstanceAiDataTableService['insertRows']>
			>;
		},
		async updateRows() {
			return { updatedCount: 0, data: [] } as unknown as Awaited<
				ReturnType<InstanceAiDataTableService['updateRows']>
			>;
		},
		async deleteRows() {
			return { deletedCount: 0 } as unknown as Awaited<
				ReturnType<InstanceAiDataTableService['deleteRows']>
			>;
		},
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StubContextResult {
	context: InstanceAiContext;
	capture: WorkflowCapture;
}

/**
 * Create a minimal InstanceAiContext with stubbed services.
 *
 * The workflow service captures `createFromWorkflowJSON` / `updateFromWorkflowJSON`
 * calls into `capture.workflows` so the eval harness can inspect the built workflows.
 * All other services return empty/no-op results.
 */
export function createStubContext(): StubContextResult {
	const capture: WorkflowCapture = { workflows: [] };

	const context: InstanceAiContext = {
		userId: 'eval-user',
		workflowService: createStubWorkflowService(capture),
		executionService: createStubExecutionService(),
		credentialService: createStubCredentialService(),
		nodeService: createStubNodeService(),
		dataTableService: createStubDataTableService(),
	};

	return { context, capture };
}
