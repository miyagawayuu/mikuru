import { AppError } from "./errors.js";
import { getAuthHeaders } from "./auth.js";

type MockResponse<T> = {
  ok: boolean;
  status: number;
  body: T;
};

export type RequestContext = {
  headers: Record<string, string>;
};

export type RequestOptions = {
  auth?: boolean;
  headers?: Record<string, string>;
};

export async function requestJson<T>(operation: (context: RequestContext) => Promise<MockResponse<T>>, options: RequestOptions = {}): Promise<T> {
  const headers = {
    ...(options.auth ? getAuthHeaders() : {}),
    ...options.headers
  };
  const response = await operation({ headers });

  if (!response.ok) {
    throw new AppError(`Request failed with status ${response.status}`, "API_ERROR");
  }

  return response.body;
}

export function mockJson<T>(body: T): Promise<MockResponse<T>> {
  return Promise.resolve({
    ok: true,
    status: 200,
    body
  });
}
