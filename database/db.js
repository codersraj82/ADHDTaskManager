import * as SQLite from "expo-sqlite";

// ✅ NEW API
export const db = SQLite.openDatabaseSync("tasks.db");

export const initDB = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      section TEXT,
      completed INTEGER
    );
  `);
};
