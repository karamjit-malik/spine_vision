import { asyncHandler } from "../utils/asyncHandler.js";
import {
  loginUser,
  refreshSession,
  registerUser,
} from "../services/authService.js";

export const register = asyncHandler(async (req, res) => {
  const user = await registerUser(req.body);
  res.status(201).json({ success: true, data: { user } });
});

export const login = asyncHandler(async (req, res) => {
  const session = await loginUser(req.body);
  res.status(200).json({ success: true, data: session });
});

export const refresh = asyncHandler(async (req, res) => {
  const tokens = await refreshSession(req.body.refresh_token);
  res.status(200).json({ success: true, data: tokens });
});

export const me = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
});
