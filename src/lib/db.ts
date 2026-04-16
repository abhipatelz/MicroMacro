import mongoose from 'mongoose';

let cached: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } =
  (global as any).__mongooseCache || { conn: null, promise: null };
(global as any).__mongooseCache = cached;

async function resolveUri(): Promise<string> {
  const uri = process.env.MONGODB_URI;
  if (uri) return uri;

  if (process.env.USE_IN_MEMORY_MONGO === 'true') {
    // Lazy load so it is only ever loaded in dev / CI.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const g = global as any;
    if (!g.__mongoMemoryServer) {
      g.__mongoMemoryServer = await MongoMemoryServer.create({
        instance: { dbName: 'qinformx' }
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
      mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 })
    );
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
