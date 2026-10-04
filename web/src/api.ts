// 后端 API 封装（Bearer 令牌存 localStorage）
let token: string | null = localStorage.getItem('sir_token');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('sir_token', t);
  else localStorage.removeItem('sir_token');
}
export function getToken() {
  return token;
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err: any = new Error(data.message || `请求失败 ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p: string) => request(`/api/${p}`),
  post: (p: string, body?: any) =>
    request(`/api/${p}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  upload: (p: string, form: FormData) =>
    request(`/api/${p}`, { method: 'POST', body: form }),
  // 并发抢单演示：不依赖当前登录身份，用指定账号令牌同时发起接单
  rawAccept: (userId: number, incidentId: number) =>
    request(`/api/incidents/${incidentId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer u${userId}` },
    }),
};
