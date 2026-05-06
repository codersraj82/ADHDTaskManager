import * as SQLite from "expo-sqlite";

// ✅ CREATE DB INSTANCE
export const db = SQLite.openDatabaseSync("tasks.db");

// ✅ INIT FUNCTION
// ✅ Update in db.js
export const initDB = () => {
  // Existing tasks table...
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      section TEXT,
      completed INTEGER,
      scheduledTime TEXT,
      details TEXT
    );
  `);

  // 🆕 THE PERMANENT SETTINGS TABLE
  db.execSync(`
    CREATE TABLE IF NOT EXISTS section_settings (
      section_name TEXT PRIMARY KEY,
      start_time TEXT,
      end_time TEXT
    );
  `);
  try {
    db.execSync(`
  ALTER TABLE tasks ADD COLUMN subtasks TEXT;
`);
  } catch (e) {}

  try {
    db.execSync(`ALTER TABLE tasks ADD COLUMN attachment TEXT;`);
  } catch (e) {}
};
