import { useState } from 'react';
import { api } from '../api';
import { nowLocalInput } from '../format';

// 最小报警表单：地点 / 发生时间 / 伤者简要 / 当前处置人 —— 不要求写长报告
export default function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    location: '',
    occurredAt: nowLocalInput(),
    victimBrief: '',
    victimContactPhone: '',
    initialHandlerNote: '',
  });

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setErr('');
    try {
      const inc = await api.post('incidents', form);
      setOpen(false);
      setForm({ location: '', occurredAt: nowLocalInput(), victimBrief: '', victimContactPhone: '', initialHandlerNote: '' });
      onCreated();
      // 直接打开新事件
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-incident', { detail: inc.id })), 100);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary" style={{ width: '100%', padding: '10px' }} onClick={() => setOpen(true)}>
        ＋ 接到现场求助，登记报警
      </button>
    );
  }

  return (
    <div className="form-box">
      <h4>🚨 新报警（先派人，报告后补）</h4>
      {err && <div className="banner banner-err">{err}</div>}
      <div className="field">
        <label>地点 *</label>
        <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="如：综合篮球馆 3 号场地" />
      </div>
      <div className="field">
        <label>发生时间 *</label>
        <input type="datetime-local" value={form.occurredAt} onChange={(e) => set('occurredAt', e.target.value)} />
      </div>
      <div className="field">
        <label>伤者基本情况 *（简要即可，到场后再补评估）</label>
        <textarea value={form.victimBrief} onChange={(e) => set('victimBrief', e.target.value)} placeholder="性别 / 大致年龄 / 主诉" />
      </div>
      <div className="field">
        <label>现场联系电话（选填）</label>
        <input value={form.victimContactPhone} onChange={(e) => set('victimContactPhone', e.target.value)} />
      </div>
      <div className="field">
        <label>当前处置人 / 初派安排（选填）</label>
        <input value={form.initialHandlerNote} onChange={(e) => set('initialHandlerNote', e.target.value)} placeholder="如：已通知王急救携 AED 前往" />
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>
        提交后系统立即向所有当班急救员推送接单通知，急救员可在现场逐步补充评估与处置记录。
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit}>
          立即登记并推送
        </button>
        <button className="btn" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
    </div>
  );
}
