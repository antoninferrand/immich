import { SessionStorageKey } from '#lib/constants.ts';
import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import type { Page } from '@playwright/test';

const names = (page: Page) =>
  page.getByPlaceholder('add_a_name').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

for (const restoringScroll of [false, true]) {
  test(`deletion ignores stale ${restoringScroll ? 'scroll restoration' : 'next page'} responses`, async ({
    page,
    data,
    api,
    app,
  }) => {
    const alice = factory.person({ name: 'Alice' });
    const bob = factory.person({ name: 'Bob' });
    const charlie = factory.person({ name: 'Charlie' });
    const dana = factory.person({ name: 'Dana' });
    data.addPeople([alice, bob, charlie, dana]);
    await page.goto(Route.people());
    if (restoringScroll) {
      await page.evaluate((key) => sessionStorage.setItem(key, '3'), SessionStorageKey.INFINITE_SCROLL_PAGE);
    }

    const pendingPage = Promise.withResolvers<void>();
    let deleted = false;
    api.on({
      getAllPeople: async ({ params }) => {
        if (params?.page === 2) {
          if (!deleted) {
            await pendingPage.promise;
            return { json: { people: [charlie, dana], hasNextPage: false, total: 4, hidden: 0 } };
          }
          return { json: { people: [dana], hasNextPage: false, total: 3, hidden: 0 } };
        }
        return {
          json: {
            people: deleted ? [bob, charlie] : [alice, bob],
            hasNextPage: true,
            total: deleted ? 3 : 4,
            hidden: 0,
          },
        };
      },
      deletePerson: ({ params }) => {
        deleted = true;
        data.deletePerson(params.id);
        return { status: 204 };
      },
    });
    const response = page.waitForResponse((response) => new URL(response.url()).searchParams.get('page') === '2');
    try {
      await page.reload();
      await expect.poll(() => api.getAllPeople.calls.some(({ params }) => params?.page === 2)).toBe(true);
      const aliceCard = page.locator('#people-card').filter({ has: page.getByAltText('Alice', { exact: true }) });
      await aliceCard.hover();
      await aliceCard.getByRole('button', { name: 'show_person_options', exact: true }).click();
      await page.getByRole('menuitem', { name: 'delete_person', exact: true }).click();
      await app.dialogButton('delete').click();
      await expect.poll(() => names(page)).toEqual(['Bob', 'Charlie', 'Dana']);
    } finally {
      pendingPage.resolve();
    }
    const staleResponse = await response;
    await staleResponse.finished();
    await page.waitForLoadState('networkidle');
    await expect.poll(() => names(page)).toEqual(['Bob', 'Charlie', 'Dana']);
    expect(api.deletePerson).toHaveBeenCalledWith({ params: { id: alice.id }, body: {} });
  });
}

test('a failed refresh can be retried after deletion', async ({ page, data, api, app, logger }) => {
  const alice = factory.person({ name: 'Alice' });
  const bob = factory.person({ name: 'Bob' });
  data.addPeople([alice, bob]);
  await page.goto(Route.people());
  await page
    .locator('#people-card')
    .filter({ has: page.getByAltText('Alice', { exact: true }) })
    .hover();
  await page.getByRole('button', { name: 'show_person_options', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'delete_person', exact: true }).click();
  api.on({ getAllPeople: () => ({ status: 500, json: { message: 'Refresh failed' } }) });
  await app.dialogButton('delete').click();
  await expect(page.getByRole('button', { name: 'retry', exact: true })).toBeVisible();

  api.on({ getAllPeople: () => ({ json: data.peoplePage({}) }) });
  await page.getByRole('button', { name: 'retry', exact: true }).click();

  await expect(page.getByRole('button', { name: 'retry', exact: true })).not.toBeVisible();
  await expect.poll(() => names(page)).toEqual(['Bob']);
  expect(api.deletePerson).toHaveBeenCalledWith({ params: { id: alice.id }, body: {} });
  expect(logger.error).toHaveBeenCalledWith(/Failed to load resource.*500/);
  expect(logger.error).toHaveBeenCalledWith(/handleError/);
});

test('deleting the viewed person returns to the people page', async ({ page, data, api, app }) => {
  const alice = factory.person({ name: 'Alice' });
  data.addPeople(alice);
  await page.goto(Route.viewPerson(alice));
  await page.getByRole('button', { name: 'open', exact: true }).click();
  await page.getByRole('menuitem', { name: 'delete_person', exact: true }).click();
  await app.dialogButton('delete').click();

  await expect(page).toHaveURL(Route.people());
  expect(api.deletePerson).toHaveBeenCalledWith({ params: { id: alice.id }, body: {} });
  await expect(page.getByText('search_no_people', { exact: true })).toBeVisible();
});
