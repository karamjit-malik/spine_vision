import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
} from "../validators/authValidator.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), authController.register);
authRouter.post("/login", validate(loginSchema), authController.login);
authRouter.post("/refresh", validate(refreshSchema), authController.refresh);
authRouter.get("/me", requireAuth, authController.me);
