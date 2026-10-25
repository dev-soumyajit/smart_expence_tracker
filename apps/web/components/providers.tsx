'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
export default function Providers({children}: {children: React.ReactNode}) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: (count, error) => count < 1 && !String(error).includes('401'), refetchOnWindowFocus: true }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}><MotionConfig reducedMotion="user">{children}</MotionConfig></QueryClientProvider>;
}
