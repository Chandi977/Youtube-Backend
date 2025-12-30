import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Video } from '../src/models/video.model.js';
import { Comment } from '../src/models/comment.model.js';

const seedUser = async () => {
  return User.create({
    fullName: 'Test User',
    email: 'test@example.com',
    username: 'testuser',
    password: 'Password1',
    avatar: 'http://example.com/avatar.png',
    coverImage: '',
  });
};

const loginUser = async () => {
  const response = await request(app).post('/api/v1/users/login').send({
    email: 'test@example.com',
    password: 'Password1',
  });
  return response;
};

const seedVideo = async (ownerId) => {
  return Video.create({
    title: 'Test Video',
    description: 'Test description',
    owner: ownerId,
    isPublished: true,
    status: 'published',
    thumbnail: {
      url: 'http://example.com/thumb.jpg',
      public_id: 'thumb-1',
    },
    videoFile: {
      url: 'http://example.com/video.m3u8',
      public_id: 'video-1',
      eager: {},
      format: 'hls',
      streaming_profile: 'hd',
    },
  });
};

describe('API integration flows', () => {
  test('auth login returns tokens', async () => {
    await seedUser();

    const response = await loginUser();
    expect(response.status).toBe(200);
    expect(response.body?.data?.accessToken).toBeTruthy();
    expect(response.body?.data?.refreshToken).toBeTruthy();
  });

  test('video views, comments, and likes flow', async () => {
    const user = await seedUser();
    const loginResponse = await loginUser();
    const token = loginResponse.body?.data?.accessToken;
    expect(token).toBeTruthy();

    const video = await seedVideo(user._id);

    const listResponse = await request(app).get('/api/v1/videos/getvideos');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body?.data?.videos?.length).toBe(1);

    await request(app).post(`/api/v1/videos/${video._id}/view`);
    await request(app).post(`/api/v1/videos/${video._id}/view`);

    const updatedVideo = await Video.findById(video._id);
    expect(updatedVideo.viewsCount).toBe(2);

    const commentResponse = await request(app)
      .post('/api/v1/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello there', video: video._id.toString() });
    expect(commentResponse.status).toBe(201);
    expect(Array.isArray(commentResponse.body?.data)).toBe(true);

    const comment = await Comment.findOne({
      video: video._id,
      parent: null,
    });
    expect(comment).toBeTruthy();

    const replyResponse = await request(app)
      .post('/api/v1/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Replying',
        video: video._id.toString(),
        parentId: comment._id.toString(),
      });
    expect(replyResponse.status).toBe(201);

    const getCommentsResponse = await request(app).get(
      `/api/v1/comments/${video._id}?page=1&limit=10`
    );
    expect(getCommentsResponse.status).toBe(200);
    expect(getCommentsResponse.body?.data?.length).toBe(1);
    expect(getCommentsResponse.body?.data?.[0]?.replies?.length).toBe(1);

    const likeResponse = await request(app)
      .post(`/api/v1/likes/c/${comment._id}/toggle`)
      .set('Authorization', `Bearer ${token}`);
    expect(likeResponse.status).toBe(201);
    expect(likeResponse.body?.data?.liked).toBe(true);

    const likeInfo = await request(app)
      .get(`/api/v1/likes/c/${comment._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(likeInfo.status).toBe(200);
    expect(likeInfo.body?.data?.count).toBe(1);
    expect(likeInfo.body?.data?.isLiked).toBe(true);

    const commentAfterLike = await Comment.findById(comment._id);
    expect(commentAfterLike.likesCount).toBe(1);

    const unlikeResponse = await request(app)
      .post(`/api/v1/likes/c/${comment._id}/toggle`)
      .set('Authorization', `Bearer ${token}`);
    expect(unlikeResponse.status).toBe(200);

    const unlikeInfo = await request(app)
      .get(`/api/v1/likes/c/${comment._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unlikeInfo.body?.data?.count).toBe(0);
  });
});
