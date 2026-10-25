export type EmailPurpose = 'verify_email' | 'email_login' | 'password_reset';
export type EmailChallenge = {
  status: 'code_required'; challenge_id: string; purpose: EmailPurpose;
  expires_in: number; resend_after: number; message: string;
};
export function isEmailChallenge(value: unknown): value is EmailChallenge {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return data.status === 'code_required' && typeof data.challenge_id === 'string'
    && ['verify_email', 'email_login', 'password_reset'].includes(String(data.purpose))
    && typeof data.expires_in === 'number' && typeof data.resend_after === 'number';
}
export const publicAuthRoutes = ['auth/login', 'auth/register', 'auth/refresh', 'auth/email/request', 'auth/email/resend', 'auth/email/verify', 'auth/password/reset'];
