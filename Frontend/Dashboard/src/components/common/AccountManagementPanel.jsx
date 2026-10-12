import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useVms } from '../../context/VmsContext';

const emptyForm = { name: '', email: '', password: '', employeeId: '', department: '' };

export const AccountManagementPanel = ({ scope }) => {
  const { currentUser, sites, showToast } = useVms();
  const isPlatformAdmin = scope === 'platform';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState(isPlatformAdmin ? 'site-admin' : 'host');
  const [siteId, setSiteId] = useState(currentUser?.site_id || '');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!siteId && sites.length) setSiteId(isPlatformAdmin ? sites[0].id : currentUser?.site_id || '');
  }, [currentUser?.site_id, isPlatformAdmin, siteId, sites]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      setUsers(await api('/users'));
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Accounts could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Enter a name, email, and temporary password.');
      return;
    }
    if (!siteId) {
      setError('Select an active site before creating this account.');
      return;
    }
    if (role === 'host' && (!form.employeeId.trim() || !form.department.trim())) {
      setError('Enter the host employee ID and department.');
      return;
    }

    setSaving(true);
    try {
      if (role === 'host') {
        await api('/hosts/accounts', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email.trim(),
            full_name: form.name.trim(),
            password: form.password,
            employee_id: form.employeeId.trim(),
            department: form.department.trim(),
            site_id: siteId,
          }),
        });
      } else {
        const selectedSite = sites.find((site) => site.id === siteId);
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email.trim(),
            full_name: form.name.trim(),
            password: form.password,
            role,
            site_id: siteId,
            ...(isPlatformAdmin ? { organization_id: selectedSite?.organization_id } : {}),
          }),
        });
      }
      showToast(`${form.name.trim()} was added as ${role.replace('-', ' ')}.`);
      setForm(emptyForm);
      setShowForm(false);
      await loadUsers();
    } catch (saveError) {
      setError(saveError.message || 'The account could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const siteName = (id) => sites.find((site) => site.id === id)?.name || 'Assigned site';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" aria-labelledby="account-management-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="account-management-title" className="text-base font-semibold text-slate-900">Account management</h2>
          <p className="mt-1 text-xs text-slate-500">
            {isPlatformAdmin
              ? 'Create site admins, Super Admins, hosts, and receptionists for active sites.'
              : 'Create host or reception accounts for your site.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setError(''); setShowForm((visible) => !visible); }}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          {showForm ? 'Close' : isPlatformAdmin ? 'Add account' : 'Add team account'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          {!isPlatformAdmin && (
            <label className="grid gap-1 text-xs font-medium text-slate-700">
              Account type
              <select value={role} onChange={(event) => setRole(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="host">Host</option>
                <option value="receptionist">Receptionist</option>
              </select>
            </label>
          )}
          {isPlatformAdmin && (
            <label className="grid gap-1 text-xs font-medium text-slate-700">
              Account type
              <select value={role} onChange={(event) => setRole(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="site-admin">Site Admin</option>
                <option value="super-admin">Super Admin</option>
                <option value="host">Host</option>
                <option value="receptionist">Receptionist</option>
              </select>
            </label>
          )}
          {isPlatformAdmin ? (
            <label className="grid gap-1 text-xs font-medium text-slate-700">
              Site
              <select value={siteId} onChange={(event) => setSiteId(event.target.value)} required className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Choose a site</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          ) : (
            <p className="self-end text-xs text-slate-500">This account will belong to {siteName(currentUser?.site_id)}.</p>
          )}
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Full name
            <input name="name" value={form.name} onChange={updateField} autoComplete="name" required maxLength={160} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Email
            <input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Initial password
            <input name="password" type="password" value={form.password} onChange={updateField} autoComplete="new-password" minLength={12} maxLength={128} required className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <span className="font-normal text-slate-500">At least 12 characters. Share it securely with the new user.</span>
          </label>
          {role === 'host' && (
            <>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                Employee ID
                <input name="employeeId" value={form.employeeId} onChange={updateField} required maxLength={80} placeholder="EMP-1234" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-700">
                Department
                <input name="department" value={form.department} onChange={updateField} required maxLength={120} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
            </>
          )}
          {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" disabled={saving || !siteId} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Creating…' : `Create ${role.replace('-', ' ')}`}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto">
        {error && !showForm ? <p role="alert" className="py-3 text-sm text-red-700">{error}</p> : null}
        {loading ? <p className="py-4 text-sm text-slate-500">Loading accounts…</p> : users.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No accounts found.</p>
        ) : (
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr><th className="py-2 pr-3 font-medium">Name</th><th className="py-2 pr-3 font-medium">Email</th><th className="py-2 pr-3 font-medium">Role</th><th className="py-2 pr-3 font-medium">Employee ID</th><th className="py-2 font-medium">Site</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{user.full_name}</td>
                  <td className="py-2 pr-3 text-slate-600">{user.email}</td>
                  <td className="py-2 pr-3 capitalize text-slate-600">{user.role.replace('-', ' ')}</td>
                  <td className="py-2 pr-3 text-slate-600">{user.role === 'host' ? user.employee_id || '—' : '—'}</td>
                  <td className="py-2 text-slate-600">{siteName(user.site_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};
