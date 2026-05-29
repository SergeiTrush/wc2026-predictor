/** Thin helpers so server code works with node:sqlite DatabaseSync API. */
function prepare(db, sql) {
  const stmt = db.prepare(sql);
  return {
    get(...params) {
      return stmt.get(...params);
    },
    all(...params) {
      return stmt.all(...params);
    },
    run(...params) {
      const result = stmt.run(...params);
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: result.changes,
      };
    },
  };
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { prepare, transaction };
