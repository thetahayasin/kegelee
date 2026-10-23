/**
 * react-native-sqlite-storage on sql.js.
 *
 * Real SQLite compiled to WebAssembly, so every query the app runs - PRAGMA
 * user_version, the migrations, INSERT OR IGNORE, the JSON-in-TEXT columns -
 * behaves exactly as it does on the phone. Only the promise API is provided,
 * because that is the only one the app enables.
 */
import initSqlJs from 'sql.js';

let sqlPromise = null;
let shared = null;

const resultSet = (db, rows) => ({
  rows: {
    length: rows.length,
    item: (i) => rows[i],
    raw: () => rows.slice(),
  },
  rowsAffected: db.getRowsModified(),
  insertId: (() => {
    const r = db.exec('SELECT last_insert_rowid() AS id');
    return r.length ? r[0].values[0][0] : undefined;
  })(),
});

const run = (db, sql, params = []) => {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p)));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return resultSet(db, rows);
  } finally {
    stmt.free();
  }
};

const wrap = (db) => ({
  executeSql: async (sql, params) => [run(db, sql, params)],
  transaction: async (fn) => {
    const tx = {
      executeSql: (sql, params, ok, fail) => {
        try {
          const rs = run(db, sql, params);
          if (ok) ok(tx, rs);
        } catch (e) {
          if (fail) fail(tx, e);
          else throw e;
        }
      },
    };
    db.exec('BEGIN');
    try {
      await fn(tx);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
  close: async () => {},
});

const SQLite = {
  enablePromise: () => {},
  DEBUG: () => {},
  openDatabase: async () => {
    if (!sqlPromise) {
      sqlPromise = initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
    }
    const SQL = await sqlPromise;
    if (!shared) shared = wrap(new SQL.Database());
    return shared;
  },
};

export default SQLite;
