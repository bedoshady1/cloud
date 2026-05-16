import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mini-Jira',
  description: 'Team task management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
