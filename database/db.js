import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("tasks.db");

export const initDB = () => {
  // 1️⃣ Create Core Tasks Table (Minimal)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      section TEXT,
      completed INTEGER,
      moodType TEXT DEFAULT ''
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

    CREATE TABLE IF NOT EXISTS daily_moods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      moodType TEXT,
      note TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT
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
    { name: "usePhoneAlarm", type: "INTEGER DEFAULT 0" },
    { name: "moodType", type: "TEXT DEFAULT ''" },
    { name: "firstAction", type: "TEXT DEFAULT ''" },
    { name: "minimumVersion", type: "TEXT DEFAULT ''" },
    { name: "energyRequired", type: "TEXT DEFAULT ''" },
    { name: "focusRequired", type: "TEXT DEFAULT ''" },
    { name: "taskContext", type: "TEXT DEFAULT ''" },
    { name: "estimatedMinutes", type: "INTEGER" },
    { name: "startAssistUsedCount", type: "INTEGER DEFAULT 0" },
    { name: "lastStartAssistAt", type: "TEXT" },
    { name: "stuckCount", type: "INTEGER DEFAULT 0" },
    { name: "lastStuckAt", type: "TEXT" },
    { name: "reminderOpenCount", type: "INTEGER DEFAULT 0" },
    { name: "reminderStartNowCount", type: "INTEGER DEFAULT 0" },
    { name: "reminderSnoozeCount", type: "INTEGER DEFAULT 0" },
    { name: "reminderMoveGentlyCount", type: "INTEGER DEFAULT 0" },
    { name: "reminderMakeSmallerCount", type: "INTEGER DEFAULT 0" },
    { name: "lastReminderActionAt", type: "TEXT" },
    { name: "lastReminderAction", type: "TEXT DEFAULT ''" },
    { name: "reminderActionHistory", type: "TEXT DEFAULT '[]'" },
    { name: "snoozeCount", type: "INTEGER DEFAULT 0" },
    { name: "lastSnoozedAt", type: "TEXT" },
    { name: "rescheduleCount", type: "INTEGER DEFAULT 0" },
    { name: "lastRescheduledAt", type: "TEXT" },
  ];

  migrations.forEach((column) => {
    try {
      // ❗ Fixed: used 'column.type' correctly here
      db.execSync(
        `ALTER TABLE tasks ADD COLUMN ${column.name} ${column.type};`,
      );
      console.log(`✅ Column ensured: ${column.name}`);
    } catch (_e) {
      // If error, it means column already exists - we ignore it.
    }
  });

  console.log("🚀 Database Schema Sync Complete");
};
