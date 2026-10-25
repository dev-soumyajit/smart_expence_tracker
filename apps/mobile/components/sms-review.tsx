import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Account, Category, Transaction } from '../../web/lib/types';
import type { SmsKind, SmsSuggestion } from '../../../packages/contracts/sms';
import { learnedSuggestion, type SmsLearning } from '../../../packages/contracts/sms';
import { TransactionEntry, type EntryPayload } from './entry-form';
import { Button, Chip, colors, ErrorBox, IconButton, styles } from './ui';
import { money } from '../lib/api';

export type SmsReceipt = { id: string; fingerprint: string; transaction: Transaction };
export type SmsSaveOptions = { remember: boolean; duplicateAcknowledged: boolean; existingTransactionId: string | null };
export function CheckOption({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, minHeight: 48 }}><View style={{ width: 23, height: 23, borderRadius: 7, backgroundColor: checked ? colors.forest : colors.white, borderWidth: 1, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.white }}>{checked ? '✓' : ''}</Text></View><Text style={[styles.text, { flex: 1, fontSize: 12 }]}>{label}</Text></Pressable>;
}
export function SmsReview({ suggestion, receipt, accounts, categories, rules, expenses, refundPicker, canRemember = false, onClose, onCheckDuplicates, onSave }: {
  suggestion?: SmsSuggestion; receipt?: SmsReceipt; accounts: Account[]; categories: Category[]; rules: SmsLearning;
  expenses: Transaction[]; refundPicker?: React.ReactNode; canRemember?: boolean; onClose: () => void;
  onCheckDuplicates: (payload: EntryPayload) => Promise<Transaction[]>;
  onSave: (payload: EntryPayload, options: SmsSaveOptions) => Promise<void>;
}) {
  const [editing, setEditing] = useState(!!receipt), [kindChoice, setKindChoice] = useState<SmsKind | ''>(suggestion?.kind || '');
  const [amountChoice, setAmountChoice] = useState<number | undefined>(suggestion?.amount || undefined);
  const [checked, setChecked] = useState(false), [remember, setRemember] = useState(false), [duplicateAck, setDuplicateAck] = useState(false);
  const [duplicates, setDuplicates] = useState<Transaction[]>([]), [linkedId, setLinkedId] = useState<string | null>(null);
  if (!editing) return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={[styles.content, { paddingBottom: 35 }]}>
    <View style={styles.row}><IconButton icon="close" label="Close SMS review" onPress={onClose} /><Text style={styles.overline}>MESSAGE REVIEW</Text></View>
    <Text style={styles.title}>Does this look right?</Text><Text style={styles.subtitle}>A message is a suggestion. You decide what becomes a financial record.</Text>
    <View style={styles.card}><Text style={styles.cardTitle}>{suggestion?.senderKey || 'Pasted bank message'}</Text><Text style={styles.text}>{suggestion?.preview}</Text><Text style={styles.small}>Preview stays on your device. Account/reference numbers are masked.</Text></View>
    <View style={[styles.card, { backgroundColor: colors.limeSoft }]}><Text style={styles.cardTitle}>A few details to check</Text>{suggestion?.questions.map(question => <Text key={question} style={styles.text}>• {question}</Text>)}<Text style={styles.small}>A sender name is not proof of authenticity. Check the bank app if anything is unexpected.</Text></View>
    <Text style={styles.label}>What happened?</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['expense','income','transfer','refund'] as const).map(kind => <Chip key={kind} title={kind.charAt(0).toUpperCase() + kind.slice(1)} selected={kindChoice === kind} onPress={() => setKindChoice(kind)} />)}</View>
    {!!suggestion?.amountOptions.length && <><Text style={styles.label}>Which amount is the transaction?</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{suggestion.amountOptions.map(value => <Chip key={value} title={money(value)} selected={amountChoice === value} onPress={() => setAmountChoice(value)} />)}<Chip title="I'll enter a different amount" selected={!amountChoice} onPress={() => setAmountChoice(undefined)} /></View></>}
    <Button title="Check and edit details" disabled={!kindChoice} onPress={() => setEditing(true)} icon="arrow-forward" />
  </ScrollView></SafeAreaView>;
  const learned = suggestion ? learnedSuggestion(suggestion, rules, accounts.filter(row => !row.archived).map(row => row.id), categories.map(row => row.id)) : { accountId: '', categoryId: '' };
  const row = receipt?.transaction;
  return <TransactionEntry accounts={accounts} categories={categories} requireWallet showTime
    initial={row ? { ...row, kind: row.kind as SmsKind } : { kind: kindChoice || 'expense', amount: amountChoice, account_id: learned.accountId, category_id: learned.categoryId || null, description: suggestion?.merchant || '', occurred_at: suggestion?.occurredAt }}
    onClose={onClose} refundOptions={expenses} refundPicker={refundPicker}
    smsContext={<View style={[styles.card, { padding: 17, backgroundColor: colors.limeSoft }]}><Text style={styles.cardTitle}>{receipt ? 'Correct your saved entry' : 'Does this look right?'}</Text><Text style={styles.small}>{receipt ? 'The original entry stays in your audit history. Only the corrected entry affects balances.' : suggestion?.preview}</Text>{!!learned.accountId && <Text style={styles.small}>Wallet suggested from your earlier confirmation. You can change it below.</Text>}<Text style={styles.small}>Check amount, type, wallet, category and IST date/time.</Text></View>}
    onReview={async payload => { setChecked(false); setDuplicateAck(false); setLinkedId(null); const rows = await onCheckDuplicates(payload); setDuplicates(rows.filter(item => item.id !== row?.id)); }}
    reviewExtra={<View style={{ gap: 13 }}>
      {!!duplicates.length && <View style={[styles.card, { backgroundColor: colors.peach }]}><Text style={styles.cardTitle}>Already recorded?</Text><Text style={styles.small}>These entries have the same wallet, type and amount within one day. A match is a warning; it can be a separate purchase.</Text>{duplicates.map(item => <View key={item.id} style={{ gap: 7 }}><Text style={styles.text}>{item.description} · {money(item.amount)}</Text><Text style={styles.small}>{new Date(item.occurred_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</Text>{!receipt && <Chip title={linkedId === item.id ? 'Selected existing entry' : 'Use this existing entry'} selected={linkedId === item.id} onPress={() => { setLinkedId(linkedId === item.id ? null : item.id); setDuplicateAck(false); }} />}</View>)}<CheckOption label="This is a separate transaction; save another entry" checked={duplicateAck} onPress={() => { setDuplicateAck(!duplicateAck); setLinkedId(null); }} /></View>}
      {linkedId && <Text style={styles.small}>Confirmation will link the message to that entry. It will not change its description or create another transaction.</Text>}
      <CheckOption label="I checked the amount, wallet, type, category and date/time" checked={checked} onPress={() => setChecked(!checked)} />
      {(suggestion || canRemember) && <CheckOption label="Remember my wallet and merchant category choices on this device" checked={remember} onPress={() => setRemember(!remember)} />}
      <Text style={styles.small}>Remembered choices only suggest a wallet/category. Amounts, dates and transaction types always need review.</Text>
      {row?.voided && <ErrorBox message="This saved entry has been reversed. Review Activity before continuing." />}
    </View>}
    confirmDisabled={!checked || (!!duplicates.length && !duplicateAck && !linkedId) || !!row?.voided}
    onSave={payload => onSave(payload, { remember, duplicateAcknowledged: duplicateAck, existingTransactionId: linkedId })}
  />;
}
