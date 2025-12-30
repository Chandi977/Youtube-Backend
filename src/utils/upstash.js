import {
  redisConnection,
  isRedisEnabled as redisEnabled,
} from '../config/redis.js';
import { recordRedisOp } from '../observability/metrics.js';

const prefix = process.env.REDIS_PREFIX || 'ytclone';

export const isRedisEnabled = redisEnabled;

// Format key with namespace
function formatKey(key) {
  return `${prefix}:${key}`;
}

// Generic pipeline call for batching commands
export function redisPipeline() {
  if (!isRedisEnabled) return null;
  return redisConnection.pipeline();
}

// ================= Redis Operations =================

// Set key (auto-JSON stringify) with optional TTL in seconds
export async function redisSet(key, value, ttl = null) {
  if (!isRedisEnabled) return null;
  const formattedKey = formatKey(key);
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
  try {
    const result = ttl
      ? await redisConnection.set(formattedKey, stringValue, 'EX', ttl)
      : await redisConnection.set(formattedKey, stringValue);
    recordRedisOp('set', true);
    return result;
  } catch (err) {
    recordRedisOp('set', false);
    throw err;
  }
}

// Get key (auto-JSON parse)
export async function redisGet(key) {
  if (!isRedisEnabled) return null;
  try {
    const val = await redisConnection.get(formatKey(key));
    recordRedisOp('get', true);
    try {
      return val ? JSON.parse(val) : null;
    } catch {
      return val;
    }
  } catch (err) {
    recordRedisOp('get', false);
    throw err;
  }
}

// MGet for batch fetching keys
export async function redisMGet(keys) {
  if (!isRedisEnabled || !keys || keys.length === 0) return [];
  try {
    const formattedKeys = keys.map(formatKey);
    const results = await redisConnection.mget(formattedKeys);
    recordRedisOp('mget', true);
    return (results || []).map((val) => {
      try {
        return val ? JSON.parse(val) : null;
      } catch {
        return val;
      }
    });
  } catch (err) {
    recordRedisOp('mget', false);
    throw err;
  }
}

// Increment / Decrement
export async function redisIncr(key) {
  if (!isRedisEnabled) return null;
  try {
    const result = await redisConnection.incr(formatKey(key));
    recordRedisOp('incr', true);
    return result;
  } catch (err) {
    recordRedisOp('incr', false);
    throw err;
  }
}

export async function redisDecr(key) {
  if (!isRedisEnabled) return null;
  try {
    const result = await redisConnection.decr(formatKey(key));
    recordRedisOp('decr', true);
    return result;
  } catch (err) {
    recordRedisOp('decr', false);
    throw err;
  }
}

// Set operations
export async function redisSAdd(setKey, ...members) {
  if (!isRedisEnabled) return null;
  try {
    const result = await redisConnection.sadd(formatKey(setKey), ...members);
    recordRedisOp('sadd', true);
    return result;
  } catch (err) {
    recordRedisOp('sadd', false);
    throw err;
  }
}

export async function redisSMembers(setKey) {
  if (!isRedisEnabled) return [];
  try {
    const result = await redisConnection.smembers(formatKey(setKey));
    recordRedisOp('smembers', true);
    return result;
  } catch (err) {
    recordRedisOp('smembers', false);
    throw err;
  }
}

export async function redisSRem(setKey, ...members) {
  if (!isRedisEnabled) return null;
  try {
    const result = await redisConnection.srem(formatKey(setKey), ...members);
    recordRedisOp('srem', true);
    return result;
  } catch (err) {
    recordRedisOp('srem', false);
    throw err;
  }
}

// Delete key
export async function redisDel(...keys) {
  if (!isRedisEnabled) return null;
  try {
    const formattedKeys = keys.map(formatKey);
    const result = await redisConnection.del(formattedKeys);
    recordRedisOp('del', true);
    return result;
  } catch (err) {
    recordRedisOp('del', false);
    throw err;
  }
}

// Set TTL on a key
export async function redisExpire(key, ttlInSeconds) {
  if (!isRedisEnabled) return null;
  try {
    const result = await redisConnection.expire(formatKey(key), ttlInSeconds);
    recordRedisOp('expire', true);
    return result;
  } catch (err) {
    recordRedisOp('expire', false);
    throw err;
  }
}

// Ping Redis
export async function redisPing() {
  if (!isRedisEnabled) return false;
  try {
    const result = await redisConnection.ping();
    recordRedisOp('ping', true);
    return result === 'PONG';
  } catch (err) {
    recordRedisOp('ping', false);
    throw err;
  }
}

// utils/upstash.js (additions)

export async function redisPublish(channel, message) {
  if (!isRedisEnabled) return null;
  const key = formatKey(channel);
  const stringMessage =
    typeof message === 'object' ? JSON.stringify(message) : message;
  try {
    const result = await redisConnection.publish(key, stringMessage);
    recordRedisOp('publish', true);
    return result;
  } catch (err) {
    recordRedisOp('publish', false);
    throw err;
  }
}

export async function redisSubscribe(channel, callback) {
  if (!isRedisEnabled) return null;
  // Note: This requires a separate subscriber client for blocking operations
  // For now, this is a placeholder. A dedicated subscriber client is recommended.
  const subClient = redisConnection.duplicate();
  const formattedChannel = formatKey(channel);
  subClient.subscribe(formattedChannel, (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${formattedChannel}`, err);
    }
  });
  subClient.on('message', (ch, msg) => {
    if (ch === formattedChannel) {
      callback(msg);
    }
  });
}
