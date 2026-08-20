/**
 * Creates a demo account so the UI can be exercised immediately.
 * Usage: npm run seed
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { User } from "../models/User.js";
import { hashPassword } from "../services/authService.js";

const DEMO = {
  name: "Demo User",
  email: "demo@spinevision.dev",
  password: "spinevision",
};

await connectDb();

const existing = await User.findOne({ email: DEMO.email }).lean();
if (existing) {
  console.log(`[seed] ${DEMO.email} already exists`);
} else {
  await User.create({
    name: DEMO.name,
    email: DEMO.email,
    passwordHash: await hashPassword(DEMO.password),
  });
  console.log(`[seed] created ${DEMO.email} / ${DEMO.password}`);
}

await disconnectDb();
process.exit(0);
