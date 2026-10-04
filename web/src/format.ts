export const ROLE_LABEL: Record<string, string> = {
  DISPATCHER: '前台值班员',
  MEDIC: '急救员',
  ADMIN: '管理员',
};

export const STATUS_TAG: Record<string, string> = {
  PENDING: 'tag-pending',
  ACTIVE: 'tag-active',
  RESOLVED: 'tag-resolved',
  FALSE_ALARM: 'tag-false',
  DUPLICATE: 'tag-duplicate',
};

export function fmt(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtFull(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function nowLocalInput() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
