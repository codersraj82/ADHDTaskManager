export const TASK_VIEW_MODE_SETTING_KEY = "taskViewMode";

export const normalizeTaskViewMode = (value) =>
  value === "category" ? "category" : "block";

// The existing database is opened synchronously before the task screen mounts.
// Read-only initialization avoids a Block flash and never overwrites a choice.
export const readTaskViewPreference = (database) => {
  try {
    const saved = database.getFirstSync(
      "SELECT value FROM app_settings WHERE key = ?",
      [TASK_VIEW_MODE_SETTING_KEY]
    );
    return normalizeTaskViewMode(saved?.value);
  } catch {
    // On first use the boot sequence may not have created app_settings yet.
    // Unavailable or invalid preferences must not prevent the app from opening.
    return "block";
  }
};
