// This is the most basic Jest test. It doesn't import any of your application code.
// Its only purpose is to verify that the Jest test runner itself is working.
jest.setTimeout(30000);
const request = require('supertest');
const app = require('../service.js');

describe('Simple Sanity Check', () => {
  test('should always pass', () => {
    // This assertion checks if true is equal to true. It will never fail.
    expect(true).toBe(true);
  });
});

describe('Application Server', () => {
  test('should start and respond to a simple request', async () => {
    // This makes a real request to an endpoint that doesn't exist.
    // We only care that the server responds with a 404 (Not Found),
    // which proves it's running.
    const res = await request(app).get('/non-existent-endpoint');
    expect(res.status).toBe(404);
  });
});