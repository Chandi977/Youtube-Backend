import mongoose from 'mongoose';
import { isRedisEnabled, redisPing } from '../utils/upstash.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const healthcheck = asyncHandler(async (req, res) => {
  const dbState = mongoose.connection.readyState; // 0 = disconnected, 1 = connected
  let redisStatus = 'disabled';

  if (isRedisEnabled) {
    try {
      const pong = await redisPing();
      redisStatus = pong ? 'connected' : 'error';
    } catch (err) {
      redisStatus = 'error';
    }
  }

  const response = {
    server: 'ok',
    timestamp: new Date().toISOString(),
    database: dbState === 1 ? 'connected' : 'disconnected',
    redis: redisStatus,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        response,
        'Healthcheck passed: Server is running and connections verified'
      )
    );
});

export { healthcheck };
