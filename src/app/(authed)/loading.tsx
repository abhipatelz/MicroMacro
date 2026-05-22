import { PragatiMark } from '@/components/PragatiMark';

// Server-rendered loading state — no JS, no client hydration, paints instantly.
// One rotating message is picked per request via a tiny inline script so we keep
// the personality without shipping a full client component.

const MESSAGES = [
  'Scanning project health…',
  'Checking audit trails…',
  'Analysing deviation patterns…',
  'Running compliance checks…',
  'Pulling team velocity…',
  'Verifying GxP status…',
  'Building your dashboard…',
];

export default function Loading() {
  const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-transparent"
          style={{
            borderTopColor: '#1565C0',
            borderRightColor: '#1565C020',
            animation: 'spin 1s linear infinite',
          }} />
        <div className="absolute inset-2 rounded-full border-4 border-transparent"
          style={{
            borderTopColor: '#1769C8',
            borderLeftColor: '#1769C820',
            animation: 'spin 1.5s linear infinite reverse',
          }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <PragatiMark size={26} flat />
        </div>
      </div>

      <div className="text-center space-y-1">
        <div className="text-sm font-medium text-slate-500">{message}</div>
        <div className="flex items-center justify-center gap-1.5 mt-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-300" style={{ animation: 'pulse 1.2s 0s ease-in-out infinite' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-300" style={{ animation: 'pulse 1.2s 0.2s ease-in-out infinite' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-300" style={{ animation: 'pulse 1.2s 0.4s ease-in-out infinite' }} />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%      { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
