import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { Route } from '#lib/route.ts';
import { factory } from '#test/unit/factories.ts';
import { test } from '#test/unit/fixtures.ts';
import { expect, vi } from 'vitest';
import { refreshAll } from '$app/navigation';
import Page from './+page.svelte';
import { load } from './+page.ts';

vi.mock('$app/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$app/navigation')>()),
  refreshAll: vi.fn().mockResolvedValue(undefined),
}));

test('removes the deleted person and refreshes pagination', async ({ data, router, render, settle, app }) => {
  const alice = factory.person({ name: 'Alice' });
  const alicia = factory.person({ name: 'Alicia' });
  data.addPeople([alice, alicia]);
  await router.goto(Route.people());
  await render(Page, load);
  await settle();
  vi.mocked(refreshAll).mockClear();

  eventManager.emit('PersonDelete', alice);
  await settle();

  expect(refreshAll).toHaveBeenCalledOnce();
  await expect.element(app.people.nameInput(0)).toHaveValue('Alicia');
  await expect.element(app.people.nameInput(1)).not.toBeInTheDocument();
});

test('preserves favourites when deleting a person outside the current results', async ({
  data,
  router,
  render,
  settle,
  app,
}) => {
  const alice = factory.person({ name: 'Alice' });
  const alicia = factory.person({ name: 'Alicia', isFavorite: true });
  data.addPeople([alicia]);
  await router.goto(`${Route.people()}?isFavorite=true`);
  await render(Page, load);
  await settle();
  vi.mocked(refreshAll).mockClear();

  eventManager.emit('PersonDelete', alice);
  await settle();

  expect(refreshAll).toHaveBeenCalledOnce();
  await expect.element(app.people.nameInput(0)).toHaveValue('Alicia');
});
