const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserCookie;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);

  // Correctly extract the cookie from the response headers
  const cookie = registerRes.headers['set-cookie'][0];
  testUserCookie = cookie.split(';')[0];

  // The token is in the cookie, not the body, so we can't check it here directly
  expect(registerRes.headers['set-cookie']).toBeDefined();
});

afterAll(async () => {
  await DB.deleteUser(testUser.email);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);

  // Assert that a cookie was set, instead of checking the body for a token
  expect(loginRes.headers['set-cookie']).toBeDefined();

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('logout', async () => {
  // We already have a valid cookie from the beforeAll hook
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Cookie', testUserCookie); // Send the cookie instead of the Authorization header

  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');
});