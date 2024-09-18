import { asyncHandler } from '../utils/asyncHandler.js';

const registerUser = asyncHandler(async (req, res) => {
  res.status(200).json({
    message: 'Bhai Kam kr rha hain Postman mai dekh liya',
  });
});

export { registerUser };
