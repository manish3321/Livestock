import type {
  AnimalDto,
  DeviceRegister,
  ExpenseCreate,
  ExpenseReview,
  FarmWithholdDto,
  LoginResponse,
  MarkerCohortDto,
  PageResult,
  RecordingRoundDto,
  RoundRemainingDto,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  TagSequenceBlockClaim,
  TagSequenceBlockDto,
  TaskDto,
  TokenPair,
} from '@farm/contracts';
import type { FarmApi } from '../core/sync-engine';
import { apiBaseUrl, noteApiSuccess, noteWorkingOrigin } from './config';
import { clearTokens, loginPlatform, saveTokens } from './secure-session';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type MobileExpense = {
  id: string;
  category: string;
  amount: number;
  expenseDate: string;
  description: string;
  status: string;
  supplier: string | null;
};

type RefreshHandler = () => Promise<string | null>;

export function createHttpFarmApi(options: {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokens: (pair: TokenPair) => void | Promise<void>;
  onAuthFailure: () => void | Promise<void>;
}): FarmApi & {
  refresh: () => Promise<TokenPair>;
  logout: () => Promise<void>;
  me: () => Promise<unknown>;
  createRound: (body: {
    mode: string;
    session?: string;
    deviceId?: string;
  }) => Promise<RecordingRoundDto>;
  activeRound: () => Promise<RecordingRoundDto | null>;
  registerDevice: (body: DeviceRegister) => Promise<unknown>;
  listExpenses: (page?: number) => Promise<PageResult<MobileExpense>>;
  createExpense: (body: ExpenseCreate) => Promise<MobileExpense>;
  reviewExpense: (id: string, body: ExpenseReview) => Promise<MobileExpense>;
  completeTask: (id: string, body?: { byScan?: boolean }) => Promise<unknown>;
  listOpenTasks: () => Promise<PageResult<TaskDto>>;
  get: <T = unknown>(path: string) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  patch: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  del: <T = unknown>(path: string) => Promise<T>;
  /** Multipart upload (no Content-Type — fetch sets boundary). */
  uploadFile: <T = unknown>(
    path: string,
    fieldName: string,
    file: { uri: string; name: string; type: string },
  ) => Promise<T>;
} {
  const base = () => apiBaseUrl();

  const parseJson = async (res: Response): Promise<unknown> => {
    const text = await res.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  };

  let refreshPromise: Promise<string | null> | null = null;

  const doRefresh: RefreshHandler = async () => {
    const refreshToken = options.getRefreshToken();
    if (!refreshToken) return null;
    let res: Response;
    try {
      res = await fetch(`${base()}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      return null;
    }
    if (!res.status || res.status < 200 || !res.ok) {
      await options.onAuthFailure();
      return null;
    }
    const pair = (await res.json()) as TokenPair;
    await options.onTokens(pair);
    await saveTokens(pair.accessToken, pair.refreshToken);
    return pair.accessToken;
  };

  const refreshOnce = () => {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  };

  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string | null,
    retry = true,
  ): Promise<T> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const auth = token ?? options.getAccessToken();
    if (auth) headers.Authorization = `Bearer ${auth}`;

    let res: Response;
    try {
      res = await fetch(`${base()}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('NETWORK', 0);
    }

    if (!res.status || res.status < 200) {
      throw new ApiError('NETWORK', 0);
    }

    if (res.status === 401 && retry && path !== '/v1/auth/login' && path !== '/v1/auth/refresh') {
      let next: string | null = null;
      try {
        next = await refreshOnce();
      } catch {
        throw new ApiError('NETWORK', 0);
      }
      if (next) return request<T>(method, path, body, next, false);
      throw new ApiError('UNAUTHORIZED', 401);
    }

    if (!res.ok) {
      const errBody = await parseJson(res);
      throw new ApiError(`HTTP_${res.status}`, res.status, errBody);
    }
    noteApiSuccess();
    noteWorkingOrigin(base());
    if (res.status === 204) return undefined as T;
    return (await parseJson(res)) as T;
  };

  return {
    async login(email, password, deviceId) {
      const res = await request<LoginResponse>(
        'POST',
        '/v1/auth/login',
        {
          email,
          password,
          deviceName: deviceId,
          platform: loginPlatform(),
        },
        null,
        false,
      );
      await options.onTokens(res);
      await saveTokens(res.accessToken, res.refreshToken);
      return res;
    },
    async refresh() {
      const refreshToken = options.getRefreshToken();
      if (!refreshToken) throw new ApiError('NO_REFRESH', 401);
      const pair = await request<TokenPair>('POST', '/v1/auth/refresh', { refreshToken }, null, false);
      await options.onTokens(pair);
      await saveTokens(pair.accessToken, pair.refreshToken);
      return pair;
    },
    async logout() {
      try {
        await request<void>('POST', '/v1/auth/logout', undefined, options.getAccessToken(), false);
      } catch {
        /* ignore */
      }
      await clearTokens();
      await options.onAuthFailure();
    },
    me() {
      return request('GET', '/v1/auth/me');
    },
    pull(cursor, token) {
      return request<SyncPullResponse>('GET', `/v1/sync/pull?cursor=${cursor}&limit=200`, undefined, token);
    },
    push(body: SyncPushRequest, token) {
      return request<SyncPushResponse>('POST', '/v1/sync/push', body, token);
    },
    listAnimals(page, token) {
      return request<PageResult<AnimalDto>>(
        'GET',
        `/v1/animals?page=${page}&pageSize=200&sort=tag&order=asc`,
        undefined,
        token,
      );
    },
    activeWithholds(token) {
      return request<FarmWithholdDto[]>('GET', '/v1/withholds/active', undefined, token);
    },
    markerCohort(token) {
      return request<MarkerCohortDto>('GET', '/v1/markers/cohort', undefined, token);
    },
    listTasks(dueBefore, token) {
      return request<PageResult<TaskDto>>(
        'GET',
        `/v1/tasks?page=1&pageSize=200&dueBefore=${encodeURIComponent(dueBefore)}`,
        undefined,
        token,
      );
    },
    claimBlock(body: TagSequenceBlockClaim, token) {
      return request<TagSequenceBlockDto>('POST', '/v1/tags/blocks', body, token);
    },
    remaining(roundId, token) {
      return request<RoundRemainingDto>('GET', `/v1/rounds/${roundId}/remaining`, undefined, token);
    },
    postRest(path, body, token) {
      return request('POST', path, body, token);
    },
    patchRest(path, body, token) {
      return request('PATCH', path, body, token);
    },
    createRound(body) {
      return request<RecordingRoundDto>('POST', '/v1/rounds', body);
    },
    activeRound() {
      return request<RecordingRoundDto | null>('GET', '/v1/rounds/active');
    },
    registerDevice(body) {
      return request('POST', '/v1/devices', body);
    },
    listExpenses(page = 1) {
      return request<PageResult<MobileExpense>>(
        'GET',
        `/v1/expenses?page=${page}&pageSize=50`,
      );
    },
    createExpense(body) {
      return request<MobileExpense>('POST', '/v1/expenses', body);
    },
    reviewExpense(id, body) {
      return request<MobileExpense>('POST', `/v1/expenses/${id}/review`, body);
    },
    completeTask(id, body = {}) {
      return request('PATCH', `/v1/tasks/${id}/complete`, body);
    },
    listOpenTasks() {
      // Match web Inbox: open tasks only (PENDING|SNOOZED), urgency order from API.
      return request<PageResult<TaskDto>>('GET', '/v1/tasks?page=1&pageSize=80');
    },
    get<T = unknown>(path: string) {
      return request<T>('GET', path);
    },
    post<T = unknown>(path: string, body?: unknown) {
      return request<T>('POST', path, body);
    },
    patch<T = unknown>(path: string, body?: unknown) {
      return request<T>('PATCH', path, body);
    },
    put<T = unknown>(path: string, body?: unknown) {
      return request<T>('PUT', path, body);
    },
    del<T = unknown>(path: string) {
      return request<T>('DELETE', path);
    },
    async uploadFile<T = unknown>(
      path: string,
      fieldName: string,
      file: { uri: string; name: string; type: string },
    ): Promise<T> {
      const send = async (retry: boolean): Promise<T> => {
        const form = new FormData();
        form.append(fieldName, {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as unknown as Blob);

        const headers: Record<string, string> = { Accept: 'application/json' };
        const auth = options.getAccessToken();
        if (auth) headers.Authorization = `Bearer ${auth}`;

        let res: Response;
        try {
          res = await fetch(`${base()}${path}`, { method: 'POST', headers, body: form });
        } catch {
          throw new ApiError('NETWORK', 0);
        }

        if (!res.status || res.status < 200) {
          throw new ApiError('NETWORK', 0);
        }

        if (res.status === 401 && retry) {
          let next: string | null = null;
          try {
            next = await refreshOnce();
          } catch {
            throw new ApiError('NETWORK', 0);
          }
          if (next) return send(false);
          throw new ApiError('UNAUTHORIZED', 401);
        }

        if (!res.ok) {
          const errBody = await parseJson(res);
          throw new ApiError(`HTTP_${res.status}`, res.status, errBody);
        }
        noteApiSuccess();
        noteWorkingOrigin(base());
        if (res.status === 204) return undefined as T;
        return (await parseJson(res)) as T;
      };
      return send(true);
    },
  };
}

export type HttpFarmApi = ReturnType<typeof createHttpFarmApi>;
