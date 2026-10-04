import { fmt } from '../format';

const EV_TAG: Record<string, string> = {
  CREATE: 'tag-ev',
  ACCEPT: 'tag-normal',
  ASSESS: 'tag-active',
  TREAT: 'tag-active',
  FAMILY: 'tag-ev',
  TRANSFER_HANDOFF: 'tag-duplicate',
  HOSPITAL: 'tag-duplicate',
  AMBULANCE: 'tag-duplicate',
  ESCALATE: 'tag-high',
  CORRECTION: 'tag-pending',
  FALSE_ALARM: 'tag-false',
  DUPLICATE: 'tag-duplicate',
  CLOSE: 'tag-resolved',
};

export default function Timeline({ detail, onCorrect }: { detail: any; onCorrect: (ev: any) => void }) {
  return (
    <div className="timeline">
      {detail.timeline.map((ev: any) => (
        <div key={ev.id} className={`tl-item t-${ev.type}`}>
          <div className="tl-top">
            <span className={`tag ${EV_TAG[ev.type] || 'tag-ev'}`}>{ev.typeLabel}</span>
            <span className="tl-time">{fmt(ev.createdAt)}</span>
            <span className="tl-actor">{ev.actor}</span>
            <span style={{ flex: 1 }} />
            {ev.correctable && detail.status !== 'FALSE_ALARM' && (
              <button className="btn btn-sm" onClick={() => onCorrect(ev)}>
                更正
              </button>
            )}
          </div>
          <div className="tl-content">{ev.content}</div>
          {ev.correctedFrom && (
            <div className="tl-corrected">
              <b>原文保留（{ev.correctedFrom.typeLabel}）：</b>
              <div style={{ marginTop: 3, textDecoration: 'line-through' }}>{ev.correctedFrom.content}</div>
            </div>
          )}
          {ev.meta?.attachmentIds?.length > 0 && (
            <div className="tl-attach">
              {detail.attachments
                .filter((a: any) => ev.meta.attachmentIds.includes(a.id))
                .map((a: any) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    📎 {a.name}
                  </a>
                ))}
            </div>
          )}
          {ev.meta?.sms && <div className="hint">短信回执：{ev.meta.sms.messageId} · {ev.meta.sms.status}</div>}
          {ev.meta?.dispatchNo && (
            <div className="hint">
              120 派车单 {ev.meta.dispatchNo} · {ev.meta.vehicle} · 预计 {ev.meta.etaMinutes} 分钟
            </div>
          )}
          {ev.meta?.receiptNo && <div className="hint">医院回执 {ev.meta.receiptNo} · 分诊 {ev.meta.triageLevel}</div>}
        </div>
      ))}
    </div>
  );
}
