// utils/upstash.js
import 'dotenv/config';
import fetch from 'node-fetch';

const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const prefix = process.env.REDIS_PREFIX || 'ytclone';

export const isRedisEnabled = !!(baseUrl && token);

if (!isRedisEnabled) {
  console.warn(
    '❌ Upstash credentials missing! Redis operations will be skipped.'
  );
} else {
  console.log('✅ Upstash credentials found. Redis operations enabled.');
}

// Format key with namespace
function formatKey(key) {
  return `${prefix}:${key}`;
}

// Generic Upstash call
async function callRedis(command, args = []) {
  if (!isRedisEnabled) return null;

  const url = `${baseUrl}/${command}/${args.map(encodeURIComponent).join('/')}`;
  const method = ['get', 'smembers', 'ping'].includes(command) ? 'GET' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (data.error) {
      console.error(`❌ Redis Error (${command}):`, data.error);
      return null;
    }

    return data.result;
  } catch (err) {
    console.error(`❌ Redis ${command} fetch failed:`, err);
    return null;
  }
}

// ================= Redis Operations =================

// Set key (auto-JSON stringify) with optional TTL in seconds
export async function redisSet(key, value, ttl = null) {
  key = formatKey(key);
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

  const result = await callRedis('set', [key, stringValue]);
  if (ttl) await callRedis('expire', [key, ttl]);
  return result;
}

// Get key (auto-JSON parse)
export async function redisGet(key) {
  const val = await callRedis('get', [formatKey(key)]);
  try {
    return val ? JSON.parse(val) : null;
  } catch {
    return val;
  }
}

// Increment / Decrement
export async function redisIncr(key) {
  return callRedis('incr', [formatKey(key)]);
}

export async function redisDecr(key) {
  return callRedis('decr', [formatKey(key)]);
}

// Set operations
export async function redisSAdd(setKey, member) {
  return callRedis('sadd', [formatKey(setKey), member]);
}

export async function redisSMembers(setKey) {
  return callRedis('smembers', [formatKey(setKey)]);
}

export async function redisSRem(setKey, member) {
  return callRedis('srem', [formatKey(setKey), member]);
}

// Delete key
export async function redisDel(key) {
  return callRedis('del', [formatKey(key)]);
}

// Set TTL on a key
export async function redisExpire(key, ttlInSeconds) {
  return callRedis('expire', [formatKey(key), ttlInSeconds]);
}

// Ping Redis
export async function redisPing() {
  if (!isRedisEnabled) return false;
  try {
    const result = await callRedis('ping');
    return result === 'PONG';
  } catch (err) {
    console.error('Redis ping failed:', err);
    return false;
  }
}
// utils/upstash.js (additions)

export async function redisPublish(channel, message) {
  if (!isRedisEnabled) return null;
  const key = formatKey(channel);
  return callRedis('publish', key, JSON.stringify(message));
}

export async function redisSubscribe(channel, callback) {
  if (!isRedisEnabled) return null;
  const key = formatKey(channel);

  // Upstash REST API doesn't support long-lived subscriptions directly.
  // For REST API, you poll or use WebSockets with Upstash's WebSocket endpoint.
  console.warn(
    '⚠️ redisSubscribe: Use WebSocket endpoint for real-time live stream events'
  );
}
