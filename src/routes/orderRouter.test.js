const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

// Mock the global fetch function before all tests
const mockFactoryResponse = { reportUrl: 'http://example.com', jwt: 'factory-jwt' };
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockFactoryResponse),
  })
);

// Add this timeout for the initial slow DB connection
jest.setTimeout(30000);

describe('orderRouter', () => {
  let dinerUser;
  let adminUser;
  let dinerCookie;
  let adminCookie;

  beforeAll(async () => {
    // Create a regular diner user
    dinerUser = {
      name: 'Test Diner',
      email: `diner-${Date.now()}@test.com`,
      password: 'password123',
    };
    const registerRes = await request(app).post('/api/auth').send(dinerUser);
    dinerCookie = registerRes.headers['set-cookie'][0].split(';')[0];

    // Create an admin user
    adminUser = {
      name: 'Test Admin',
      email: `admin-${Date.now()}@test.com`,
      password: 'password123',
      roles: [{ role: Role.Admin }],
    };
    await DB.addUser(adminUser);
    const loginRes = await request(app).put('/api/auth').send(adminUser);
    adminCookie = loginRes.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(async () => {
    await DB.deleteUser(dinerUser.email);
    await DB.deleteUser(adminUser.email);
  });

  afterAll(async () => {
    await DB.close();
  });

  describe('GET /api/order/menu', () => {
    it('should return the full menu', async () => {
      const res = await request(app).get('/api/order/menu');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PUT /api/order/menu', () => {
    const newMenuItem = {
      title: 'Test Pizza',
      description: 'A pizza for testing',
      image: 'test.png',
      price: 9.99,
    };

    it('should return 401 Unauthorized if no cookie is provided', async () => {
      const res = await request(app).put('/api/order/menu').send(newMenuItem);
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden if user is not an admin', async () => {
      const res = await request(app)
        .put('/api/order/menu')
        .set('Cookie', dinerCookie) // Use Cookie header
        .send(newMenuItem);
      expect(res.status).toBe(403);
    });

    it('should allow an admin to add a new menu item', async () => {
      const res = await request(app)
        .put('/api/order/menu')
        .set('Cookie', adminCookie) // Use Cookie header
        .send(newMenuItem);

      expect(res.status).toBe(200);
      const addedItem = res.body.find((item) => item.title === newMenuItem.title);
      expect(addedItem).toBeDefined();
    });
  });

  describe('GET /api/order', () => {
    it('should return 401 Unauthorized if no cookie is provided', async () => {
      const res = await request(app).get('/api/order');
      expect(res.status).toBe(401);
    });

    it('should return the orders for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/order')
        .set('Cookie', dinerCookie); // Use Cookie header

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('orders');
    });
  });

  describe('POST /api/order', () => {
    const newOrder = {
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: 'Test Item', price: 9.99 }],
    };

    it('should return 401 Unauthorized if no cookie is provided', async () => {
      const res = await request(app).post('/api/order').send(newOrder);
      expect(res.status).toBe(401);
    });

    it('should create a new order for the authenticated user', async () => {
      const res = await request(app)
        .post('/api/order')
        .set('Cookie', dinerCookie) // Use Cookie header
        .send(newOrder);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('order');
      expect(res.body.order.id).toBeDefined();
    });
  });
});