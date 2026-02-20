'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptionalAuth, useOptionalClerk, clerkEnabled } from '../../../providers/auth-provider';

export default function LoginPage() {
  const { redirectToSignIn } = useOptionalClerk();
  const { isLoaded, isSignedIn } = useOptionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('record') === 'true' ? '/record' : '/';

  useEffect(() => {
    if (!clerkEnabled) {
      router.replace(redirectUrl);
      return;
    }
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace(redirectUrl);
    } else {
      redirectToSignIn({ redirectUrl });
    }
  }, [isLoaded, isSignedIn, redirectToSignIn, router, redirectUrl]);

  return null;
}
