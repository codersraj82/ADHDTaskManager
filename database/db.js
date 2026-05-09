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

  db.execSync(`
    CREATE TABLE IF NOT EXISTS app_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT DEFAULT '',
      profileImage TEXT DEFAULT '',
      vibe TEXT DEFAULT '🌿',
      onboardingComplete INTEGER DEFAULT 0,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      completedTasks INTEGER DEFAULT 0,
      totalFocusTime INTEGER DEFAULT 0,
      streakValue INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS special_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      note TEXT,
      createdAt TEXT
    );
  `);

  // 2️⃣ 🛡️ The Migration Loop (Improved with Defaults)
  const migrations = [
    { name: "scheduledTime", type: "TEXT" },
    { name: "details", type: "TEXT" },
    { name: "attachment", type: "TEXT" },
    // Adding default empty arrays for JSON columns
    { name: "subtasks", type: "TEXT DEFAULT '[]'" },
    { name: "notificationId", type: "TEXT DEFAULT '[]'" },
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
