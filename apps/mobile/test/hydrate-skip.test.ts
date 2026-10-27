import { describe, expect, it, vi } from 'vitest';
import { applySnapshot, createStore } from '../src/core/store';
import { hydrateFromNetwork, type FarmApi } from '../src/core/sync-engine';

const ANIMAL_ID = '11111111-1111-4111-8111-111111111111';

function seedHerd(store: ReturnType<typeof createStore>) {
  applySnapshot(store, {
    pullCursor: 42,
    tagBlocks: [],
    photos: [],
    animals: [
      {
        id: ANIMAL_ID,
        tag: 'BUF004',
        shortNo: 'B04',
        name: 'Kali',
        species: 'BUFFALO',
        status: 'LACTATING',
        gender: 'FEMALE',
        isPregnant: false,
        penName: 'Shed 1',
        photoUrl: null,
        photoLocalPath: null,
        rolling7Mean: null,
        version: 1,
        lactationStartDate: null,
        expectedCalvingDate: null,
        deletedAt: null,
      },
    ],
    withholds: [],
    markers: [],
    tasks: [],
  });
}

function fakeApi(overrides: Partial<FarmApi> = {}): FarmApi {
  return {
    login: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
    listAnimals: vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 200,
      total: 0,
    })),
    activeWithholds: vi.fn(async () => []),
    markerCohort: vi.fn(async () => ({ groups: [] })),
    listTasks: vi.fn(async () => ({ items: [], page: 1, pageSize: 200, total: 0 })),
    claimBlock: vi.fn(),
    remaining: vi.fn(),
    postRest: vi.fn(),
    patchRest: vi.fn(),
    ...overrides,
  };
}

describe('hydrateFromNetwork animal skip', () => {
  it('does not re-page animals when a herd and pull cursor already exist', async () => {
    const store = createStore('dev-1');
    store.accessToken = 'tok';
    seedHerd(store);
    const api = fakeApi();

    await hydrateFromNetwork(store, api);

    expect(api.listAnimals).not.toHaveBeenCalled();
    expect(api.activeWithholds).toHaveBeenCalledOnce();
    expect(api.markerCohort).toHaveBeenCalledOnce();
    expect(api.listTasks).toHaveBeenCalledOnce();
    expect(store.animals.get(ANIMAL_ID)?.tag).toBe('BUF004');
    expect(store.pullCursor).toBe(42);
  });

  it('re-pages the herd when animals: full is forced (login)', async () => {
    const store = createStore('dev-1');
    store.accessToken = 'tok';
    seedHerd(store);
    const api = fakeApi({
      listAnimals: vi.fn(async () => ({
        items: [
          {
            id: ANIMAL_ID,
            tag: 'BUF004',
            herdNumber: 'B04',
            name: 'Kali',
            species: 'BUFFALO',
            status: 'LACTATING',
            gender: 'FEMALE',
            isPregnant: false,
            shed: 'Shed 1',
            photoUrl: null,
            version: 2,
            lactationStartDate: null,
            expectedCalvingDate: null,
            deletedAt: null,
          },
        ],
        page: 1,
        pageSize: 200,
        total: 1,
        // Partial AnimalDto is enough — hydrate only reads the fields above.
      })) as unknown as FarmApi['listAnimals'],
    });

    await hydrateFromNetwork(store, api, new Date(), { animals: 'full' });

    expect(api.listAnimals).toHaveBeenCalled();
    expect(store.animals.get(ANIMAL_ID)?.version).toBe(2);
  });
});
