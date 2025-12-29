export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'YoutubeClone API',
    version: '1.0.0',
    description: 'Backend API for YoutubeClone',
  },
  servers: [
    { url: 'http://localhost:8000/api/v1', description: 'Local' },
  ],
  components: {
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {},
          requestId: { type: 'string', nullable: true },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          success: { type: 'boolean', default: false },
          message: { type: 'string' },
          requestId: { type: 'string', nullable: true },
          data: { type: 'object' },
        },
      },
      LoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          username: { type: 'string' },
          password: { type: 'string' },
        },
        required: ['password'],
      },
      LoginResponse: {
        type: 'object',
        properties: {
          user: { type: 'object' },
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      VideoListResponse: {
        type: 'object',
        properties: {
          videos: { type: 'array', items: { type: 'object' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/healthcheck': {
      get: {
        summary: 'Health check',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' },
              },
            },
          },
        },
      },
    },
    '/users/login': {
      post: {
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' },
              },
            },
          },
          401: {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
              },
            },
          },
        },
      },
    },
    '/videos/getvideos': {
      get: {
        summary: 'List videos',
        responses: {
          200: {
            description: 'Video list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' },
              },
            },
          },
        },
      },
    },
    '/videos/trending/top': {
      get: {
        summary: 'Trending videos',
        responses: {
          200: {
            description: 'Trending list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' },
              },
            },
          },
        },
      },
    },
    '/comments/{videoId}': {
      get: {
        summary: 'Video comments',
        parameters: [
          {
            name: 'videoId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Comments fetched',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' },
              },
            },
          },
        },
      },
    },
  },
};
