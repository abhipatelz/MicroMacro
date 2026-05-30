import 'dotenv/config';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

async function main() {
  await connectDB();

  const pmToLead = await User.updateMany({ role: 'pm' }, { $set: { role: 'lead' } });
  const employeeToContributor = await User.updateMany(
    { role: 'employee' },
    { $set: { role: 'contributor' } },
  );

  console.log('[migrate-roles] pm -> lead:', pmToLead.modifiedCount);
  console.log('[migrate-roles] employee -> contributor:', employeeToContributor.modifiedCount);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
