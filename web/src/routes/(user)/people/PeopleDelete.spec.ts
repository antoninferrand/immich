import { getClusterGroupUsers, searchPerson } from '@immich/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { get, readable } from 'svelte/store';
import { invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { personFactory } from '@test-data/factories/person-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import PeoplePage from './+page.svelte';

vi.mock('@immich/sdk');
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/stores', () => ({ page: readable({ url: new URL('http://localhost/people') }) }));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', () => import('@test-data/mocks/UserPageLayout.mock.svelte'));
vi.mock('$lib/modals/PersonMergeSuggestionModal.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/modals/PeopleFilterModal.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: { init: vi.fn(), loadFeatureFlags: vi.fn(), value: {} },
}));

type Data = ComponentProps<typeof PeoplePage>['data'];
const alice = personFactory.build({ id: 'alice', name: 'Alice', isHidden: false, isFavorite: false });
const alicia = personFactory.build({ id: 'alicia', name: 'Alicia', isHidden: false, isFavorite: true });
const dataFor = (people: (typeof alice)[], hasNextPage = false): Data => ({
  error: undefined,
  asset: undefined,
  meta: { title: 'People' },
  filter: {},
  people: { people, total: people.length, hidden: 0, hasNextPage },
});

describe('People deletion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    get(page).url.search = '';
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
    authManager.setUser(userAdminFactory.build());
    authManager.setPreferences(preferencesFactory.build());
    vi.mocked(getClusterGroupUsers).mockResolvedValue([]);
  });

  it('reloads shifted pages instead of skipping the next person', async () => {
    const { rerender } = render(TestWrapper, {
      component: PeoplePage,
      componentProps: { data: dataFor([alice], true) },
    });
    vi.mocked(invalidateAll).mockImplementation(async () => {
      await rerender({ componentProps: { data: dataFor([alicia]) } });
    });

    eventManager.emit('PersonDelete', alice);

    await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByDisplayValue('Alicia')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument();
  });

  it('refreshes the search cache before a query is refined', async () => {
    const { rerender } = render(TestWrapper, {
      component: PeoplePage,
      componentProps: { data: dataFor([alice, alicia]) },
    });
    vi.mocked(searchPerson).mockResolvedValueOnce([alice, alicia]).mockResolvedValue([alicia]);
    vi.mocked(invalidateAll).mockImplementation(async () => {
      await rerender({ componentProps: { data: dataFor([alicia]) } });
    });
    const search = screen.getByPlaceholderText('search_people');
    await fireEvent.input(search, { target: { value: 'Ali' } });
    await waitFor(() => expect(searchPerson).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByDisplayValue('Alice')).toHaveLength(1));

    eventManager.emit('PersonDelete', alice);
    await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
    await fireEvent.input(search, { target: { value: 'Alic' } });

    await waitFor(() => expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument());
    expect(screen.getByDisplayValue('Alicia')).toBeInTheDocument();
  });

  it('does not restore a deleted person when a cleared search is repeated', async () => {
    const { rerender } = render(TestWrapper, {
      component: PeoplePage,
      componentProps: { data: dataFor([alice, alicia]) },
    });
    vi.mocked(searchPerson).mockResolvedValueOnce([alice, alicia]).mockResolvedValue([alicia]);
    vi.mocked(invalidateAll).mockImplementation(async () => {
      await rerender({ componentProps: { data: dataFor([alicia]) } });
    });
    const search = screen.getByPlaceholderText('search_people');
    await fireEvent.input(search, { target: { value: 'Ali' } });
    await waitFor(() => expect(searchPerson).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByDisplayValue('Alice')).toBeInTheDocument());
    await fireEvent.input(search, { target: { value: '' } });

    eventManager.emit('PersonDelete', alice);
    await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument());
    await fireEvent.input(search, { target: { value: 'Ali' } });

    await waitFor(() => expect(searchPerson).toHaveBeenCalledTimes(2));
    expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Alicia')).toBeInTheDocument();
  });

  it('preserves favourites when deleting a non-favourite search result', async () => {
    const data = { ...dataFor([alicia]), filter: { isFavorite: true } };
    const { rerender } = render(TestWrapper, { component: PeoplePage, componentProps: { data } });
    vi.mocked(searchPerson).mockResolvedValueOnce([alice]).mockResolvedValue([]);
    vi.mocked(invalidateAll).mockImplementation(async () => {
      await rerender({ componentProps: { data: { ...dataFor([alicia]), filter: data.filter } } });
    });
    const search = screen.getByPlaceholderText('search_people');
    await fireEvent.input(search, { target: { value: 'Alice' } });
    await waitFor(() => expect(searchPerson).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByDisplayValue('Alice')).toHaveLength(2));

    eventManager.emit('PersonDelete', alice);
    await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
    await fireEvent.input(search, { target: { value: '' } });

    await waitFor(() => expect(screen.getByDisplayValue('Alicia')).toBeInTheDocument());
  });
});
