import { AppError } from "./errors.js";

type MockResponse<T> = {
  ok: boolean;
  status: number;
  body: T;
};

export async function requestJson<T>(operation: () => Promise<MockResponse<T>>): Promise<T> {
  const response = await operation();

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
