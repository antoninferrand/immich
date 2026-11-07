import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { getPersonActions } from '#lib/services/person.service.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import { factory } from '#test/unit/factories.ts';
import { deletePerson } from '@immich/sdk';
import type { MessageFormatter } from 'svelte-i18n';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  deletePerson: vi.fn(),
}));
const { showDialog } = vi.hoisted(() => ({ showDialog: vi.fn() }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { showDialog },
  toastManager: { primary: vi.fn() },
}));
vi.mock('#lib/utils/i18n.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/utils/i18n.ts')>()),
  getFormatter: vi.fn(),
}));
vi.mock('#lib/modals/PersonEditModal.svelte', () => ({ default: vi.fn() }));
vi.mock('#lib/modals/PersonEditAccessModal.svelte', () => ({ default: vi.fn() }));
vi.mock('#lib/utils/handle-error.ts', () => ({ handleError: vi.fn() }));

describe('Delete person', () => {
  const person = factory.person();
  const $t: MessageFormatter = String;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFormatter).mockResolvedValue($t);
  });

  it('does not delete when confirmation is cancelled', async () => {
    showDialog.mockResolvedValue(false);
    await getPersonActions($t, person).Delete.onAction?.(undefined as never);
    expect(deletePerson).not.toHaveBeenCalled();
  });

  it('notifies listeners only after deletion succeeds', async () => {
    showDialog.mockResolvedValue(true);
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
    showDialog.mockResolvedValue(true);
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
