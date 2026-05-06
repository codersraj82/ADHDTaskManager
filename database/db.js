import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("tasks.db");

export const initDB = () => {
  // 1️⃣ Create Core Tasks Table (Minimal)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      section TEXT,
      completed INTEGER
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS section_settings (
      section_name TEXT PRIMARY KEY,
      start_time TEXT,
      end_time TEXT
    );
  `);

  // 2️⃣ 🛡️ The Migration Loop (The Fix)
  const migrations = [
    { name: "scheduledTime", type: "TEXT" },
    { name: "details", type: "TEXT" },
    { name: "subtasks", type: "TEXT" },
    { name: "attachment", type: "TEXT" },
    { name: "notificationId", type: "TEXT" },
  ];

  migrations.forEach((column) => {
    try {
      // ❗ Fixed: used 'column.type' correctly here
      db.execSync(
        `ALTER TABLE tasks ADD COLUMN ${column.name} ${column.type};`,
      );
      console.log(`✅ Column ensured: ${column.name}`);
    } catch (e) {
      // If error, it means column already exists - we ignore it.
    }
  });

  console.log("🚀 Database Schema Sync Complete");
};
