import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config();
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import xssClean from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import fetch from 'node-fetch';
import { createServer } from 'http';

import { createVideoWorker } from './workers/videoWorker.js';
import { syncLikes } from './workers/syncLikes.js';
import logger, { requestLogger } from './utils/logger.js';
import { isRedisEnabled } from './utils/upstash.js';
import errorHandler from './middlewares/errorHandler.middleware.js';
import { initializeSocket } from './socket/socketHandler.js';

import passport from 'passport';
import './config/passport.js'; // Your Passport strategies

const app = express();

// Trust the first proxy in front of the app, which is Render's load balancer.
app.set('trust proxy', 1);

// Create HTTP server for Socket.IO
const server = createServer(app);

// Initialize Socket.IO
const io = initializeSocket(server);

// Make io available in requests for live streaming
app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use(passport.initialize());

// ------------------------
// Security middlewares
// ------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'connect-src': ["'self'", 'ws:', 'wss:'], // Allow WebSocket connections
      },
    },
  })
);
app.use(hpp());
app.use(xssClean());
app.use(mongoSanitize());
app.use(compression());

// ------------------------
// CORS (Updated for Socket.IO)
// ------------------------
// Define a base set of allowed origins, including localhost and all Vercel domains.
const baseAllowedOrigins = [
  'http://localhost:5173', // Local development frontend
  /\.vercel\.app$/, // Matches any Vercel deployment URL (e.g., project.vercel.app, project-git-branch.vercel.app)
];

// Add origins from the environment variable, if they exist.
const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : [];

// Combine and create a unique list of allowed origins.
const allowedOrigins = [...new Set([...baseAllowedOrigins, ...envOrigins])];

console.log('Allowed Origins:', allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like Postman, mobile apps, server-to-server)
      if (!origin) return callback(null, true);

      // Check if the origin is in our allowed list (string or regex)
      const isAllowed = allowedOrigins.some((allowed) =>
        allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
      );

      if (isAllowed) return callback(null, true);

      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true, // important for cookies/auth
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept-Ranges'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  })
);

// ------------------------
// Body parsers
// ------------------------
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static('public'));

// ------------------------
// Request Logger
// ------------------------
app.use(requestLogger);

// ------------------------
// Rate Limiter (Updated for live streaming)
// ------------------------
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200, // Increased for live streaming features
  message: {
    success: false,
    message: 'Too many requests from this IP, try again later',
  },
  skip: (req) => {
    // Skip rate limiting for socket.io and live streaming endpoints
    return (
      req.url.startsWith('/socket.io') || req.url.includes('/livestreams/')
    );
  },
});
app.use(limiter);

// ------------------------
// Routes (Existing + New)
// ------------------------
import userRouter from './routes/user.routes.js';
import healthcheckRouter from './routes/healthcheck.routes.js';
import videoRouter from './routes/video.routes.js';
import commentRouter from './routes/comment.routes.js';
import likeRouter from './routes/like.routes.js';
import playlistRouter from './routes/playlist.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import Subscription from './routes/subscription.routes.js';
import tweet from './routes/tweet.routes.js';
import upstashRoutes from './routes/upstash.routes.js';
import liveStreamRouter from './routes/livestream.routes.js'; // New live streaming routes
import jobRoutes from './routes/job.routes.js'; // New job routes
import authRoutes from './routes/auth.routes.js'; // New auth routes

// Existing routes
app.use('/api/v1/healthcheck', healthcheckRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/api/v1/comments', commentRouter);
app.use('/api/v1/likes', likeRouter);
app.use('/api/v1/playlist', playlistRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/subscriptions', Subscription);
app.use('/api/v1/tweets', tweet);
app.use('/api/v1', upstashRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/auth', authRoutes);

// New live streaming routes
app.use('/api/v1/livestreams', liveStreamRouter);

// ------------------------
// Global Error Handler
// ------------------------
app.use(errorHandler);

// ------------------------
// Workers
// ------------------------
// Start video worker
const videoWorker = createVideoWorker(io);

const SYNC_LIKES_INTERVAL = Number(process.env.SYNC_LIKES_INTERVAL_MS) || 30000;
if (isRedisEnabled) {
  setInterval(async () => {
    try {
      await syncLikes();
    } catch (err) {
      logger.error('Worker syncLikes failed:', err);
    }
  }, SYNC_LIKES_INTERVAL);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await videoWorker.close();
  process.exit(0);
});

// ------------------------
// Heart Ticker
// ------------------------
const HEART_TICKER_INTERVAL = 5 * 60 * 1000;
setInterval(async () => {
  try {
    const url = process.env.APP_URL || 'http://localhost:8000';
    await fetch(url);
    logger.info(`[HeartTicker] Pinged ${url} to stay awake`);
  } catch (err) {
    logger.error('[HeartTicker] Failed:', err);
  }
}, HEART_TICKER_INTERVAL);

// Export both app and server
export { app, server };
