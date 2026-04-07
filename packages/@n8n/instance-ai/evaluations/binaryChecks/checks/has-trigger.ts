import type { BinaryCheck } from '../types';

const TRIGGER_SUFFIX = 'Trigger';

/** Nodes that act as triggers but don't follow the *Trigger naming convention */
const KNOWN_TRIGGER_TYPES = new Set([
	'n8n-nodes-base.manualTrigger',
	'n8n-nodes-base.scheduleTrigger',
	'n8n-nodes-base.start',
	'n8n-nodes-base.webhook',
	'n8n-nodes-base.formTrigger',
	'@n8n/n8n-nodes-langchain.chatTrigger',
	'@n8n/n8n-nodes-langchain.mcpTrigger',
]);

function isTriggerNode(type: string): boolean {
	if (KNOWN_TRIGGER_TYPES.has(type)) return true;

	// Convention: most trigger nodes end with "Trigger"
	const shortName = type.split('.').pop() ?? '';
	return shortName.endsWith(TRIGGER_SUFFIX);
}

export const hasTrigger: BinaryCheck = {
	name: 'has_trigger',
	description: 'Workflow contains a trigger or start node',
	kind: 'deterministic',
	async run(workflow) {
		const nodes = workflow.nodes ?? [];
		const triggers = nodes.filter((n) => isTriggerNode(n.type));
		return {
			pass: triggers.length > 0,
			...(triggers.length === 0 ? { comment: 'No trigger or start node found' } : {}),
		};
	},
};
