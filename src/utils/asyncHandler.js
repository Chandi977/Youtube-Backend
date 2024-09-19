const asyncHandler = (requestHandler) => {
  // Returns a function that wraps the provided requestHandler function
  return (req, res, next) => {
    // Wrap the requestHandler in a Promise and handle any rejections
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export { asyncHandler };

// Alternative implementation with try-catch for error handling
// const asyncHandler = (fn) => async (req, res, next) => {
//   try {
//     await fn(req, res, next); // Await the provided async function
//   } catch (error) {
//     // Catch any errors and send an appropriate response
//     res.status(error.code || 500).json({
//       success: false, // Fix typo from 'succes' to 'success'
//       message: error.message, // Send error message in response
//     });
//   }
// };
