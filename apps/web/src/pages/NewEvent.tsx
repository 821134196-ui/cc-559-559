import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { User } from '../types';

function defaultLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

/** 快速报警登记：只填关键信息即可先派人，详细报告由急救员处置过程中补充 */
export default function NewEvent({ me }: { me: User }) {
  const navigate = useNavigate();
  const [medics, setMedics] = useState<User[]>([]);
  const [form, setForm] = useState({
    location: '',
    occurredAt: defaultLocal(),
    injuredName: '',
    injuredGender: '男',
    injuredAge: '',
    injuredContact: '',
    description: '',
    riskLevel: 'NORMAL',
    assigneeId: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/auth/users?role=MEDIC')
      .then(setMedics)
      .catch(() => {});
  }, []);

  if (me.role === 'MEDIC') {
    return (
      <div className="alert">
        急救员请直接在值班屏接手求助，新报警由值班员登记。
      </div>
    );
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const ev = await api.post('/events', {
        location: form.location,
        occurredAt: new Date(form.occurredAt).toISOString(),
        injuredName: form.injuredName,
        injuredGender: form.injuredGender,
        injuredAge: form.injuredAge === '' ? null : Number(form.injuredAge),
        injuredContact: form.injuredContact || null,
        description: form.description,
        riskLevel: form.riskLevel,
        assigneeId: form.assigneeId || null,
      });
      navigate(`/events/${ev.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="form-page">
      <h2>新报警登记</h2>
      <p className="muted">
        只需填写关键信息即可先派人处置，详细报告由急救员在处置过程中补充。
      </p>
      {error && <div className="alert">{error}</div>}
      <form onSubmit={submit} className="form">
        <label>
          事发地点 *
          <input
            required
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="如：篮球馆 2 号场地"
          />
        </label>
        <label>
          发生时间 *
          <input
            required
            type="datetime-local"
            value={form.occurredAt}
            onChange={(e) => set('occurredAt', e.target.value)}
          />
        </label>
        <div className="row">
          <label>
            伤者姓名 *
            <input
              required
              value={form.injuredName}
              onChange={(e) => set('injuredName', e.target.value)}
            />
          </label>
          <label>
            性别
            <select
              value={form.injuredGender}
              onChange={(e) => set('injuredGender', e.target.value)}
            >
              <option>男</option>
              <option>女</option>
              <option>未知</option>
            </select>
          </label>
          <label>
            年龄
            <input
              type="number"
              min="0"
              max="120"
              value={form.injuredAge}
              onChange={(e) => set('injuredAge', e.target.value)}
            />
          </label>
        </div>
        <label>
          伤者/家属联系方式
          <input
            value={form.injuredContact}
            onChange={(e) => set('injuredContact', e.target.value)}
            placeholder="仅参与处置人员可见"
          />
        </label>
        <label>
          简要情况
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="一句话说明即可，不要求完整报告"
          />
        </label>
        <div className="row">
          <label>
            风险等级
            <select
              value={form.riskLevel}
              onChange={(e) => set('riskLevel', e.target.value)}
            >
              <option value="NORMAL">一般</option>
              <option value="HIGH">高风险</option>
            </select>
          </label>
          <label>
            当前处置人（可留空，由急救员抢单）
            <select
              value={form.assigneeId}
              onChange={(e) => set('assigneeId', e.target.value)}
            >
              <option value="">— 待接手 —</option>
              {medics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary" type="submit">
          提交报警
        </button>
      </form>
    </div>
  );
}
