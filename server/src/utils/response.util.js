export function successResponse(res, message, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

export function errorResponse(res, message, error = null, statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    message,
    error: error instanceof Error ? error.message : error
  });
}
