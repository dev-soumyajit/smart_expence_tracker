import { parseINR } from '../../../packages/contracts/validation';
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
let refreshing: Promise<Response> | null = null;
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const send = () => fetch('/api/' + path, { ...options, headers: {'Content-Type': 'application/json', ...options?.headers}, cache: 'no-store' });
  let response = await send();
  if (response.status === 401 && !['auth/login', 'auth/register', 'auth/refresh'].includes(path)) {
    if (!refreshing) refreshing = fetch('/api/auth/refresh', {method:'POST'}).finally(() => { refreshing = null; });
    if ((await refreshing).ok) response = await send();
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, typeof data.detail === 'string' ? data.detail : 'Please check the form fields and try again.');
  return data;
}
export function money(paise: number, decimals = false) {
  return new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR', minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2}).format(paise / 100);
}
export function toPaise(value: string) {
  return parseINR(value);
}
export function localDate() { return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day:'2-digit'}).format(new Date()); }
