import { deletePerson } from '@immich/sdk';
import { modalManager } from '@immich/ui';
import type { MessageFormatter } from 'svelte-i18n';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { getPersonActions } from '$lib/services/person.service';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { personFactory } from '@test-data/factories/person-factory';

vi.mock('@immich/sdk');
vi.mock('@immich/ui', () => ({
  modalManager: { showDialog: vi.fn() },
  toastManager: { primary: vi.fn() },
}));
vi.mock('$lib/utils/i18n', () => ({ getFormatter: vi.fn(), getPreferredLocale: vi.fn() }));
vi.mock('$lib/modals/PersonEditModal.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/modals/PersonEditAccessModal.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/utils/handle-error', () => ({ handleError: vi.fn() }));

describe('Delete person', () => {
  const person = personFactory.build();
  const $t: MessageFormatter = String;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFormatter).mockResolvedValue($t);
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.mocked(modalManager.showDialog).mockResolvedValue(false);
    await getPersonActions($t, person).Delete.onAction?.(undefined as never);
    expect(deletePerson).not.toHaveBeenCalled();
  });

  it('notifies listeners only after deletion succeeds', async () => {
    vi.mocked(modalManager.showDialog).mockResolvedValue(true);
    vi.mocked(deletePerson).mockResolvedValue(undefined as never);
    const listener = vi.fn();
    const unsubscribe = eventManager.on({ PersonDelete: listener });
    try {
      await getPersonActions($t, person).Delete.onAction?.(undefined as never);
      expect(deletePerson).toHaveBeenCalledWith({ id: person.id, personDeleteDto: {} });
      expect(listener).toHaveBeenCalledWith(person);
    } finally {
      unsubscribe();
    }
  });

  it('keeps the person visible when deletion fails', async () => {
    vi.mocked(modalManager.showDialog).mockResolvedValue(true);
    const error = new Error('Deletion failed');
    vi.mocked(deletePerson).mockRejectedValue(error);
    const listener = vi.fn();
    const unsubscribe = eventManager.on({ PersonDelete: listener });
    try {
      await getPersonActions($t, person).Delete.onAction?.(undefined as never);
      expect(listener).not.toHaveBeenCalled();
      expect(handleError).toHaveBeenCalledWith(error, 'errors.something_went_wrong');
    } finally {
      unsubscribe();
    }
  });
});
