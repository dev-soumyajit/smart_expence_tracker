import Workspace from '@/components/workspace';
import { notFound } from 'next/navigation';
const sections = ['transactions', 'accounts', 'cash', 'budgets', 'insights', 'recurring', 'goals', 'assistant', 'import', 'settings'];
export default async function Page({params}: {params:Promise<{section:string}>}) {
  const {section} = await params;
  if (!sections.includes(section)) notFound();
  return <Workspace section={section} />;
}
