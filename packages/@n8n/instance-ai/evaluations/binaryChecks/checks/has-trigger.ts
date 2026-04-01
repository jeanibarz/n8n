import type { BinaryCheck } from '../types';

const TRIGGER_SUFFIX = 'Trigger';
const MANUAL_TRIGGER = 'n8n-nodes-base.manualTrigger';
const SCHEDULE_TRIGGER = 'n8n-nodes-base.scheduleTrigger';
const START_NODE = 'n8n-nodes-base.start';

function isTriggerNode(type: string): boolean {
	if (type === MANUAL_TRIGGER || type === SCHEDULE_TRIGGER || type === START_NODE) return true;

	// Convention: trigger nodes end with "Trigger" (e.g. n8n-nodes-base.webhookTrigger)
	const shortName = type.split('.').pop() ?? '';
	return shortName.endsWith(TRIGGER_SUFFIX);
}

export const hasTrigger: BinaryCheck = {
	name: 'has_trigger',
	description: 'Workflow contains a trigger or start node',
	run(workflow) {
		const nodes = workflow.nodes ?? [];
		const triggers = nodes.filter((n) => isTriggerNode(n.type));
		return {
			pass: triggers.length > 0,
			...(triggers.length === 0 ? { comment: 'No trigger or start node found' } : {}),
		};
	},
};
