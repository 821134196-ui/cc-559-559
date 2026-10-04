import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { EventItem, User } from '../types';

const STATUS_NAMES: Record<string, string> = {
  PENDING: '待接手',
  CLAIMED: '处置中',
  ESCALATED: '已升级',
  CLOSED: '已关闭',
};

export function fmt(s: string) {
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

function ago(s: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000));
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  return `${Math.floor(m / 60)} 小时前`;
}

export default function Board({ me }: { me: User }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      setEvents(await api.get('/events'));
    } catch {
      /* 忽略轮询错误 */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function claim(id: string) {
    setMsg('');
    try {
      await api.post(`/events/${id}/claim`);
    } catch (e: any) {
      setMsg(e.message); // 例如：该求助已被他人接手
    }
    await load();
  }

  const pending = events.filter((e) => e.status === 'PENDING');
  const active = events.filter(
    (e) => e.status === 'CLAIMED' || e.status === 'ESCALATED',
  );
  const closed = events.filter((e) => e.status === 'CLOSED');

  return (
    <div>
      {msg && <div className="alert">{msg}</div>}

      <section className="pending-section">
        <h2>🚨 未接手求助（{pending.length}）</h2>
        {pending.length === 0 && (
          <p className="muted">当前没有待接手的求助。</p>
        )}
        <div className="card-grid">
          {pending.map((ev) => (
            <EventCard key={ev.id} ev={ev} me={me} onClaim={claim} highlight />
          ))}
        </div>
      </section>

      <section>
        <h2>处置中 / 已升级（{active.length}）</h2>
        {active.length === 0 && <p className="muted">暂无。</p>}
        <div className="card-grid">
          {active.map((ev) => (
            <EventCard key={ev.id} ev={ev} me={me} onClaim={claim} />
          ))}
        </div>
      </section>

      <section>
        <h2>已关闭（{closed.length}）</h2>
        {closed.length === 0 && <p className="muted">暂无。</p>}
        <div className="card-grid">
          {closed.map((ev) => (
            <EventCard key={ev.id} ev={ev} me={me} onClaim={claim} />
          ))}
        </div>
      </section>
    </div>
  );
}

function EventCard({
  ev,
  me,
  onClaim,
  highlight,
}: {
  ev: EventItem;
  me: User;
  onClaim: (id: string) => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={`card ${highlight ? 'card-pending' : ''} ${
        ev.riskLevel === 'HIGH' ? 'card-high' : ''
      }`}
    >
      <div className="card-head">
        <Link to={`/events/${ev.id}`} className="code">
          {ev.code}
        </Link>
        <span className={`badge status-${ev.status.toLowerCase()}`}>
          {STATUS_NAMES[ev.status]}
        </span>
        {ev.riskLevel === 'HIGH' && <span className="badge risk-high">高风险</span>}
      </div>
      <div className="loc">{ev.location}</div>
      <div className="muted small">
        发生时间：{fmt(ev.occurredAt)}（{ago(ev.occurredAt)}）
      </div>
      <div className="muted small">
        伤者：{ev.injuredName}　{ev.injuredGender}
        {ev.injuredAge != null ? `　${ev.injuredAge} 岁` : ''}
      </div>
      <div className="muted small">处置人：{ev.assigneeName || '（未接手）'}</div>
      <div className="card-actions">
        <Link className="btn" to={`/events/${ev.id}`}>
          详情
        </Link>
        {ev.status === 'PENDING' && (me.role === 'MEDIC' || me.role === 'ADMIN') && (
          <button className="btn primary" onClick={() => onClaim(ev.id)}>
            立即接手
          </button>
        )}
      </div>
    </div>
  );
}
