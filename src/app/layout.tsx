import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QInformX — Quality Informatics Project Manager',
  description:
    'A project and task management platform for pharma quality informatics teams, with AI-assisted triage and deadline risk prediction.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50">{children}</body>
    </html>
  );
}
