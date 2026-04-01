import type { WorkflowResponse } from '../../clients/n8n-client';
import type { BinaryCheck } from '../types';

const STICKY_NOTE_TYPE = 'n8n-nodes-base.stickyNote';

/**
 * n8n connections format:
 * { [sourceNode]: { main: [ [ { node: targetNode, type: string, index: number } ] ] } }
 *
 * A node is "connected" if it appears as a source key or as a target in any
 * connection entry. We walk the full graph to find all reachable nodes.
 */
function collectConnectedNodes(connections: Record<string, unknown>): Set<string> {
	const connected = new Set<string>();
	const adjacency = new Map<string, string[]>();

	for (const [sourceName, outputs] of Object.entries(connections)) {
		connected.add(sourceName);
		if (typeof outputs !== 'object' || outputs === null) continue;

		for (const connectionGroup of Object.values(outputs as Record<string, unknown>)) {
			if (!Array.isArray(connectionGroup)) continue;
			for (const outputSlot of connectionGroup) {
				if (!Array.isArray(outputSlot)) continue;
				for (const link of outputSlot) {
					if (typeof link === 'object' && link !== null && 'node' in link) {
						const target = (link as { node: string }).node;
						connected.add(target);
						if (!adjacency.has(sourceName)) adjacency.set(sourceName, []);
						adjacency.get(sourceName)!.push(target);
					}
				}
			}
		}
	}

	// BFS to find all transitively reachable nodes
	const visited = new Set<string>(connected);
	const queue = Array.from(connected);
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const neighbor of adjacency.get(current) ?? []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push(neighbor);
			}
		}
	}

	return visited;
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
