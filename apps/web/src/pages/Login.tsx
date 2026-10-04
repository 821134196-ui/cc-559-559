import { useEffect, useState } from 'react';
import { api, saveSession } from '../api';
import { ROLE_NAMES } from '../App';
import type { User } from '../types';

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/auth/users')
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, []);

  async function login(username: string) {
    setError('');
    try {
      const r = await api.post('/auth/login', { username });
      saveSession(r.token, r.user);
      onLogin(r.user);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="login-page">
      <h1>🏥 体育中心运动损伤应急处置系统</h1>
      <p className="muted">演示环境：选择账号直接登录</p>
      {error && <div className="alert">{error}</div>}
      <div className="user-grid">
        {users.map((u) => (
          <button key={u.id} className="user-card" onClick={() => login(u.username)}>
            <strong>{u.name}</strong>
            <span className="muted">{ROLE_NAMES[u.role]}</span>
          </button>
        ))}
      </div>
      <p className="muted small">
        提示：开两个浏览器窗口分别登录李婷 / 王强，同时点「立即接手」可演示抢单。
      </p>
    </div>
  );
}
