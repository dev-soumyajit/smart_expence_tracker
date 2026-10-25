// Browser-only visual fixtures. Never imported into Android/iOS bundles.
import { useState } from 'react';
import { Text } from 'react-native';
import { SmsReview, type SmsReceipt } from '../components/sms-review';
import { parseSms } from '../../../packages/contracts/sms';
import { Sheet, styles } from '../components/ui';
import { accounts, categories, transactions } from './fixtures';

export default function SmsPreview({ mode = 'expense', onClose }: { mode?: string; onClose: () => void }) {
  const [result, setResult] = useState(''), [attempts, setAttempts] = useState(0);
  const body = mode === 'ambiguous' ? 'A/c XX1234 debited and credited INR 100 and Rs 50 on 24-10-2026 at 10:15:30' : mode === 'refund' ? 'Rs 100 refunded to A/c XX1234 on 24-10-2026 at 10:15:30' : 'A/c XX1234 debited INR 125.50 at Blue Cafe on 24-10-2026 at 10:15:30. Avl Bal INR 78,000';
  const suggestion = parseSms({ id: 'example', sender: 'VM-HDFCBK-S', body, receivedAt: Date.parse('2026-10-24T11:00:00+05:30') });
  const original = { ...transactions[0], id: 'example-original-expense', account_id: accounts[0].id, kind: 'expense', amount: 50000, occurred_at: '2026-10-01T06:30:00Z', voided: false };
  const receipt: SmsReceipt | undefined = mode === 'correction' ? { id: 'example-receipt', fingerprint: 'a'.repeat(64), transaction: { ...original, notes: 'Keep this note', description: 'Correct this amount' } } : undefined;
  return <><SmsReview suggestion={receipt ? undefined : suggestion} receipt={receipt} accounts={accounts} categories={categories} rules={{ wallets: {}, categories: {} }} expenses={[original]} onClose={onClose}
    onCheckDuplicates={async payload => mode === 'duplicate' ? [{ ...original, id: 'example-duplicate', ...payload, original_id: null, description: 'Existing coffee entry', source: 'manual' }] : []}
    onSave={async (payload, options) => { setAttempts(value => value + 1); if (mode === 'retry' && attempts === 0) throw new Error('Example network failure. Your edits are still here; retry safely.'); setResult(JSON.stringify({ amount: payload.amount, kind: payload.kind, account_id: payload.account_id, occurred_at: payload.occurred_at, notes: payload.notes, original_id: payload.original_id || null, ...options })); }}
  /><Sheet visible={!!result} title="Example SMS confirmation" onClose={() => setResult('')}><Text style={styles.text}>{result}</Text><Text style={styles.small}>Example data only. No financial records were written.</Text></Sheet></>;
}
