import { useState } from 'react';
import { api } from '../api';

// 多人同时接单演示：用两个急救员身份在同一瞬间发起 accept，
// 后端条件更新保证只有一人成为唯一有效接手人。
export default function RaceDemo({
  incidentId,
  medics,
  onSettled,
}: {
  incidentId: number;
  medics: any[];
  onSettled: () => void;
}) {
  const [a, setA] = useState<number>(medics[0]?.id ?? 0);
  const [b, setB] = useState<number>(medics[1]?.id ?? 0);
  const [results, setResults] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function race() {
    setBusy(true);
    setResults(null);
    const [ra, rb] = await Promise.allSettled([api.rawAccept(a, incidentId), api.rawAccept(b, incidentId)]);
    setResults({ a: unwrap(ra), b: unwrap(rb) });
    setBusy(false);
    onSettled();
  }

  function unwrap(r: PromiseSettledResult<any>) {
    if (r.status === 'fulfilled') return r.value;
    return { won: false, error: (r.reason?.message || '请求失败') };
  }

  const medicName = (id: number) => medics.find((m) => m.id === id)?.name || `#${id}`;

  return (
    <div className="race-box">
      <b>🧪 多人抢单并发演示</b>
      <div className="hint">选择两名急救员，用两个身份令牌在同一瞬间发起接单（Promise.all 并发）：</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <select value={a} onChange={(e) => setA(Number(e.target.value))}>
          {medics.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <span style={{ color: '#6b7686' }}>⚡ 同时接单 ⚡</span>
        <select value={b} onChange={(e) => setB(Number(e.target.value))}>
          {medics.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button className="btn btn-warn" disabled={busy || a === b} onClick={race}>
          {busy ? '并发请求中…' : '开始抢单'}
        </button>
      </div>
      {a === b && <div className="hint" style={{ color: '#b45309' }}>请选择两名不同的急救员</div>}
      {results && (
        <div className="race-result">
          {[['a', a], ['b', b]].map(([key, id]) => {
            const r = results[key];
            const won = r.won === true;
            return (
              <div key={key as string} className={`race-card ${won ? 'win' : 'lose'}`}>
                <b>{medicName(id as number)}</b>
                <div style={{ marginTop: 6 }}>
                  {won ? (
                    <>✅ 抢单成功，成为<b>唯一有效接手人</b>，事件转入处置中</>
                  ) : r.handler ? (
                    <>⛔ 抢单失败：{r.handler} 已接手（{r.reason === 'LOST_RACE' ? '并发竞争落败' : '已被接手'}）</>
                  ) : (
                    <>⛔ {r.error || '抢单失败'}</>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
