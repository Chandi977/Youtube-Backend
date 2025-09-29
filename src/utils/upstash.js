import {
  redisConnection,
  isRedisEnabled as redisEnabled,
} from '../config/redis.js';

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
  if (ttl) {
    return redisConnection.set(formattedKey, stringValue, 'EX', ttl);
  }
  return redisConnection.set(formattedKey, stringValue);
}

// Get key (auto-JSON parse)
export async function redisGet(key) {
  if (!isRedisEnabled) return null;
  const val = await redisConnection.get(formatKey(key));
  try {
    return val ? JSON.parse(val) : null;
  } catch {
    return val;
  }
}

// MGet for batch fetching keys
export async function redisMGet(keys) {
  if (!isRedisEnabled || !keys || keys.length === 0) return [];
  const formattedKeys = keys.map(formatKey);
  const results = await redisConnection.mget(formattedKeys);
  return (results || []).map((val) => {
    try {
      return val ? JSON.parse(val) : null;
    } catch {
      return val;
    }
  });
}

// Increment / Decrement
export async function redisIncr(key) {
  if (!isRedisEnabled) return null;
  return redisConnection.incr(formatKey(key));
}

export async function redisDecr(key) {
  if (!isRedisEnabled) return null;
  return redisConnection.decr(formatKey(key));
}

// Set operations
export async function redisSAdd(setKey, ...members) {
  if (!isRedisEnabled) return null;
  return redisConnection.sadd(formatKey(setKey), ...members);
}

export async function redisSMembers(setKey) {
  if (!isRedisEnabled) return [];
  return redisConnection.smembers(formatKey(setKey));
}

export async function redisSRem(setKey, ...members) {
  if (!isRedisEnabled) return null;
  return redisConnection.srem(formatKey(setKey), ...members);
}

// Delete key
export async function redisDel(...keys) {
  if (!isRedisEnabled) return null;
  const formattedKeys = keys.map(formatKey);
  return redisConnection.del(formattedKeys);
}

// Set TTL on a key
export async function redisExpire(key, ttlInSeconds) {
  if (!isRedisEnabled) return null;
  return redisConnection.expire(formatKey(key), ttlInSeconds);
}

// Ping Redis
export async function redisPing() {
  if (!isRedisEnabled) return false;
  const result = await redisConnection.ping();
  return result === 'PONG';
}

// utils/upstash.js (additions)

export async function redisPublish(channel, message) {
  if (!isRedisEnabled) return null;
  const key = formatKey(channel);
  const stringMessage =
    typeof message === 'object' ? JSON.stringify(message) : message;
  return redisConnection.publish(key, stringMessage);
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
