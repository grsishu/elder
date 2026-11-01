import sqlite3 from 'sqlite3';

const db = new sqlite3.Database(':memory:');
db.serialize(() => {
  db.run("CREATE TABLE users (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), name TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  db.all("INSERT INTO users (name) VALUES (?) RETURNING *", ['Alice'], (err, rows) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Success, rows:', rows);
    }
  });
});

