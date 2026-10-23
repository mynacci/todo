import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let server: MongoMemoryServer | undefined;

export async function startTestDB(): Promise<string> {
  server = await MongoMemoryServer.create();
  const uri = server.getUri("todo-test");
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  return uri;
}

export async function clearTestDB(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function stopTestDB(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
  server = undefined;
}
