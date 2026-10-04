import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Entry, EventItem, User } from '../types';
import { fmt } from './Board';

const TYPE_META: Record<string, { label: string; icon: string }> = {
  REPORT: { label: '报案', icon: '📝' },
  CLAIM: { label: '接手', icon: '🙋' },
  ASSESSMENT: { label: '现场评估', icon: '🩺' },
  FAMILY_CONTACT: { label: '联系家属', icon: '📞' },
  TRANSFER: { label: '转送', icon: '🚑' },
  EMS_RECEIPT: { label: '急救机构回执', icon: '📨' },
  HANDOVER: { label: '交接', icon: '🔁' },
  ESCALATION: { label: '升级', icon: '⬆️' },
  CLOSE: { label: '关闭', icon: '✅' },
  NOTE: { label: '备注', icon: '💬' },
};

const STATUS_NAMES: Record<string, string> = {
  PENDING: '待接手',
  CLAIMED: '处置中',
  ESCALATED: '已升级',
  CLOSED: '已关闭',
};

const CLOSE_REASONS: Record<string, string> = {
  RESOLVED: '处置完成',
  FALSE_ALARM: '误报',
  DUPLICATE: '重复报警',
};

export default function EventDetail({ me }: { me: User }) {
  const { id = '' } = useParams();
  const [ev, setEv] = useState<EventItem | null>(null);
  const [error, setError] = useState('');
  const [medics, setMedics] = useState<User[]>([]);
  const [correcting, setCorrecting] = useState<Entry | null>(null);

  async function load() {
    try {
      setEv(await api.get(`/events/${id}`));
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000); // 轮询：及时看到他人记录与急救机构回执
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    api
      .get('/auth/users?role=MEDIC')
      .then(setMedics)
      .catch(() => {});
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    }
    await load();
  }

  if (!ev) {
    return <div>{error ? <div className="alert">{error}</div> : '加载中…'}</div>;
  }

  const closed = ev.status === 'CLOSED';
  const isAssignee = ev.assigneeId === me.id;
  const participant = ev.viewer.participant;
  const highRisk = ev.riskLevel === 'HIGH' || ev.status === 'ESCALATED';

  return (
    <div className="detail">
      <Link to="/" className="muted">
        ← 返回值班屏
      </Link>
      {error && <div className="alert">{error}</div>}

      <div className="panel">
        <div className="card-head">
          <span className="code big">{ev.code}</span>
          <span className={`badge status-${ev.status.toLowerCase()}`}>
            {STATUS_NAMES[ev.status]}
          </span>
          {ev.riskLevel === 'HIGH' && <span className="badge risk-high">高风险</span>}
          {ev.closeReason && (
            <span className="badge">{CLOSE_REASONS[ev.closeReason]}</span>
          )}
        </div>
        <div className="meta-grid">
          <div>
            <span className="muted">事发地点</span>
            <strong>{ev.location}</strong>
          </div>
          <div>
            <span className="muted">发生时间</span>
            <strong>{fmt(ev.occurredAt)}</strong>
          </div>
          <div>
            <span className="muted">报案人</span>
            <strong>{ev.createdByName}</strong>
          </div>
          <div>
            <span className="muted">当前处置人</span>
            <strong>{ev.assigneeName || '（未接手）'}</strong>
          </div>
        </div>

        {participant ? (
          <div className="injured-card">
            <h3>伤者信息</h3>
            <div className="meta-grid">
              <div>
                <span className="muted">姓名</span>
                <strong>{ev.injuredName}</strong>
              </div>
              <div>
                <span className="muted">性别 / 年龄</span>
                <strong>
                  {ev.injuredGender}
                  {ev.injuredAge != null ? ` / ${ev.injuredAge} 岁` : ''}
                </strong>
              </div>
              <div>
                <span className="muted">联系方式</span>
                <strong>{ev.injuredContact || '—'}</strong>
              </div>
            </div>
            {ev.description && <p>{ev.description}</p>}
          </div>
        ) : (
          <div className="injured-card masked">
            🔒 伤者资料仅参与处置的人员可见（当前可见：{ev.injuredName}）
          </div>
        )}

        <div className="actions">
          {ev.status === 'PENDING' && (me.role === 'MEDIC' || me.role === 'ADMIN') && (
            <button
              className="btn primary"
              onClick={() => act(() => api.post(`/events/${id}/claim`))}
            >
              立即接手
            </button>
          )}
          {!closed &&
            (isAssignee || me.role === 'DISPATCHER' || me.role === 'ADMIN') && (
              <HandoverForm
                medics={medics}
                currentAssigneeId={ev.assigneeId}
                onSubmit={(toUserId, reason) =>
                  act(() => api.post(`/events/${id}/handover`, { toUserId, reason }))
                }
              />
            )}
          {!closed && (participant || me.role === 'DISPATCHER') && (
            <EscalateForm
              escalated={ev.status === 'ESCALATED'}
              onSubmit={(reason) =>
                act(() => api.post(`/events/${id}/escalate`, { reason }))
              }
            />
          )}
          {!closed &&
            (me.role === 'DISPATCHER' ||
              me.role === 'ADMIN' ||
              isAssignee ||
              ev.createdById === me.id) && (
              <CloseForm
                me={me}
                highRisk={highRisk}
                onSubmit={(reason, note, duplicateOfId) =>
                  act(() =>
                    api.post(`/events/${id}/close`, { reason, note, duplicateOfId }),
                  )
                }
              />
            )}
        </div>
      </div>

      <div className="columns">
        <div className="panel">
          <h3>处置时间线</h3>
          <Timeline
            entries={ev.entries}
            me={me}
            onCorrect={(e) => setCorrecting(e)}
          />
        </div>

        <div className="side">
          {!closed && (participant || me.role === 'ADMIN') && (
            <AddRecord
              ev={ev}
              me={me}
              onSubmit={(type, content, hospital) =>
                act(() =>
                  api.post(`/events/${id}/entries`, {
                    type,
                    content,
                    meta: type === 'TRANSFER' ? { hospital } : undefined,
                  }),
                )
              }
            />
          )}

          {participant && (
            <div className="panel">
              <h3>附件（本地保存）</h3>
              {ev.attachments.length === 0 && <p className="muted">暂无附件</p>}
              <ul className="attach-list">
                {ev.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/uploads/${a.storedName}`} target="_blank" rel="noreferrer">
                      📎 {a.filename}
                    </a>
                    <span className="muted small">（{Math.ceil(a.size / 1024)} KB）</span>
                  </li>
                ))}
              </ul>
              {!closed && (
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) act(() => api.upload(`/events/${id}/attachments`, f));
                    e.target.value = '';
                  }}
                />
              )}
            </div>
          )}

          {participant && ev.notifications.length > 0 && (
            <div className="panel">
              <h3>通知与回执（本地模拟接口）</h3>
              <ul className="notif-list">
                {ev.notifications.map((n) => (
                  <li key={n.id}>
                    <span className={`badge ${n.status === 'ACKED' ? 'status-closed' : 'status-pending'}`}>
                      {n.channel === 'EMS' ? '急救机构' : '内部通知'}
                    </span>{' '}
                    {n.status === 'ACKED' ? `已回执 ${n.receipt}` : '已发送，待回执'}
                    <div className="muted small">{fmt(n.createdAt)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {correcting && (
        <CorrectDialog
          entry={correcting}
          onClose={() => setCorrecting(null)}
          onSubmit={(content) =>
            act(() =>
              api.post(`/events/${id}/entries/${correcting.id}/correct`, { content }),
            ).then(() => setCorrecting(null))
          }
        />
      )}
    </div>
  );
}

/** 处置时间线：按时间展示每次处置与交接；被更正的记录保留原文并标注 */
function Timeline({
  entries,
  me,
  onCorrect,
}: {
  entries: Entry[];
  me: User;
  onCorrect: (e: Entry) => void;
}) {
  const byId = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(e.id, e);
    return m;
  }, [entries]);
  const supersededBy = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) if (e.supersedesId) m.set(e.supersedesId, e);
    return m;
  }, [entries]);

  return (
    <ol className="timeline">
      {entries.map((e) => {
        const meta = TYPE_META[e.type] || { label: e.type, icon: '•' };
        const replaced = supersededBy.get(e.id);
        const original = e.supersedesId ? byId.get(e.supersedesId) : null;
        const canCorrect =
          !replaced &&
          !e.supersedesId &&
          (e.author.id === me.id || me.role === 'ADMIN') &&
          ['ASSESSMENT', 'FAMILY_CONTACT', 'TRANSFER', 'NOTE'].includes(e.type);
        return (
          <li
            key={e.id}
            className={`tl-item ${replaced ? 'tl-superseded' : ''} ${
              e.type === 'ESCALATION' ? 'tl-escalation' : ''
            }`}
          >
            <div className="tl-head">
              <span>{meta.icon}</span>
              <strong>{meta.label}</strong>
              {e.supersedesId && <span className="badge badge-corr">更正</span>}
              <span className="muted small">
                {e.author.name} · {fmt(e.createdAt)}
              </span>
              {canCorrect && (
                <button className="link" onClick={() => onCorrect(e)}>
                  更正
                </button>
              )}
            </div>
            <div className="tl-content">{e.content}</div>
            {original && (
              <details className="orig">
                <summary>查看原文（{fmt(original.createdAt)}，已保留）</summary>
                <div>{original.content}</div>
              </details>
            )}
            {replaced && (
              <div className="muted small">
                ⚠ 该记录已被更正，以 {fmt(replaced.createdAt)} 的版本为准
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function HandoverForm({
  medics,
  currentAssigneeId,
  onSubmit,
}: {
  medics: User[];
  currentAssigneeId: string | null;
  onSubmit: (toUserId: string, reason: string) => void;
}) {
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('换班');
  const candidates = medics.filter((m) => m.id !== currentAssigneeId);
  return (
    <span className="inline-form">
      <select value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
        <option value="">交接给…</option>
        {candidates.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="原因（如：换班）"
        style={{ width: 130 }}
      />
      <button
        className="btn"
        disabled={!toUserId}
        onClick={() => onSubmit(toUserId, reason)}
      >
        交接
      </button>
    </span>
  );
}

function EscalateForm({
  escalated,
  onSubmit,
}: {
  escalated: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  if (escalated) return null;
  return (
    <span className="inline-form">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="升级原因（高风险）"
        style={{ width: 180 }}
      />
      <button
        className="btn danger"
        disabled={!reason.trim()}
        onClick={() => onSubmit(reason)}
      >
        ⬆️ 升级
      </button>
    </span>
  );
}

function CloseForm({
  me,
  highRisk,
  onSubmit,
}: {
  me: User;
  highRisk: boolean;
  onSubmit: (reason: string, note: string, duplicateOfId?: string) => void;
}) {
  const [reason, setReason] = useState('RESOLVED');
  const [note, setNote] = useState('');
  const [dupOf, setDupOf] = useState('');
  const blocked = highRisk && me.role !== 'ADMIN';
  return (
    <span className="inline-form">
      <select value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="RESOLVED">处置完成</option>
        <option value="FALSE_ALARM">误报</option>
        <option value="DUPLICATE">重复报警</option>
      </select>
      {reason === 'DUPLICATE' && (
        <input
          value={dupOf}
          onChange={(e) => setDupOf(e.target.value)}
          placeholder="原事件编号"
          style={{ width: 120 }}
        />
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="备注（可选）"
        style={{ width: 150 }}
      />
      <button
        className="btn"
        disabled={blocked || (reason === 'DUPLICATE' && !dupOf.trim())}
        title={blocked ? '高风险事件须由管理人员复盘后关闭' : ''}
        onClick={() => onSubmit(reason, note, dupOf || undefined)}
      >
        关闭事件
      </button>
      {blocked && <span className="muted small">高风险须管理员关闭</span>}
    </span>
  );
}

function AddRecord({
  ev,
  me,
  onSubmit,
}: {
  ev: EventItem;
  me: User;
  onSubmit: (type: string, content: string, hospital: string) => void;
}) {
  const canHandle = me.role === 'ADMIN' || ev.assigneeId === me.id;
  const types = canHandle
    ? [
        ['ASSESSMENT', '现场评估'],
        ['FAMILY_CONTACT', '联系家属'],
        ['TRANSFER', '转送'],
        ['NOTE', '备注'],
      ]
    : [['NOTE', '备注']];
  const [type, setType] = useState(types[0][0]);
  const [content, setContent] = useState('');
  const [hospital, setHospital] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmit(type, content, hospital);
    setContent('');
  }

  return (
    <div className="panel">
      <h3>补充处置记录</h3>
      {!canHandle && (
        <p className="muted small">您不是当前处置人，仅可添加备注。</p>
      )}
      <form onSubmit={submit} className="form">
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {type === 'TRANSFER' && (
            <input
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
              placeholder="转送医院"
              required
            />
          )}
        </div>
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记录内容…"
          required
        />
        <button className="btn primary" type="submit">
          提交记录
        </button>
        {type === 'TRANSFER' && (
          <p className="muted small">
            提交后将通过本地模拟接口通知急救机构，回执会自动出现在时间线中。
          </p>
        )}
      </form>
    </div>
  );
}

function CorrectDialog({
  entry,
  onClose,
  onSubmit,
}: {
  entry: Entry;
  onClose: () => void;
  onSubmit: (content: string) => void;
}) {
  const [content, setContent] = useState(entry.content);
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>更正记录（原文将保留）</h3>
        <div className="orig">
          <div className="muted small">原文（{fmt(entry.createdAt)}）：</div>
          <div>{entry.content}</div>
        </div>
        <textarea
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="actions">
          <button
            className="btn primary"
            disabled={!content.trim() || content === entry.content}
            onClick={() => onSubmit(content)}
          >
            提交更正
          </button>
          <button className="btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
