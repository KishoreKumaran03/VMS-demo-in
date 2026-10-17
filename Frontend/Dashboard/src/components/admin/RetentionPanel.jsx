import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useVms } from '../../context/VmsContext';

const CLASS_LABELS = {
  ordinary_visit: 'Completed visits', security_visit: 'Security-related visits', pass_scan: 'Pass scans', notification: 'Notifications',
  auth_event: 'Sign-in events', audit_log: 'Audit log', outbox_event: 'Processed sync events', job_run: 'Job history',
};

/** Platform retention defaults, legal/investigation holds, and system health (Super Admin). */
export const RetentionPanel = () => {
  const { showToast } = useVms();
  const [policies, setPolicies] = useState([]);
  const [holds, setHolds] = useState([]);
  const [health, setHealth] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [policyRows, holdRows, healthBody] = await Promise.all([api('/retention/policies'), api('/retention/holds'), api('/ops/health')]);
      setPolicies(policyRows);
      setHolds(holdRows);
      setHealth(healthBody);
      setError('');
    } catch (loadError) { setError(loadError.message || 'Retention settings could not be loaded.'); }
  };
  useEffect(() => { load(); }, []);

  const save = async (policy, months) => {
    try {
      await api('/retention/policies', { method: 'PUT', body: JSON.stringify({
        organization_id: policy.organization_id, site_id: policy.site_id, record_class: policy.record_class,
        retain_months: Number(months), action: policy.action, notes: policy.notes }) });
      showToast(`${CLASS_LABELS[policy.record_class]}: kept for ${months} months.`);
      await load();
    } catch (requestError) { setError(requestError.message); }
  };
  const release = async (hold) => {
    const reason = window.prompt('Why is this hold being released?');
    if (!reason || reason.trim().length < 5) return;
    try {
      await api(`/retention/holds/${hold.id}/release`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      await load();
    } catch (requestError) { setError(requestError.message); }
  };
  const runPreview = async () => {
    try { setPreview(await api('/retention/preview')); } catch (requestError) { setError(requestError.message); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-4" aria-labelledby="retention-title">
      {health && (
        <div className={`rounded-xl p-3 text-xs ${health.status === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} role="status">
          <p className="font-semibold">System health: {health.status === 'ok' ? 'all checks passing' : 'attention needed'}</p>
          {health.problems.map((problem) => <p key={problem}>• {problem}</p>)}
          <p className="mt-1 text-slate-600">Last backup: {health.backups.last_success_at ? new Date(health.backups.last_success_at).toLocaleString() : 'none recorded'} ·
            Last restore test: {health.backups.last_restore_test_at ? new Date(health.backups.last_restore_test_at).toLocaleString() : 'none recorded'}</p>
        </div>
      )}
      <div>
        <h2 id="retention-title" className="text-sm font-semibold text-slate-900">Data retention</h2>
        <p className="mt-1 text-xs text-slate-500">Records older than these periods are anonymized or deleted nightly. Backups keep copies until they expire (up to 6 months).</p>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <table className="w-full text-left text-xs">
        <thead><tr className="text-slate-500"><th className="py-1 font-medium">Records</th><th className="font-medium">Scope</th><th className="font-medium">Months</th><th className="font-medium">Action</th></tr></thead>
        <tbody>
          {policies.map((policy) => (
            <tr key={policy.id} className="border-t border-slate-100">
              <td className="py-1.5">{CLASS_LABELS[policy.record_class] || policy.record_class}</td>
              <td>{policy.site_id ? 'Site' : policy.organization_id ? 'Organization' : 'Platform default'}</td>
              <td>
                <input aria-label={`Months to keep ${CLASS_LABELS[policy.record_class]}`} type="number" min={1} max={120} defaultValue={policy.retain_months}
                  onBlur={(event) => Number(event.target.value) !== policy.retain_months && save(policy, event.target.value)}
                  className="w-16 rounded border border-slate-300 px-1 py-0.5" />
              </td>
              <td>{policy.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2">
        <button type="button" onClick={runPreview} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium">Preview next run</button>
        {preview && <span className="text-xs text-slate-600">Would anonymize {preview.counts.visits_anonymized} visits and {preview.counts.people_anonymized} visitors; {preview.counts.visits_held} held.</span>}
      </div>
      <div className="border-t border-slate-100 pt-3">
        <h3 className="text-sm font-semibold text-slate-900">Active retention holds</h3>
        {holds.length === 0 && <p className="mt-1 text-xs text-slate-500">No records are on hold.</p>}
        <ul className="divide-y divide-slate-100">
          {holds.map((hold) => (
            <li key={hold.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span>{hold.hold_type.replace('_', ' ')} hold on a {hold.entity_type} {hold.case_reference ? `(${hold.case_reference})` : ''} · review by {new Date(hold.review_due_at).toLocaleDateString()}</span>
              <button type="button" onClick={() => release(hold)} className="rounded-lg border border-slate-200 px-2 py-1">Release</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
