import { useState } from 'react';
import { api } from '../api';

// 伤者资料卡：默认脱敏；仅参与处置者/管理员可解锁查看完整 PII
export default function PiiCard({ detail, onUnlocked }: { detail: any; onUnlocked: (d: any) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const p = detail.injuredPerson;

  if (!p) {
    return (
      <div className="pii-box">
        <div className="hint">伤者详细资料尚未登记（急救员现场评估时补充姓名、证件、既往史等）。</div>
      </div>
    );
  }

  async function unlock() {
    setBusy(true);
    setErr('');
    try {
      const d = await api.get(`incidents/${detail.id}?fullPii=1`);
      onUnlocked(d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`pii-box ${p.piiLocked ? 'locked' : ''}`}>
      {p.piiLocked ? (
        <>
          <div className="pii-lock-note">🔒 伤者资料受保护：仅参与本事件处置的人员及管理员可查看完整信息</div>
          <button className="btn btn-sm" disabled={busy} onClick={unlock}>
            {busy ? '校验权限中…' : '申请查看（系统将校验处置参与身份）'}
          </button>
          {err && <div className="banner banner-err" style={{ marginTop: 8 }}>{err}</div>}
          <div className="kv" style={{ marginTop: 10 }}>
            <span className="k">姓名</span><span>{p.name ?? '—'}</span>
            <span className="k">电话</span><span>{p.phone ?? '—'}</span>
            <span className="k">证件号</span><span>{p.idNumber ?? '—'}</span>
            <span className="k">既往史</span><span>{p.medicalNote}</span>
          </div>
        </>
      ) : (
        <>
          <div className="banner banner-ok" style={{ marginBottom: 10 }}>
            🔓 您是本事件参与处置人员，已展示完整资料（非参与者看到的是脱敏数据）
          </div>
          <div className="kv">
            <span className="k">姓名</span><span>{p.name ?? '—'}</span>
            <span className="k">性别/年龄</span><span>{[p.gender, p.age ? p.age + ' 岁' : null].filter(Boolean).join(' / ') || '—'}</span>
            <span className="k">电话</span><span>{p.phone ?? '—'}</span>
            <span className="k">证件号</span><span>{p.idNumber ?? '—'}</span>
            <span className="k">住址</span><span>{p.address ?? '—'}</span>
            <span className="k">既往史/过敏</span><span>{p.medicalNote ?? '—'}</span>
          </div>
        </>
      )}
    </div>
  );
}
