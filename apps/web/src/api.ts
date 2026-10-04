import type { User } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string {
  return localStorage.getItem('token') || '';
}

export function getUser(): User | null {
  const s = localStorage.getItem('user');
  return s ? JSON.parse(s) : null;
}

export function saveSession(token: string, user: User) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (typeof options.body === 'string') headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      msg = Array.isArray(data.message)
        ? data.message.join('；')
        : data.message || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) =>
    request(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  upload: (path: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(path, { method: 'POST', body: fd });
  },
};
