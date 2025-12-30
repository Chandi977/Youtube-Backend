process.env.NODE_ENV = 'test';
process.env.ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET || 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';
process.env.UPSTASH_REDIS_URL = '';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || 'test-google-secret';
process.env.GITHUB_CLIENT_ID =
  process.env.GITHUB_CLIENT_ID || 'test-github-client';
process.env.GITHUB_CLIENT_SECRET =
  process.env.GITHUB_CLIENT_SECRET || 'test-github-secret';
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:8000';
