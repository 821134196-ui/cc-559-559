import { useState } from 'react';
import { api } from '../api';
import RaceDemo from './RaceDemo';

type FormKey =
  | 'assess' | 'treat' | 'family' | 'handoff' | 'hospital'
  | 'escalate' | 'falseAlarm' | 'duplicate' | 'close' | null;

export default function ActionPanel({
  user, detail, medics, onChanged, onCorrect,
}: {
  user: any;
  detail: any;
  medics: any[];
  onChanged: () => void;
  onCorrect: (ev: any) => void;
}) {
  const [open, setOpen] = useState<FormKey>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const isMedic = user.role === 'MEDIC';
  const isAdmin = user.role === 'ADMIN';
  const isDispatcher = user.role === 'DISPATCHER';
  const closed = ['RESOLVED', 'FALSE_ALARM', 'DUPLICATE'].includes(detail.status);
  const isParticipant = detail.isParticipant;
  const canAct = isAdmin || (isMedic && isParticipant); // 追加处置记录的权限

  function toggle(k: FormKey) {
    setOpen(open === k ? null : k);
    setErr('');
    setOk('');
  }

  async function run(fn: () => Promise<any>, success: string, refreshDetail = true) {
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const r = await fn();
      setOk(success);
      setOpen(null);
      onChanged();
      return r;
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const otherMedics = medics.filter((m) => m.id !== detail.currentHandler?.id);

  return (
    <div>
      {err && <div className="banner banner-err">{err}</div>}
      {ok && <div className="banner banner-ok">{ok}</div>}

      {/* ---------- 待接手：抢单 ---------- */}
      {detail.status === 'PENDING' && isMedic && (
        <>
          <button className="btn btn-warn" style={{ width: '100%', padding: '11px', fontWeight: 700 }}
            disabled={busy}
            onClick={() => run(() => api.post(`incidents/${detail.id}/accept`),
              '接单成功：您已成为本事件唯一有效接手人')}>
            🙋 我是急救员，立即接单
          </button>
          <RaceDemo incidentId={detail.id} medics={medics} onSettled={onChanged} />
        </>
      )}
      {detail.status === 'PENDING' && !isMedic && (
        <div className="banner banner-info">该求助尚无人接手，值班屏已向全部当班急救员推送通知。</div>
      )}

      {/* ---------- 处置中：操作按钮组 ---------- */}
      {!closed && detail.status === 'ACTIVE' && (
        <div className="row-actions">
          {canAct && <button className="btn btn-primary" onClick={() => toggle('assess')}>📋 现场评估</button>}
          {canAct && <button className="btn btn-primary" onClick={() => toggle('treat')}>💊 补充处置</button>}
          {canAct && <button className="btn" onClick={() => toggle('family')}>📞 联系家属</button>}
          {canAct && <button className="btn" onClick={() => toggle('handoff')}>🔄 换班交接</button>}
          {canAct && <button className="btn" onClick={() => toggle('hospital')}>🚑 转院</button>}
          {(canAct || isDispatcher) && !detail.escalatedAt && (
            <button className="btn btn-ghost-danger" onClick={() => toggle('escalate')}>⚠️ 升级为高风险</button>
          )}
          {isDispatcher && (
            <button className="btn" onClick={() => toggle('duplicate')}>🔗 标记重复报警</button>
          )}
          {(isDispatcher || canAct) && (
            <button className="btn btn-ghost-danger" onClick={() => toggle('falseAlarm')}>🚫 标记误报</button>
          )}
          {isAdmin && <button className="btn btn-danger" onClick={() => toggle('close')}>✔️ 管理员结案</button>}
        </div>
      )}

      {/* 已结案/误报/重复：前台与急救员无关闭权的提示 */}
      {closed && (
        <div className="banner banner-info">
          事件已终结（{detail.statusLabel}{detail.closeReason ? `：${detail.closeReason}` : ''}），记录全部保留备查。
        </div>
      )}
      {!closed && isDispatcher && detail.status === 'ACTIVE' && (
        <div className="hint" style={{ marginTop: 8 }}>
          前台不能直接关闭急救员已接手的事件；如需误报或结案，须由管理员确认。
        </div>
      )}

      {/* ---------- 表单区 ---------- */}
      {open === 'assess' && <AssessForm busy={busy} onSubmit={(d) =>
        run(async () => {
          const fd = new FormData();
          fd.append('content', d.content);
          fd.append('severity', d.severity);
          fd.append('escalateReason', d.escalateReason || '');
          fd.append('injuredPerson', JSON.stringify(d.pii));
          d.files.forEach((f: File) => fd.append('files', f));
          const r = await api.upload(`incidents/${detail.id}/assess`, fd);
          if (r.escalated) setOk('评估已记录，系统已自动升级为高风险并通知管理员');
          return r;
        }, '现场评估已记录')} onCancel={() => setOpen(null)} />}

      {open === 'treat' && <TreatForm busy={busy} onSubmit={(d) =>
        run(async () => {
          const fd = new FormData();
          fd.append('content', d.content);
          d.files.forEach((f: File) => fd.append('files', f));
          return api.upload(`incidents/${detail.id}/treat`, fd);
        }, '处置记录已追加')} onCancel={() => setOpen(null)} />}

      {open === 'family' && <FamilyForm busy={busy} onSubmit={(d) =>
        run(() => api.post(`incidents/${detail.id}/family`, d), d.sendSms ? '已记录并发送模拟短信' : '联系家属情况已记录')}
        onCancel={() => setOpen(null)} />}

      {open === 'handoff' && <HandoffForm busy={busy} medics={otherMedics} onSubmit={(d) =>
        run(() => api.post(`incidents/${detail.id}/handoff`, d), '交接完成，处置人已更新（记录沿原事件保留）')}
        onCancel={() => setOpen(null)} />}

      {open === 'hospital' && <HospitalForm busy={busy} high={detail.severity === 'HIGH'} onSubmit={(d) =>
        run(() => api.post(`incidents/${detail.id}/hospital`, d), '转院记录已保存，急救机构回执已归档')}
        onCancel={() => setOpen(null)} />}

      {open === 'escalate' && <SimpleTextForm title="升级为高风险" label="升级原因" busy={busy}
        onSubmit={(reason) => run(() => api.post(`incidents/${detail.id}/escalate`, { reason }),
          '已升级：管理员收到通知，前台将无法关闭本事件')} onCancel={() => setOpen(null)} />}

      {open === 'falseAlarm' && <SimpleTextForm title="标记误报" label="误报原因" busy={busy}
        onSubmit={(reason) => run(() => api.post(`incidents/${detail.id}/false-alarm`, { reason }),
          '已标记误报（原事件记录保留）')} onCancel={() => setOpen(null)} />}

      {open === 'duplicate' && <DuplicateForm busy={busy} onSubmit={(d) =>
        run(() => api.post(`incidents/${detail.id}/duplicate`, d), '已关联为重复报警，本单合并至原事件')}
        onCancel={() => setOpen(null)} />}

      {open === 'close' && <SimpleTextForm title="管理员结案" label="结案意见（复盘结论）" busy={busy}
        onSubmit={(reason) => run(() => api.post(`incidents/${detail.id}/close`, { reason }), '事件已结案')}
        onCancel={() => setOpen(null)} />}
    </div>
  );
}

/* ---------------- 各表单 ---------------- */

function Shell({ title, children, onCancel }: { title: string; children: any; onCancel: () => void }) {
  return (
    <div className="form-box" style={{ marginTop: 12 }}>
      <h4>{title}</h4>
      {children}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

function AssessForm({ busy, onSubmit, onCancel }: any) {
  const [content, setContent] = useState('');
  const [high, setHigh] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [pii, setPii] = useState<any>({ name: '', gender: '男', age: '', phone: '', idNumber: '', address: '', medicalNote: '' });

  return (
    <Shell title="📋 现场评估" onCancel={onCancel}>
      <div className="field">
        <label>现场评估（意识/呼吸/受伤部位/初步判断）</label>
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="到场后所见、体格检查、初步诊断" />
      </div>
      <div className="field">
        <label className="check-row">
          <input type="checkbox" checked={high} onChange={(e) => setHigh(e.target.checked)} />
          判定为 <b style={{ color: '#dc2626' }}>高风险</b>（生命体征不稳定/疑似重伤），勾选后自动升级并通知管理员
        </label>
      </div>
      {high && (
        <div className="field">
          <label>升级原因</label>
          <input value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} placeholder="如：胸痛不缓解、血氧 92%" />
        </div>
      )}
      <div className="section-title">伤者资料（仅参与处置者可见）</div>
      <div className="forms-grid">
        <div><label>姓名</label><input value={pii.name} onChange={(e) => setPii({ ...pii, name: e.target.value })} /></div>
        <div><label>性别 / 年龄</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={pii.gender} onChange={(e) => setPii({ ...pii, gender: e.target.value })} style={{ width: 90 }}>
              <option>男</option><option>女</option>
            </select>
            <input type="number" value={pii.age} onChange={(e) => setPii({ ...pii, age: e.target.value })} placeholder="年龄" />
          </div>
        </div>
        <div><label>联系电话</label><input value={pii.phone} onChange={(e) => setPii({ ...pii, phone: e.target.value })} /></div>
        <div><label>证件号</label><input value={pii.idNumber} onChange={(e) => setPii({ ...pii, idNumber: e.target.value })} /></div>
        <div className="full"><label>住址</label><input value={pii.address} onChange={(e) => setPii({ ...pii, address: e.target.value })} /></div>
        <div className="full"><label>既往史 / 过敏史</label><input value={pii.medicalNote} onChange={(e) => setPii({ ...pii, medicalNote: e.target.value })} /></div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>现场照片/单据附件（本地保存，选填）</label>
        <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
      </div>
      <button className="btn btn-primary" disabled={busy || !content.trim()}
        onClick={() => onSubmit({ content, severity: high ? 'HIGH' : 'NORMAL', escalateReason, pii, files })}>
        提交评估
      </button>
    </Shell>
  );
}

function TreatForm({ busy, onSubmit, onCancel }: any) {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  return (
    <Shell title="💊 补充处置记录" onCancel={onCancel}>
      <div className="field">
        <label>处置内容（止血/包扎/固定/用药/AED 等，可多次追加）</label>
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="field">
        <label>附件（选填）</label>
        <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
      </div>
      <button className="btn btn-primary" disabled={busy || !content.trim()}
        onClick={() => onSubmit({ content, files })}>提交处置记录</button>
    </Shell>
  );
}

function FamilyForm({ busy, onSubmit, onCancel }: any) {
  const [f, setF] = useState({ contactName: '', relation: '', phone: '', content: '', sendSms: false, smsContent: '' });
  return (
    <Shell title="📞 联系家属" onCancel={onCancel}>
      <div className="forms-grid">
        <div><label>家属称谓/姓名</label><input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></div>
        <div><label>关系</label><input value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="如：母亲" /></div>
        <div className="full"><label>家属电话</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="11 位手机号，用于模拟短信回执" /></div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>联系情况 *</label>
        <textarea rows={2} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="如：已电话告知伤情，家属约 20 分钟到" />
      </div>
      <div className="field">
        <label className="check-row">
          <input type="checkbox" checked={f.sendSms} onChange={(e) => setF({ ...f, sendSms: e.target.checked })} />
          通过本地模拟短信网关发送通知
        </label>
      </div>
      {f.sendSms && (
        <div className="field">
          <label>短信内容</label>
          <textarea rows={2} value={f.smsContent} onChange={(e) => setF({ ...f, smsContent: e.target.value })}
            placeholder="【体育中心医务室】您的家属在本中心受伤正在接受处置……" />
        </div>
      )}
      <button className="btn btn-primary" disabled={busy || !f.content.trim()} onClick={() => onSubmit(f)}>保存</button>
    </Shell>
  );
}

function HandoffForm({ busy, medics, onSubmit, onCancel }: any) {
  const [toUserId, setToUserId] = useState(medics[0]?.id || 0);
  const [content, setContent] = useState('');
  return (
    <Shell title="🔄 换班交接" onCancel={onCancel}>
      <div className="field">
        <label>交接给（接班急救员将成为新处置人，并获得伤者资料查看权）</label>
        <select value={toUserId} onChange={(e) => setToUserId(Number(e.target.value))}>
          {medics.map((m: any) => <option key={m.id} value={m.id}>{m.name}（{m.phone}）</option>)}
        </select>
      </div>
      <div className="field">
        <label>交接说明（当前进展、注意事项）</label>
        <textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={() => onSubmit({ toUserId, content })}>确认交接</button>
    </Shell>
  );
}

function HospitalForm({ busy, high, onSubmit, onCancel }: any) {
  const [f, setF] = useState({
    hospital: '市中心医院急诊', requestAmbulance: true, transportBy: 'AMBULANCE', callbackPhone: '', content: '',
  });
  return (
    <Shell title="🚑 转院" onCancel={onCancel}>
      <div className="field">
        <label>接收医院 *</label>
        <input value={f.hospital} onChange={(e) => setF({ ...f, hospital: e.target.value })} />
      </div>
      <div className="field">
        <label className="check-row">
          <input type="checkbox" checked={f.requestAmbulance} onChange={(e) => setF({ ...f, requestAmbulance: e.target.checked })} />
          呼叫 120（本地模拟急救中心派车回执）
        </label>
      </div>
      <div className="forms-grid">
        <div>
          <label>转送方式</label>
          <select value={f.transportBy} onChange={(e) => setF({ ...f, transportBy: e.target.value })}>
            <option value="AMBULANCE">120 救护车</option>
            <option value="CENTER_VEHICLE">中心车辆</option>
            <option value="SELF">自行前往</option>
          </select>
        </div>
        <div><label>随车联系电话</label><input value={f.callbackPhone} onChange={(e) => setF({ ...f, callbackPhone: e.target.value })} /></div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>转院说明</label>
        <textarea rows={2} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="生命体征、途中处置、随附资料" />
      </div>
      {high && <div className="hint" style={{ color: '#b45309' }}>高风险事件将按 I 级分诊通知医院，救护车优先派发。</div>}
      <button className="btn btn-primary" disabled={busy} onClick={() => onSubmit(f)}>确认转院并获取回执</button>
    </Shell>
  );
}

function SimpleTextForm({ title, label, busy, onSubmit, onCancel }: any) {
  const [v, setV] = useState('');
  return (
    <Shell title={title} onCancel={onCancel}>
      <div className="field">
        <label>{label} *</label>
        <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy || !v.trim()} onClick={() => onSubmit(v)}>确认提交</button>
    </Shell>
  );
}

function DuplicateForm({ busy, onSubmit, onCancel }: any) {
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('同一地点同一伤者的重复求助电话');
  return (
    <Shell title="🔗 标记重复报警" onCancel={onCancel}>
      <div className="field">
        <label>原始事件编号 *（如 INC-20261004-002）</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="INC-YYYYMMDD-000" />
      </div>
      <div className="field">
        <label>判定原因</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="hint">本单将保留全部记录并关联到原事件，不再重复派人。</div>
      <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={busy || !code.trim()}
        onClick={() => onSubmit({ duplicateCode: code, reason })}>确认关联</button>
    </Shell>
  );
}
