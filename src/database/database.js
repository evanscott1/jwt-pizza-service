const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const config = require('../config.js');
const { StatusCodeError } = require('../endpointHelper.js');
const { Role } = require('../model/model.js');
const dbModel = require('./dbModel.js');
class DB {
  constructor() {
    this.pool = mysql.createPool({
      host: config.db.connection.host,
      user: config.db.connection.user,
      password: config.db.connection.password,
      database: config.db.connection.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true,
    });
    this.initialized = this.initializeDatabase();
  }

  async close() {
    await this.initialized;
    await this.pool.end();
  }

  async getMenu() {
    const connection = await this.getConnection();
      const rows = await this.query(connection, `SELECT * FROM menu`);
      return rows;
  }

  async addMenuItem(item) {
    const connection = await this.getConnection();
      const addResult = await this.query(connection, `INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)`, [item.title, item.description, item.image, item.price]);
      return { ...item, id: addResult.insertId };
  }

  async addUser(user) {
    const connection = await this.getConnection();
      const hashedPassword = await bcrypt.hash(user.password, 10);

      const userResult = await this.query(connection, `INSERT INTO user (name, email, password) VALUES (?, ?, ?)`, [user.name, user.email, hashedPassword]);
      const userId = userResult.insertId;
      for (const role of user.roles) {
        switch (role.role) {
          case Role.Franchisee: {
            const franchiseId = await this.getID(connection, 'name', role.object, 'franchise');
            await this.query(connection, `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`, [userId, role.role, franchiseId]);
            break;
          }
          default: {
            await this.query(connection, `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`, [userId, role.role, 0]);
            break;
          }
        }
      }
      return { ...user, id: userId, password: undefined };
  }

  async getUser(email, password) {
    const connection = await this.getConnection();
      const userResult = await this.query(connection, `SELECT * FROM user WHERE email=?`, [email]);
      const user = userResult[0];
      if (!user || (password && !(await bcrypt.compare(password, user.password)))) {
        throw new StatusCodeError('unknown user', 404);
      }

      const roleResult = await this.query(connection, `SELECT * FROM userRole WHERE userId=?`, [user.id]);
      const roles = roleResult.map((r) => {
        return { objectId: r.objectId || undefined, role: r.role };
      });

      return { ...user, roles: roles, password: undefined };
  }

  async updateUser(userId, name, email, password) {
    const connection = await this.getConnection();
      const params = [];
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        params.push(`password='${hashedPassword}'`);
      }
      if (email) {
        params.push(`email='${email}'`);
      }
      if (name) {
        params.push(`name='${name}'`);
      }
      if (params.length > 0) {
        const query = `UPDATE user SET ${params.join(', ')} WHERE id=${userId}`;
        await this.query(connection, query);
      }
      return this.getUserById(userId);
  }

async deleteUser(email) {
  let connection; // Define connection here to access it in the 'finally' block
  try {
    // 1. Get a single connection from the pool
    connection = await this.pool.getConnection();
    
    // 2. Start the transaction on that specific connection
    await connection.beginTransaction();

    // Find the user ID
    const userResult = await this.query(connection, `SELECT id FROM user WHERE email=?`, [email]);
    if (userResult.length === 0) {
      await connection.commit();
      return; // Return here, the 'finally' block will still run
    }
    const userId = userResult[0].id;

    // ... (rest of your delete logic is the same)
    const orders = await this.query(connection, `SELECT id FROM dinerOrder WHERE dinerId=?`, [userId]);
    if (orders.length > 0) {
      const orderIds = orders.map(order => order.id);
      await connection.query(`DELETE FROM orderItem WHERE orderId IN (?)`, [orderIds]);
      await this.query(connection, `DELETE FROM dinerOrder WHERE dinerId=?`, [userId]);
    }
    await this.query(connection, `DELETE FROM auth WHERE userId=?`, [userId]);
    await this.query(connection, `DELETE FROM userRole WHERE userId=?`, [userId]);
    await this.query(connection, `DELETE FROM user WHERE id=?`, [userId]);

    // 3. Commit the transaction
    await connection.commit();
  } catch (error) {
    // 4. Rollback the transaction if an error occurs
    if (connection) await connection.rollback();
    console.error('Failed to delete user:', error);
    throw new StatusCodeError('unable to delete user', 500);
  } finally {
    // 5. Release the connection back to the pool
    if (connection) connection.release();
  }
}

  async loginUser(userId, token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();

      await this.query(connection, `INSERT INTO auth (token, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE token=token`, [token, userId]);
  }

  async isLoggedIn(token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
      const authResult = await this.query(connection, `SELECT userId FROM auth WHERE token=?`, [token]);
      return authResult.length > 0;
  }

  async logoutUser(token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
      await this.query(connection, `DELETE FROM auth WHERE token=?`, [token]);
  }

  async getOrders(user, page = 1) {
    const connection = await this.getConnection();
      const offset = this.getOffset(page, config.db.listPerPage);
      const orders = await this.query(connection, `SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT ${offset},${config.db.listPerPage}`, [user.id]);
      for (const order of orders) {
        let items = await this.query(connection, `SELECT id, menuId, description, price FROM orderItem WHERE orderId=?`, [order.id]);
        order.items = items;
      }
      return { dinerId: user.id, orders: orders, page };
  }

  async addDinerOrder(user, order) {
    const connection = await this.getConnection();
      const orderResult = await this.query(connection, `INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())`, [user.id, order.franchiseId, order.storeId]);
      const orderId = orderResult.insertId;
      for (const item of order.items) {
        const menuId = await this.getID(connection, 'id', item.menuId, 'menu');
        await this.query(connection, `INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)`, [orderId, menuId, item.description, item.price]);
      }
      return { ...order, id: orderId };
  }

  async createFranchise(franchise) {
    const connection = await this.getConnection();
      for (const admin of franchise.admins) {
        const adminUser = await this.query(connection, `SELECT id, name FROM user WHERE email=?`, [admin.email]);
        if (adminUser.length == 0) {
          throw new StatusCodeError(`unknown user for franchise admin ${admin.email} provided`, 404);
        }
        admin.id = adminUser[0].id;
        admin.name = adminUser[0].name;
      }

      const franchiseResult = await this.query(connection, `INSERT INTO franchise (name) VALUES (?)`, [franchise.name]);
      franchise.id = franchiseResult.insertId;

      for (const admin of franchise.admins) {
        await this.query(connection, `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`, [admin.id, Role.Franchisee, franchise.id]);
      }

      return franchise;
  }

  async deleteFranchise(franchiseId) {
    const connection = await this.getConnection();
      await connection.beginTransaction();
      try {
        await this.query(connection, `DELETE FROM store WHERE franchiseId=?`, [franchiseId]);
        await this.query(connection, `DELETE FROM userRole WHERE objectId=?`, [franchiseId]);
        await this.query(connection, `DELETE FROM franchise WHERE id=?`, [franchiseId]);
        await connection.commit();
      } catch {
        await connection.rollback();
        throw new StatusCodeError('unable to delete franchise', 500);
      }
  }

  async getFranchises(authUser, page = 0, limit = 10, nameFilter = '*') {
    const connection = await this.getConnection();

    const offset = page * limit;
    nameFilter = nameFilter.replace(/\*/g, '%');

      let franchises = await this.query(connection, `SELECT id, name FROM franchise WHERE name LIKE ? LIMIT ${limit + 1} OFFSET ${offset}`, [nameFilter]);

      const more = franchises.length > limit;
      if (more) {
        franchises = franchises.slice(0, limit);
      }

      for (const franchise of franchises) {
        if (authUser?.isRole(Role.Admin)) {
          await this.getFranchise(franchise);
        } else {
          franchise.stores = await this.query(connection, `SELECT id, name FROM store WHERE franchiseId=?`, [franchise.id]);
        }
      }
      return [franchises, more];
  }

  async getUserFranchises(userId) {
    const connection = await this.getConnection();
      let franchiseIds = await this.query(connection, `SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?`, [userId]);
      if (franchiseIds.length === 0) {
        return [];
      }

      franchiseIds = franchiseIds.map((v) => v.objectId);
      const franchises = await this.query(connection, `SELECT id, name FROM franchise WHERE id in (${franchiseIds.join(',')})`);
      for (const franchise of franchises) {
        await this.getFranchise(franchise);
      }
      return franchises;
  }

  async getFranchise(franchise) {
    const connection = await this.getConnection();
      franchise.admins = await this.query(connection, `SELECT u.id, u.name, u.email FROM userRole AS ur JOIN user AS u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee'`, [franchise.id]);

      franchise.stores = await this.query(connection, `SELECT s.id, s.name, COALESCE(SUM(oi.price), 0) AS totalRevenue FROM dinerOrder AS do JOIN orderItem AS oi ON do.id=oi.orderId RIGHT JOIN store AS s ON s.id=do.storeId WHERE s.franchiseId=? GROUP BY s.id`, [franchise.id]);

      return franchise;
  }

  async createStore(franchiseId, store) {
    const connection = await this.getConnection();
      const insertResult = await this.query(connection, `INSERT INTO store (franchiseId, name) VALUES (?, ?)`, [franchiseId, store.name]);
      return { id: insertResult.insertId, franchiseId, name: store.name };
  }

  async deleteStore(franchiseId, storeId) {
    const connection = await this.getConnection();
      await this.query(connection, `DELETE FROM store WHERE franchiseId=? AND id=?`, [franchiseId, storeId]);
  }

  async getUserById(userId) {
  const connection = await this.getConnection();
    const userResult = await this.query(connection, `SELECT * FROM user WHERE id=?`, [userId]);
    const user = userResult[0];
    if (!user) {
      throw new StatusCodeError('unknown user', 404);
    }

    const roleResult = await this.query(connection, `SELECT * FROM userRole WHERE userId=?`, [userId]);
    const roles = roleResult.map((r) => {
      return { objectId: r.objectId || undefined, role: r.role };
    });

    return { ...user, roles: roles, password: undefined };
}

  getOffset(currentPage = 1, listPerPage) {
    return (currentPage - 1) * [listPerPage];
  }

  getTokenSignature(token) {
    const parts = token.split('.');
    if (parts.length > 2) {
      return parts[2];
    }
    return '';
  }

  async query(connection, sql, params) {
    const [results] = await connection.execute(sql, params);
    return results;
  }

  async getID(connection, key, value, table) {
    const [rows] = await connection.execute(`SELECT id FROM ${table} WHERE ${key}=?`, [value]);
    if (rows.length > 0) {
      return rows[0].id;
    }
    throw new Error('No ID found');
  }

async getConnection() {
    await this.initialized;
    return this.pool;
  }


async initializeDatabase() {
    let tempConnection;
    try {
      tempConnection = await mysql.createConnection({
        host: config.db.connection.host,
        user: config.db.connection.user,
        password: config.db.connection.password,
      });
      await tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${config.db.connection.database}`);
    } finally {
      if (tempConnection) await tempConnection.end();
    }

    try {
      const [rows] = await this.pool.execute('SHOW TABLES');
      if (rows.length === 0) {
          for (const statement of dbModel.tableCreateStatements) {
            await this.pool.query(statement);
          }

          const defaultAdmin = { name: '常用名字', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] };
          const hashedPassword = await bcrypt.hash(defaultAdmin.password, 10);
          const [userResult] = await this.pool.execute(`INSERT INTO user (name, email, password) VALUES (?, ?, ?)`, [defaultAdmin.name, defaultAdmin.email, hashedPassword]);
          const userId = userResult.insertId;
          await this.pool.execute(`INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`, [userId, Role.Admin, 0]);
      }
    } catch (err) {
      console.error('Error creating tables:', err);
    }
  }

  async checkDatabaseExists(connection) {
    const [rows] = await connection.execute(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`, [config.db.connection.database]);
    return rows.length > 0;
  }
}

const db = new DB();
module.exports = { Role, DB: db };
