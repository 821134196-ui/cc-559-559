import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setToken } from './api';
import { ROLE_LABEL } from './format';
import Login from './components/Login';
import IncidentList from './components/IncidentList';
import IncidentDetail from './components/IncidentDetail';
import CreateForm from './components/CreateForm';

export default function App() {
  const [user, setUser] = useState<any>(() => {
    const t = localStorage.getItem('sir_token');
    return t ? null : null; // 启动时由 /auth/me 恢复
  });
  const [booting, setBooting] = useState(true);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const timer = useRef<any>(null);

  // 恢复登录态
  useEffect(() => {
    (async () => {
      if (localStorage.getItem('sir_token')) {
        try {
          const me = await api.get('auth/me');
          setUser(me);
        } catch {
          setToken(null);
        }
      }
      setBooting(false);
    })();
  }, []);

  const refreshList = useCallback(async () => {
    try {
      setIncidents(await api.get('incidents'));
    } catch {
      /* 未登录忽略 */
    }
  }, []);

  const refreshDetail = useCallback(async (id: number) => {
    try {
      setDetail(await api.get(`incidents/${id}`));
    } catch (e) {
      setDetail(null);
    }
  }, []);

  // 登录后：加载名单、列表、轮询（值班屏实时突出新求助）
  useEffect(() => {
    if (!user) return;
    api.get('users').then(setUsers);
    refreshList();
    timer.current = setInterval(() => {
      refreshList();
      if (selectedId) refreshDetail(selectedId);
    }, 4000);
    return () => clearInterval(timer.current);
  }, [user, selectedId, refreshList, refreshDetail]);

  // 报警后跳转
  useEffect(() => {
    const h = (e: any) => setSelectedId(e.detail);
    window.addEventListener('open-incident', h);
    return () => window.removeEventListener('open-incident', h);
  }, []);

  useEffect(() => {
    if (selectedId) refreshDetail(selectedId);
    else setDetail(null);
  }, [selectedId, refreshDetail]);

  function logout() {
    setToken(null);
    setUser(null);
    setDetail(null);
    setSelectedId(null);
  }

  if (booting) return <div className="empty">加载中…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const medics = users.filter((u) => u.role === 'MEDIC');

  return (
    <div>
      <div className="topbar">
        <span className="logo">🏟️ 体育中心运动损伤应急处置系统</span>
        <span className="spacer" />
        <span className="me">当前身份：<b>{user.name}</b>（{ROLE_LABEL[user.role]}）</span>
        <button className="btn btn-sm" onClick={logout}>切换身份</button>
      </div>

      <div className="layout">
        <div className="col">
          {(user.role === 'DISPATCHER' || user.role === 'ADMIN') && (
            <div className="panel"><div className="panel-b"><CreateForm onCreated={refreshList} /></div></div>
          )}
          <IncidentList incidents={incidents} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="col">
          {!detail ? (
            <div className="panel">
              <div className="empty">
                请在左侧选择一起事件查看详情与完整处置时间线。
                <div style={{ marginTop: 10 }}>
                  {incidents.some((i) => i.status === 'PENDING')
                    ? '🟡 当前有尚未接手的求助，急救员可立即接单演示抢单。'
                    : '值班员可在左上登记新的报警。'}
                </div>
              </div>
            </div>
          ) : (
            <IncidentDetail
              key={detail.id}
              user={user}
              detail={detail}
              medics={medics}
              onChanged={() => {
                refreshList();
                refreshDetail(detail.id);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
