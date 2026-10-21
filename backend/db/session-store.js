'use strict';

const session = require('express-session');

class MySQLSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.initialization = null;
  }

  init() {
    if (!this.initialization) {
      this.initialization = this.db.query(`
        CREATE TABLE IF NOT EXISTS app_sessions (
          sid VARCHAR(128) NOT NULL PRIMARY KEY,
          expires BIGINT UNSIGNED NOT NULL,
          data MEDIUMTEXT NOT NULL,
          INDEX idx_app_sessions_expires (expires)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `).then(() => undefined);
    }
    return this.initialization;
  }

  get(sid, callback) {
    this.init()
      .then(async () => {
        const [rows] = await this.db.query(
          'SELECT data, expires FROM app_sessions WHERE sid = ? LIMIT 1',
          [sid]
        );
        if (!rows.length) return callback(null, null);
        if (Number(rows[0].expires) <= Date.now()) {
          await this.db.query('DELETE FROM app_sessions WHERE sid = ?', [sid]);
          return callback(null, null);
        }
        callback(null, JSON.parse(rows[0].data));
      })
      .catch(callback);
  }

  set(sid, sessionData, callback) {
    this.init()
      .then(async () => {
        const cookieExpiry = sessionData.cookie?.expires
          ? new Date(sessionData.cookie.expires).getTime()
          : Date.now() + (Number(sessionData.cookie?.maxAge) || 7 * 24 * 60 * 60 * 1000);
        const expires = Number.isFinite(cookieExpiry)
          ? cookieExpiry
          : Date.now() + 7 * 24 * 60 * 60 * 1000;
        await this.db.query(
          `INSERT INTO app_sessions (sid, expires, data) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
          [sid, expires, JSON.stringify(sessionData)]
        );
        callback?.(null);
      })
      .catch(error => callback?.(error));
  }

  touch(sid, sessionData, callback) {
    this.init()
      .then(async () => {
        const cookieExpiry = sessionData.cookie?.expires
          ? new Date(sessionData.cookie.expires).getTime()
          : Date.now() + (Number(sessionData.cookie?.maxAge) || 7 * 24 * 60 * 60 * 1000);
        const expires = Number.isFinite(cookieExpiry)
          ? cookieExpiry
          : Date.now() + 7 * 24 * 60 * 60 * 1000;
        await this.db.query('UPDATE app_sessions SET expires = ? WHERE sid = ?', [expires, sid]);
        callback?.(null);
      })
      .catch(error => callback?.(error));
  }

  destroy(sid, callback) {
    this.init()
      .then(() => this.db.query('DELETE FROM app_sessions WHERE sid = ?', [sid]))
      .then(() => callback?.(null))
      .catch(error => callback?.(error));
  }
}

module.exports = MySQLSessionStore;
