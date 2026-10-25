import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { z } from 'zod';
import type { EmailChallenge, EmailPurpose } from '../../../packages/contracts/email-auth';
import { Brand, Button, colors, ErrorBox, Field, fonts, IconButton, styles } from './ui';

export type EmailAuthActions = {
  request: (email: string, purpose: 'email_login' | 'password_reset') => Promise<EmailChallenge>;
  resend: (challengeId: string) => Promise<EmailChallenge>;
  verify: (challenge: EmailChallenge, code: string, password?: string) => Promise<void>;
};
export function EmailAuthPage({ purpose, initialEmail = '', initialChallenge, actions, onBack }: { purpose: EmailPurpose; initialEmail?: string; initialChallenge?: EmailChallenge; actions: EmailAuthActions; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail), [challenge, setChallenge] = useState(initialChallenge);
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [complete, setComplete] = useState(false);
  const [remaining, setRemaining] = useState(0), [expires, setExpires] = useState(0);
  const running = useRef(false);
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
    const next = await actions.request(normalized, purpose); setEmail(normalized); setChallenge(next); setCode('');
  });
  const verify = () => run(async () => {
    if (!challenge || !/^[0-9]{6}$/.test(code)) throw new Error('Enter the 6-digit code from your email.');
    if (purpose === 'password_reset') {
      if (password.length < 12 || password.length > 128) throw new Error('Use a new password with 12 to 128 characters.');
      if (password !== confirmation) throw new Error('Your new passwords do not match.');
    }
    await actions.verify(challenge, code, purpose === 'password_reset' ? password : undefined);
    setCode(''); setPassword(''); setConfirmation(''); setComplete(true);
  });
  const title = complete ? purpose === 'password_reset' ? 'A fresh start.' : 'You’re all set.' : challenge ? 'Check your email.' : purpose === 'password_reset' ? 'Let’s get you back in.' : 'A code, a little clarity.';
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 35, gap: 24 }]}>
    <View style={styles.row}><IconButton label="Back to sign in" icon="arrow-back" disabled={busy} onPress={onBack} /><Brand compact /></View>
    <View style={{ width: 68, height: 68, borderRadius: 25, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}><Ionicons name={complete ? 'checkmark-circle-outline' : 'mail-outline'} size={32} color={colors.forest} /></View>
    <View style={{ gap: 10 }}><Text style={styles.overline}>{purpose === 'password_reset' ? 'RESET YOUR PASSWORD' : purpose === 'verify_email' ? 'VERIFY YOUR EMAIL' : 'SIGN IN WITH EMAIL'}</Text><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{complete ? purpose === 'password_reset' ? 'Your password is updated. Earlier sessions were signed out. Sign in with your new password.' : 'Your email has been confirmed.' : challenge ? 'Enter the latest 6-digit code for ' + email + '. Check your inbox and spam folder.' : 'We’ll use your email address for the code. No phone number is needed.'}</Text></View>
    {complete ? <Button title="Back to sign in" onPress={onBack} /> : <View style={styles.card}>
      {!challenge ? <><Field label="Email address" icon="mail-outline" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} editable={!busy} placeholder="you@example.com" /><Button title="Send email code" busy={busy} icon="arrow-forward" onPress={() => void request()} /></> : <>
        <Field label="6-digit email code" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!busy} placeholder="000000" style={{ fontFamily: fonts.bold, fontSize: 29, letterSpacing: 8, textAlign: 'center' }} />
        <Text style={styles.small}>{expires > 0 ? 'Code expires in ' + Math.floor(expires / 60) + ':' + String(expires % 60).padStart(2, '0') : 'This code has expired. Request a new one below.'}</Text>
        {purpose === 'password_reset' && <><Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={128} editable={!busy} placeholder="At least 12 characters" /><Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={128} editable={!busy} /></>}
        <Button title={purpose === 'password_reset' ? 'Reset my password' : 'Verify & continue'} busy={busy} disabled={expires <= 0} icon="checkmark" onPress={() => void verify()} />
        <Button title={remaining > 0 ? 'Resend code in ' + remaining + 's' : 'Resend email code'} secondary disabled={busy || remaining > 0} onPress={() => void run(async () => { const next = await actions.resend(challenge.challenge_id); setChallenge(next); setCode(''); })} />
        <Text style={styles.small}>Only the latest code works. If the address is eligible, the code will arrive shortly. Already registered? Return to sign in.</Text>
      </>}
      {!!error && <ErrorBox message={error} />}
    </View>}
    <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={20} color={colors.green} /><Text style={[styles.small, { flex: 1 }]}>Never share an email code with anyone. Morrowmint will not ask you to send a code to support.</Text></View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
