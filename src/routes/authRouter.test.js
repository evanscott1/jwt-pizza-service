const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5);
}

const agent = request.agent(app);

const testUser = { name: 'pizza diner', password: 'a' };

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';

  const registerRes = await agent.post('/api/auth').send(testUser);

   expect(registerRes.status).toBe(200);
});

afterAll(async () => {
  await DB.deleteUser(testUser.email);
});

test('login', async () => {
  const loginAgent = request.agent(app);
  const loginRes = await loginAgent.put('/api/auth').send(testUser);

  expect(loginRes.status).toBe(200);
  
  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;

  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('logout', async () => {
  const logoutRes = await agent.delete('/api/auth');

  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');
});