import fs from "fs";
import mongoose from "mongoose";
import { env } from "./env.js";

let embedded = null;

/**
 * Connect to MongoDB.
 *
 * Prefers the configured MONGODB_URI. If that host is unreachable and
 * USE_EMBEDDED_MONGO is on, boot a real mongod binary against a local dbPath —
 * this machine has no system mongod, and the data still persists across
 * restarts. Once a system MongoDB exists, set USE_EMBEDDED_MONGO=false.
 */
export async function connectDb() {
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 2000 });
    console.log(`[db] connected to ${env.mongoUri}`);
    return;
  } catch (error) {
    // In production the embedded fallback is never right — it would come up
    // healthy on a throwaway database and quietly lose every account.
    if (!env.useEmbeddedMongo || env.nodeEnv === "production") throw error;
    console.warn(`[db] ${env.mongoUri} unreachable — starting embedded mongod`);
  }

  // Another process (the server, a seed script) may already own the embedded
  // instance — reuse it rather than fighting over the port.
  const embeddedUri = `mongodb://127.0.0.1:${env.embeddedMongoPort}/spinevision`;
  try {
    await mongoose.connect(embeddedUri, { serverSelectionTimeoutMS: 1500 });
    console.log(`[db] joined embedded mongod on port ${env.embeddedMongoPort}`);
    return;
  } catch {
    /* nothing listening yet — start one below */
  }

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  fs.mkdirSync(env.embeddedMongoDbPath, { recursive: true });

  embedded = await MongoMemoryServer.create({
    instance: {
      port: env.embeddedMongoPort,
      dbPath: env.embeddedMongoDbPath,
      storageEngine: "wiredTiger",
      dbName: "spinevision",
    },
  });

  await mongoose.connect(`${embedded.getUri()}spinevision`);
  console.log(`[db] embedded mongod on port ${env.embeddedMongoPort} (${env.embeddedMongoDbPath})`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (embedded) await embedded.stop();
}
