# Updating the README content with all 10 methods and detailed descriptions for each method in user.controller.js

readme_content = """
# User Controller - API Documentation

This file documents the **user.controller.js** file, which manages various user-related functionalities in your application. The controller includes 10 methods for tasks such as user registration, login, token handling, image uploads, and account updates.

## Table of Contents
1. [Register User](#register-user)
2. [Login User](#login-user)
3. [Logout User](#logout-user)
4. [Refresh Access Token](#refresh-access-token)
5. [Change Current Password](#change-current-password)
6. [Get Current User](#get-current-user)
7. [Update Account Details](#update-account-details)
8. [Update User Avatar](#update-user-avatar)
9. [Update User Cover Image](#update-user-cover-image)
10. [Generate Access and Refresh Tokens](#generate-access-and-refresh-tokens)

## 1. Register User

### Method: `registerUser`
- **Description:** Handles the user registration process, validating inputs such as `fullName`, `email`, `username`, `password`, and uploads `avatar` and `coverImage` (optional) to Cloudinary.
- **Route:** `POST /api/users/register`
- **Key Steps:**
  1. Validate required fields (e.g., `fullName`, `email`, etc.) using regex for `email` and `password`.
  2. Check if the user already exists in the database by searching with `email` or `username`.
  3. Upload avatar (mandatory) and cover image (optional) to Cloudinary.
  4. Create and save a new user in the database.
  5. Return the created user's details, excluding sensitive fields like `password` and `refreshToken`.

- **Code**:
    ``` javascript 
    const registerUser = asyncHandler(async (req, res) => {
        // Step 1: Request body se user data lena
        const { fullName, email, username, password } = req.body;

        // Step 2: Required fields ka validation karna
        if (
          [fullName, email, username, password].some((field) => field?.trim() === '')
        ) {
          throw new ApiError(400, 'Sab fields required hain.'); // Error agar koi field khali ho
        }

        // Fullname validation: minimum 2 characters aur sirf letters aur spaces allowed
        if (fullName.trim().length < 2) {
          throw new ApiError(
            400,
            'Fullname mein kam se kam 2 characters hone chahiye.'
          );
        } else if (!/^[a-zA-Z\s]+$/.test(fullName.trim())) {
          throw new ApiError(
            400,
            'Fullname sirf letters aur spaces contain kar sakta hai.'
          );
        }

        // Email validation ke liye regex pattern
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        if (!emailRegex.test(email)) {
          throw new ApiError(400, 'Kripya ek valid email address enter karein.');
        }

        // Username validation: minimum 4 characters, alphanumeric, bina spaces
        if (username.length < 4) {
          throw new ApiError(
            400,
            'Username mein kam se kam 4 characters hone chahiye.'
          );
        } else if (!/^[a-zA-Z0-9]+$/.test(username)) {
          throw new ApiError(
            400,
            'Username sirf alphanumeric characters bina spaces ke contain kar sakta hai.'
          );
        }

        // Password validation: minimum 8 characters, letters aur numbers hone chahiye
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
        if (password.length < 8) {
          throw new ApiError(
            400,
            'Password mein kam se kam 8 characters hone chahiye.'
          );
        } else if (!passwordRegex.test(password)) {
          throw new ApiError(
            400,
            'Password mein kam se kam ek letter aur ek number hona chahiye.'
          );
        }

        // Step 3: Check karna agar user pehle se exist karta hai (email ya username se)
        const existedUser = await User.findOne({
          $or: [{ email }, { username }],
        });

        if (existedUser) {
          throw new ApiError(409, 'User pehle se registered hai'); // Agar user pehle se hai to error throw karna
        }

        // Step 4: Image uploads check karna, specifically avatar
        const avatarLocalPath = req.files?.avatar[0]?.path; // Uploaded avatar image ka path
        let coverImageLocalPath; // Optional cover image path
        if (
          req.files &&
          Array.isArray(req.files.coverImage) &&
          req.files.coverImage.length > 0
        ) {
          coverImageLocalPath = req.files.coverImage[0].path; // Cover image ka path agar uploaded hai
        }

        if (!avatarLocalPath) {
          throw new ApiError(400, 'Kripya ek avatar image upload karein.'); // Agar avatar nahi hai to error throw karna
        }

        // Step 5: Avatar aur optional cover image ko Cloudinary pe upload karna
        const avatar = await uploadOnCloudinary(avatarLocalPath); // Avatar ko Cloudinary pe upload karna
        const coverImage = await uploadOnCloudinary(coverImageLocalPath); // Cover image ko Cloudinary pe upload karna
        if (!avatar) {
          throw new ApiError(
            500,
            'Avatar image ko Cloudinary pe upload karne me failure.'
          ); // Agar avatar upload fail ho to error
        }

        // Step 6: Naya user object create karna aur database me save karna
        const user = await User.create({
          fullName,
          email,
          username: username.toLowerCase(),
          password,
          avatar: avatar.url, // Cloudinary se avatar URL ko save karna
          coverImage: coverImage?.url || '', // Cover image URL save karna agar available ho, ya khali string
        });

        // Step 7: Password aur refresh token ko user object se remove karna response se pehle
        const createdUser = await User.findById(user._id).select(
          '-password -refreshToken'
        );

        // Step 8: Check karna agar user creation successful hai
        if (!createdUser) {
          throw new ApiError(
            500,
            'User registration ke dauran user create karne me failure.'
          ); // Agar user creation fail ho to error
        }

        // Step 9: Successful response return karna created user data ke sath
        return res
          .status(201)
          .json(new ApiResponse(200, createdUser, 'User successfully registered.'));
    }); 
    
    ```
    
- **Libraries/Methods Used:**
  - `trim()`: Removes whitespace from input values.
  - `findOne()`: Searches the database for an existing user by email or username.
  - `uploadOnCloudinary()`: Utility function to upload images to Cloudinary.
  - `create()`: MongoDB method to create and save a new document in the collection.
  - `select()`: Excludes sensitive fields from the user object before returning the response.

## 2. Login User

### Method: `loginUser`
- **Description:** Logs in a user by verifying credentials and generating tokens.
- **Route:** `POST /api/users/login`
- **Key Steps:**
  1. Validate the provided `username`, `email`, and `password`.
  2. Find the user by `email` or `username` and verify the password.
  3. Generate and send access and refresh tokens via cookies.
- **Code**: 
    ```javascript
    // User login ke liye middleware
    const loginUser = asyncHandler(async (req, res) => {
      // Step 1: Request body se user data lena
      const { email, username, password } = req.body;

      if (!username && !email) {
        throw new ApiError(400, 'Email ya Username required hai.'); // Agar dono fields nahi hai to error throw karna
      }

      // Step 2: User ko email ya username se dhundna
      const user = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (!user) {
        throw new ApiError(401, 'User exist nahi karta.'); // Agar user nahi milta to error
      }

      // Step 3: Password ko validate karna
      const isPasswordValid = await user.isPasswordCorrect(password);
      if (!isPasswordValid) {
        throw new ApiError(401, 'Invalid user credentials.'); // Agar password galat hai to error
      }

      // Step 4: User ke liye access aur refresh tokens generate karna
      const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
        user._id
      );

      const loggedInUser = await User.findById(user._id).select(
        '-password -refreshToken'
      ); // User ko password aur refresh token ke bina lena

      // Step 5: Access aur refresh tokens ko HTTP-only cookies ke roop me bhejna
      const options = {
        httpOnly: true,
        secure: true,
      };
      return res
        .status(200)
        .cookie('accessToken', accessToken, options) // Access token ko cookie me set karna
        .cookie('refreshToken', refreshToken, options) // Refresh token ko cookie me set karna
        .json(
          new ApiResponse(
            200,
            { user: loggedInUser, accessToken, refreshToken },
            'User successfully logged in.'
          )
        );
    });
    ```
- **Libraries/Methods Used:**
  - `findOne()`: Searches for the user in the database.
  - `isPasswordCorrect()`: Custom method to compare input password with the stored hash.
  - `generateAccessAndRefreshTokens()`: Generates JWT tokens for authentication.
  - `cookie()`: Sets HTTP-only cookies for secure transmission of tokens.

## 3. Logout User

### Method: `logoutUser`
- **Description:** Logs out the user by clearing tokens and removing the `refreshToken` from the database.
- **Route:** `POST /api/users/logout`
- **Key Steps:**
  1. Clear access and refresh tokens from cookies.
  2. Remove the refresh token from the user's database record.
- **Code**:
    ```javascript
    // User logout ke liye middleware
    const logoutUser = asyncHandler(async (req, res) => {
      // Step 1: Database me user se refresh token ko remove karna
      await User.findByIdAndUpdate(
        req.user._id,
        { $set: { refreshToken: undefined } },
        { new: true }
      );

      // Step 2: Client se access aur refresh token cookies ko clear karna
      const options = {
        httpOnly: true,
        secure: true,
      };
      return res
        .status(200)
        .clearCookie('accessToken', options) // Access token cookie ko clear karna
        .clearCookie('refreshToken', options) // Refresh token cookie ko clear karna
        .json(new ApiResponse(200, {}, 'User successfully logged out.')); // Success response return karna
    });
    ```
- **Libraries/Methods Used:**
  - `findByIdAndUpdate()`: Updates the user's record in the database.
  - `clearCookie()`: Removes cookies from the client.

## 4. Refresh Access Token

### Method: `refreshAccessToken`
- **Description:** Refreshes the user's access token by verifying the refresh token and generating new tokens.
- **Route:** `POST /api/users/token/refresh`
- **Key Steps:**
  1. Extract the refresh token from cookies or request body.
  2. Verify the refresh token using `jwt.verify()`.
  3. If valid, generate new access and refresh tokens.
  4. Set new tokens in cookies and return them to the user.
- **Code**: 
    ```javascript
    // Access token refresh karne ka middleware
    const refreshAccessToken = asyncHandler(async (req, res) => {
      // Step 1: Request cookies se refresh token lena
      const incomingRefreshToken = req.cookies.refreshToken || req.body.accessToken;
      if (!incomingRefreshToken) {
        throw new ApiError(401, 'Unauthorized request'); // Agar refresh token nahi hai to error
      }
      try {
        // Step 2: Database me refresh token ko validate karna
        const decodedToken = jwt.verify(
          incomingRefreshToken,
          process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken.access?._id);
        if (!user) {
          throw new ApiError(401, 'Invalid refresh token'); // Agar user nahi milta to error
        }

        if (incomingRefreshToken !== user?.refreshToken) {
          throw new ApiError(401, 'Refresh token expired ya used hai'); // Agar refresh token expired ya used hai to error
        }

        // Step 3: User ke liye naya access aur refresh tokens generate karna
        const options = {
          httpOnly: true,
          secure: true,
        };

        const { accessToken, newRefreshToken } =
          await generateAccessAndRefreshTokens(user._id);

        return res
          .status(200)
          .cookie('accessToken', accessToken, options)
          .cookie('refreshToken', newRefreshToken, options)
          .json(
            new ApiResponse(
              200,
              { accessToken, newRefreshToken },
              'Access token refreshed'
            )
          );
      } catch (error) {
        throw new ApiError(401, error?.message || 'Invalid refresh token'); // Error agar refresh token invalid hai
      }
    });
    ```
- **Libraries/Methods Used:**
  - `jwt.verify()`: Verifies the validity of the refresh token.
  - `findById()`: Retrieves the user from the database by ID.
  - `generateAccessAndRefreshTokens()`: Generates new tokens for the user.

## 5. Change Current Password

### Method: `changeCurrrentPassword`
- **Description:** Allows the user to change their password by providing the old and new passwords.
- **Route:** `POST /api/users/change-password`
- **Key Steps:**
  1. Verify the old password using `isPasswordCorrect()`.
  2. Save the new password to the database.
- **Code**:
    ```javascript
    const changeCurrrentPassword = asyncHandler(async (req, res) => {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user?._id);
        const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

        if (!isPasswordCorrect) {
          throw new ApiError(400, 'Invalid old password'); // Agar old password galat hai to error
        }

        user.password = newPassword; // Naya password set karna
        await user.save({ validateBeforeSave: false }); // User ko save karna bina validation ke

        return res
          .status(200)
          .json(new ApiResponse(200, {}, 'Password successfully changed')); // Success response return karna
    }) ;
    ```
- **Libraries/Methods Used:**
  - `isPasswordCorrect()`: Validates the old password.
  - `save()`: Saves the new password in the user document.

## 6. Get Current User

### Method: `getCurrentUser`
- **Description:** Fetches and returns the details of the currently authenticated user.
- **Route:** `GET /api/users/me`
- **Key Steps:**
  1. Return the current user object from `req.user`.
- **Code**:
    ```javascript
    const getCurrentUser = asyncHandler(async (req, res) => {
        return res
        .status(200)
        .json(200, req.user, 'Current user successfully fetched'); // Current user ka data return karna
    }); 
    ```
- **Libraries/Methods Used:**
  - No database queries, directly returns the user object from the request.

## 7. Update Account Details

### Method: `updateAcccountDetails`
- **Description:** Allows the user to update their account details such as `fullName` and `email`.
- **Route:** `PUT /api/users/update`
- **Key Steps:**
  1. Validate the provided `fullName` and `email`.
  2. Update the user's details in the database.
  3. Return the updated user details.
- **Code**:
    ```javascript
    const updateAcccountDetails = asyncHandler(async (req, res) => {
        const { fullName, email } = req.body;

        if (!fullName || !email) {
          throw new ApiError(400, 'Full name aur email required hain'); // Agar full name ya email nahi hai to error
        }

        const user = await User.findByIdAndUpdate(
          req.user?._id,
          {
            $set: {
              fullName,
              email: email.toLowerCase(),
            },
          },
          { new: true }
        ).select('-password'); // Password ko select nahi karna

        return res
          .status(200)
          .json(new ApiResponse(200, user, 'Account details successfully updated')); // Success response return karna
    });
    ```
- **Libraries/Methods Used:**
  - `findByIdAndUpdate()`: Updates the user document in the database.
  - `select()`: Excludes sensitive fields from the response.

## 8. Update User Avatar

### Method: `updateUserAvatar`
- **Description:** Updates the user's avatar by uploading the new avatar to Cloudinary and saving the URL in the database.
- **Route:** `PUT /api/users/avatar`
- **Key Steps:**
  1. Validate the avatar file.
  2. Upload the avatar to Cloudinary.
  3. Update the user's avatar URL in the database.
- **Code**:
    ```javascript
    const updateUserAvatar = asyncHandler(async (req, res) => {
        const avatarLocalPath = req.file?.path;
        if (!avatarLocalPath) {
          throw new ApiError(400, 'Avatar file missing hai.'); // Agar avatar file nahi hai to error
        }
        const avatar = await uploadOnCloudinary(avatarLocalPath); // Avatar ko Cloudinary pe upload karna
        if (!avatar.url) {
          throw new ApiError(400, 'Avatar upload karne me error aaya'); // Agar avatar upload me error aaya to error
        }
        const user = await User.findByIdAndUpdate(
          req.user?._id,
          {
            $set: {
              avatar: avatar.url, // Avatar URL ko update karna
            },
          },
          { new: true }
        ).select('-password'); // Password ko select nahi karna

        return res
          .status(200)
          .json(new ApiResponse(200, user, 'User avatar successfully updated')); // Success response return karna
    });
    ```
- **Libraries/Methods Used:**
  - `uploadOnCloudinary()`: Uploads the avatar to Cloudinary.
  - `findByIdAndUpdate()`: Updates the user's avatar URL in the database.

## 9. Update User Cover Image

### Method: `updateUserCoverImage`
- **Description:** Updates the user's cover image by uploading the new image to Cloudinary and saving the URL in the database.
- **Route:** `PUT /api/users/cover-image`
- **Key Steps:**
  1. Validate the cover image file.
  2. Upload the cover image to Cloudinary.
  3. Update the user's cover image URL in the database.
- **Code***:
    ```javascript
    const updateUserCoverImage = asyncHandler(async (req, res) => {
        const coverImageLocalPath = req.file?.path;

        if (!coverImageLocalPath) {
          throw new ApiError(400, 'CoverImage file missing hai.'); // Agar cover image file nahi hai to error
        }

        const coverImage = await uploadOnCloudinary(coverImageLocalPath); // Cover image ko Cloudinary pe upload karna

        if (!coverImage.url) {
          throw new ApiError(400, 'CoverImage upload karne me error aaya'); // Agar cover image upload me error aaya to error
        }

        const user = await User.findByIdAndUpdate(
          req.user?._id,
          {
            $set: {
              coverImage: coverImage.url, // Cover image URL ko update karna
            },
          },
          { new: true }
        ).select('-password'); // Password ko select nahi karna

        return res
          .status(200)
          .json(new ApiResponse(200, user, 'User coverImage successfully updated')); // Success response return karna
    });
    ```
- **Libraries/Methods Used:**
  - `uploadOnCloudinary()`: Uploads the cover image to Cloudinary.
  - `findByIdAndUpdate()`: Updates the user's cover image URL in the database.

## 10. Generate Access and Refresh Tokens

### Method: `generateAccessAndRefreshTokens`
- **Description:** Generates JWT access and refresh tokens for the user, saving the refresh token in the database.
- **Key Steps:**
  1. Find the user by their ID.
  2. Generate access and refresh tokens.
  3. Save the refresh token in the user's document.
  4. Return the generated tokens.
- **Code**:
    ```javascript
    const generateAccessAndRefreshTokens = async (userId) => {
        try {
          const user = await User.findById(userId); // User ko ID se dhundna
          const accessToken = user.generateAccessToken(); // User ke liye access token generate karna
          const refreshToken = user.generateRefreshToken(); // User ke liye refresh token generate karna

          user.refreshToken = refreshToken; // User document me refresh token ko save karna
          await user.save({ validateBeforeSave: false }); // User ko bina validation ke database me save karna

          return { accessToken, refreshToken }; // Generated tokens ko return karna
        } catch (error) {
          throw new ApiError(
            500,
            'Refresh aur access token generate karne me kuch galat ho gaya',
            error
          ); // Token generation me error hone par error throw karna
        }
    };
    ```
- **Libraries/Methods Used:**
  - `findById()`: Retrieves the user from the database by their ID.
  - `generateAccessToken()`: Generates a JWT access token.
  - `generateRefreshToken()`: Generates a JWT refresh token.
  - `save()`: Saves the refresh token in the database.

---

## Utility Methods Explained
### `asyncHandler()`
A utility function used to wrap async route handlers and catch errors without using `try-catch` blocks.

### `jwt.verify()`
Used to verify the validity of a JSON Web Token (JWT). This method ensures that a token has not been tampered with and is still valid based on the secret key.

### `findById()`
A MongoDB method that finds a document by its unique ID.

### `findOne()`
A MongoDB method that finds a single document matching the provided criteria.

### `create()`
Creates and saves a new document in the MongoDB collection.

### `save()`
Saves changes to a document in MongoDB.

### `uploadOnCloudinary()`
Utility function for uploading images to Cloudinary and returning the uploaded image's URL.

---

## Error Handling

This controller uses `ApiError` for custom error handling and `asyncHandler` to manage errors in asynchronous functions.
"""