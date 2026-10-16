import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useVms } from '../../context/VmsContext';

const formatTime = (value) => (value ? new Date(value).toLocaleString() : 'Never');

/** Register kiosks and show their one-time pairing codes. A paired kiosk only works for its own site. */
export const DevicesPanel = () => {
  const { sites, currentUser, showToast } = useVms();
  const [devices, setDevices] = useState([]);
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState(currentUser?.site_id || '');
  const [pairing, setPairing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setDevices(await api('/devices'));
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Devices could not be loaded.');
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!siteId && sites.length) setSiteId(sites[0].id); }, [siteId, sites]);

  const showCode = (result) => setPairing({ name: result.device.name, code: result.pairing_code, expires: result.pairing_expires_at });

  const register = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      showCode(await api('/devices', { method: 'POST', body: JSON.stringify({ name: name.trim(), site_id: siteId, device_type: 'kiosk' }) }));
      setName('');
      await load();
    } catch (requestError) {
      setError(requestError.message || 'The kiosk could not be registered.');
    } finally {
      setBusy(false);
    }
  };
  const repair = async (device) => {
    if (!window.confirm(`Re-pair ${device.name}? Its current pairing stops working immediately.`)) return;
    try {
      showCode(await api(`/devices/${device.id}/pairing-code`, { method: 'POST' }));
      await load();
    } catch (requestError) { setError(requestError.message); }
  };
  const disable = async (device) => {
    if (!window.confirm(`Disable ${device.name}? It will stop working immediately.`)) return;
    try {
      await api(`/devices/${device.id}`, { method: 'DELETE' });
      showToast(`${device.name} disabled.`);
      await load();
    } catch (requestError) { setError(requestError.message); }
  };
  const siteName = (id) => sites.find((site) => site.id === id)?.name || 'Unknown site';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="devices-title">
      <h2 id="devices-title" className="text-sm font-semibold text-slate-900">Kiosks</h2>
      <p className="mt-1 text-xs text-slate-500">Register a kiosk, then type the pairing code on its screen within 15 minutes. Codes work once.</p>
      <form onSubmit={register} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input aria-label="Kiosk name" required maxLength={120} placeholder="Lobby kiosk" value={name} onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select aria-label="Kiosk site" value={siteId} onChange={(event) => setSiteId(event.target.value)} required className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
        <button type="submit" disabled={busy || !siteId} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Register kiosk</button>
      </form>
      {pairing && (
        <div role="status" className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="text-xs text-slate-600">Pairing code for <strong>{pairing.name}</strong> (expires {new Date(pairing.expires).toLocaleTimeString()}):</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-slate-900" data-testid="pairing-code">{pairing.code}</p>
          <button type="button" onClick={() => setPairing(null)} className="mt-2 text-xs font-medium text-slate-500">Hide code</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <ul className="mt-3 divide-y divide-slate-100">
        {devices.length === 0 && <li className="py-2 text-xs text-slate-500">No kiosks registered yet.</li>}
        {devices.map((device) => (
          <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <p className="font-medium text-slate-900">{device.name}</p>
              <p className="text-xs text-slate-500">{siteName(device.site_id)} · {device.status} · last seen {formatTime(device.last_seen_at)}</p>
            </div>
            {device.status !== 'disabled' && (
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => repair(device)} className="rounded-lg border border-slate-200 px-2 py-1">Re-pair</button>
                <button type="button" onClick={() => disable(device)} className="rounded-lg border border-red-200 px-2 py-1 text-red-600">Disable</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
