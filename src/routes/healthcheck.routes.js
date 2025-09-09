// routes/healthcheck.routes.js
import express from 'express';
import mongoose from 'mongoose';
import { isRedisEnabled, redisGet } from '../utils/upstash.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const mongoStatus =
    mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  let redisStatus = 'disabled';

  if (isRedisEnabled) {
    try {
      await redisGet('healthcheck');
      redisStatus = 'connected';
    } catch {
      redisStatus = 'error';
    }
  }

  res.status(200).json({
    success: true,
    status: {
      mongo: mongoStatus,
      redis: redisStatus,
    },
  });
});

export default router;
