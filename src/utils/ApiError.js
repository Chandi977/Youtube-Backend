class ApiError extends Error {
  constructor(
    statusCode, // HTTP status code for the error
    message = 'Something went wrong', // Error message, default is 'Something went wrong'
    errors = [], // Optional array of additional error details
    stack = '' // Optional stack trace
  ) {
    super(message); // Call the parent class (Error) constructor with the message

    this.statusCode = statusCode; // Set the HTTP status code
    this.data = null; // Placeholder for additional data related to the error
    this.message = message; // Set the error message
    this.success = false; // Indicates failure (default is false)
    this.errors = errors; // Set additional error details

    // Set the stack trace if provided, otherwise capture it
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError }; // Export the ApiError class for use in other modules
