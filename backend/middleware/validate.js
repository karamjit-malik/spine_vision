import { ApiError } from "../utils/ApiError.js";

/**
 * Joi validation middleware factory.
 * @param {import("joi").Schema} schema
 * @param {"body"|"params"|"query"} source
 */
export const validate =
  (schema, source = "body") =>
  (req, _res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return next(ApiError.badRequest(error.details.map((d) => d.message).join(", ")));
    }

    // req.query is a getter on Express 5; assign only where it is writable.
    if (source === "query") Object.assign(req.query, value);
    else req[source] = value;
    next();
  };
