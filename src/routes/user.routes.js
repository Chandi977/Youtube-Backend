import { Router } from 'express'; // Importing the Router module from express to create modular, mountable route handlers.
import {
  loginUser,
  registerUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAcccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
} from '../controllers/user.controller.js'; // Importing controller functions for user-related actions.
import { upload } from '../middlewares/multer.middleware.js'; // Importing middleware for handling file uploads (Multer).
import { verifyJWT } from '../middlewares/auth.middleware.js'; // Importing middleware to verify JSON Web Tokens (JWT).

const router = Router(); // Creating a new Router instance to handle routes.

// Route to handle user registration
// This route expects avatar and coverImage fields for file uploads
router.route('/register').post(
  upload.fields([
    {
      name: 'avatar', // Expecting an avatar file upload with maxCount set to 1.
      maxCount: 1,
    },
    {
      name: 'coverImage', // Expecting a coverImage file upload with maxCount set to 1.
      maxCount: 1,
    },
  ]),
  registerUser // Controller function to handle the user registration logic.
);

// Route to handle user login
router.route('/login').post(loginUser); // Controller function to handle user login logic.

// Secured Route for logout
// The user needs to be authenticated with JWT to access this route
router.route('/logout').post(verifyJWT, logoutUser); // Controller function to handle logout, with JWT verification for security.

router.route('/refresh-token').post(refreshAccessToken);
router.route('/changePassword').post(verifyJWT, changeCurrentPassword);
router.route('/current-user').get(verifyJWT, getCurrentUser);
router.route('/update-account').post(verifyJWT, updateAcccountDetails);
router
  .route('/update-avatar')
  .patch(verifyJWT, upload.single('avatar'), updateUserAvatar);
router
  .route('/update-coverImage')
  .patch(verifyJWT, upload.single('coverImage'), updateUserCoverImage);
export default router; // Exporting the router to use it in other parts of the application.
