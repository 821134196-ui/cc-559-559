import { useState } from 'react';
import { api } from '../api';
import { fmtFull } from '../format';
import Timeline from './Timeline';
import PiiCard from './PiiCard';
import ActionPanel from './ActionPanel';

export default function IncidentDetail({
  user, detail, medics, onChanged,
}: {
  user: any;
  detail: any;
  medics: any[];
  onChanged: () => void;
}) {
  const [d, setD] = useState(detail);
  const [correctTarget, setCorrectTarget] = useState<any>(null);
  const [correctText, setCorrectText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // 外部切换/刷新后同步
  if (d.id !== detail.id || d.updatedAt !== detail.updatedAt || d.timeline.length !== detail.timeline.length) {
    setD(detail);
  }

  async function submitCorrection() {
    setBusy(true);
    setErr('');
    try {
      await api.post(`incidents/${d.id}/correct`, { eventId: correctTarget.id, newContent: correctText });
      setCorrectTarget(null);
      setCorrectText('');
      onChanged();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="detail-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{d.code}</h2>
          {d.severity === 'HIGH' ? <span className="tag tag-high">⚠️ 高风险{!d.escalatedAt ? '' : ''}</span> : <span className="tag tag-normal">普通风险</span>}
          <span className={`tag ${({ PENDING: 'tag-pending', ACTIVE: 'tag-active', RESOLVED: 'tag-resolved', FALSE_ALARM: 'tag-false', DUPLICATE: 'tag-duplicate' } as any)[d.status]}`}>{d.statusLabel}</span>
          {d.duplicateOf && <span className="tag tag-duplicate">重复报警 → {d.duplicateOf.code}</span>}
        </div>
        <div className="kv" style={{ marginTop: 12 }}>
          <span className="k">地点</span><span>📍 {d.location}</span>
          <span className="k">发生时间</span><span>{fmtFull(d.occurredAt)}</span>
          <span className="k">伤者简要</span><span>{d.victimBrief}</span>
          {d.initialHandlerNote && <><span className="k">初派安排</span><span>{d.initialHandlerNote}</span></>}
          <span className="k">当前处置人</span>
          <span>{d.currentHandler ? `${d.currentHandler.name}（${d.currentHandler.role === 'MEDIC' ? '急救员' : d.currentHandler.role}）` : '— 尚未接手 —'}</span>
          {d.escalatedAt && <><span className="k">升级时间</span><span style={{ color: '#dc2626' }}>{fmtFull(d.escalatedAt)}</span></>}
          {d.closedAt && <><span className="k">终结时间</span><span>{fmtFull(d.closedAt)}{d.closeReason ? `（${d.closeReason}）` : ''}</span></>}
        </div>
        {d.duplicates?.length > 0 && (
          <div className="hint" style={{ marginTop: 8 }}>
            关联的重复报警单：{d.duplicates.map((x: any) => `${x.code}[${x.status}]`).join('、')}
          </div>
        )}

        <ActionPanel user={user} detail={d} medics={medics} onChanged={onChanged} onCorrect={setCorrectTarget} />
      </div>

      <div className="panel-h" style={{ borderTop: '1px solid var(--line)' }}>👤 伤者资料（PII）</div>
      <div className="panel-b">
        <PiiCard detail={d} onUnlocked={(full) => setD({ ...d, injuredPerson: { ...full.injuredPerson } })} />
      </div>

      <div className="panel-h">🧑‍🤝‍🧑 参与处置人员（{d.participants.length}）</div>
      <div className="panel-b" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {d.participants.length === 0 && <span className="hint">尚无急救员接手</span>}
        {d.participants.map((p: any) => (
          <span key={p.userId} className="tag tag-ev" style={{ fontSize: 12.5, padding: '4px 11px' }}>
            {p.name} · {({ ACCEPTOR: '接手人', SUPPORT: '协助', HANDOFF: '换班接手' } as any)[p.role]}
            {d.canSeePii && p.phone ? ` · ${p.phone}` : ''}
          </span>
        ))}
      </div>

      <div className="panel-h">
        🕒 处置时间线
        <span className="spacer" />
        <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7686' }}>按时间展示每次处置与交接，只追加不删除</span>
      </div>
      <Timeline detail={d} onCorrect={setCorrectTarget} />

      {d.mockLogs?.length > 0 && (
        <>
          <div className="panel-h">🏥 急救机构回执（本地模拟接口）</div>
          <div className="panel-b">
            {d.mockLogs.map((l: any) => (
              <div key={l.id} className="mock-log">
                <div className="mh">
                  {l.provider === 'AMBULANCE' ? '🚑 市急救中心 · 派车' : '🏥 医院急诊 · 接收'}
                  <span className="pill-mini" style={{ marginLeft: 8 }}>{fmtFull(l.createdAt)} · {l.operator}</span>
                </div>
                <div className="receipt">{JSON.stringify(l.response, null, 2)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {d.notifications?.length > 0 && (
        <>
          <div className="panel-h">🔔 通知记录</div>
          <div className="panel-b">
            {d.notifications.slice(0, 8).map((n: any) => (
              <div key={n.id} className="notif-line">
                <span className="pill-mini">{n.channel}</span>
                <span style={{ flex: 1 }}>→ {n.target}：{n.content}</span>
                <span className="pill-mini">{n.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 更正弹窗：原文 + 新内容 */}
      {correctTarget && (
        <div className="modal-mask" onClick={() => setCorrectTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">更正「{correctTarget.typeLabel}」记录</div>
            <div className="modal-b">
              <div className="hint" style={{ marginBottom: 6 }}>原文将保留并在时间线中划线展示：</div>
              <div className="tl-corrected" style={{ marginBottom: 12 }}>{correctTarget.content}</div>
              {err && <div className="banner banner-err">{err}</div>}
              <label>更正后的内容 *</label>
              <textarea rows={4} value={correctText} onChange={(e) => setCorrectText(e.target.value)} />
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setCorrectTarget(null)}>取消</button>
              <button className="btn btn-primary" disabled={busy || !correctText.trim()} onClick={submitCorrection}>
                提交更正（保留原文）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
