'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import type { EmailChallenge, EmailPurpose } from '../../../packages/contracts/email-auth';
import { api } from '@/lib/api';

export function EmailAuthPanel({ purpose, initialEmail, initialChallenge, onBack }: { purpose: EmailPurpose; initialEmail: string; initialChallenge?: EmailChallenge; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail), [challenge, setChallenge] = useState(initialChallenge);
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [complete, setComplete] = useState(false);
  const [remaining, setRemaining] = useState(0), [expires, setExpires] = useState(0);
  const running = useRef(false), router = useRouter(), cache = useQueryClient();
  useEffect(() => {
    if (!challenge) return;
    const received = Date.now();
    const tick = () => { setRemaining(Math.max(0, Math.ceil(challenge.resend_after - (Date.now() - received) / 1000))); setExpires(Math.max(0, Math.ceil(challenge.expires_in - (Date.now() - received) / 1000))); };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [challenge]);
  const run = async (work: () => Promise<void>) => { if (running.current) return; running.current = true; setBusy(true); setError(''); try { await work(); } catch (problem) { setError((problem as Error).message); } finally { running.current = false; setBusy(false); } };
  const request = () => run(async () => {
    const normalized = email.trim().toLowerCase();
    if (!z.email().safeParse(normalized).success) throw new Error('Enter a valid email address.');
    if (purpose === 'verify_email') throw new Error('Return to sign-up to start a new verification request.');
    const next = await api<EmailChallenge>('auth/email/request', { method: 'POST', body: JSON.stringify({ email: normalized, purpose }) });
    setEmail(normalized); setChallenge(next); setCode('');
  });
  const verify = () => run(async () => {
    if (!challenge || !/^[0-9]{6}$/.test(code)) throw new Error('Enter the 6-digit code from your email.');
    if (purpose === 'password_reset') {
      if (password.length < 12 || password.length > 128) throw new Error('Use a new password with 12 to 128 characters.');
      if (password !== confirmation) throw new Error('Your new passwords do not match.');
      await api('auth/password/reset', { method: 'POST', body: JSON.stringify({ challenge_id: challenge.challenge_id, code, new_password: password }) });
      setPassword(''); setConfirmation(''); setCode(''); setComplete(true); cache.clear(); return;
    }
    await api('auth/email/verify', { method: 'POST', body: JSON.stringify({ challenge_id: challenge.challenge_id, code, purpose: challenge.purpose }) });
    setCode(''); cache.clear(); router.replace('/');
  });
  return <main className="auth-page"><div className="auth-story"><div className="brand">morrow<span>mint</span></div><div className="story-copy"><div className="eyebrow">A LITTLE MORE PEACE OF MIND.</div><h1>Your email.<br/><em>Your space.</em></h1><p>A short code helps keep your account in your hands.</p></div><div className="auth-foot"><ShieldCheck size={17}/> Never share your sign-in or password-reset code.</div></div><div className="auth-form"><div className="auth-form-inner">
    <button type="button" className="button secondary" disabled={busy} onClick={onBack}><ArrowLeft size={17}/> Back to sign in</button>
    <span className="pill"><Mail size={15}/> {purpose === 'password_reset' ? 'PASSWORD RECOVERY' : 'EMAIL VERIFICATION'}</span>
    <h2>{complete ? 'A fresh start.' : challenge ? 'Check your email.' : purpose === 'password_reset' ? 'Let’s get you back in.' : 'Sign in with an email code.'}</h2>
    <p>{complete ? 'Your password is updated. Earlier sessions were signed out. Sign in with your new password.' : challenge ? 'Enter the latest 6-digit code for ' + email + '. Check your inbox and spam folder.' : 'We’ll send the code to your email. No phone number is needed.'}</p>
    {complete ? <button className="button primary" onClick={onBack}>Back to sign in</button> : <form noValidate onSubmit={event => { event.preventDefault(); void (challenge ? verify() : request()); }}>
      {!challenge ? <><label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} disabled={busy} placeholder="you@example.com" /></label><button className="button primary" disabled={busy}>{busy ? 'Requesting…' : 'Send email code'}</button></> : <>
        <label>6-digit email code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} disabled={busy} placeholder="000000" style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }} /></label>
        <p>{expires > 0 ? 'Code expires in ' + Math.floor(expires / 60) + ':' + String(expires % 60).padStart(2, '0') : 'This code has expired. Request a new one below.'}</p>
        {purpose === 'password_reset' && <><label>New password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} disabled={busy} placeholder="At least 12 characters" /></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={128} disabled={busy} /></label></>}
        <button className="button primary" disabled={busy || expires <= 0}>{busy ? 'Checking…' : purpose === 'password_reset' ? 'Reset my password' : 'Verify & continue'}</button>
        <button type="button" className="button secondary" disabled={busy || remaining > 0} onClick={() => void run(async () => { const next = await api<EmailChallenge>('auth/email/resend', { method: 'POST', body: JSON.stringify({ challenge_id: challenge.challenge_id }) }); setChallenge(next); setCode(''); })}>{remaining > 0 ? 'Resend code in ' + remaining + 's' : 'Resend email code'}</button>
        <p className="privacy-note">If the address is eligible, the code will arrive shortly. Only the latest code works. Already registered? Return to sign in.</p>
      </>}{!!error && <div role="alert" className="error-box">{error}</div>}
    </form>}
  </div></div></main>;
}
