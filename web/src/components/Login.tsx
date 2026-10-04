import { useState } from 'react';
import { api, setToken } from '../api';
import { ROLE_LABEL } from '../format';

const PRESETS = [
  { username: 'duty', desc: '接警登记、值班调度' },
  { username: 'medic1', desc: '现场急救处置' },
  { username: 'medic2', desc: '现场急救处置' },
  { username: 'medic3', desc: '现场急救处置' },
  { username: 'admin', desc: '升级处置、复盘结案' },
];

export default function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState('');

  async function login(username: string) {
    setErr('');
    setLoading(username);
    try {
      const r = await api.post('auth/login', { username });
      if (!r.ok) {
        setErr(r.message || '登录失败');
        return;
      }
      setToken(r.token);
      onLogin(r.user);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>体育中心运动损伤应急处置系统</h1>
        <div className="sub">请选择当班身份进入（本地演示系统，免密码）</div>
        {err && <div className="banner banner-err">{err}</div>}
        <div className="user-pick">
          {PRESETS.map((p) => (
            <button key={p.username} disabled={!!loading} onClick={() => login(p.username)}>
              <div className="rn">
                {loading === p.username ? '登录中…' : `${p.username} · ${ROLE_LABEL[userRole(p.username)] || ''}`}
              </div>
              <div className="rr">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function userRole(username: string) {
  if (username === 'duty') return 'DISPATCHER';
  if (username === 'admin') return 'ADMIN';
  return 'MEDIC';
}
