// ---------------------------------------------------------------------------
// Registry of all binary checks
// ---------------------------------------------------------------------------

import type { BinaryCheck } from '../types';
import { allNodesConnected } from './all-nodes-connected';
import { expressionsReferenceExistingNodes } from './expressions-reference-existing-nodes';
import { fulfillsUserRequest } from './fulfills-user-request';
import { hasNodes } from './has-nodes';
import { validDataFlow } from './valid-data-flow';
import { hasTrigger } from './has-trigger';
import { noDisabledNodes } from './no-disabled-nodes';
import { noEmptySetNodes } from './no-empty-set-nodes';
import { validFieldReferences } from './valid-field-references';

export const DETERMINISTIC_CHECKS: BinaryCheck[] = [
	hasNodes,
	hasTrigger,
	allNodesConnected,
	noEmptySetNodes,
	noDisabledNodes,
	expressionsReferenceExistingNodes,
	validFieldReferences,
];

export const LLM_CHECKS: BinaryCheck[] = [fulfillsUserRequest, validDataFlow];
