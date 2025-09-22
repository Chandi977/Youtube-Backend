# Youtube Backend using MERN stack

Model of the Backend with JavaScript

- [Model Link](https://app.eraser.io/workspace/YtPqZ1VogxGy1jzIDkzj)

## Overview

VideoTube is a backend service for a video streaming platform. It handles user authentication, video management, and integrates with Cloudinary for media storage. This project uses Node.js, Express, MongoDB, and various libraries for handling file uploads, authentication, and more.

## Features

- User Registration and Login
- User Authentication with JWT
- Media Upload to Cloudinary
- Video Management
- User Watch History
- Pagination for video listings

## Technologies Used

- **Node.js** - JavaScript runtime for server-side code
- **Express** - Web framework for Node.js
- **MongoDB** - NoSQL database for data storage
- **Mongoose** - ODM for MongoDB
- **jsonwebtoken** - Library for JWT-based authentication
- **bcrypt** - Library for hashing passwords
- **Cloudinary** - Cloud-based media storage and management
- **multer** - Middleware for handling file uploads
- **dotenv** - Module for environment variable management
- **cors** - Middleware for Cross-Origin Resource Sharing
- **cookie-parser** - Middleware for parsing cookies

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/videotube-backend.git
   ```

2. **Navigate into the project directory:**
   ```bash
   cd videotube-backend
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Create a `.env` file in the root directory with the following environment variables:**

   You can copy the example file and then add your values:
   `cp .env.example .env`
   ```bash
   PORT=8000
   NODE_ENV=development # Use 'production' on your hosting service

   # Database
   MONGODB_URI=your_mongodb_connection_string

   # JWT Secrets
   ACCESS_TOKEN_SECRET=your_access_token_secret
   REFRESH_TOKEN_SECRET=your_refresh_token_secret
   ACCESS_TOKEN_EXPIRY=1d
   REFRESH_TOKEN_EXPIRY=10d

   # Cloudinary
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret

   RTMP_SERVER_URL=rtmp://your-rtmp-server/live
   # OAuth & URLs
   CORS_ORIGIN=http://localhost:5173,https://your-production-frontend.com
   BASE_URL=http://localhost:8000 # For production: https://your-backend-url.com
   FRONTEND_DEV_URL=http://localhost:5173
   FRONTEND_PROD_URL=https://your-production-frontend.com
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   ```

5. **Run the application:**
   ```bash
   npm start
   ```

## API Endpoints

### User Registration

- URL: /api/v1/users/register
- Method: POST
- Request Body:
  ```json
  {
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "username": "johndoe",
    "password": "Password123",
    "avatar": "file", // Multipart form-data
    "coverImage": "file" // Multipart form-data
  }
  ```
- Response:
  ```json
  {
    "statusCode": 200,
    "data": {
      "username": "johndoe",
      "email": "john.doe@example.com",
      "fullName": "John Doe",
      "avatar": "url_to_avatar",
      "coverImage": "url_to_cover_image"
    },
    "message": "User registered successfully"
  }
  ```

### User Login

- URL: /api/v1/users/login
- Method: POST
- Request Body:

  ```json
  {
    "email": "john.doe@example.com",
    "username": "johndoe",
    "password": "Password123"
  }
  ```

- Response:
  ```json
  {
    "statusCode": 200,
    "data": {
      "user": {
        "username": "johndoe",
        "email": "john.doe@example.com",
        "fullName": "John Doe",
        "avatar": "url_to_avatar",
        "coverImage": "url_to_cover_image"
      },
      "accessToken": "jwt_access_token",
      "refreshToken": "jwt_refresh_token"
    },
    "message": "User logged in successfully"
  }
  ```

### User Logout

- URL: /api/v1/users/logout
- Method: POST
- Headers:
  - Authorization: Bearer <access_token>
- Response:
  ```json
  {
    "statusCode": 200,
    "data": {},
    "message": "User logged out successfully"
  }
  ```

## Video Management

- CRUD operations for video management (e.g., upload, view, update, delete) are available through relevant endpoints. Check the route definitions and controllers for more details.

## Error Handling

- Errors are handled using the ApiError class and returned in a standardized format. Ensure to handle different types of errors and validate inputs properly.

## Testing

1. Run tests:
   ```bash
   npm test
   ```
2. Add new test cases as needed to cover additional functionality.

## Code Structure

    - /src/app.js: Initializes the Express application and sets up middleware.
    - /src/db/index.js: Handles the database connection.
    - /src/controllers/user.controller.js: Contains user-related logic and endpoint handlers.
    - /src/models/user.model.js: Mongoose schema and model for user data.
    - /src/models/video.model.js: Mongoose schema and model for video data.
    - /src/middlewares/auth.middleware.js: Middleware for authentication and authorization.
    - /src/middlewares/multer.middleware.js: Middleware for handling file uploads.
    - /src/utils/asyncHandler.js: Utility for handling async errors in route handlers.
    - /src/utils/ApiError.js: Custom error class for API errors.
    - /src/utils/ApiResponse.js: Custom response class for API responses.
    - /src/utils/cloudinary.js: Utility for uploading files to Cloudinary.
    - /src/routes/user.routes.js: Routes related to user operations.

    ```
    Youtube Backend/
    ├── .env
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── README.md
    ├── server.js
    └── src/
        ├── db/
        │   └── index.js
        ├── controllers/
        │   ├── comment.controller.js
        │   ├── dashboard.controller.js
        │   ├── healthcheck.controller.js
        │   ├── like.controller.js
        │   ├── playlist.controller.js
        │   ├── subscription.controller.js
        │   ├── tweet.controller.js
        │   ├── user.controller.js
        │   └── video.controller.js
        ├── middleware/
        │   ├── auth.middleware.js
        │   └── multer.middleware.js
        ├── models/
        │   ├── comment.model.js
        │   ├── like.model.js
        │   ├── playlist.model.js
        │   ├── subscription.model.js
        │   ├── tweet.model.js
        │   ├── user.model.js
        │   └── video.model.js
        ├── routes/
        │   ├── comment.routes.js
        │   ├── dashboard.routes.js
        │   ├── healthcheck.routes.js
        │   ├── like.routes.js
        │   ├── playlist.routes.js
        │   ├── subscription.routes.js
        │   ├── tweet.routes.js
        │   ├── user.routes.js
        │   └── video.routes.js
        └── utils/
            ├── ApiError.js
            ├── ApiResponse.js
            └── asyncHandler.js
    ```

## Features

1. Server Setup
   We use Express.js to handle incoming requests, set up CORS, parse JSON and URL-encoded data, and serve static files.
2. MongoDB Connection
   We connect to MongoDB using Mongoose with the following configuration:
3. JWT Authentication
   Token-based authentication is handled using JWT. We generate and verify tokens to ensure secure access.
4. File Uploads with Multer
   Files are uploaded using Multer and temporarily stored on the server before being uploaded to Cloudinary.
5. Cloudinary Integration
   Cloudinary is used for storing uploaded files in the cloud. After successful upload, the temporary local files are deleted.
6. Error Handling
   Custom error handling is done using the ApiError class to manage different types of errors.
7. Password Encryption
   Bcrypt is used to hash passwords before saving them to the database for better security.

## Thanks

Special thanks to [Hitesh Choudhary](https://youtu.be/7fjOw8ApZ1I?si=J0m9Yjs3vdXD4vUp) for his Complete Backend Developer Playlist, which greatly helped me learn backend development.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
