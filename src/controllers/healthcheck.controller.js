import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Healthcheck endpoint for checking server status
const healthcheck = asyncHandler(async (req, res) => {
  // TODO: Healthcheck response banani hai jo server ke OK status ko return kare
  const response = {
    success: true, // Bata raha hai ki server thik hai
    message: 'Server is running', // Server ke running status ka message
    timestamp: new Date().toISOString(), // Server status check ka exact time
  };

  // Response 200 ke sath json format mein bhejna hai
  return res
    .status(200)
    .json(new ApiResponse(200, response, 'Sab Badhiya chl rha.')); // Success message in Hinglish
});

export { healthcheck };
