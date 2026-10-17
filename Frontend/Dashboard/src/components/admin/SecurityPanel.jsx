import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useVms } from '../../context/VmsContext';

const REASONS = ['safety', 'theft', 'harassment', 'trespass', 'legal_order', 'policy_violation', 'other'];
const label = (value) => value.replace(/_/g, ' ');

/** Security reviews (visits that matched a restricted-entry record) and the records themselves. */
export const SecurityPanel = () => {
  const { sites, currentUser, refreshData, showToast } = useVms();
  const [approvals, setApprovals] = useState([]);
  const [entries, setEntries] = useState([]);
  const [reviews, setReviews] = useState({});
  const [reasons, setReasons] = useState({});
  const [form, setForm] = useState({ match_name: '', match_email: '', match_phone: '', reason_category: 'safety', reason_detail: '', severity: 'require_approval', site_id: currentUser?.site_id || '' });
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [pending, records] = await Promise.all([api('/security/approvals'), api('/blacklist')]);
      setApprovals(pending);
      setEntries(records);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Security data could not be loaded.');
    }
  };
  useEffect(() => { load(); }, []);

  const decide = async (approval, decision) => {
    const reason = (reasons[approval.id] || '').trim();
    if (reason.length < 5) { setError('Give a reason of at least 5 characters for the decision.'); return; }
    const matchReviews = approval.matches
      .filter((match) => reviews[match.id] && reviews[match.id] !== match.confidence)
      .map((match) => ({ match_id: match.id, confidence: reviews[match.id] }));
    try {
      await api(`/security/approvals/${approval.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason, match_reviews: matchReviews }) });
      showToast(decision === 'approve' ? 'Visit approved after security review.' : 'Visit denied.');
      await Promise.all([load(), refreshData()]);
    } catch (requestError) { setError(requestError.message); }
  };

  const create = async (event) => {
    event.preventDefault();
    const body = { reason_category: form.reason_category, severity: form.severity, reason_detail: form.reason_detail || null, site_id: form.site_id || null };
    for (const key of ['match_name', 'match_email', 'match_phone']) if (form[key].trim()) body[key] = form[key].trim();
    try {
      await api('/blacklist', { method: 'POST', body: JSON.stringify(body) });
      setForm({ ...form, match_name: '', match_email: '', match_phone: '', reason_detail: '' });
      showToast('Restricted-entry record added. Upcoming visits were re-screened.');
      await Promise.all([load(), refreshData()]);
    } catch (requestError) { setError(requestError.message); }
  };

  const lift = async (entry) => {
    const reason = window.prompt('Why is this restriction being lifted?');
    if (!reason || reason.trim().length < 5) return;
    try {
      await api(`/blacklist/${entry.id}/lift`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      await load();
    } catch (requestError) { setError(requestError.message); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-4" aria-labelledby="security-title">
      <div>
        <h2 id="security-title" className="text-sm font-semibold text-slate-900">Security reviews</h2>
        <p className="mt-1 text-xs text-slate-500">Visitors who matched a restricted-entry record wait here. You cannot decide for your own visitors.</p>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {approvals.length === 0 && <p className="text-xs text-slate-500">No visits are waiting for a security decision.</p>}
      {approvals.map((approval) => (
        <article key={approval.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-sm">
          <p className="font-semibold text-slate-900">{approval.visitor_name} <span className="font-normal text-slate-500">to see {approval.host_name}</span></p>
          <ul className="mt-2 flex flex-col gap-1">
            {approval.matches.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${match.severity === 'deny' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{match.severity === 'deny' ? 'Deny' : 'Needs approval'}</span>
                <span>{label(match.reason_category)} · matched on {match.match_basis}</span>
                <select aria-label="Is this the same person?" value={reviews[match.id] || match.confidence}
                  onChange={(event) => setReviews({ ...reviews, [match.id]: event.target.value })} className="rounded border border-slate-300 bg-white px-1 py-0.5">
                  <option value="confirmed">Same person</option>
                  <option value="uncertain">Not sure</option>
                  <option value="rejected">Different person</option>
                </select>
              </li>
            ))}
          </ul>
          <textarea aria-label="Decision reason" rows={2} maxLength={500} placeholder="Reason for the decision (recorded in the audit trail)"
            value={reasons[approval.id] || ''} onChange={(event) => setReasons({ ...reasons, [approval.id]: event.target.value })}
            className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => decide(approval, 'approve')} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Approve visit</button>
            <button type="button" onClick={() => decide(approval, 'deny')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">Deny visit</button>
          </div>
        </article>
      ))}

      <div className="border-t border-slate-100 pt-3">
        <h3 className="text-sm font-semibold text-slate-900">Restricted-entry records</h3>
        <p className="mt-1 text-xs text-slate-500">Store only what is needed to recognise the person. Records must be reviewed within 12 months.</p>
        <form onSubmit={create} className="mt-2 grid gap-2 sm:grid-cols-3">
          <input aria-label="Name to match" placeholder="Full name" value={form.match_name} onChange={(event) => setForm({ ...form, match_name: event.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <input aria-label="Email to match" type="email" placeholder="Email" value={form.match_email} onChange={(event) => setForm({ ...form, match_email: event.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <input aria-label="Phone to match" placeholder="Phone" value={form.match_phone} onChange={(event) => setForm({ ...form, match_phone: event.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <select aria-label="Reason" value={form.reason_category} onChange={(event) => setForm({ ...form, reason_category: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
            {REASONS.map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}
          </select>
          <select aria-label="Severity" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="require_approval">Needs security approval</option>
            <option value="deny">Deny entry</option>
          </select>
          <select aria-label="Applies to" value={form.site_id} onChange={(event) => setForm({ ...form, site_id: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
            {currentUser?.site_ids === null && <option value="">All sites</option>}
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          <input aria-label="Details" placeholder="Details (restricted to administrators)" maxLength={1000} value={form.reason_detail} onChange={(event) => setForm({ ...form, reason_detail: event.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:col-span-2" />
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Add record</button>
        </form>
        <ul className="mt-3 divide-y divide-slate-100">
          {entries.length === 0 && <li className="py-2 text-xs text-slate-500">No active records.</li>}
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span>
                <strong className="text-slate-900">{entry.match_name || entry.match_email || entry.match_phone_digits || 'Linked visitor'}</strong>
                {' · '}{label(entry.reason_category)} · {entry.severity === 'deny' ? 'deny' : 'needs approval'} · review by {new Date(entry.review_due_at).toLocaleDateString()}
              </span>
              <button type="button" onClick={() => lift(entry)} className="rounded-lg border border-slate-200 px-2 py-1">Lift</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
