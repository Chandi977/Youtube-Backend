# Backend Development Project
This project is a backend server built using Node.js and Express.js, which connects to a MongoDB database. It handles user authentication with JWT, file uploads with Multer, stores files on Cloudinary, and manages error handling and password encryption for enhanced security.

## Table of Contents
1. Installation
2. Environment Variables
3. Technologies Used
4. Project Structure
5. Features
6. Acknowledgments
7. Conclusion

## Installation
1. Clone the repository:
```
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

2. Install dependencies:
```
npm install
```

3. Set up environment variables by creating a `.env` file in the root directory and adding:
```
MONGODB_URI=your_mongodb_uri
PORT=your_port_number
ACCESS_TOKEN_SECRET=your_jwt_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CORS_ORIGIN=your_frontend_url
```

4. Start the server:
```
npm start
```
## Environment Variables
The following environment variables must be set in your `.env` file:
- `MONGODB_URI`: The MongoDB connection string.
- `PORT`: The port number to run the server.
- `ACCESS_TOKEN_SECRET`: Secret key for JWT access tokens.
- `REFRESH_TOKEN_SECRET`: Secret key for JWT refresh tokens.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Cloudinary credentials for file storage.
- `CORS_ORIGIN`: Frontend URL to enable CORS.

## Technologies Used
- Node.js: JavaScript runtime environment.
- Express.js: Web framework for Node.js.
- MongoDB & Mongoose: Database and ORM for MongoDB.
- JWT (JSON Web Token): Secure token-based authentication.
- Bcrypt: Password encryption.
- Multer: Middleware for handling file uploads.
- Cloudinary: Cloud storage for media files.
- Project Structure
```
|-- src
|   |-- app.js          # Main Express server setup
|   |-- db              # Database connection setup
|   |-- routes          # API routes
|   |-- models          # Mongoose models
|   |-- controllers     # Request handling logic
|   |-- middlewares     # Middleware functions
|   |-- utils           # Helper functions like error handling
|   |-- public          # Static files (e.g., temp file uploads)
|-- .env                # Environment variables
|-- README.md           # Documentation
|-- package.json        # Node.js dependencies and scripts
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

## Acknowledgments
A big thanks to **Hitesh Choudhary** for his **Complete Backend Developer Playlist**, which helped me a lot in understanding and mastering backend development.

## Conclusion
This project demonstrates how to set up a secure backend using Node.js, Express.js, MongoDB, JWT, and other essential technologies. You can customize it to fit any application that needs authentication, file handling, and database connectivity.