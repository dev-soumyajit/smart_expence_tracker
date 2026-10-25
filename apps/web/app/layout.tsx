import type { Metadata } from 'next';
import Providers from '@/components/providers';
import './globals.css';
export const metadata: Metadata = { title: 'Morrowmint · Make room for what matters', description: 'A clearer picture of your money. Accounts, spending, budgets and a thoughtful finance copilot.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en-IN"><body><Providers>{children}</Providers></body></html>;
}
