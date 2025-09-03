// utils/upstash.js
const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!baseUrl || !token) {
  throw new Error(
    'Missing Upstash Redis credentials in environment variables.'
  );
}

// Generic call helper
async function callRedis(command, ...args) {
  const url = `${baseUrl}/${command}/${args.join('/')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result;
}

// Common operations
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

export async function redisDel(key) {
  return callRedis('del', key);
}
