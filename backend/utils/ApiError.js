/** Error carrying an HTTP status, thrown from services and controllers. */
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }

  static badRequest(message) {
    return new ApiError(400, message);
  }
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }
  static forbidden(message = "Forbidden") {
    return new ApiError(403, message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }
  static conflict(message) {
    return new ApiError(409, message);
  }
  static tooManyRequests(message = "Too many requests") {
    return new ApiError(429, message);
  }
  /** A dependency the server needs is not configured or not answering. */
  static serviceUnavailable(message = "Service unavailable") {
    return new ApiError(503, message);
  }
}
