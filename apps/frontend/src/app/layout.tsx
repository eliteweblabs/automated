import './global.css';
import { Inter } from 'next/font/google';
import { AuthProvider } from '../providers/auth-provider';
import { ChakraUIProvider } from '../providers/chakra-provider';
import { QueryProvider } from '../providers/query-provider';
import { FeedbackModal } from './components/FeedbackModal';
import { ImpersonationProvider } from '../providers/impersonation-provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Automated',
  description: 'Automate any workflow. Record your workflow once, let it run on autopilot forever.',
  icons: {
    icon: '/brand/icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} ${inter.className}`}>
          <ChakraUIProvider>
            <QueryProvider>
              <ImpersonationProvider>
                {children}
                <FeedbackModal />
              </ImpersonationProvider>
            </QueryProvider>
          </ChakraUIProvider>
        </body>
      </html>
    </AuthProvider>
  );
}
