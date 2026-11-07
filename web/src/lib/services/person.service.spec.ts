import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { getPersonActions } from '#lib/services/person.service.ts';
import { factory } from '#test/unit/factories.ts';
import { test } from '#test/unit/fixtures.ts';
import { expect, vi } from 'vitest';

test('cancelling person deletion leaves the person intact', async ({ data, api, app }) => {
  const person = factory.person();
  data.addPeople(person);

  const result = getPersonActions(String, person).Delete.onAction?.(undefined as never);
  await app.cancelButton.click();
  await result;

  expect(api.deletePerson).not.toHaveBeenCalled();
  expect(data.getPerson(person.id)).toEqual(person);
});

test('successful deletion notifies listeners after the request completes', async ({ data, api, app, settle }) => {
  const person = factory.person();
  data.addPeople(person);
  const pending = Promise.withResolvers<void>();
  api.on({
    deletePerson: async ({ params }) => {
      await pending.promise;
      data.deletePerson(params.id);
      return { status: 204 };
    },
  });
  const listener = vi.fn();
  const unsubscribe = eventManager.on({ PersonDelete: listener });
  try {
    const result = getPersonActions(String, person).Delete.onAction?.(undefined as never);
    expect(listener).not.toHaveBeenCalled();
    await app.dialogButton('delete').click();
    await expect.poll(() => api.deletePerson.calls.length).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    pending.resolve();
    await result;
    await settle();

    expect(api.deletePerson).toHaveBeenCalledWith({ params: { id: person.id }, body: {} });
    expect(data.getPerson(person.id)).toBeUndefined();
    expect(listener).toHaveBeenCalledExactlyOnceWith({ id: person.id });
  } finally {
    pending.resolve();
    unsubscribe();
  }
});

test('failed deletion leaves the person intact without notifying listeners', async ({
  data,
  api,
  app,
  settle,
  logger,
}) => {
  const person = factory.person();
  data.addPeople(person);
  api.on({ deletePerson: () => ({ status: 500, json: { message: 'Deletion failed' } }) });
  const listener = vi.fn();
  const unsubscribe = eventManager.on({ PersonDelete: listener });
  try {
    const result = getPersonActions(String, person).Delete.onAction?.(undefined as never);
    await app.dialogButton('delete').click();
    await result;
    await settle();

    expect(api.deletePerson).toHaveBeenCalledWith({ params: { id: person.id }, body: {} });
    expect(logger.error).toHaveBeenCalledWith(/handleError/);
    expect(data.getPerson(person.id)).toEqual(person);
    expect(listener).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});
