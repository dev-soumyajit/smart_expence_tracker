// Browser-only fixtures. This file is excluded from native production bundles.
import { Text, View } from 'react-native';
import { EmailAuthPage, type EmailAuthActions } from '../components/email-auth-page';
import type { EmailChallenge, EmailPurpose } from '../../../packages/contracts/email-auth';
import { colors, fonts } from '../components/ui';

export default function EmailPreview({ mode = 'verify', onBack }: { mode?: string; onBack: () => void }) {
  const purpose: EmailPurpose = mode === 'reset' ? 'password_reset' : mode === 'login' ? 'email_login' : 'verify_email';
  const challenge = (purpose: EmailPurpose): EmailChallenge => ({ status: 'code_required', challenge_id: '11111111-1111-4111-a111-111111111111', purpose, expires_in: mode === 'expired' ? 1 : 600, resend_after: 2, message: 'Example email flow only.' });
  const actions: EmailAuthActions = {
    request: async (_email, selected) => challenge(selected),
    resend: async () => challenge(purpose),
    verify: async (_challenge, code) => { if (mode === 'failure') throw new Error('Example connection failed. Your input is still here.'); if (code !== '123456') throw new Error('That code is invalid or expired. Request a new code and try again.'); },
  };
  return <View style={{ flex: 1, backgroundColor: colors.bg }}><View style={{ backgroundColor: '#E9EEDC', paddingVertical: 5, alignItems: 'center' }}><Text style={{ fontFamily: fonts.semibold, fontSize: 8, letterSpacing: 1, color: '#7C8E62' }}>EXAMPLE EMAIL FLOW · NO EMAILS SENT</Text></View><EmailAuthPage purpose={purpose} initialEmail="alex@example.com" initialChallenge={mode === 'login' || mode === 'reset' ? undefined : challenge(purpose)} actions={actions} onBack={onBack} /></View>;
}
