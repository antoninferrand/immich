import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { asMutation, queryClient } from '#lib/queries/client.ts';
import { deletePerson, getAllPeople } from '@immich/sdk';
import { queryOptions } from '@tanstack/svelte-query';

export const peopleQueryKey = ['people'];

export const getAllPeopleQuery = (params: Parameters<typeof getAllPeople>[0]) =>
  queryOptions({
    queryKey: [...peopleQueryKey, params],
    queryFn: ({ signal }) => getAllPeople(params, { signal }),
    staleTime: 0,
  });

export const deletePersonMutation = () =>
  asMutation(deletePerson, {
    onSuccess: async (_, [{ id }]) => {
      await queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      eventManager.emit('PersonDelete', { id });
    },
    meta: { success: { toast: true } },
  });
