import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const inputClass = 'h-11 rounded-xl bg-slate-50 border border-slate-200 px-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';

/** Request a reset link. The response never says whether the email has an account. */
export const ForgotPasswordForm = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/password-reset', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setSent(true);
    } catch (requestError) {
      setError(requestError.message || 'The request could not be sent. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-3 text-sm text-slate-700">
        <p>If an account matches <strong>{email}</strong>, a reset link is on its way. The link works once and expires soon.</p>
        <button type="button" onClick={onBack} className="h-11 rounded-xl border border-slate-200 font-medium">Back to sign in</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">Enter your account email. We will send a single-use link to reset your password.</p>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">Email
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className={inputClass} />
      </label>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="h-11 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send reset link'}</button>
      <button type="button" onClick={onBack} className="text-xs font-medium text-slate-500 hover:text-primary">Back to sign in</button>
    </form>
  );
};

/** Landing page for the emailed link: /reset-password#token=… (the token stays out of server logs). */
export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/password-reset/complete', { method: 'POST', body: JSON.stringify({ token, password }) });
      window.history.replaceState(null, '', '/reset-password');
      setDone(true);
    } catch (requestError) {
      setError(requestError.message || 'This reset link is invalid or has expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Choose a new password</h1>
        {done ? (
          <div className="mt-3 flex flex-col gap-3 text-sm text-slate-700">
            <p>Your password was changed and you were signed out everywhere. Sign in with the new password.</p>
            <button type="button" onClick={() => navigate('/login')} className="h-11 rounded-xl bg-primary font-semibold text-white">Go to sign in</button>
          </div>
        ) : !token ? (
          <p className="mt-3 text-sm text-slate-600">This page needs the link from your reset email. Request a new link from the sign-in page.</p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <div className="grid gap-1">
              <label htmlFor="new-password" className="text-xs font-semibold text-slate-700">New password</label>
              <input id="new-password" aria-describedby="new-password-hint" type="password" required minLength={12} maxLength={128} autoComplete="new-password"
                value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
              <span id="new-password-hint" className="text-xs text-slate-500">At least 12 characters.</span>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">Confirm new password
              <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className={inputClass} />
            </label>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="h-11 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Set new password'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

/** Signed-in password change. Other sessions are signed out; this one stays. */
export const ChangePasswordDialog = ({ onClose, onDone }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) });
      onDone();
    } catch (requestError) {
      setError(requestError.message || 'Your password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl flex flex-col gap-3">
        <h2 id="change-password-title" className="text-base font-semibold text-slate-900">Change password</h2>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Current password
          <input type="password" required autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">New password
          <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Confirm new password
          <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className={inputClass} />
        </label>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-medium">Cancel</button>
          <button type="submit" disabled={busy} className="h-10 flex-1 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Change'}</button>
        </div>
      </form>
    </div>
  );
};
