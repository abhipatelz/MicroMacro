import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { ScratchNote } from '@/models/ScratchNote';
import MyDayClient from './MyDayClient';

function serializeNote(n: any) {
  return {
    id: String(n._id),
    text: n.text as string,
    done: !!n.done,
    promotedTaskId: n.promotedTaskId ? String(n.promotedTaskId) : null,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
  };
}

export default async function MyDayPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');

  await connectDB();

  const [open, done] = await Promise.all([
    ScratchNote.find({ userId: jwt.sub, done: false }).sort({ createdAt: -1 }).lean(),
    ScratchNote.find({ userId: jwt.sub, done: true }).sort({ updatedAt: -1 }).limit(20).lean(),
  ]);

  return (
    <MyDayClient
      initialData={{
        open: open.map(serializeNote),
        done: done.map(serializeNote),
      }}
    />
  );
}
