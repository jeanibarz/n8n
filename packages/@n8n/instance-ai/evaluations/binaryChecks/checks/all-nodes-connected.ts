import type { WorkflowResponse } from '../../clients/n8n-client';
import type { BinaryCheck } from '../types';

const STICKY_NOTE_TYPE = 'n8n-nodes-base.stickyNote';

/**
 * Collect all nodes that appear in the connections object — as source or target.
 *
 * n8n connections format:
 * { [sourceNode]: { main: [ [ { node: targetNode, type: string, index: number } ] ] } }
 */
function collectConnectedNodes(connections: Record<string, unknown>): Set<string> {
	const connected = new Set<string>();

	for (const [sourceName, outputs] of Object.entries(connections)) {
		connected.add(sourceName);
		if (typeof outputs !== 'object' || outputs === null) continue;

		for (const connectionGroup of Object.values(outputs as Record<string, unknown>)) {
			if (!Array.isArray(connectionGroup)) continue;
			for (const outputSlot of connectionGroup) {
				if (!Array.isArray(outputSlot)) continue;
				for (const link of outputSlot) {
					if (typeof link === 'object' && link !== null && 'node' in link) {
						connected.add((link as { node: string }).node);
					}
				}
			}
		}
	}

	return connected;
}

export const allNodesConnected: BinaryCheck = {
	name: 'all_nodes_connected',
	description: 'Every non-sticky node is part of the connection graph',
	run(workflow: WorkflowResponse) {
		const activeNodes = (workflow.nodes ?? []).filter((n) => n.type !== STICKY_NOTE_TYPE);

		if (activeNodes.length === 0) return { pass: true };

		const connected = collectConnectedNodes(workflow.connections ?? {});
		const disconnected = activeNodes.filter((n) => !connected.has(n.name)).map((n) => n.name);

		return {
			pass: disconnected.length === 0,
			...(disconnected.length > 0
				? { comment: `Disconnected nodes: ${disconnected.join(', ')}` }
				: {}),
		};
	},
};
