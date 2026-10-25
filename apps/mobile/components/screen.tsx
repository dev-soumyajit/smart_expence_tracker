import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Account, Budget, Category, Dashboard, Goal, Page, Transaction, User } from '../../web/lib/types';
import { parseINR } from '../../../packages/contracts/validation';
import { api, money } from '../lib/api';
import { AppHeader, BalanceCard, BudgetCard, GoalTeaser, InsightCard, prettyDate, QuickActions, SafeCard, SpendingCard, TransactionRows, WalletCard } from './finance-cards';
import { Button, Chip, colors, EmptyState, ErrorBox, Field, fonts, IconButton, LoadingCards, SectionHeading, Sheet, styles } from './ui';

type Section = 'home' | 'transactions' | 'accounts' | 'budgets';
type SheetName = 'account' | 'budget' | 'account-detail' | 'safe' | 'period' | 'filter' | 'bills' | 'transaction' | 'goal' | null;
export type HomeActions = { add: (kind: string) => void; route: (section: string) => void; safe: () => void; period: () => void; goal: (goal: Goal) => void; transaction: (row: Transaction) => void };
const labels = { home: 'Your overview', transactions: 'Your activity', accounts: 'Your wallets', budgets: 'Your spending plan' };

function indiaDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function monthQuery(previous: boolean) {
  const parts = indiaDate().split('-').map(Number);
  const first = new Date(Date.UTC(parts[0], parts[1] - (previous ? 2 : 1), 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return '?start=' + first.toISOString().slice(0, 10) + '&end=' + last.toISOString().slice(0, 10);
}
export function HomeContent({ data, recent, categories, actions, period, hidden, toggleHidden, recentPending = false, recentError, retryRecent }: { data: Dashboard; recent: Transaction[]; categories: Category[]; actions: HomeActions; period: string; hidden: boolean; toggleHidden: () => void; recentPending?: boolean; recentError?: string; retryRecent?: () => void }) {
  return <View style={{ gap: 23 }}>
    <BalanceCard data={data} hidden={hidden} toggle={toggleHidden} onPeriod={actions.period} period={period} />
    <QuickActions onExpense={() => actions.add('expense')} onIncome={() => actions.add('income')} onTransfer={() => actions.add('transfer')} onPlan={() => actions.route('budgets')} />
    <SafeCard data={data} onPress={actions.safe} />
    <Button title="Review bank messages" secondary icon="chatbubble-ellipses-outline" onPress={() => actions.route('sms')} />
    {!data.accounts.length && <View style={styles.card}><EmptyState title="Start with what you have." detail="Add your first bank account or cash wallet. A clearer picture begins there." action="Add your first wallet" onAction={() => actions.route('accounts')} icon="wallet-outline" /></View>}
    <SpendingCard data={data} />
    {data.goals[0] && <GoalTeaser goal={data.goals[0]} onPress={() => actions.goal(data.goals[0])} />}
    <View style={{ gap: 3 }}><SectionHeading title="Recent activity" action="View all" onPress={() => actions.route('transactions')} /><View style={[styles.card, { paddingVertical: 3, paddingHorizontal: 18 }]}>{recentPending ? <View style={{ padding: 25 }}><ActivityIndicator color={colors.green} /></View> : recentError ? <View style={{ paddingVertical: 15, gap: 10 }}><ErrorBox message={recentError} /><Button title="Try again" onPress={retryRecent || (() => {})} secondary /></View> : recent.length ? <TransactionRows rows={recent} accounts={data.accounts} categories={categories} onSelect={actions.transaction} /> : <EmptyState title="A fresh page." detail="The coffee runs, the paydays, the little things. Keep them all in view." action="Record a transaction" onAction={() => actions.add('expense')} icon="receipt-outline" />}</View></View>
    {data.insights[0] && <InsightCard title={data.insights[0].title} detail={data.insights[0].detail} />}
  </View>;
}

export default function Screen({ section }: { section: Section }) {
  const router = useRouter(), cache = useQueryClient();
  const [period, setPeriod] = useState('cycle'), [hidden, setHidden] = useState(false), [sheet, setSheet] = useState<SheetName>(null);
  const [page, setPage] = useState(1), [kind, setKind] = useState(''), [search, setSearch] = useState(''), [debounced, setDebounced] = useState(''), [cashOnly, setCashOnly] = useState(false);
  const [filterAccount, setFilterAccount] = useState(''), [filterCategory, setFilterCategory] = useState('');
  const [name, setName] = useState(''), [amount, setAmount] = useState(''), [accountType, setAccountType] = useState('bank'), [category, setCategory] = useState('');
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null), [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null), [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const suffix = period === 'cycle' ? '' : monthQuery(period === 'previous');
  const data = useQuery({ queryKey: ['dashboard', suffix], queryFn: () => api<Dashboard>('dashboard' + suffix) });
  const user = useQuery({ queryKey: ['me'], queryFn: () => api<User>('auth/me') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('categories') });
  const query = new URLSearchParams({ page: String(page), search: debounced, ...(kind ? { kind } : {}), ...(filterAccount ? { account_id: filterAccount } : {}), ...(filterCategory ? { category_id: filterCategory } : {}) });
  const transactions = useQuery({ queryKey: ['transactions', query.toString()], queryFn: () => api<Page<Transaction>>('transactions?' + query.toString()), enabled: section === 'transactions' });
  const recent = useQuery({ queryKey: ['transactions', 'home'], queryFn: () => api<Page<Transaction>>('transactions?page_size=4'), enabled: section === 'home' });
  const budgets = useQuery({ queryKey: ['budgets'], queryFn: () => api<Budget[]>('budgets'), enabled: section === 'budgets' });
  useEffect(() => { const timeout = setTimeout(() => { setDebounced(search); setPage(1); }, 250); return () => clearTimeout(timeout); }, [search]);
  const d = data.data;
  const refresh = () => { void cache.invalidateQueries(); };
  const route = (value: string) => { if (value === 'home') router.push('/'); else router.push(('/' + value) as '/accounts'); };
  const add = (value: string) => router.push({ pathname: '/add', params: { kind: value } });
  const open = (value: SheetName) => { setError(''); setSheet(value); };
  const close = () => { if (!busy) setSheet(null); };
  const createForm = (value: 'account' | 'budget') => { setName(''); setAmount(''); setCategory(''); setAccountType('bank'); setStart(d?.cycle_start || indiaDate()); setEnd(d?.cycle_end || indiaDate()); open(value); };
  const showAccount = (account: Account) => { setSelectedAccount(account); setName(account.name); open('account-detail'); };
  const showTransaction = (transaction: Transaction) => { setSelectedTransaction(transaction); open('transaction'); };
  const showGoal = (goal: Goal) => { setSelectedGoal(goal); open('goal'); };
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!name.trim()) throw new Error('Give this a name before saving.');
      if (sheet === 'account') await api('accounts', { method: 'POST', body: JSON.stringify({ name, type: accountType, opening_balance: parseINR(amount || '0') }) });
      else if (sheet === 'budget') await api('budgets', { method: 'POST', body: JSON.stringify({ name, amount: parseINR(amount), category_id: category || null, start_date: start, end_date: end }) });
      else if (sheet === 'account-detail' && selectedAccount) await api('accounts/' + selectedAccount.id, { method: 'PATCH', body: JSON.stringify({ name, archived: selectedAccount.archived }) });
      setSheet(null); refresh();
    } catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  };
  const archive = async () => {
    if (!selectedAccount) return;
    setBusy(true); setError('');
    try { await api('accounts/' + selectedAccount.id, { method: 'PATCH', body: JSON.stringify({ name: selectedAccount.name, archived: !selectedAccount.archived }) }); setSheet(null); refresh(); }
    catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  };
  const activeOverall = budgets.data?.find(budget => !budget.category_id && budget.start_date <= indiaDate() && budget.end_date >= indiaDate());
  const periodLabel = period === 'cycle' ? 'Current cycle' : period === 'month' ? 'This month' : 'Last month';

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={refresh} tintColor={colors.green} colors={[colors.green]} />}>
      <AppHeader name={user.data?.name || 'M'} onProfile={() => route('settings')} onReminders={() => open('bills')} dueCount={d?.upcoming.length} />
      <View style={{ gap: 7 }}>
        <Text style={styles.subtitle}>{section === 'home' ? 'Hello, ' + (user.data?.name.split(' ')[0] || 'friend') + ' 👋' : labels[section]}</Text>
        <View style={[styles.row, { alignItems: 'center' }]}><Text style={[styles.title, { flex: 1 }]}>{section === 'home' ? 'Make room for more.' : section === 'transactions' ? 'Every little detail.' : section === 'accounts' ? 'All together now.' : section === 'budgets' ? 'A plan that fits.' : 'Make it yours.'}</Text>{(section === 'accounts' || section === 'budgets') && <IconButton icon="add" label={section === 'accounts' ? 'Add a wallet' : 'Create a budget'} onPress={() => createForm(section === 'accounts' ? 'account' : 'budget')} background={colors.lime} />}</View>
      </View>
      {data.isPending ? <LoadingCards /> : data.error ? <View style={styles.card}><EmptyState icon="cloud-offline-outline" title="Let's reconnect." detail={data.error.message} /><Button title="Try again" onPress={() => void data.refetch()} icon="refresh-outline" /></View> : d && <>
        {section === 'home' && <HomeContent data={d} recent={recent.data?.items || []} categories={categories.data || []} actions={{ add, route, safe: () => open('safe'), period: () => open('period'), goal: showGoal, transaction: showTransaction }} period={periodLabel} hidden={hidden} toggleHidden={() => setHidden(!hidden)} recentPending={recent.isPending} recentError={recent.error?.message} retryRecent={() => void recent.refetch()} />}
        {section === 'transactions' && <>
          <View style={[styles.card, { backgroundColor: colors.forest, gap: 10 }]}><View style={styles.row}><Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.onDark }}>Current-cycle net spending</Text><Ionicons name="receipt-outline" size={20} color={colors.lime} /></View><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: colors.white, fontSize: 31 }]}>{money(d.expenses)}</Text><Text style={{ fontFamily: fonts.regular, fontSize: 10, color: '#A4BDAA' }}>{prettyDate(d.start_date, true)} – {prettyDate(d.end_date, true)} · transfers excluded</Text></View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><View style={{ flex: 1 }}><Field label="Search your activity" icon="search-outline" placeholder="Coffee, groceries, payday…" value={search} onChangeText={setSearch} /></View><View style={{ marginTop: 25 }}><IconButton icon="options-outline" label="Filter accounts and categories" onPress={() => open('filter')} background={filterAccount || filterCategory ? colors.lime : colors.panel} /></View></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Chip title="All activity" selected={!kind} onPress={() => { setKind(''); setPage(1); }} />{['expense', 'income', 'transfer', 'refund'].map(value => <Chip key={value} title={value.charAt(0).toUpperCase() + value.slice(1) + 's'} selected={kind === value} onPress={() => { setKind(value); setPage(1); }} />)}</ScrollView>
          <View style={[styles.card, { paddingVertical: 5, paddingHorizontal: 18 }]}>{transactions.isPending ? <View style={{ padding: 30 }}><ActivityIndicator color={colors.green} /></View> : transactions.error ? <View style={{ paddingVertical: 20, gap: 15 }}><ErrorBox message={transactions.error.message} /><Button secondary title="Try again" onPress={() => void transactions.refetch()} /></View> : transactions.data?.items.length ? <TransactionRows rows={transactions.data.items} accounts={d.accounts} categories={categories.data || []} onSelect={showTransaction} /> : <EmptyState title="Nothing here just yet." detail="Try another search or start a new page in your money story." action="Add a transaction" onAction={() => add('expense')} icon="search-outline" />}</View>
          <View style={styles.row}><IconButton label="Previous transactions" disabled={page===1} icon="chevron-back" onPress={() => { if (page > 1) setPage(page - 1); }} background={page > 1 ? colors.panel : colors.surface} /><Text style={styles.small}>Page {page} · {transactions.data?.total || 0} entries</Text><IconButton label="Next transactions" disabled={page*20>=(transactions.data?.total||0)} icon="chevron-forward" onPress={() => { if (page * 20 < (transactions.data?.total || 0)) setPage(page + 1); }} background={page * 20 < (transactions.data?.total || 0) ? colors.panel : colors.surface} /></View>
        </>}
        {section === 'accounts' && <>
          <View style={{ flexDirection: 'row', gap: 8 }}><Chip title="All wallets" selected={!cashOnly} icon="wallet-outline" onPress={() => setCashOnly(false)} /><Chip title="Just cash" selected={cashOnly} icon="cash-outline" onPress={() => setCashOnly(true)} /></View>
          {d.accounts.filter(account => !cashOnly || account.type === 'cash').map(account => <WalletCard key={account.id} account={account} onPress={() => showAccount(account)} />)}
          {!d.accounts.filter(account => !cashOnly || account.type === 'cash').length && <View style={styles.card}><EmptyState title={cashOnly ? 'A home for your pocket money.' : 'Every wallet, one clear picture.'} detail="Add a bank account, cash wallet or credit card to get started." action="Add a wallet" onAction={() => createForm('account')} icon="wallet-outline" /></View>}
          <InsightCard title="From bank to pocket. Still your money." detail="An ATM withdrawal is a transfer to your cash wallet. Only the cash you actually spend counts as an expense." />
          <Button title="Move money between wallets" secondary icon="swap-horizontal-outline" onPress={() => add('transfer')} />
        </>}
        {section === 'budgets' && <>
          {activeOverall ? <View style={[styles.card, { backgroundColor: colors.forest, gap: 14 }]}><View style={styles.row}><View style={{ flex: 1, gap: 7 }}><Text style={{ fontFamily: fonts.medium, color: colors.onDark, fontSize: 11 }}>A little direction for this cycle</Text><Text style={{ fontFamily: fonts.bold, color: colors.white, fontSize: 28, letterSpacing: -1 }}>{money(activeOverall.remaining)}</Text><Text style={{ fontFamily: fonts.regular, color: colors.onDark, fontSize: 10 }}>remaining in {activeOverall.name}</Text></View><View style={{ width: 58, height: 58, backgroundColor: '#FFFFFF10', borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="pie-chart-outline" size={27} color={colors.lime} /></View></View></View> : <View style={[styles.card, { backgroundColor: colors.limeSoft }]}><Ionicons name="leaf-outline" size={28} color={colors.green} /><Text style={[styles.title, { fontSize: 25, lineHeight: 33 }]}>A little structure.{"\n"}A little more freedom.</Text><Text style={styles.subtitle}>Make room for the things you need and the things you love.</Text><Button title="Create a spending plan" onPress={() => createForm('budget')} icon="add" /></View>}
          <SectionHeading title="Your budgets" action="New budget +" onPress={() => createForm('budget')} />
          {budgets.isPending ? <ActivityIndicator color={colors.green} /> : budgets.error ? <ErrorBox message={budgets.error.message} /> : budgets.data?.map(budget => <BudgetCard key={budget.id} budget={budget} category={categories.data?.find(item => item.id === budget.category_id)} />)}
          <View style={styles.note}><Ionicons name="information-circle-outline" size={18} color={colors.green} /><Text style={[styles.small, { flex: 1 }]}>Budgets use real expenses minus refunds. Moving money and repaying a card never use your budget twice.</Text></View>
        </>}
      </>}
    </ScrollView>
    <Sheet visible={sheet !== null} title={sheet === 'account' ? 'A new home for your money.' : sheet === 'budget' ? 'Give your money a plan.' : sheet === 'account-detail' ? 'Your wallet, in detail.' : sheet === 'safe' ? 'A little breathing room.' : sheet === 'period' ? 'Choose your perspective.' : sheet === 'filter' ? 'Find what matters.' : sheet === 'bills' ? 'Coming up next.' : sheet === 'goal' ? 'Your someday is taking shape.' : 'The little details.'} onClose={close}>
      {(sheet === 'account' || sheet === 'budget') && <>
        <Field label={sheet === 'account' ? 'Wallet name' : 'Budget name'} value={name} onChangeText={setName} placeholder={sheet === 'account' ? 'My everyday account' : 'A more intentional month'} maxLength={80} icon={sheet === 'account' ? 'wallet-outline' : 'pie-chart-outline'} />
        {sheet === 'account' && <View style={{ gap: 10 }}><Text style={styles.label}>What kind of wallet?</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['bank', 'cash', 'credit', 'other'].map(type => <Chip key={type} title={type === 'credit' ? 'Credit card' : type.charAt(0).toUpperCase() + type.slice(1)} selected={accountType === type} onPress={() => setAccountType(type)} />)}</View></View>}
        <Field label={sheet === 'account' ? 'Opening balance · INR' : 'Spending limit · INR'} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType={sheet === 'account' ? 'default' : 'decimal-pad'} icon="cash-outline" />
        {sheet === 'account' ? <Text style={styles.small}>Start with your balance before your first recorded transaction. For a credit card with money owed, enter a negative balance.</Text> : <>
          <View style={{ gap: 9 }}><Text style={styles.label}>Plan for</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Chip title="Everything" selected={!category} onPress={() => setCategory('')} />{categories.data?.map(item => <Chip title={item.name} key={item.id} selected={category === item.id} onPress={() => setCategory(item.id)} />)}</ScrollView></View>
          <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Field label="From · YYYY-MM-DD" value={start} onChangeText={setStart} /></View><View style={{ flex: 1 }}><Field label="Until · YYYY-MM-DD" value={end} onChangeText={setEnd} /></View></View>
        </>}
        {!!error && <ErrorBox message={error} />}<Button title={sheet === 'account' ? 'Create wallet' : 'Create budget'} busy={busy} onPress={() => void save()} icon="arrow-forward" />
      </>}
      {sheet === 'account-detail' && selectedAccount && <><WalletCard account={selectedAccount} onPress={() => {}} /><Field label="Wallet name" value={name} onChangeText={setName} /><DetailRow label="Opening signed balance" value={money(selectedAccount.opening_balance)} />{!!error && <ErrorBox message={error} />}<Button title="Save wallet name" busy={busy} onPress={() => void save()} /><Button title={selectedAccount.archived ? 'Restore this wallet' : 'Archive this wallet'} secondary busy={busy} onPress={() => void archive()} /><Text style={styles.small}>Archiving keeps your history and balance intact. Restore the wallet whenever you need to record more activity.</Text></>}
      {sheet === 'safe' && d && <><SafeCard data={d} onPress={() => {}} /><DetailRow label="Available funds" value={money(d.available)} /><DetailRow label="Credit card debt reserved" value={money(d.credit_debt)} /><DetailRow label="Essential bills reserved" value={money(d.reserved_bills)} /><DetailRow label="Goal allocations" value={money(d.reserved_goals)} /><DetailRow label="Minimum balance reserve" value={money(d.minimum_balance)} /><View style={styles.note}><Ionicons name="information-circle-outline" size={20} color={colors.green} /><Text style={[styles.small, { flex: 1 }]}>{d.assumptions}</Text></View></>}
      {sheet === 'period' && [['cycle', 'Current salary cycle'], ['month', 'This calendar month'], ['previous', 'Last calendar month']].map(([value, label]) => <Pressable key={value} accessibilityRole="button" onPress={() => { setPeriod(value); setSheet(null); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54, backgroundColor: period === value ? colors.limeSoft : colors.panel, paddingHorizontal: 16, borderRadius: 16 }}><Text style={styles.text}>{label}</Text>{period === value && <Ionicons name="checkmark-circle" color={colors.green} size={21} />}</Pressable>)}
      {sheet === 'filter' && d && <><Text style={styles.label}>From wallet</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Chip title="All wallets" selected={!filterAccount} onPress={() => setFilterAccount('')} />{d.accounts.map(account => <Chip key={account.id} title={account.name} selected={filterAccount === account.id} onPress={() => setFilterAccount(account.id)} />)}</View><Text style={styles.label}>In category</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Chip title="All categories" selected={!filterCategory} onPress={() => setFilterCategory('')} />{categories.data?.map(item => <Chip key={item.id} title={item.name} selected={filterCategory === item.id} onPress={() => setFilterCategory(item.id)} />)}</View><Button title="Show my activity" onPress={() => { setPage(1); setSheet(null); }} icon="arrow-forward" /></>}
      {sheet === 'bills' && (d?.upcoming.length ? d.upcoming.map(bill => <View key={bill.id} style={[styles.card, { gap: 8 }]}><View style={styles.row}><Text style={styles.cardTitle}>{bill.name}</Text><Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 14 }}>{money(bill.amount)}</Text></View><Text style={styles.small}>{prettyDate(bill.next_due)} · {bill.frequency} · {bill.next_due < indiaDate() ? 'Overdue' : 'Scheduled'}</Text><Text style={styles.small}>A reminder, not a completed payment. Confirm payments in the web app.</Text></View>) : <EmptyState title="A little less to remember." detail="Set up recurring bills in the web app and see upcoming reminders here." icon="calendar-outline" />)}
      {sheet === 'transaction' && selectedTransaction && d && <><View style={[styles.card, { backgroundColor: colors.limeSoft, alignItems: 'center', paddingVertical: 30 }]}><Text style={styles.overline}>{selectedTransaction.kind.toUpperCase()}</Text><Text style={styles.amount}>{money(selectedTransaction.amount)}</Text><Text style={styles.cardTitle}>{selectedTransaction.description}</Text></View><DetailRow label="Wallet" value={d.accounts.find(account => account.id === selectedTransaction.account_id)?.name || 'Account'} />{selectedTransaction.destination_id && <DetailRow label="To wallet" value={d.accounts.find(account => account.id === selectedTransaction.destination_id)?.name || 'Account'} />}<DetailRow label="Date" value={prettyDate(selectedTransaction.occurred_at)} /><DetailRow label="Category" value={categories.data?.find(item => item.id === selectedTransaction.category_id)?.name || 'Uncategorized'} />{!!selectedTransaction.notes && <Text style={styles.subtitle}>{selectedTransaction.notes}</Text>}<Text style={styles.small}>Need a correction or refund? The web ledger keeps the original and its audit history together.</Text></>}
      {sheet === 'goal' && selectedGoal && <><GoalTeaser goal={selectedGoal} onPress={() => {}} /><DetailRow label="Target date" value={prettyDate(selectedGoal.target_date)} /><DetailRow label="Estimated monthly contribution" value={money(selectedGoal.monthly_required)} /><Text style={styles.subtitle}>Allocations reserve existing funds for this goal. The estimate assumes 30-day months and no investment returns. Manage contributions in the web app.</Text></>}
    </Sheet>
  </SafeAreaView>;
}

function DetailRow({ label, value }: { label: string; value: string }) { return <View style={[styles.row, { paddingVertical: 5, alignItems: 'flex-start' }]}><Text style={[styles.small, { flex: 1 }]}>{label}</Text><Text style={[styles.text, { textAlign: 'right', flex: 1 }]}>{value}</Text></View>; }
