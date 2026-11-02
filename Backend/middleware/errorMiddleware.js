/**
 * Handle 404 errors - routes not found
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Central error handler for all errors
 */
const errorHandler = (err, req, res, next) => {
  // If response status is 200 but there's an error, set to 500
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Set status code
  res.status(statusCode);
  
  // Send error response
  res.json({
    success: false,
    message: err.message,
    // Only include stack trace in development
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    // Include the error name for more context
    error: err.name
  });
};

module.exports = { notFound, errorHandler }; 