class ApiResponse {
  constructor(statusCode, data, message = 'Success') {
    this.statusCode = statusCode; // HTTP status code for the response
    this.data = data; // Data to be included in the response
    this.message = message; // Response message, default is 'Success'
    this.success = statusCode < 400; // Indicates success if status code is less than 400 (i.e., successful response)
  }
}

export { ApiResponse }; // Export the ApiResponse class for use in other modules
