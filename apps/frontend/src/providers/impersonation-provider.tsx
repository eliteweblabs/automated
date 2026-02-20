'use client';

import { useOptionalUser } from './auth-provider';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

const ADMIN_EMAIL = 'robert.victor.muresan@gmail.com';

interface ImpersonationContextValue {
  impersonatedEmail: string | null;
  isAdmin: boolean;
  startImpersonating: (email: string) => void;
  stopImpersonating: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  impersonatedEmail: null,
  isAdmin: false,
  startImpersonating: () => {},
  stopImpersonating: () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { user } = useOptionalUser();
  const queryClient = useQueryClient();
  const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(null);

  const isAdmin = user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL;

  // Track whether this is the initial mount to skip the first effect
  const isInitialMount = useRef(true);

  // Invalidate all queries AFTER React has re-rendered consumers with the new impersonatedEmail.
  // This ensures queryFn closures have the updated header before refetching.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    queryClient.invalidateQueries();
  }, [impersonatedEmail, queryClient]);

  const startImpersonating = useCallback(
    (email: string) => {
      if (isAdmin) {
        setImpersonatedEmail(email);
      }
    },
    [isAdmin],
  );

  const stopImpersonating = useCallback(() => {
    setImpersonatedEmail(null);
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{ impersonatedEmail, isAdmin, startImpersonating, stopImpersonating }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
