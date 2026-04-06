import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, waitFor, within } from '@testing-library/vue';
import { reactive } from 'vue';
import { createComponentRenderer } from '@/__tests__/render';
import InstanceAiInput from '../components/InstanceAiInput.vue';
import { INSTANCE_AI_EMPTY_STATE_SUGGESTIONS as suggestions } from '../emptyStateSuggestions';

const toggleResearchMode = vi.fn();
const storeState = reactive({
	amendContext: null as { agentId: string; role: string } | null,
	contextualSuggestion: null as string | null,
	researchMode: false,
	isSendingMessage: false,
	toggleResearchMode,
});

vi.mock('../instanceAi.store', () => ({
	useInstanceAiStore: vi.fn(() => storeState),
}));

const renderComponent = createComponentRenderer(InstanceAiInput);

describe('InstanceAiInput', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storeState.amendContext = null;
		storeState.contextualSuggestion = null;
		storeState.researchMode = false;
		storeState.isSendingMessage = false;
	});

	it('uses the shared suggestions fixture with the expected top-level contract', () => {
		expect(suggestions.map((suggestion) => ({ id: suggestion.id, type: suggestion.type }))).toEqual(
			[
				{ id: 'build-workflow', type: 'prompt' },
				{ id: 'build-agent', type: 'prompt' },
				{ id: 'find-automation-ideas', type: 'prompt' },
				{ id: 'quick-examples', type: 'menu' },
			],
		);
	});

	it('renders the four empty-state suggestions when the textarea is empty', () => {
		const { getByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		expect(getByTestId('instance-ai-suggestion-build-workflow')).toHaveTextContent(
			'Build a workflow',
		);
		expect(getByTestId('instance-ai-suggestion-build-agent')).toHaveTextContent('Build an agent');
		expect(getByTestId('instance-ai-suggestion-find-automation-ideas')).toHaveTextContent(
			'Find inspiration',
		);
		expect(getByTestId('instance-ai-suggestion-quick-examples')).toHaveTextContent(
			'Quick examples',
		);
	});

	it('shows a ghost prompt in the placeholder when hovering a prompt suggestion', async () => {
		const { getByRole, getByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		const textbox = getByRole('textbox');
		const initialPlaceholder = textbox.getAttribute('placeholder');

		await userEvent.hover(getByTestId('instance-ai-suggestion-build-workflow'));

		expect(textbox).toHaveAttribute(
			'placeholder',
			"I want to build a new workflow. Help me figure out what to build. Ask me what's the end goal, what should trigger it, and what apps or services are involved.",
		);

		await userEvent.unhover(getByTestId('instance-ai-suggestion-build-workflow'));

		expect(textbox).toHaveAttribute('placeholder', initialPlaceholder ?? '');
	});

	it('does not change the placeholder when hovering the quick examples trigger', async () => {
		const { getByRole, getByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		const textbox = getByRole('textbox');
		const initialPlaceholder = textbox.getAttribute('placeholder');

		await userEvent.hover(getByTestId('instance-ai-suggestion-quick-examples'));

		expect(textbox).toHaveAttribute('placeholder', initialPlaceholder ?? '');
	});

	it('keeps suggestions visible for whitespace-only input but does not preview a ghost prompt', async () => {
		const { getByRole, getByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		const textbox = getByRole('textbox');
		const initialPlaceholder = textbox.getAttribute('placeholder') ?? '';
		await userEvent.type(textbox, '   ');

		expect(getByTestId('instance-ai-suggestion-build-workflow')).toBeInTheDocument();
		await userEvent.hover(getByTestId('instance-ai-suggestion-build-workflow'));
		expect(textbox).toHaveAttribute('placeholder', initialPlaceholder);
	});

	it('shows a ghost prompt in the placeholder when hovering a quick example row', async () => {
		const { getByRole, getByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		const textbox = getByRole('textbox');
		const initialPlaceholder = textbox.getAttribute('placeholder');

		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));
		await userEvent.hover(getByTestId('instance-ai-quick-example-monitor-competitors'));

		expect(textbox).toHaveAttribute(
			'placeholder',
			'Once per week, search Google News for mentions of all the competitors listed in a Google Sheet, use Claude to summarize any articles published in the last week, and post the summary to #competitive-intel in Slack.',
		);

		await userEvent.unhover(getByTestId('instance-ai-quick-example-monitor-competitors'));

		expect(textbox).toHaveAttribute('placeholder', initialPlaceholder ?? '');
	});

	it('clears the ghost prompt when quick examples are closed by clicking outside', async () => {
		const { getByRole, getByTestId, queryByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		const textbox = getByRole('textbox');
		const initialPlaceholder = textbox.getAttribute('placeholder') ?? '';

		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));
		await userEvent.hover(getByTestId('instance-ai-quick-example-monitor-competitors'));
		expect(textbox.getAttribute('placeholder')).not.toBe(initialPlaceholder);

		await fireEvent.click(document.body);

		expect(queryByTestId('instance-ai-quick-examples-panel')).not.toBeInTheDocument();
		expect(textbox).toHaveAttribute('placeholder', initialPlaceholder);
	});

	it('submits immediately when a prompt suggestion is clicked', async () => {
		const { emitted, getByRole, getByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		const textbox = getByRole('textbox');
		await userEvent.click(getByTestId('instance-ai-suggestion-build-agent'));

		expect(emitted().submit?.[0]).toEqual([
			'I want to build a new agent. Help me figure out what to build. Ask me what the main purpose of the agent is, what should trigger it into action, what apps, tools, or knowledge it should have access to, and whether I have a preference for the AI model used.',
			undefined,
		]);
		expect(textbox).toHaveValue('');
	});

	it('opens quick examples and submits immediately when an example is clicked', async () => {
		const { emitted, getByRole, getByTestId, queryByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));

		const panel = getByTestId('instance-ai-quick-examples-panel');
		expect(panel).toBeVisible();
		expect(within(panel).getByText('Track competitor news')).toBeVisible();
		expect(within(panel).getByText('Automate my inbox')).toBeVisible();

		await userEvent.click(getByTestId('instance-ai-quick-example-answer-support-requests'));

		const textbox = getByRole('textbox');
		expect(emitted().submit?.[0]).toEqual([
			'When a new email arrives in our Outlook inbox, use Claude to summarize what the prospect is looking for, rate its urgency and potential value, then notify the right person in Slack based on the product and region of the prospect.',
			undefined,
		]);
		expect(textbox).toHaveValue('');
		expect(queryByTestId('instance-ai-quick-examples-panel')).not.toBeInTheDocument();
	});

	it('hides suggestions and quick examples when a file is attached', async () => {
		const { container, getByTestId, queryByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		await userEvent.click(getByTestId('instance-ai-suggestion-quick-examples'));

		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(['hello'], 'note.txt', { type: 'text/plain' });

		Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });

		await fireEvent.change(fileInput);

		await waitFor(() => {
			expect(queryByTestId('instance-ai-suggestion-build-workflow')).not.toBeInTheDocument();
			expect(queryByTestId('instance-ai-quick-examples-panel')).not.toBeInTheDocument();
		});
	});

	it('hides suggestions while a send is pending', async () => {
		const { queryByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		expect(queryByTestId('instance-ai-suggestion-build-workflow')).toBeInTheDocument();

		storeState.isSendingMessage = true;

		await waitFor(() => {
			expect(queryByTestId('instance-ai-suggestion-build-workflow')).not.toBeInTheDocument();
		});
	});

	it('clears the ghost prompt when suggestions become hidden', async () => {
		const { getByRole, getByTestId, queryByTestId } = renderComponent({
			props: {
				isStreaming: false,
				suggestions,
			},
		});

		const textbox = getByRole('textbox');
		const initialPlaceholder = textbox.getAttribute('placeholder') ?? '';
		await userEvent.hover(getByTestId('instance-ai-suggestion-build-workflow'));
		expect(textbox.getAttribute('placeholder')).not.toBe(initialPlaceholder);

		storeState.isSendingMessage = true;

		await waitFor(() => {
			expect(queryByTestId('instance-ai-suggestion-build-workflow')).not.toBeInTheDocument();
			expect(textbox).toHaveAttribute('placeholder', initialPlaceholder);
		});
	});

	it('does not render suggestions when the prop is omitted', () => {
		const { queryByTestId } = renderComponent({
			props: {
				isStreaming: false,
			},
		});

		expect(queryByTestId('instance-ai-suggestion-build-workflow')).not.toBeInTheDocument();
	});
});
