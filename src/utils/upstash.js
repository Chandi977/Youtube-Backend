// utils/upstash.js
import 'dotenv/config';
import fetch from 'node-fetch';

const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRedisEnabled = !!(baseUrl && token);

if (!isRedisEnabled) {
  console.warn(
    '❌ Upstash credentials missing! Redis operations will be skipped.'
  );
} else {
  console.log('✅ Upstash credentials found. Redis operations enabled.');
}

// Generic call helper
async function callRedis(command, ...args) {
  if (!isRedisEnabled) return null;

  try {
    const url = `${baseUrl}/${command}/${args.join('/')}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (data.error) {
      console.error(`❌ Redis Error: ${data.error}`);
      return null;
    }

    return data.result;
  } catch (err) {
    console.error('❌ Redis fetch failed:', err);
    return null; // Prevent crash
  }
}

// Redis operations
export async function redisSet(key, value) {
  return callRedis('set', key, value);
}

export async function redisGet(key) {
  return callRedis('get', key);
}

export async function redisIncr(key) {
  return callRedis('incr', key);
}

export async function redisDecr(key) {
  return callRedis('decr', key);
}

export async function redisSAdd(setKey, member) {
  return callRedis('sadd', setKey, member);
}

export async function redisSMembers(setKey) {
  return callRedis('smembers', setKey);
}

export async function redisSRem(setKey, member) {
  return callRedis('srem', setKey, member);
}

export async function redisDel(key) {
  return callRedis('del', key);
}
