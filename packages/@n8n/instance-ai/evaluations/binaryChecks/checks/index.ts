// ---------------------------------------------------------------------------
// Registry of all deterministic binary checks
// ---------------------------------------------------------------------------

import type { BinaryCheck } from '../types';
import { allNodesConnected } from './all-nodes-connected';
import { hasNodes } from './has-nodes';
import { hasTrigger } from './has-trigger';
import { noDisabledNodes } from './no-disabled-nodes';
import { noEmptySetNodes } from './no-empty-set-nodes';

export const CHECKS: BinaryCheck[] = [
	hasNodes,
	hasTrigger,
	allNodesConnected,
	noEmptySetNodes,
	noDisabledNodes,
];
