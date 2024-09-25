import express from 'express'; // Import Express framework
import cors from 'cors'; // Import CORS middleware
import cookieParser from 'cookie-parser'; // Import Cookie parser middleware

const app = express(); // Create an instance of Express

// Configure CORS to allow requests from specified origin and enable credentials
app.use(
  cors({
    origin: process.env.CORS_ORIGIN, // Allowed origin for CORS requests
    credentials: true, // Enable sending credentials (e.g., cookies) with CORS requests
  })
);

// Middleware to parse JSON request bodies with a limit of 16kb
app.use(express.json({ limit: '16kb' }));

// Middleware to parse URL-encoded request bodies with a limit of 16kb
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

// Middleware to serve static files from the 'public' directory
app.use(express.static('public'));

// Middleware to parse cookies from the request
app.use(cookieParser());

// Import routes
import userRouter from './routes/user.routes.js';
import healthcheckRouter from './routes/healthcheck.routes.js';
import tweetRouter from './routes/tweet.routes.js';
import subscriptionRouter from './routes/subscription.routes.js';
import videoRouter from './routes/video.routes.js';
import commentRouter from './routes/comment.routes.js';
import likeRouter from './routes/like.routes.js';
import playlistRouter from './routes/playlist.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
// Define routes for the API version 1, using the imported userRouter
//routes declaration
app.use('/api/v1/healthcheck', healthcheckRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/tweets', tweetRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/api/v1/comments', commentRouter);
app.use('/api/v1/likes', likeRouter);
app.use('/api/v1/playlist', playlistRouter);
app.use('/api/v1/dashboard', dashboardRouter);

export { app }; // Export the Express app for use in other modules
