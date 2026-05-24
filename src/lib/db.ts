import mongoose from 'mongoose';

let cached: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } =
  (global as any).__mongooseCache || { conn: null, promise: null };
(global as any).__mongooseCache = cached;

async function resolveUri(): Promise<string> {
  const uri = process.env.MONGODB_URI;
  if (uri) return uri;

  if (process.env.USE_IN_MEMORY_MONGO === 'true') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const g = global as any;
    if (!g.__mongoMemoryServer) {
      g.__mongoMemoryServer = await MongoMemoryServer.create({
        instance: { dbName: 'pragati' },
        binary: { version: process.env.MONGOMS_VERSION || '7.0.14' },
      });
      console.log(`[db] in-memory Mongo @ ${g.__mongoMemoryServer.getUri()}`);
    }
    return g.__mongoMemoryServer.getUri();
  }

  // First request after a misconfigured deploy lands here — make the
  // message obvious in the logs.
  const where = process.env.NODE_ENV === 'production' ? '[CONFIG]' : '[db]';
  throw new Error(
    `${where} MONGODB_URI is not set. Configure it in the hosting dashboard, ` +
    'or set USE_IN_MEMORY_MONGO=true for local dev.',
  );
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = resolveUri().then((uri) =>
      mongoose.connect(uri, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,  // fail fast, not 15s
        connectTimeoutMS: 8000,
        socketTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
      }),
    );
  }
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Critical: a rejected promise must NOT stay cached, otherwise every
    // subsequent request returns the same error forever (until the process
    // recycles). Reset so the next call can retry against a refreshed URI
    // / a recovered cluster.
    cached.promise = null;
    cached.conn    = null;
    throw err;
  }

  if (process.env.USE_IN_MEMORY_MONGO === 'true') {
    const { devSeed } = await import('@/lib/devSeed');
    await devSeed();
  }

  return cached.conn;
}
