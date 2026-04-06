import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/vue';
import { createComponentRenderer } from '@/__tests__/render';
import InstanceAiPromptSuggestions from '../components/InstanceAiPromptSuggestions.vue';
import { INSTANCE_AI_EMPTY_STATE_SUGGESTIONS as suggestions } from '../emptyStateSuggestions';

const renderComponent = createComponentRenderer(InstanceAiPromptSuggestions);

describe('InstanceAiPromptSuggestions', () => {
	it('emits preview changes for prompt pills and quick-example rows', async () => {
		const { emitted, getByTestId } = renderComponent({
			props: {
				suggestions,
				disabled: false,
			},
		});

		await userEvent.hover(getByTestId('instance-ai-suggestion-build-workflow'));
		await userEvent.unhover(getByTestId('instance-ai-suggestion-build-workflow'));

		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));
		await userEvent.hover(getByTestId('instance-ai-quick-example-monitor-competitors'));
		await userEvent.unhover(getByTestId('instance-ai-quick-example-monitor-competitors'));

		expect(emitted()['preview-change']).toEqual([
			['instanceAi.emptyState.suggestions.buildWorkflow.prompt'],
			[null],
			[null],
			['instanceAi.emptyState.quickExamples.monitorCompetitors.prompt'],
			[null],
		]);
	});

	it('closes quick examples and clears preview when Escape is pressed', async () => {
		const { emitted, getByTestId, queryByTestId } = renderComponent({
			props: {
				suggestions,
				disabled: false,
			},
		});

		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));
		await userEvent.hover(getByTestId('instance-ai-quick-example-monitor-competitors'));
		expect(getByTestId('instance-ai-quick-examples-panel')).toBeVisible();

		await fireEvent.keyDown(document, { key: 'Escape' });

		expect(queryByTestId('instance-ai-quick-examples-panel')).not.toBeInTheDocument();
		expect(emitted()['preview-change']?.at(-1)).toEqual([null]);
	});

	it('does not emit preview or submit events while disabled', async () => {
		const { emitted, getByTestId, queryByTestId } = renderComponent({
			props: {
				suggestions,
				disabled: true,
			},
		});

		await userEvent.hover(getByTestId('instance-ai-suggestion-build-workflow'));
		await fireEvent.focus(getByTestId('instance-ai-suggestion-build-workflow'));
		await userEvent.click(getByTestId('instance-ai-suggestion-build-workflow'));
		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));

		expect(queryByTestId('instance-ai-quick-examples-panel')).not.toBeInTheDocument();
		expect(emitted()['preview-change']).toBeUndefined();
		expect(emitted()['submit-prompt']).toBeUndefined();
	});

	it('closes quick examples and clears preview when clicking outside', async () => {
		const { emitted, getByTestId, queryByTestId } = renderComponent({
			props: {
				suggestions,
				disabled: false,
			},
		});

		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));
		await userEvent.hover(getByTestId('instance-ai-quick-example-monitor-competitors'));
		expect(getByTestId('instance-ai-quick-examples-panel')).toBeVisible();

		await fireEvent.click(document.body);

		expect(queryByTestId('instance-ai-quick-examples-panel')).not.toBeInTheDocument();
		expect(emitted()['preview-change']?.at(-1)).toEqual([null]);
	});
});
