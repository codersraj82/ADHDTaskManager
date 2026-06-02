const TASK_LINK_PATHS = new Set(["task", "open-task"]);
const ALARM_LINK_PATH = "alarm";

export const TASK_DEEP_LINK_FALLBACK_MESSAGE =
  "Task could not be found. It may have been completed or removed.";

const getStringParam = (searchParams, names) => {
  for (const name of names) {
    const value = searchParams.get(name);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const normalizeSource = ({ source, alarmId, alarmAction }) => {
  const normalized = String(source || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (normalized === "strong_alarm" || normalized === "strongalarm") {
    return "strong_alarm";
  }
  if (normalized === "notification") return "notification";
  if (alarmId || alarmAction) return "strong_alarm";
  return "unknown";
};

const parseUrl = (url) => {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed, "adhdtaskmanager://app");
  } catch {
    return null;
  }
};

const getPathInfo = (parsedUrl) => {
  const hostname = String(parsedUrl?.hostname || "").toLowerCase();
  const segments = String(parsedUrl?.pathname || "")
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  return { hostname, segments };
};

const hasTaskDeepLinkShape = (parsedUrl) => {
  if (!parsedUrl) return false;

  const { hostname, segments } = getPathInfo(parsedUrl);
  const firstSegment = segments[0] || "";
  const secondSegment = segments[1] || "";
  const source = parsedUrl.searchParams.get("source");

  return (
    TASK_LINK_PATHS.has(hostname) ||
    TASK_LINK_PATHS.has(firstSegment) ||
    (hostname === ALARM_LINK_PATH && TASK_LINK_PATHS.has(firstSegment)) ||
    (firstSegment === ALARM_LINK_PATH && TASK_LINK_PATHS.has(secondSegment)) ||
    parsedUrl.searchParams.has("alarmId") ||
    parsedUrl.searchParams.has("alarmAction") ||
    normalizeSource({ source }) === "strong_alarm"
  );
};

export const isTaskDeepLinkUrl = (url) => hasTaskDeepLinkShape(parseUrl(url));

export const parseTaskDeepLink = (url) => {
  const parsedUrl = parseUrl(url);
  if (!hasTaskDeepLinkShape(parsedUrl)) return null;

  const searchParams = parsedUrl.searchParams;
  const taskId = getStringParam(searchParams, [
    "taskId",
    "taskID",
    "task_id",
    "id",
    "pendingTaskId",
  ]);

  if (!taskId) return null;

  const taskTitle = getStringParam(searchParams, ["taskTitle", "title"]);
  const alarmId = getStringParam(searchParams, ["alarmId"]);
  const alarmAction = getStringParam(searchParams, ["alarmAction", "action"]);
  const source = normalizeSource({
    source: searchParams.get("source"),
    alarmId,
    alarmAction,
  });
  const sectionId = getStringParam(searchParams, [
    "sectionId",
    "section",
    "category",
    "sectionName",
  ]);

  return {
    type: "task",
    taskId,
    ...(taskTitle ? { taskTitle } : {}),
    ...(alarmId ? { alarmId } : {}),
    ...(alarmAction ? { alarmAction } : {}),
    ...(sectionId ? { sectionId } : {}),
    source,
  };
};

export const buildTaskDeepLinkRedirectPath = (url) => {
  if (!isTaskDeepLinkUrl(url)) return null;

  const parsedTaskLink = parseTaskDeepLink(url);
  const queryParams = new URLSearchParams();

  if (parsedTaskLink?.taskId) {
    queryParams.set("taskId", parsedTaskLink.taskId);
  } else {
    queryParams.set("taskLinkError", "missing_task");
  }

  if (parsedTaskLink?.taskTitle) {
    queryParams.set("taskTitle", parsedTaskLink.taskTitle);
  }
  if (parsedTaskLink?.alarmId) {
    queryParams.set("alarmId", parsedTaskLink.alarmId);
  }
  if (parsedTaskLink?.alarmAction) {
    queryParams.set("alarmAction", parsedTaskLink.alarmAction);
  }
  if (parsedTaskLink?.sectionId) {
    queryParams.set("sectionId", parsedTaskLink.sectionId);
  }

  queryParams.set(
    "source",
    parsedTaskLink?.source === "notification" ? "notification" : "strong_alarm"
  );

  return `/?${queryParams.toString()}`;
};
