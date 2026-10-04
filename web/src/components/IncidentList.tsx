import { fmt } from '../format';

export default function IncidentList({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: any[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const pending = incidents.filter((i) => i.status === 'PENDING');
  const high = incidents.filter((i) => i.severity === 'HIGH' && !['RESOLVED', 'FALSE_ALARM', 'DUPLICATE'].includes(i.status));

  return (
    <div className="panel">
      <div className="panel-h">
        🖥️ 值班屏
        <span className="spacer" />
        {pending.length > 0 && <span className="tag tag-pending blink">待接手 {pending.length}</span>}
        {high.length > 0 && <span className="tag tag-high">高风险 {high.length}</span>}
      </div>
      {pending.length === 0 && incidents.length === 0 && <div className="empty">暂无事件</div>}
      {incidents.map((i) => (
        <div
          key={i.id}
          className={`inc-card ${i.status === 'PENDING' ? 'pending' : ''} ${i.severity === 'HIGH' && i.status !== 'RESOLVED' ? 'high' : ''} ${selectedId === i.id ? 'selected' : ''}`}
          onClick={() => onSelect(i.id)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="inc-code">{i.code}</span>
            <span style={{ flex: 1 }} />
            {i.severity === 'HIGH' && <span className="tag tag-high">高风险</span>}
            <span className={`tag ${statusClass(i.status)}`}>{statusLabel(i.status)}</span>
          </div>
          <div className="inc-loc">📍 {i.location}</div>
          <div className="inc-brief">{i.victimBrief}</div>
          <div className="inc-meta">
            <span className="pill-mini">{fmt(i.occurredAt)}</span>
            {i.status === 'PENDING' ? (
              <span className="tag tag-pending blink">等待急救员接单</span>
            ) : (
              <span className="pill-mini">处置人：{i.currentHandler?.name || '—'}</span>
            )}
            {i.duplicateOf && <span className="tag tag-duplicate">重复→{i.duplicateOf.code}</span>}
            <span style={{ flex: 1 }} />
            <span className="pill-mini">{i.eventCount} 条记录</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function statusClass(s: string) {
  return { PENDING: 'tag-pending', ACTIVE: 'tag-active', RESOLVED: 'tag-resolved', FALSE_ALARM: 'tag-false', DUPLICATE: 'tag-duplicate' }[s] || 'tag-false';
}
function statusLabel(s: string) {
  return { PENDING: '待接手', ACTIVE: '处置中', RESOLVED: '已结案', FALSE_ALARM: '误报', DUPLICATE: '重复报警' }[s] || s;
}
