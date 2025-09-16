// controllers/upstash.controller.js
import { redisSet, redisGet, redisDel } from '../utils/upstash.js';

export const upstashTest = async (req, res) => {
  try {
    // 1) Set a key with TTL = 60s
    await redisSet('test_upstash_key', 'hello_from_render', 60);

    // 2) Get the key
    const value = await redisGet('test_upstash_key');

    // 3) Clean up
    await redisDel('test_upstash_key');

    return res.json({
      ok: true,
      upstashResult: value,
    });
  } catch (err) {
    console.error('Upstash test error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
