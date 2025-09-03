import fetch from 'node-fetch';

export const upstashTest = async (req, res) => {
  try {
    const base = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!base || !token) {
      return res
        .status(500)
        .json({ ok: false, message: 'Missing UPSTASH env vars' });
    }

    // 1) Set a key
    await fetch(`${base}/set/test_upstash_key/hello_from_render`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    // 2) Get the key
    const getRes = await fetch(`${base}/get/test_upstash_key`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getJson = await getRes.json();

    // 3) Clean up
    await fetch(`${base}/del/test_upstash_key`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    return res.json({
      ok: true,
      upstashResult: getJson.result ?? getJson,
    });
  } catch (err) {
    console.error('Upstash test error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
