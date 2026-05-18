import { useEffect, useMemo, useState } from "react";
import { db } from "../database/db";
import { parseStoredDateTime } from "../utils/formatDateTime";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const createEmptyProgress = () => ({
  completedTasks: 0,
  pendingTasks: 0,
  totalTasks: 0,
  progressPercentage: 0,
});

const getIsoDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLegacyDateKey = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const getTodayKeys = () => {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
  return {
    iso: getIsoDateKey(now),
    legacy: getLegacyDateKey(now),
    start,
    end: start + DAY_MS - 1,
  };
};

const toTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  return parsed.getTime();
};

const isArchivedTask = (task) =>
  task?.archived === 1 ||
  task?.archived === true ||
  task?.isArchived === 1 ||
  task?.isArchived === true;

export const useDailyProgress = (tasks = []) => {
  const [todayKeys, setTodayKeys] = useState(() => getTodayKeys());
  const [progress, setProgress] = useState(createEmptyProgress);

  const refreshToken = useMemo(
    () =>
      tasks
        .map((task) =>
          [
            task.id ?? "",
            task.completed ? 1 : 0,
            task.completedAt || "",
            task.scheduledTime || "",
            task.createdAt || "",
            task.archived ? 1 : 0,
            task.isArchived ? 1 : 0,
          ].join(":")
        )
        .join("|"),
    [tasks]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const nextKeys = getTodayKeys();
      setTodayKeys((prev) => (prev.iso === nextKeys.iso ? prev : nextKeys));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const taskColumns = db.getAllSync("PRAGMA table_info(tasks)") || [];
      const hasCreatedAt = taskColumns.some((column) => column.name === "createdAt");

      const dateParams = [todayKeys.iso, todayKeys.legacy];
      const whereClauses = [
        `(scheduledTime IS NOT NULL AND TRIM(scheduledTime) <> '' AND (substr(scheduledTime, 1, 10) = ? OR upper(substr(scheduledTime, 1, 11)) = ?))`,
      ];

      if (hasCreatedAt) {
        whereClauses.push(
          `((scheduledTime IS NULL OR TRIM(scheduledTime) = '') AND createdAt IS NOT NULL AND TRIM(createdAt) <> '' AND (substr(createdAt, 1, 10) = ? OR upper(substr(createdAt, 1, 11)) = ?))`
        );
        dateParams.push(todayKeys.iso, todayKeys.legacy);
      }

      const todayTasks =
        db.getAllSync(
          `SELECT * FROM tasks WHERE ${whereClauses.join(" OR ")}`,
          dateParams
        ) || [];

      let completedTasks = 0;
      let pendingTasks = 0;

      todayTasks.forEach((task) => {
        if (isArchivedTask(task)) return;

        const scheduledTimestamp = toTimestamp(task.scheduledTime);
        const createdTimestamp = toTimestamp(task.createdAt);

        const isScheduledForToday =
          scheduledTimestamp !== null &&
          scheduledTimestamp >= todayKeys.start &&
          scheduledTimestamp <= todayKeys.end;

        const isCreatedTodayWithoutSchedule =
          scheduledTimestamp === null &&
          createdTimestamp !== null &&
          createdTimestamp >= todayKeys.start &&
          createdTimestamp <= todayKeys.end;

        if (!isScheduledForToday && !isCreatedTodayWithoutSchedule) return;

        if (task.completed === 1 || task.completed === true) {
          completedTasks += 1;
          return;
        }

        pendingTasks += 1;
      });

      const totalTasks = completedTasks + pendingTasks;
      const progressPercentage =
        totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

      setProgress((prev) => {
        if (
          prev.completedTasks === completedTasks &&
          prev.pendingTasks === pendingTasks &&
          prev.totalTasks === totalTasks &&
          prev.progressPercentage === progressPercentage
        ) {
          return prev;
        }

        return {
          completedTasks,
          pendingTasks,
          totalTasks,
          progressPercentage,
        };
      });
    } catch (error) {
      setProgress(createEmptyProgress());
      console.log("Daily progress query error:", error);
    }
  }, [refreshToken, todayKeys.end, todayKeys.iso, todayKeys.legacy, todayKeys.start]);

  return progress;
};

