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

  throw new Error('MONGODB_URI not set and USE_IN_MEMORY_MONGO is not true');
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
      })
    );
  }
  cached.conn = await cached.promise;

  if (process.env.USE_IN_MEMORY_MONGO === 'true') {
    const { devSeed } = await import('@/lib/devSeed');
    await devSeed();
  }

  return cached.conn;
}
