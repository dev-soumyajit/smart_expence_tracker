import { useRef } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Account, Category } from '../../web/lib/types';
import { TransactionEntry, type EntryKind, type EntryPayload } from '../components/entry-form';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Add() {
  const router = useRouter(), cache = useQueryClient(), auth = useAuth();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const key = useRef('mobile:' + Date.now() + ':' + Math.random().toString(36).slice(2));
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('accounts'), enabled: auth.signedIn });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('categories'), enabled: auth.signedIn });
  if (auth.ready && !auth.signedIn) return <Redirect href="/login" />;
  const save = async (payload: EntryPayload) => {
    await api('transactions', { method: 'POST', headers: { 'Idempotency-Key': key.current }, body: JSON.stringify(payload) });
    void cache.invalidateQueries();
    router.back();
  };
  const initialKind: EntryKind = kind === 'income' || kind === 'transfer' ? kind : 'expense';
  return <TransactionEntry accounts={accounts.data || []} categories={categories.data || []} initialKind={initialKind} onSave={save} onClose={() => router.back()} loading={accounts.isPending} loadError={accounts.error?.message || categories.error?.message} />;
}
