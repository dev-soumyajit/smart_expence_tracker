// On-device only: raw messages never enter the HTTP API or learned preferences.
export type SmsKind = 'expense' | 'income' | 'transfer' | 'refund';
export type DeviceSms = { id: string; sender: string; body: string; receivedAt: number };
export type SmsSuggestion = {
  status: 'review_required' | 'ignored' | 'unsupported'; reason: string;
  amount: number | null; amountOptions: number[]; kind: SmsKind | null;
  occurredAt: string; dateSource: 'message' | 'receipt'; accountTail: string;
  senderKey: string; merchant: string; preview: string; questions: string[];
  identity: string; reference: string; transferHint: 'atm' | 'card_repayment' | 'own_transfer' | null;
};
const maximum = 900_000_000_000_000;
export function normalizeSender(sender: string) {
  return sender.toUpperCase().trim().replace(/^[A-Z0-9]{2}-/, '').replace(/-[A-Z]$/, '').replace(/[^A-Z0-9]/g, '').slice(0, 24);
}
export function merchantKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
export function redactSms(text: string) {
  return text.replace(/https?:\/\/\S+/gi, '[link]').replace(/[\w.+-]+@[\w.-]+/g, '[UPI ID]')
    .replace(/((?:a\/c|acct?|account|card)(?:\s*(?:no\.?|number|ending|ending in|ending with))?\s*[:*xX.\- ]*)(\d{5,18})\b/gi, (_all, prefix, number) => prefix + '••••' + number.slice(-4))
    .replace(/((?:ref(?:erence)?|utr|rrn)\s*[:#.\- ]*)([A-Z0-9]{8,24})\b/gi, (_all, prefix, number) => prefix + '••••' + number.slice(-4))
    .replace(/\b\d{8,}\b/g, value => '••••' + value.slice(-4)).replace(/\s+/g, ' ').slice(0, 420);
}
function validAmount(token: string): number | null {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(token)) return null;
  const [whole, fraction = ''] = token.replace(/,/g, '').split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}
export function parseSms(message: DeviceSms): SmsSuggestion {
  const timestamp = new Date(message.receivedAt);
  const safeTime = Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : '';
  const result: SmsSuggestion = { status: 'unsupported', reason: '', amount: null, amountOptions: [], kind: null, occurredAt: safeTime, dateSource: 'receipt', accountTail: '', senderKey: normalizeSender(message.sender), merchant: '', preview: '', questions: [], identity: '', reference: '', transferHint: null };
  const stop = (reason: string, status: 'ignored' | 'unsupported' = 'ignored') => ({ ...result, status, reason });
  if (!safeTime || message.body.length > 3000 || !message.body.trim()) return stop('Invalid message or receipt time', 'unsupported');
  const text = message.body.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(), lower = text.toLowerCase();
  // No security codes or authentication messages are retained, shown or uploaded.
  if (/\b(?:otp|one[ -]time|verification code|authentication code|security code|login code|passcode|2fa|password|cvv|pin)\b/i.test(text)) return stop('Security or authentication message');
  if (/\b(?:failed|failure|declined|unsuccessful|pending|processing|initiated|scheduled|due|reminder|statement|offer|requested|cancelled|canceled|rejected)\b/i.test(text) || /\b(?:collect request|payment request|request for|will be|to be|will debit|will credit)\b/i.test(text) || /\bnot\s+(?:debited|credited|paid|successful)\b/i.test(text)) return stop('No confirmed completed transaction');
  const debit = /\b(?:debited|spent|paid|withdrawn|withdrawal|sent|purchased)\b/.test(lower);
  const credit = /\b(?:credited|received|deposited)\b/.test(lower);
  if (/\b(?:refund(?:ed)?|reversed|reversal)\b/.test(lower)) result.kind = 'refund';
  else if (/\batm\b/.test(lower) && /\b(?:fees?|charges)\b/.test(lower) && (debit || credit)) result.questions.push('This ATM alert mentions a fee. Was this a bank charge (expense) or a cash withdrawal (transfer)?');
  else if (/\batm\b/.test(lower) && /\b(?:withdrawal|withdrawn|wdl|debited)\b/.test(lower)) { result.kind = 'transfer'; result.transferHint = 'atm'; }
  else if ((/credit[ -]?card/.test(lower) && /\b(?:repayment|repaid|payment received)\b/.test(lower)) || /(?:paid|payment).*\b(?:towards|to|for)\s+(?:(?:your|my|the)\s+)?credit[ -]?card\b/.test(lower) || /credit[ -]?card.*payment (?:of|received)/.test(lower) || /credited for credit card payment/.test(lower)) { result.kind = 'transfer'; result.transferHint = 'card_repayment'; }
  else if (/\b(?:self transfer|own accounts?|own account transfer)\b/.test(lower) && (debit || credit)) { result.kind = 'transfer'; result.transferHint = 'own_transfer'; }
  else if (debit !== credit) result.kind = debit ? 'expense' : 'income';
  else if (!debit && !credit) return stop('No confirmed transaction direction', 'unsupported');
  if (!result.kind && debit && credit) result.questions.push('Both debit and credit language appear. Which transaction type is correct?');
  const money = /(?:\bINR|\bRs\.?|₹)\s*([-+]?\d[\d,]*(?:\.\d+)?)(?![\w,]|\.\d)/gi;
  let match: RegExpExecArray | null;
  const values: number[] = [];
  while ((match = money.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 48), match.index);
    const after = text.slice(money.lastIndex, money.lastIndex + 35);
    if (/(?:bal(?:ance)?|limit|outstanding)\s*(?:is|of|:|=)?\s*$/i.test(before) || /^\s*(?:is\s+(?:your\s+)?)?(?:available\s+|avl\s+)?bal(?:ance)?\b/i.test(after)) continue;
    const value = validAmount(match[1]);
    if (value === null) result.questions.push('An amount has invalid grouping, precision or range. Enter the exact transaction amount.');
    else values.push(value);
  }
  result.amountOptions = [...new Set(values)];
  if (result.amountOptions.length === 1 && !result.questions.some(q => q.startsWith('An amount'))) result.amount = result.amountOptions[0];
  else if (result.amountOptions.length > 1) result.questions.push('Several amounts appear. Select the transaction amount, excluding balance and fees.');
  else result.questions.push('The transaction amount is unclear. Enter it manually.');
  if (!result.amountOptions.length && !/(?:\bINR\b|\bRs\.?|₹)/i.test(text)) return stop('Only INR transaction alerts are supported', 'unsupported');
  const tail = /(?:a\/c|acct?|account|card)(?:\s*(?:no\.?|number|ending|ending in|ending with))?\s*[:*xX.\- ]*(\d{4,18})\b/i.exec(text);
  result.accountTail = tail ? tail[1].slice(-4) : '';
  const reference = /(?:\b(?:UPI|IMPS|NEFT|RTGS)\s*(?:ref(?:erence)?(?:\s*(?:no|number))?|txn(?:\s*id)?|rrn)?|\b(?:ref(?:erence)?(?:\s*(?:no|number))?|rrn|utr))\s*[:#.\- ]*([A-Z0-9]{8,24})\b/i.exec(text);
  result.reference = reference && /\d/.test(reference[1]) ? reference[1].toUpperCase() : '';
  const merchant = /\b(?:at|to|from)\s+([A-Za-z][A-Za-z0-9 &.'_-]{1,65}?)(?=\s+(?:on|via|using|ref|upi|imps|neft|avl|bal|a\/c|account|card)\b|[.;]|$)/i.exec(text);
  result.merchant = merchant ? merchant[1].trim().slice(0, 65) : '';
  const iso = /\b(?:on|dated|at)\s+(\d{4})-(\d{2})-(\d{2})(?:[ T]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?!\d)/i.exec(text);
  const date = iso ? [iso[0], iso[3], iso[2], iso[1], iso[4], iso[5], iso[6]] : /\b(?:on|dated|at)\s+(\d{1,2})[-/](\d{1,2}|[A-Za-z]{3})[-/](\d{2}|\d{4})(?:[ T]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?!\d)/i.exec(text);
  if (date) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const month = /^\d+$/.test(date[2]) ? Number(date[2]) : months.indexOf(date[2].toLowerCase()) + 1;
    const year = Number(date[3]) + (date[3].length === 2 ? 2000 : 0);
    const day = Number(date[1]), hour = Number(date[4] || 12), minute = Number(date[5] || 0), second = Number(date[6] || 0);
    const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const utc = new Date(local.getTime() - 330 * 60000);
    if (/\b(?:UTC|GMT)\b|\d{2}:\d{2}(?::\d{2})?\s*(?:Z\b|[+-]\d{2}:?\d{2})/i.test(text)) result.questions.push('The message includes an explicit timezone. Convert and confirm the correct IST time.');
    else if (local.getUTCFullYear() === year && local.getUTCMonth() === month - 1 && local.getUTCDate() === day && hour < 24 && minute < 60 && second < 60 && utc.getTime() <= message.receivedAt + 5 * 60000) {
      result.occurredAt = utc.toISOString(); result.dateSource = 'message';
      if (!date[4]) result.questions.push('The message gives a date without a time. Noon IST is proposed; check it.');
    } else result.questions.push('The message date is invalid or later than receipt. Choose the correct date and time.');
  }
  if (result.dateSource === 'receipt') result.questions.push('No reliable bank transaction time. Is the message receipt date and time correct?');
  if (!result.accountTail) result.questions.push('Which wallet does this message belong to?');
  if (result.kind === 'refund') result.questions.push('Which original expense is being refunded? A refund must not count as new income.');
  if (result.kind === 'transfer') result.questions.push('Confirm both wallets. Moving money must not count as a second expense.');
  result.preview = redactSms(text);
  // Excludes amount from a reference-based identity so parser corrections cannot create a new event.
  const bankDay = new Date(message.receivedAt + 330 * 60000).toISOString().slice(0, 10);
  result.identity = result.reference && result.accountTail && result.kind && result.senderKey
    ? ['sms-v1', result.senderKey, result.accountTail, result.reference, debit ? 'debit' : credit ? 'credit' : result.kind].join('|')
    : ['sms-v1', result.senderKey, bankDay, message.id === 'paste' ? 'paste' : String(message.receivedAt), lower.replace(/\s+/g, ' ')].join('|');
  result.status = 'review_required'; result.reason = result.questions.length ? 'Please clarify the highlighted details.' : 'Please confirm every detail before saving.';
  return result;
}

export type SmsLearning = { wallets: Record<string, string>; categories: Record<string, string> };
export type SmsLearningContext = { walletKey: string; merchantKey: string };
export function walletRuleKey(suggestion: SmsSuggestion) { return suggestion.senderKey && suggestion.accountTail ? suggestion.senderKey + ':' + suggestion.accountTail : ''; }
export function learningContext(suggestion: SmsSuggestion): SmsLearningContext { return { walletKey: walletRuleKey(suggestion), merchantKey: merchantKey(suggestion.merchant) }; }
export function learnedSuggestion(suggestion: SmsSuggestion, rules: SmsLearning, activeAccountIds: string[], categoryIds: string[]) {
  const account = rules.wallets[walletRuleKey(suggestion)], category = rules.categories[merchantKey(suggestion.merchant)];
  return { accountId: account && activeAccountIds.includes(account) && suggestion.kind !== 'transfer' && suggestion.kind !== 'refund' ? account : '', categoryId: category && categoryIds.includes(category) ? category : '' };
}
export function learnSelection(rules: SmsLearning, suggestion: SmsSuggestion, accountId: string, categoryId: string | null): SmsLearning {
  return learnContextSelection(rules, learningContext(suggestion), suggestion.kind, accountId, categoryId);
}
export function learnContextSelection(rules: SmsLearning, context: SmsLearningContext, kind: SmsKind | null, accountId: string, categoryId: string | null): SmsLearning {
  const wallets = { ...rules.wallets }, categories = { ...rules.categories };
  const key = context.walletKey, merchant = context.merchantKey;
  if (key) { delete wallets[key]; if (kind === 'expense' || kind === 'income') wallets[key] = accountId; }
  if (merchant) { delete categories[merchant]; if (categoryId) categories[merchant] = categoryId; }
  const recent = (entries: Record<string, string>) => Object.fromEntries(Object.entries(entries).slice(-8));
  return { wallets: recent(wallets), categories: recent(categories) };
}
