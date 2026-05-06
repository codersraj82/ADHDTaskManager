import * as SQLite from "expo-sqlite";

// ✅ CREATE DB INSTANCE
export const db = SQLite.openDatabaseSync("tasks.db");

// ✅ INIT FUNCTION
export const initDB = () => {
  // 1️⃣ Create Core Tasks Table (Basic Schema)
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

  // 2️⃣ Create Section Settings Table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS section_settings (
      section_name TEXT PRIMARY KEY,
      start_time TEXT,
      end_time TEXT
    );
  `);

  // 3️⃣ Pro Migration Logic: Safely Add New Columns
  // We list all the columns we've added throughout the project here.
  const migrations = [
    { name: "subtasks", type: "TEXT" }, // For small tasks JSON
    { name: "attachment", type: "TEXT" }, // For Image/PDF URIs
    { name: "notificationId", type: "TEXT" }, // For scheduled Alarm IDs
  ];

  migrations.forEach((column) => {
    try {
      // This command will only run if the column doesn't already exist.
      // If it exists, SQLite throws an error, which we catch and ignore.
      db.execSync(
        `ALTER TABLE tasks ADD COLUMN ${column.name} ${column.type};`,
      );
      console.log(`✅ Migration Success: Added ${column.name} column`);
    } catch (e) {
      // Column already exists, no action needed
    }
  });

  console.log("🚀 Database Initialized Successfully");
};
