import Joi from "joi";

export const scanIdSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    "string.hex": "Invalid scan id",
    "string.length": "Invalid scan id",
  }),
});

export const historyQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
});

/**
 * The explain route carries a condition as well as the id. It needs its own
 * schema — validating it with scanIdSchema would strip `condition`, since the
 * validator runs with stripUnknown.
 */
export const explainParamsSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    "string.hex": "Invalid scan id",
    "string.length": "Invalid scan id",
  }),
  condition: Joi.string()
    .pattern(/^[a-z][a-z_]*$/)
    .max(64)
    .required()
    .messages({ "string.pattern.base": "Invalid condition" }),
});

export const askBodySchema = Joi.object({
  question: Joi.string().trim().min(1).max(500).required().messages({
    "string.empty": "Ask a question first",
    "string.max": "Keep the question under 500 characters",
  }),
  audience: Joi.string().valid("patient", "clinician").default("patient"),
});

export const imageParamsSchema = Joi.object({
  scanId: Joi.string().hex().length(24).required(),
  filename: Joi.string()
    .pattern(/^[\w.-]+$/)
    .required()
    .messages({ "string.pattern.base": "Invalid filename" }),
});
