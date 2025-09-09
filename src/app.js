import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import xssClean from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import fetch from 'node-fetch';
import { syncLikes } from './workers/syncLikes.js';
import logger, { requestLogger } from './utils/logger.js';
import { isRedisEnabled } from './utils/upstash.js';
// console.log('[DEBUG] isRedisEnabled:', isRedisEnabled);
import errorHandler from './middlewares/errorHandler.middleware.js';
// import connectDB from './db/index.js';
// Load env
dotenv.config();

const app = express();
// console.log(app);

// ------------------------
// Security middlewares
// ------------------------
app.use(helmet());
app.use(hpp());
app.use(xssClean());
app.use(mongoSanitize());
app.use(compression());

// ------------------------
// CORS
// ------------------------
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:5173',
  'https://youtube-frontend.vercel.app',
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// ------------------------
// Body parsers
// ------------------------
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());
app.use(express.static('public'));

// ------------------------
// Request Logger
// ------------------------
app.use(requestLogger);

// ------------------------
// Rate Limiter
// ------------------------
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, try again later',
  },
});
app.use(limiter);

// ------------------------
// Routes
// ------------------------
import userRouter from './routes/user.routes.js';
import healthcheckRouter from './routes/healthcheck.routes.js';
import videoRouter from './routes/video.routes.js';
import commentRouter from './routes/comment.routes.js';
import likeRouter from './routes/like.routes.js';
import playlistRouter from './routes/playlist.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import upstashRoutes from './routes/upstash.routes.js';

app.use('/api/v1/healthcheck', healthcheckRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/api/v1/comments', commentRouter);
app.use('/api/v1/likes', likeRouter);
app.use('/api/v1/playlist', playlistRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1', upstashRoutes);

// ------------------------
// Global Error Handler
// ------------------------
app.use(errorHandler);

// ------------------------
// Workers
// ------------------------
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

// console.log('[DEBUG] app.js loaded successfully');

export default app;
