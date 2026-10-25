import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { Account, Category, Page, Transaction, User } from '../../web/lib/types';
import { parseSms, learningContext, learnContextSelection, type SmsLearning, type SmsLearningContext, type SmsSuggestion } from '../../../packages/contracts/sms';
import { api, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import { canReadSms, clearLearning, dismissSms, dismissed, fingerprintSms, loadLearning, loadLearningContext, readSmsPage, requestSmsAccess, smsUnavailable, storeLearning, storeLearningContext, undoDismissSms } from '../lib/sms-device';
import { CheckOption, SmsReview, type SmsReceipt, type SmsSaveOptions } from '../components/sms-review';
import type { EntryPayload } from '../components/entry-form';
import { Button, Chip, colors, EmptyState, ErrorBox, Field, IconButton, styles } from '../components/ui';

type Candidate = { fingerprint: string; suggestion: SmsSuggestion };
type ScanCursor = { since: number; until: number; beforeDate: number; beforeId: string };
type Selection = { candidate?: Candidate; receipt?: SmsReceipt; editKey: string; context?: SmsLearningContext };
export default function SmsInbox() {
  const auth = useAuth(), router = useRouter(), cache = useQueryClient();
  const user = useQuery({ queryKey: ['me'], queryFn: () => api<User>('auth/me'), enabled: auth.signedIn });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('accounts'), enabled: auth.signedIn });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('categories'), enabled: auth.signedIn });
  const [historyPage, setHistoryPage] = useState(1), [expensePage, setExpensePage] = useState(1), [expenseSearch, setExpenseSearch] = useState('');
  const history = useQuery({ queryKey: ['sms-receipts', historyPage], queryFn: () => api<Page<SmsReceipt>>('sms/receipts?page=' + historyPage), enabled: auth.signedIn });
  const expenses = useQuery({ queryKey: ['sms-expenses', expensePage, expenseSearch], queryFn: () => api<Page<Transaction>>('transactions?kind=expense&page_size=20&page=' + expensePage + '&search=' + encodeURIComponent(expenseSearch)), enabled: auth.signedIn });
  const [rules, setRules] = useState<SmsLearning>({ wallets: {}, categories: {} }), [rulesReady, setRulesReady] = useState(false);
  const [pending, setPending] = useState<Candidate[]>([]), [selection, setSelection] = useState<Selection | null>(null);
  const [lastIgnored, setLastIgnored] = useState<Candidate | null>(null);
  const [body, setBody] = useState(''), [sender, setSender] = useState(''), [consent, setConsent] = useState(false), [days, setDays] = useState(7);
  const [cursor, setCursor] = useState<ScanCursor | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const running = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let live = true; if (user.data) { setRulesReady(false); loadLearning(user.data.id).then(value => { if (live) setRules(value); }).catch(() => { if (live) setError('Remembered choices could not be loaded. You can still review messages manually.'); }).finally(() => { if (live) setRulesReady(true); }); } return () => { live = false; }; }, [user.data?.id]);
  const guard = async (work: () => Promise<void>) => {
    if (running.current || !user.data) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  const mergeCandidates = async (items: Candidate[]) => {
    if (!user.data) return;
    const keep: Candidate[] = [];
    for (const item of items) if (!await dismissed(user.data.id, item.fingerprint)) keep.push(item);
    let saved = new Set<string>();
    if (keep.length) {
      try { saved = new Set(await api<string[]>('sms/lookup', { method: 'POST', body: JSON.stringify({ fingerprints: keep.map(item => item.fingerprint) }) })); }
      catch { setNotice('Saved-message checks are unavailable. Suggestions are kept; reconnect before confirmation.'); }
    }
    if (mounted.current) setPending(previous => [...new Map([...previous, ...keep.filter(item => !saved.has(item.fingerprint))].map(item => [item.fingerprint, item])).values()]);
  };
  const scan = (more = false) => guard(async () => {
    if (!consent) throw new Error('Read the disclosure and enable the checkbox before scanning.');
    await requestSmsAccess();
    let next: ScanCursor = more && cursor ? cursor : { since: Date.now() - days * 86400000, until: Date.now(), beforeDate: 0, beforeId: '' };
    let scanned = 0, proposed = 0;
    for (let page = 0; page < 4 && mounted.current; page++) {
      const batch = await readSmsPage(next.since, next.until, next.beforeDate, next.beforeId);
      scanned += batch.scanned;
      const items: Candidate[] = [];
      for (const message of batch.messages) {
        const suggestion = parseSms(message);
        if (suggestion.status === 'review_required') items.push({ suggestion, fingerprint: await fingerprintSms(suggestion) });
      }
      proposed += items.length;
      await mergeCandidates(items);
      next = { ...next, beforeDate: batch.beforeDate, beforeId: batch.beforeId };
      setCursor(batch.hasMore ? next : null);
      if (!batch.hasMore) break;
    }
    if (mounted.current) setNotice(previous => previous || `Checked ${scanned} inbox messages; found ${proposed} transaction alerts before duplicate/dismissed filtering. Review suggestions below. No entries were saved.`);
  });
  const paste = () => guard(async () => {
    const suggestion = parseSms({ id: 'paste', sender, body, receivedAt: Date.now() });
    if (suggestion.status !== 'review_required') throw new Error(suggestion.reason + '. Paste a completed INR bank transaction alert, or use manual entry.');
    await mergeCandidates([{ suggestion, fingerprint: await fingerprintSms(suggestion) }]);
    setBody(''); setNotice('Message analyzed locally. Check the suggestions below; already-saved messages are available in history.');
  });
  const choose = (candidate: Candidate) => guard(async () => {
    const receipt = await api<SmsReceipt | null>('sms/lookup/' + candidate.fingerprint);
    setSelection({ candidate, receipt: receipt || undefined, editKey: Crypto.randomUUID(), context: learningContext(candidate.suggestion) });
  });
  const save = async (payload: EntryPayload, options: SmsSaveOptions) => {
    if (!selection || !user.data) throw new Error('Reopen this review.');
    const transaction = { ...payload, source: 'sms' };
    let saved: SmsReceipt;
    if (selection.receipt) saved = await api<SmsReceipt>('sms/receipts/' + selection.receipt.id, { method: 'PUT', body: JSON.stringify({ transaction, expected_transaction_id: selection.receipt.transaction.id, edit_key: selection.editKey, duplicate_acknowledged: options.duplicateAcknowledged }) });
    else saved = await api<SmsReceipt>('sms/confirm', { method: 'POST', body: JSON.stringify({ fingerprint: selection.candidate!.fingerprint, transaction, duplicate_acknowledged: options.duplicateAcknowledged, existing_transaction_id: options.existingTransactionId }) });
    // The ledger commit has succeeded. A local learning failure must never invite a duplicate financial retry.
    let learnedNotice = '';
    if (options.remember && selection.context) {
      const next = learnContextSelection(rules, selection.context, payload.kind, payload.account_id, payload.category_id);
      setRules(next);
      try { await storeLearning(user.data.id, next); await storeLearningContext(user.data.id, saved.fingerprint, selection.context); } catch { learnedNotice = ' Remembered choices could not be stored on this device.'; }
    }
    setPending(previous => previous.filter(item => item.fingerprint !== saved.fingerprint));
    setSelection(null); setNotice((options.existingTransactionId ? 'Linked to the existing entry. No extra transaction was created.' : selection.receipt ? 'Correction saved. The original remains in the audit history.' : 'Confirmed entry saved.') + learnedNotice);
    void cache.invalidateQueries();
  };
  if (auth.ready && !auth.signedIn) return <Redirect href="/login" />;
  if (!auth.ready || user.isPending || accounts.isPending || categories.isPending) return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.green} /></SafeAreaView>;
  if (selection) return <SmsReview key={selection.editKey} suggestion={selection.candidate?.suggestion} receipt={selection.receipt} canRemember={!!selection.context} accounts={accounts.data || []} categories={categories.data || []} rules={rules} expenses={expenses.data?.items || []}
    refundPicker={<View style={{ gap: 10 }}><Field label="Search original expenses" value={expenseSearch} onChangeText={value => { setExpenseSearch(value); setExpensePage(1); }} />{expenses.error && <ErrorBox message={expenses.error.message} />}{expenses.isFetching && <ActivityIndicator color={colors.green} />}<View style={styles.row}><Button title="Earlier page" secondary disabled={expensePage === 1} onPress={() => setExpensePage(page => page - 1)} /><Button title="More expenses" secondary disabled={!expenses.data || expensePage * 20 >= expenses.data.total} onPress={() => setExpensePage(page => page + 1)} /></View></View>}
    onClose={() => { setSelection(null); void history.refetch(); }} onCheckDuplicates={payload => api<Transaction[]>('sms/duplicates', { method: 'POST', body: JSON.stringify({ ...payload, source: 'sms' }) })} onSave={save} />;
  const loadError = user.error?.message || accounts.error?.message || categories.error?.message;
  return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
    <View style={styles.row}><IconButton icon="arrow-back" label="Back from message inbox" onPress={() => router.back()} /><Text style={styles.overline}>SMART MESSAGE REVIEW</Text></View>
    <Text style={styles.title}>Your messages.{"\n"}Your final say.</Text><Text style={styles.subtitle}>Review bank alerts, fix the details and confirm each entry. Nothing is added automatically.</Text>
    {!!loadError && <><ErrorBox message={loadError} /><Button title="Retry loading" onPress={() => void cache.invalidateQueries()} /></>}
    <View style={[styles.card, { backgroundColor: colors.limeSoft }]}><Text style={styles.cardTitle}>Check your phone inbox</Text><Text style={styles.text}>With your permission, Morrowmint reads recent SMS on this device to find completed INR transactions. Parsing stays on the phone; raw messages are never sent to the server or AI. OTPs are excluded. Only details you confirm and a duplicate-check digest are uploaded.</Text>
      {canReadSms ? <><CheckOption label="Allow a scan of recent SMS for transaction suggestions" checked={consent} onPress={() => setConsent(!consent)} /><View style={{ flexDirection: 'row', gap: 8 }}><Chip title="Last 7 days" selected={days === 7} onPress={() => { setDays(7); setCursor(null); }} /><Chip title="Last 30 days" selected={days === 30} onPress={() => { setDays(30); setCursor(null); }} /></View><Button title="Scan bank messages" disabled={!consent || !rulesReady || !!loadError} busy={busy} onPress={() => void scan()} />{!!cursor && <Button title="Continue older messages" secondary busy={busy} disabled={!consent} onPress={() => void scan(true)} />}<Button title="Manage Android SMS access" secondary onPress={() => void Linking.openSettings().catch(() => setError('Open Android Settings, then Apps, Morrowmint, Permissions.'))} /></> : <Text style={styles.small}>{smsUnavailable}</Text>}
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Or paste a bank message</Text><Field label="Sender ID · optional" value={sender} onChangeText={setSender} maxLength={30} placeholder="For example, HDFCBK" /><Field label="Bank message" multiline value={body} onChangeText={setBody} maxLength={3000} placeholder="Paste a completed transaction alert. Never paste an OTP or PIN." /><Text style={styles.small}>If no transaction time is found, paste time is proposed. You can correct the IST date and time.</Text><Button title="Analyze message" busy={busy} disabled={!body.trim() || !rulesReady || !!loadError} onPress={() => void paste()} /></View>
    {!!error && <ErrorBox message={error} />}{!!notice && <View accessibilityLiveRegion="polite" style={styles.note}><Text style={styles.text}>{notice}</Text></View>}
    {lastIgnored && <Button title="Undo last ignore" secondary busy={busy} onPress={() => void guard(async () => { await undoDismissSms(user.data!.id, lastIgnored.fingerprint); setPending(previous => [...new Map([...previous, lastIgnored].map(item => [item.fingerprint, item])).values()]); setLastIgnored(null); setNotice('Message restored for review.'); })} />}
    <Text style={styles.cardTitle}>Needs your review · {pending.length}</Text>
    {pending.map(candidate => <View key={candidate.fingerprint} style={styles.card}><Text style={styles.overline}>{candidate.suggestion.senderKey || 'PASTED MESSAGE'}</Text><Text style={styles.cardTitle}>{candidate.suggestion.amount ? money(candidate.suggestion.amount) : 'Amount needs checking'} · {candidate.suggestion.kind || 'Choose type'}</Text><Text style={styles.small}>{candidate.suggestion.preview}</Text><Button title="Does this look right?" busy={busy} onPress={() => void choose(candidate)} /><Button title="Ignore this message" secondary disabled={busy} onPress={() => void guard(async () => { await dismissSms(user.data!.id, candidate.fingerprint); setLastIgnored(candidate); setPending(previous => previous.filter(item => item.fingerprint !== candidate.fingerprint)); setNotice('Ignored on this device. You can still paste the details as a manual entry.'); })} /></View>)}
    {!pending.length && <EmptyState title="No messages waiting." detail="Scan or paste a bank alert to review it. Saved entries are below." icon="chatbubble-ellipses-outline" />}
    <Button title="Refresh saved entries" secondary busy={history.isFetching} onPress={() => void history.refetch()} />
    <Text style={styles.cardTitle}>Saved message entries</Text>{history.error && <><ErrorBox message={history.error.message} /><Button title="Retry saved entries" secondary onPress={() => void history.refetch()} /></>}
    {history.data?.items.map(receipt => <View key={receipt.id} style={styles.card}><Text style={styles.cardTitle}>{receipt.transaction.description}</Text><Text style={styles.text}>{money(receipt.transaction.amount)} · {receipt.transaction.kind}{receipt.transaction.voided ? ' · Reversed' : ''}</Text><Button title="Review or correct this entry" secondary disabled={busy} onPress={() => void guard(async () => { const latest = await api<SmsReceipt>('sms/receipts/' + receipt.id); const context = await loadLearningContext(user.data!.id, latest.fingerprint).catch(() => undefined); setSelection({ receipt: latest, editKey: Crypto.randomUUID(), context }); })} /></View>)}
    <View style={styles.row}><Button title="Previous saved" secondary disabled={historyPage === 1} onPress={() => setHistoryPage(page => page - 1)} /><Button title="More saved" secondary disabled={!history.data || historyPage * 30 >= history.data.total} onPress={() => setHistoryPage(page => page + 1)} /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>You control what it remembers</Text><Text style={styles.small}>Wallet/category choices are scoped to your account on this device. Clearing them does not change financial records. You can revoke SMS access in Android app settings.</Text><Button title="Forget learned choices" secondary busy={busy} onPress={() => void guard(async () => { await clearLearning(user.data!.id); setRules({ wallets: {}, categories: {} }); setNotice('Remembered choices cleared.'); })} /></View>
  </ScrollView></SafeAreaView>;
}
