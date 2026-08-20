import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

const SALT_ROUNDS = 12;

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function signTokens(user) {
  const payload = { userId: user._id.toString(), email: user.email };
  return {
    access_token: jwt.sign(payload, env.jwtSecret, {
      expiresIn: env.accessTokenExpiry,
    }),
    refresh_token: jwt.sign(payload, env.jwtRefreshSecret, {
      expiresIn: env.refreshTokenExpiry,
    }),
  };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

export async function registerUser({ name, email, password }) {
  const existing = await User.findOne({ email: email.toLowerCase() }).lean();
  if (existing) throw ApiError.conflict("An account with that email already exists");

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
  });

  return user.toPublic();
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Same error for unknown email and wrong password — never reveal which.
  const invalid = ApiError.unauthorized("Invalid email or password");
  if (!user) throw invalid;

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw invalid;

  return { ...signTokens(user), user: user.toPublic() };
}

export async function refreshSession(refreshToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Refresh token is invalid or expired");
  }

  const user = await User.findById(decoded.userId);
  if (!user) throw ApiError.unauthorized("Account no longer exists");

  return signTokens(user);
}
