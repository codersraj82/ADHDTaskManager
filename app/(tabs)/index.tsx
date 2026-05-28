import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Animated,
  Pressable,
  Dimensions,
  Image,
  Linking,
  StatusBar,
  LayoutAnimation,
  Platform,
  UIManager,
  AppState,
  KeyboardAvoidingView,
} from "react-native";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db, initDB } from "../../database/db";
import Svg, { Circle } from "react-native-svg";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";

import { WebView } from "react-native-webview"; // For PDF viewing
import * as Notifications from "expo-notifications";
import DatePickerModal from "../../components/DatePickerModal";
import {
  formatDateTimeForDisplay,
  formatSqliteDateTime,
  parseStoredDateTime,
} from "../../utils/formatDateTime";
import {
  FOCUS_COMPLETION_AFFIRMATIONS,
  SECTION_HEADER_AFFIRMATIONS,
  MOOD_HEADER_SUPPORT_AFFIRMATIONS,
  TASK_START_AFFIRMATIONS,
} from "../../utils/affirmations";
import {
  getRandomAffirmation,
  getSectionAffirmations,
} from "../../utils/getRandomAffirmation";
import {
  buildTimerSession,
  deserializeTimerState,
  FOCUS_TIMER_STATE_KEY,
  getElapsedSecondsFromTimestamp,
  getRemainingSecondsFromTimestamp,
  serializeTimerState,
} from "../../utils/timerHelpers";
import {
  buildFocusCompletionSpeechMessage,
  buildTaskCompletionSpeechMessage,
} from "../../utils/speechHelpers";
import { pickWelcomeMessage } from "../../utils/welcomeMessages";
import {
  sortTasksForSection,
  sortPinnedTasks,
} from "../../utils/sortTasks";
import {
  getNearestUpcomingSection,
  SECTION_ORDER,
} from "../../utils/sectionHelpers";
import { buildNextRecurringTask } from "../../utils/repeatTaskGenerator";
import {
  MONTHLY_REPEAT_TYPES,
  REPEAT_TYPES,
  WEEKDAY_OPTIONS,
  createRepeatGroupId,
  isRepeatingTask,
  normalizeRepeatType,
  normalizeTaskRepeatSettings,
  parseRepeatDays,
  serializeRepeatDays,
} from "../../utils/repeatTaskHelpers";
import { formatRepeatLabel } from "../../utils/repeatLabelFormatter";
import {
  cancelNotificationById,
  scheduleFocusCompletionNotification,
  sendTaskCompletionNotification,
  TASK_REMINDER_ACTIONS_CATEGORY_ID,
  TASK_REMINDER_ACTION_IDS,
} from "../../services/notificationService";
import {
  speakEncouragement,
  stopEncouragement,
} from "../../services/speechService";
import {
  getMoodMeta,
  getMoodScore,
  getMoodTypeFromAverageScore,
  MOOD_OPTIONS,
  MOOD_TYPES,
  pickMoodAffirmation,
  isValidMoodType,
} from "../../utils/moodHelpers";
import {
  buildMoodSummary,
  getRowsForCurrentMonth,
  getRowsForCurrentYear,
  getRowsForLastDays,
  buildMonthlyMoodCalendar,
  buildYearlyByMonth,
} from "../../utils/moodAnalytics";
import {
  buildTaskReminderPayload,
  buildTaskReminderNotificationContent,
  extractTaskNavigationPayload,
  findBestCurrentTask,
} from "../../utils/taskNavigationHelpers";
import {
  getTaskAvoidanceSignal,
  getAvoidanceReasonText,
} from "../../utils/taskSupportSignals";
import { getOverwhelmSuggestions } from "../../utils/overwhelmMode";
import {
  ENERGY_TASK_FILTERS,
  ENERGY_FILTER_EMPTY_MESSAGES,
  filterTasksByEnergyFilter,
  doesTaskMatchEnergyFilter,
} from "../../utils/energyTaskMatching";
import OverwhelmModeSheet from "../../components/task/OverwhelmModeSheet";
import Reanimated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  interpolateColor,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDailyProgress } from "../../hooks/useDailyProgress";

const COLORS = {
  bg: "#061414",
  card: "#0B1F1F",
  card2: "#123131",
  border: "#337a7a",
  accent: "#66b9b9",
  accentSoft: "#99bdbd",
  text: "#E8F4F4",
  muted: "#9FB5B5",
  success: "#7DFFB3",
  warning: "#FFD166",
  danger: "#FF7B7B",
};

const DEFAULT_PROFILE = {
  name: "",
  profileImage: "",
  vibe: "🌿",
  onboardingComplete: false,
};

const VIBE_OPTIONS = [
  { emoji: "💪", label: "Strong" },
  { emoji: "🌿", label: "Calm" },
  { emoji: "⚡", label: "Energetic" },
  { emoji: "🧠", label: "Focused" },
  { emoji: "🌊", label: "Balanced" },
];

const affirmations = SECTION_HEADER_AFFIRMATIONS;

const MENU_ITEMS = [
  { key: "profile", label: "Profile Details", icon: "👤" },
  { key: "special", label: "Special Tasks", icon: "⭐" },
  { key: "pending", label: "Pending Tasks", icon: "⏳" },
  { key: "completed", label: "Completed Tasks", icon: "✅" },
  { key: "calendar", label: "Calendar View", icon: "📅" },
  { key: "mood-tracker", label: "Mood Tracker", icon: "🧠" },
  { key: "settings", label: "Settings", icon: "⚙️" },
  { key: "about", label: "About", icon: "ℹ️" },
  { key: "support", label: "Support This Project", icon: "❤️" },
];

const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getYesterdayKey = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getDateKey(date);
};

const getLocalDateKey = (date = new Date()) => getDateKey(date);

const normalizeTodayPlanSection = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === TODAY_PLAN_SECTIONS.MORNING ||
    normalized === TODAY_PLAN_SECTIONS.WORK ||
    normalized === TODAY_PLAN_SECTIONS.EVENING
  ) {
    return normalized;
  }
  return null;
};

const getSectionForCurrentTime = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Work";
  return "Evening";
};

const hashSeed = (value = "") => {
  let hash = 0;
  const normalized = String(value);
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickStableBySeed = (items = [], seed = "") => {
  if (!Array.isArray(items) || !items.length) return "";
  const index = hashSeed(seed) % items.length;
  return items[index] || items[0] || "";
};

const FOCUS_AUTO_DISMISS_DELAY_MS = 10000;
const FOCUS_AUTO_DISMISS_COUNTDOWN_SECONDS = Math.max(
  1,
  Math.round(FOCUS_AUTO_DISMISS_DELAY_MS / 1000)
);
const HEADER_HIDE_SCROLL_THRESHOLD = 48;
const HEADER_SHOW_SCROLL_THRESHOLD = 12;
const HEADER_HIDE_OFFSET_FALLBACK = 172;
const HEADER_AFFIRMATION_MARQUEE_GAP = 56;
const HEADER_AFFIRMATION_SCROLL_SPEED_PX_PER_SEC = 24;
const HEADER_AFFIRMATION_MIN_DURATION_MS = 12000;
const HEADER_AFFIRMATION_MAX_DURATION_MS = 32000;
const WELCOME_VOICE_DELAY_MS = 900;
const NOTIFICATION_SPEECH_MIN_GAP_MS = 6000;
const SMART_TASK_BORDER_CYCLE_MS = 3600;
const SMART_TASK_SHIMMER_CYCLE_MS = 2600;
const SMART_TASK_SHIMMER_WIDTH = 52;
const TASK_HIGHLIGHT_DURATION_MS = 5000;
const TASK_HIGHLIGHT_PULSE_IN_MS = 900;
const TASK_HIGHLIGHT_PULSE_OUT_MS = 1000;
const TASK_NAVIGATION_MAX_RETRIES = 5;
const TASK_NAVIGATION_RETRY_DELAY_MS = 130;
const CURRENT_TASK_FAB_BREATH_MS = 2600;
const START_ASSIST_SHORT_FOCUS_SECONDS = 120;
const HEAVY_SUPPORT_MINIMUM_FOCUS_SECONDS = 300;
const REMINDER_ACTION_HISTORY_LIMIT = 30;
const REMINDER_ACTIONS = Object.freeze({
  OPENED: "opened",
  START_NOW: "start_now",
  SNOOZE_10: "snooze_10",
  SNOOZE_30: "snooze_30",
  MOVE_GENTLY: "move_gently",
  MAKE_SMALLER: "make_smaller",
});
const SNOOZE_AFFIRMATION_AUTO_CLOSE_DELAY_MS = 10000;
const SNOOZE_AFFIRMATION_MESSAGE =
  "No guilt. Your reminder will return gently. When you come back, one tiny step is enough.";
const TODAY_PLAN_NOTIFICATION_SETTINGS_KEY = "todayPlanReminderNotificationIds";
const LAST_TODAY_PLAN_PROMPT_DATE_KEY = "lastTodayPlanPromptDate";
const TODAY_PLAN_CELEBRATION_AUTO_CLOSE_DELAY_MS = 7000;
const TODAY_PLAN_SECTIONS = Object.freeze({
  MORNING: "morning",
  WORK: "work",
  EVENING: "evening",
});
const TODAY_PLAN_NOTIFICATION_SLOTS = Object.freeze([
  {
    section: TODAY_PLAN_SECTIONS.MORNING,
    hour: 8,
    minute: 0,
    title: "Plan your morning gently",
    body: "Pick one small task to begin the day. 🌿",
  },
  {
    section: TODAY_PLAN_SECTIONS.WORK,
    hour: 10,
    minute: 0,
    title: "Plan your work block",
    body: "One clear task can reduce mental load. ✨",
  },
  {
    section: TODAY_PLAN_SECTIONS.EVENING,
    hour: 18,
    minute: 0,
    title: "Plan your evening gently",
    body: "Choose one small thing to close the day. 🤍",
  },
]);
const EMPTY_TASK_SUPPORT_SIGNAL = Object.freeze({
  score: 0,
  reasons: [],
  level: "none",
});

const SECTION_SURFACE_CLASSES = {
  Pinned: "bg-[#0B1F1F]",
  Morning: "bg-[#111F1A]",
  Work: "bg-[#0B1F1F]",
  Evening: "bg-[#0A1D24]",
};

const SECTION_HEADER_CLASSES = {
  Pinned: "bg-[#123131]/90",
  Morning: "bg-[#182D22]/95",
  Work: "bg-[#123131]/90",
  Evening: "bg-[#132836]/95",
};

const REPEAT_TYPE_OPTIONS = [
  { key: REPEAT_TYPES.NONE, label: "None" },
  { key: REPEAT_TYPES.DAILY, label: "Daily" },
  { key: REPEAT_TYPES.WEEKLY, label: "Weekly" },
  { key: REPEAT_TYPES.MONTHLY, label: "Monthly" },
  { key: REPEAT_TYPES.YEARLY, label: "Yearly" },
];

const ENERGY_REQUIRED_OPTIONS = Object.freeze([
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]);

const FOCUS_REQUIRED_OPTIONS = Object.freeze([
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "deep", label: "Deep" },
]);

const TASK_CONTEXT_OPTIONS = Object.freeze([
  { value: "anywhere", label: "Anywhere" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "study", label: "Study" },
  { value: "outside", label: "Outside" },
]);

const ESTIMATED_MINUTES_OPTIONS = Object.freeze([2, 5, 10, 15, 25]);

const ENERGY_REQUIRED_META_LABELS = Object.freeze({
  low: "Low energy",
  medium: "Medium energy",
  high: "High energy",
});

const FOCUS_REQUIRED_META_LABELS = Object.freeze({
  light: "Light focus",
  medium: "Medium focus",
  deep: "Deep focus",
});

const TASK_CONTEXT_META_LABELS = Object.freeze({
  anywhere: "Anywhere",
  home: "Home",
  work: "Work",
  study: "Study",
  outside: "Outside",
});

const SECTION_AFFIRMATION_KEYS = ["Pinned", ...SECTION_ORDER];

const getDayBounds = (now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000 - 1;
  return { start, end };
};

const toTaskTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  return parsed.getTime();
};

const parseReminderActionHistory = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).slice(-REMINDER_ACTION_HISTORY_LIMIT);
  }
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(Boolean).slice(-REMINDER_ACTION_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
};

const toIsoStringOrEmpty = (value) => {
  if (!value || typeof value !== "string") return "";
  return value;
};

const isTaskDeletedOrArchived = (task) =>
  task?.deleted === true ||
  task?.deleted === 1 ||
  task?.isDeleted === true ||
  task?.isDeleted === 1 ||
  task?.archived === true ||
  task?.archived === 1 ||
  task?.isArchived === true ||
  task?.isArchived === 1;

const isTimestampWithinRange = (timestamp, start, end) =>
  timestamp !== null && timestamp >= start && timestamp <= end;

const isTaskScheduledForTodayOrCreatedToday = (task, start, end) => {
  const scheduledTimestamp = toTaskTimestamp(task?.scheduledTime);
  const createdTimestamp = toTaskTimestamp(task?.createdAt);

  const isScheduledForToday = isTimestampWithinRange(
    scheduledTimestamp,
    start,
    end
  );

  const isCreatedTodayWithoutSchedule =
    scheduledTimestamp === null &&
    isTimestampWithinRange(createdTimestamp, start, end);

  return isScheduledForToday || isCreatedTodayWithoutSchedule;
};

const hasPendingTodayTasks = (
  tasks = [],
  { now = new Date(), activeTaskId = null } = {}
) => {
  if (!Array.isArray(tasks) || !tasks.length) return false;
  const { start, end } = getDayBounds(now);

  return tasks.some((task) => {
    if (!task || task.completed || isTaskDeletedOrArchived(task)) return false;

    const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);
    const dueTimestamp = toTaskTimestamp(task.dueDate);
    const createdTimestamp = toTaskTimestamp(task.createdAt);
    const isScheduledForToday = isTimestampWithinRange(
      scheduledTimestamp,
      start,
      end
    );
    const isDueToday = isTimestampWithinRange(dueTimestamp, start, end);
    const isCreatedTodayWithoutSchedule =
      scheduledTimestamp === null &&
      isTimestampWithinRange(createdTimestamp, start, end);
    const isActiveTodayTask =
      activeTaskId !== null &&
      activeTaskId !== undefined &&
      Number(task.id) === Number(activeTaskId) &&
      (isScheduledForToday || isDueToday || isCreatedTodayWithoutSchedule);

    return (
      isScheduledForToday ||
      isDueToday ||
      isCreatedTodayWithoutSchedule ||
      isActiveTodayTask
    );
  });
};

const normalizeEnergyRequiredValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return "";
};

const normalizeFocusRequiredValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "light" || normalized === "medium" || normalized === "deep") {
    return normalized;
  }
  return "";
};

const normalizeTaskContextValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "anywhere" ||
    normalized === "home" ||
    normalized === "work" ||
    normalized === "study" ||
    normalized === "outside"
  ) {
    return normalized;
  }
  return "";
};

const normalizeEstimatedMinutesValue = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return Math.round(numericValue);
};

const getTaskEnergyMetadataPills = (task) => {
  if (!task) return [];

  const energyRequired = normalizeEnergyRequiredValue(task.energyRequired);
  const focusRequired = normalizeFocusRequiredValue(task.focusRequired);
  const taskContext = normalizeTaskContextValue(task.taskContext);
  const estimatedMinutes = normalizeEstimatedMinutesValue(
    task.estimatedMinutes ?? task.estimateMinutes
  );

  const pills = [];
  if (energyRequired) {
    pills.push(ENERGY_REQUIRED_META_LABELS[energyRequired]);
  }
  if (estimatedMinutes !== null) {
    pills.push(`${estimatedMinutes} min`);
  }
  if (focusRequired) {
    pills.push(FOCUS_REQUIRED_META_LABELS[focusRequired]);
  }
  if (taskContext) {
    pills.push(TASK_CONTEXT_META_LABELS[taskContext]);
  }

  return pills.filter(Boolean);
};

const getPastPendingTasks = (tasks = [], now = new Date()) => {
  if (!Array.isArray(tasks) || !tasks.length) return [];
  const { start } = getDayBounds(now);

  return tasks
    .filter((task) => {
      if (!task || task.completed || isTaskDeletedOrArchived(task)) return false;
      const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);
      return scheduledTimestamp !== null && scheduledTimestamp < start;
    })
    .sort((a, b) => {
      const aTime = toTaskTimestamp(a.scheduledTime) || 0;
      const bTime = toTaskTimestamp(b.scheduledTime) || 0;
      return bTime - aTime;
    });
};

//*************main component function********* */
export default function Home() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState([
    { id: 1, title: "Drink water 💧", section: "Morning", completed: false, notificationId: [], isPinned: false, moodType: "" },
    { id: 2, title: "Goto office 💼", section: "Work", completed: false, notificationId: [], isPinned: false, moodType: "" },
    { id: 3, title: "Walk 10 minutes 🚶", section: "Evening", completed: false, notificationId: [], isPinned: false, moodType: "" },
  ]);
  const [totalFocusTime, setTotalFocusTime] = useState(0); // seconds

  const [focusTime, setFocusTime] = useState(0); // in seconds
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFocusCompleted, setIsFocusCompleted] = useState(false);
  const [focusCompletionCountdown, setFocusCompletionCountdown] = useState(0);
  const [focusStartTimestamp, setFocusStartTimestamp] = useState(null);
  const [focusEndTimestamp, setFocusEndTimestamp] = useState(null);

  const [activeTaskId, setActiveTaskId] = useState(null);

  const [taskDurations, setTaskDurations] = useState({});
  const [currentDuration, setCurrentDuration] = useState(1500);

  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [customHour, setCustomHour] = useState("");
  const [customMinute, setCustomMinute] = useState("");
  const [currentTaskForTime, setCurrentTaskForTime] = useState(null);
  const [lastCompletedTaskId, setLastCompletedTaskId] = useState(null);
  const [showDurationError, setShowDurationError] = useState(null); // store taskId

  const [celebration, setCelebration] = useState({
    visible: false,
    message: "",
    emoji: "🎉",
  });

  const [editingTask, setEditingTask] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  // const [taskTitle, setTaskTitle] = useState(""); 

  const [deleteTask, setDeleteTask] = useState(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [lastDeletedTask, setLastDeletedTask] = useState(null);
  const [undoTimer, setUndoTimer] = useState(10);

  const [editingSection, setEditingSection] = useState(null);
  const [sectionStartTime, setSectionStartTime] = useState("");
  const [sectionEndTime, setSectionEndTime] = useState("");

  const [sectionTimeModalVisible, setSectionTimeModalVisible] = useState(false);
  const [datePickerModal, setDatePickerModal] = useState({
    visible: false,
    target: null,
    section: null,
    title: "Schedule",
    value: null,
  });
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskAttachment, setTaskAttachment] = useState("");
  const [detailsHeight, setDetailsHeight] = useState(80);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [firstStepOnlyTaskId, setFirstStepOnlyTaskId] = useState(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState(null);
  const [currentFocusedTaskId, setCurrentFocusedTaskId] = useState(null);
  const [pendingNotificationTaskTarget, setPendingNotificationTaskTarget] =
    useState(null);
  const [snoozeAffirmationModal, setSnoozeAffirmationModal] = useState({
    visible: false,
    taskId: null,
    minutes: null,
    title: "",
    message: "",
  });
  const [isStartAssistVisible, setIsStartAssistVisible] = useState(false);
  const [startAssistTaskId, setStartAssistTaskId] = useState(null);
  const [startAssistMode, setStartAssistMode] = useState("main");
  const [startAssistFirstActionDraft, setStartAssistFirstActionDraft] =
    useState("");
  const [startAssistBreakdownDraft, setStartAssistBreakdownDraft] =
    useState("");
  const [startAssistMinimumVersionDraft, setStartAssistMinimumVersionDraft] =
    useState("");
  const [startAssistEditHint, setStartAssistEditHint] = useState("");
  const [editingSubtaskTaskId, setEditingSubtaskTaskId] = useState(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editingSubtaskDraft, setEditingSubtaskDraft] = useState("");
  const [draggingSubtaskKey, setDraggingSubtaskKey] = useState("");
  const [isSubtaskReordering, setIsSubtaskReordering] = useState(false);
  const [isPinnedSectionExpanded, setIsPinnedSectionExpanded] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);
  const [activeEnergyFilter, setActiveEnergyFilter] = useState(null);
  const [timeError, setTimeError] = useState(false);
  const [sectionTimes, setSectionTimes] = useState({
    Morning: { start: "", end: "" },
    Work: { start: "", end: "" },
    Evening: { start: "", end: "" },
  });

  const [timeAdjusted, setTimeAdjusted] = useState(false);

  const [attachmentUri, setAttachmentUri] = useState(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [viewerVisible, setViewerVisible] = useState(false);
  const [currentFile, setCurrentFile] = useState({ uri: null, type: null });
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [profileDraftName, setProfileDraftName] = useState("");
  const [profileDraftVibe, setProfileDraftVibe] = useState(DEFAULT_PROFILE.vibe);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activePage, setActivePage] = useState(null);
  const [moodTrackerView, setMoodTrackerView] = useState("daily");
  const [dailyMoodEntries, setDailyMoodEntries] = useState([]);
  const [dailyMoodType, setDailyMoodType] = useState("");
  const [dailyMoodNote, setDailyMoodNote] = useState("");
  const [isDailyMoodExpanded, setIsDailyMoodExpanded] = useState(false);
  const [smartTaskButtonWidth, setSmartTaskButtonWidth] = useState(0);
  const [dismissedDailyMoodPromptDate, setDismissedDailyMoodPromptDate] =
    useState("");
  const [taskMoodPromptVisible, setTaskMoodPromptVisible] = useState(false);
  const [taskMoodPromptTaskId, setTaskMoodPromptTaskId] = useState(null);
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [recoveryPendingTasks, setRecoveryPendingTasks] = useState([]);
  const [recoveryEditingTaskId, setRecoveryEditingTaskId] = useState(null);
  const [recoveryDraftDateTime, setRecoveryDraftDateTime] = useState("");
  const [recoveryDraftSection, setRecoveryDraftSection] = useState("Morning");
  const [recoverySavingTaskId, setRecoverySavingTaskId] = useState(null);
  const [recoverySuccessMessage, setRecoverySuccessMessage] = useState("");
  const [recoveryFabPromptVisible, setRecoveryFabPromptVisible] = useState(false);
  const [tasksHydrated, setTasksHydrated] = useState(false);
  const [todayPlanSheetVisible, setTodayPlanSheetVisible] = useState(false);
  const [todayPlanNotificationSection, setTodayPlanNotificationSection] =
    useState(null);
  const [pendingTodayPlanSheet, setPendingTodayPlanSheet] = useState({
    open: false,
    section: null,
  });
  const [todayPlanCreateContextActive, setTodayPlanCreateContextActive] =
    useState(false);
  const [lastTodayPlanPromptDate, setLastTodayPlanPromptDate] = useState("");
  const [todayPlanCelebration, setTodayPlanCelebration] = useState({
    visible: false,
    title: "",
    message: "",
    buttonLabel: "Okay",
  });
  const [isOverwhelmModeVisible, setIsOverwhelmModeVisible] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [headerContainerHeight, setHeaderContainerHeight] = useState(
    HEADER_HIDE_OFFSET_FALLBACK
  );
  const [currentAffirmation, setCurrentAffirmation] = useState(affirmations[0]);
  const [headerAffirmationViewportWidth, setHeaderAffirmationViewportWidth] =
    useState(0);
  const [headerAffirmationTextWidth, setHeaderAffirmationTextWidth] =
    useState(0);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [startAssistReadAloudEnabled, setStartAssistReadAloudEnabled] =
    useState(false);
  const [startAssistVoiceHint, setStartAssistVoiceHint] = useState("");
  const [sectionAffirmations, setSectionAffirmations] = useState(() =>
    getSectionAffirmations(SECTION_AFFIRMATION_KEYS, SECTION_HEADER_AFFIRMATIONS)
  );
  const [dailyStats, setDailyStats] = useState({
    date: getDateKey(),
    completedTasks: 0,
    totalFocusTime: 0,
    streakValue: 0,
  });
  const [productivityStats, setProductivityStats] = useState({
    currentStreak: 0,
    bestStreak: 0,
    lifetimeFocusTime: 0,
    lifetimeCompletedTasks: 0,
    lastActiveDate: getDateKey(),
    lastQualifiedDate: "",
    showStreak: true,
  });
  const [specialTasks, setSpecialTasks] = useState([]);
  const [specialTaskTitle, setSpecialTaskTitle] = useState("");
  const [specialTaskNote, setSpecialTaskNote] = useState("");
  const footerSafeBottom = Math.max(insets.bottom, 8);
  const footerHeight = 36;
  const recoveryFabSize = 44;
  const addTaskFabApproxHeight = 56;
  const floatingBaseBottom = footerSafeBottom + footerHeight + 14;
  const recoveryFabBottom = floatingBaseBottom;
  const addTaskFabBottom = recoveryFabBottom + recoveryFabSize + 8;
  const focusFabBottom = addTaskFabBottom + addTaskFabApproxHeight + 10;
  const recoveryPromptBottom = recoveryFabBottom + 2;
  const maxFloatingStackBottom = Math.max(
    focusFabBottom + 48,
    addTaskFabBottom + addTaskFabApproxHeight,
    recoveryFabBottom + recoveryFabSize
  );
  const listBottomPadding =
    maxFloatingStackBottom + 44;
  const modalBottomPadding = Math.max(insets.bottom, 8) + 8;
  const modalKeyboardOffset = Platform.OS === "ios" ? Math.max(insets.top, 10) : 0;

  const syncHeaderCollapsedState = useCallback((collapsed) => {
    setIsHeaderCollapsed((prev) => (prev === collapsed ? prev : collapsed));
  }, []);
  const shouldScrollHeaderAffirmation = useMemo(() => {
    if (!headerAffirmationViewportWidth || !headerAffirmationTextWidth) {
      return false;
    }
    return headerAffirmationTextWidth > headerAffirmationViewportWidth - 4;
  }, [headerAffirmationTextWidth, headerAffirmationViewportWidth]);

  const handleHeaderAffirmationViewportLayout = useCallback((event) => {
    const width = Math.max(0, Math.ceil(event?.nativeEvent?.layout?.width || 0));
    if (!width) return;
    setHeaderAffirmationViewportWidth((prev) =>
      Math.abs(prev - width) < 2 ? prev : width
    );
  }, []);

  const handleHeaderAffirmationTextLayout = useCallback((event) => {
    const width = Math.max(0, Math.ceil(event?.nativeEvent?.layout?.width || 0));
    if (!width) return;
    setHeaderAffirmationTextWidth((prev) =>
      Math.abs(prev - width) < 2 ? prev : width
    );
  }, []);

  //******Vriables */

  // ✅ Daily Progress Calculations
  const {
    completedTasks: completedTodayTasks,
    pendingTasks: pendingTodayTasks,
    totalTasks: totalTodayTasks,
    progressPercentage,
  } = useDailyProgress(tasks);

  const dailyProgressCaption = useMemo(() => {
    if (totalTodayTasks === 0) {
      return "Your day is ready 🌅";
    }

    if (completedTodayTasks === 0) {
      const firstWinMessages = [
        "Ready for your first win today ✨",
        "Small progress still matters 🌱",
        "One tiny task can start momentum 🧠",
      ];
      return firstWinMessages[pendingTodayTasks % firstWinMessages.length];
    }

    if (progressPercentage >= 70) {
      return "Momentum building nicely 🚀";
    }

    if (progressPercentage >= 40) {
      return "Focused progress today 🧠";
    }

    return "Consistency grows quietly 🌱";
  }, [
    completedTodayTasks,
    pendingTodayTasks,
    progressPercentage,
    totalTodayTasks,
  ]);

  const dailyProgressSummary =
    totalTodayTasks === 0
      ? "Start with one small step ✨"
      : completedTodayTasks === 0
        ? "Ready for your first win today ✨"
        : `${completedTodayTasks} of ${totalTodayTasks} tasks completed ✨`;
  const modalScale = useRef(new Animated.Value(0.8)).current;
  const todayDateKey = dailyStats?.date || getDateKey();
  const hasPendingTodayTasksFlag = useMemo(
    () => hasPendingTodayTasks(tasks, { now: new Date(), activeTaskId }),
    [activeTaskId, tasks]
  );
  const todayPlanPastPendingTasks = useMemo(
    () => getPastPendingTasks(tasks, new Date()),
    [tasks]
  );
  const todayPlanPreviewPastTasks = useMemo(
    () => todayPlanPastPendingTasks.slice(0, 5),
    [todayPlanPastPendingTasks]
  );

  const todayDailyMoodEntry = useMemo(
    () => dailyMoodEntries.find((entry) => entry.date === todayDateKey) || null,
    [dailyMoodEntries, todayDateKey]
  );

  const todayTaskMoodSummary = useMemo(() => {
    const [year, month, day] = todayDateKey.split("-").map(Number);
    const dateRef = new Date(year, (month || 1) - 1, day || 1);
    const { start, end } = getDayBounds(dateRef);

    let scoreTotal = 0;
    let scoreCount = 0;
    let frustratedCount = 0;
    let sadCount = 0;

    tasks.forEach((task) => {
      if (!isTaskScheduledForTodayOrCreatedToday(task, start, end)) return;
      if (!isValidMoodType(task?.moodType)) return;

      const score = getMoodScore(task.moodType);
      if (score === null) return;

      scoreTotal += score;
      scoreCount += 1;
      if (task.moodType === MOOD_TYPES.FRUSTRATED) frustratedCount += 1;
      if (task.moodType === MOOD_TYPES.SAD) sadCount += 1;
    });

    const averageScore = scoreCount ? scoreTotal / scoreCount : null;
    const averageMoodType = getMoodTypeFromAverageScore(averageScore);

    return {
      scoreCount,
      averageScore,
      averageMoodType,
      averageMoodMeta: getMoodMeta(averageMoodType),
      frustratedCount,
      sadCount,
    };
  }, [tasks, todayDateKey]);

  const weeklyMoodRows = useMemo(
    () => getRowsForLastDays(dailyMoodEntries, 7, new Date()),
    [dailyMoodEntries]
  );
  const monthlyMoodRows = useMemo(
    () => getRowsForCurrentMonth(dailyMoodEntries, new Date()),
    [dailyMoodEntries]
  );
  const yearlyMoodRows = useMemo(
    () => getRowsForCurrentYear(dailyMoodEntries, new Date()),
    [dailyMoodEntries]
  );

  const weeklyMoodSummary = useMemo(
    () => buildMoodSummary(weeklyMoodRows),
    [weeklyMoodRows]
  );
  const monthlyMoodSummary = useMemo(
    () => buildMoodSummary(monthlyMoodRows),
    [monthlyMoodRows]
  );
  const yearlyMoodSummary = useMemo(
    () => buildMoodSummary(yearlyMoodRows),
    [yearlyMoodRows]
  );
  const monthlyMoodCalendar = useMemo(
    () => buildMonthlyMoodCalendar(monthlyMoodRows, new Date()),
    [monthlyMoodRows]
  );
  const yearlyMoodByMonth = useMemo(
    () => buildYearlyByMonth(yearlyMoodRows, new Date()),
    [yearlyMoodRows]
  );

  const effectiveTodayMoodType =
    todayDailyMoodEntry?.moodType || todayTaskMoodSummary.averageMoodType || null;
  const heavierMoodDaysInWeek = useMemo(
    () =>
      weeklyMoodRows.filter(
        (row) =>
          row.moodType === MOOD_TYPES.FRUSTRATED || row.moodType === MOOD_TYPES.SAD
      ).length,
    [weeklyMoodRows]
  );
  const dailyMoodAffirmation = useMemo(
    () =>
      pickMoodAffirmation({
        context: "daily",
        moodType: effectiveTodayMoodType || MOOD_TYPES.NEUTRAL,
        seed: `${todayDateKey}:${completedTodayTasks}:${pendingTodayTasks}`,
        isHeavierDay:
          todayTaskMoodSummary.frustratedCount >= 2 || heavierMoodDaysInWeek >= 3,
      }),
    [
      completedTodayTasks,
      effectiveTodayMoodType,
      heavierMoodDaysInWeek,
      pendingTodayTasks,
      todayDateKey,
      todayTaskMoodSummary.frustratedCount,
    ]
  );

  const moodPromptVisibleInBanner =
    !todayDailyMoodEntry &&
    dismissedDailyMoodPromptDate !== todayDateKey &&
    activePage !== "mood-tracker";
  const taskMoodPromptTask = useMemo(
    () => tasks.find((task) => task.id === taskMoodPromptTaskId) || null,
    [taskMoodPromptTaskId, tasks]
  );
  const weeklyMoodAffirmation = useMemo(
    () =>
      pickMoodAffirmation({
        context: "weekly",
        moodType: weeklyMoodSummary.averageMoodType || MOOD_TYPES.NEUTRAL,
        seed: `${todayDateKey}:weekly:${weeklyMoodSummary.totalEntries || 0}`,
      }),
    [todayDateKey, weeklyMoodSummary.averageMoodType, weeklyMoodSummary.totalEntries]
  );
  const monthlyMoodAffirmation = useMemo(
    () =>
      pickMoodAffirmation({
        context: "monthly",
        moodType: monthlyMoodSummary.averageMoodType || MOOD_TYPES.NEUTRAL,
        seed: `${todayDateKey}:monthly:${monthlyMoodSummary.totalEntries || 0}`,
      }),
    [monthlyMoodSummary.averageMoodType, monthlyMoodSummary.totalEntries, todayDateKey]
  );
  const yearlyMoodAffirmation = useMemo(
    () =>
      pickMoodAffirmation({
        context: "yearly",
        moodType: yearlyMoodSummary.averageMoodType || MOOD_TYPES.NEUTRAL,
        seed: `${todayDateKey}:yearly:${yearlyMoodSummary.totalEntries || 0}`,
      }),
    [todayDateKey, yearlyMoodSummary.averageMoodType, yearlyMoodSummary.totalEntries]
  );

  const effectiveMoodTypeForDailyProgress = useMemo(
    () =>
      todayDailyMoodEntry?.moodType ||
      dailyMoodType ||
      todayTaskMoodSummary.averageMoodType ||
      null,
    [dailyMoodType, todayDailyMoodEntry?.moodType, todayTaskMoodSummary.averageMoodType]
  );
  const effectiveMoodMetaForDailyProgress = getMoodMeta(
    effectiveMoodTypeForDailyProgress
  );
  const moodHeaderLabel = effectiveMoodMetaForDailyProgress?.label || "Not logged yet";
  const moodHeaderEmoji = effectiveMoodMetaForDailyProgress?.emoji || "🧠";

  const moodSupportBucketKey = useMemo(() => {
    if (!effectiveMoodTypeForDailyProgress) return "";
    if (effectiveMoodTypeForDailyProgress === MOOD_TYPES.FRUSTRATED) {
      return "frustrated";
    }
    if (effectiveMoodTypeForDailyProgress === MOOD_TYPES.SAD) {
      return "sad";
    }
    const normalized = String(effectiveMoodTypeForDailyProgress).toLowerCase();
    if (normalized.includes("overwhelm")) return "overwhelmed";
    if (normalized.includes("anx")) return "anxious";
    if (normalized.includes("low_energy")) return "low_energy";
    return "";
  }, [effectiveMoodTypeForDailyProgress]);

  const collapsedMoodSupportMessage = useMemo(() => {
    if (!moodSupportBucketKey) return "";
    const source = MOOD_HEADER_SUPPORT_AFFIRMATIONS[moodSupportBucketKey] || [];
    return pickStableBySeed(
      source,
      `${todayDateKey}:${moodSupportBucketKey}:${completedTodayTasks}:${pendingTodayTasks}`
    );
  }, [
    completedTodayTasks,
    moodSupportBucketKey,
    pendingTodayTasks,
    todayDateKey,
  ]);

  const pendingActionableTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (!task || task.completed) return false;
        if (task.isPinned) return true;
        return SECTION_ORDER.includes(task.section);
      }),
    [tasks]
  );

  const currentTaskQuickTarget = useMemo(
    () =>
      findBestCurrentTask(tasks, {
        activeTaskId,
      }),
    [activeTaskId, tasks]
  );
  const currentTaskQuickTask = currentTaskQuickTarget?.task || null;
  const currentTaskQuickTaskId = currentTaskQuickTarget?.taskId || null;
  const currentTaskQuickReason = currentTaskQuickTarget?.reason || "";
  const startAssistTask = useMemo(
    () => tasks.find((task) => task.id === startAssistTaskId) || null,
    [startAssistTaskId, tasks]
  );
  const startAssistFirstIncompleteSubtask = useMemo(() => {
    if (!startAssistTask) return null;
    const subtasks = Array.isArray(startAssistTask.subtasks)
      ? startAssistTask.subtasks
      : [];
    return subtasks.find((subtask) => !subtask?.completed) || null;
  }, [startAssistTask]);
  const startAssistFirstStepPreview = useMemo(
    () =>
      startAssistFirstIncompleteSubtask?.title ||
      (startAssistTask?.firstAction || "").trim() ||
      "Choose one tiny first move.",
    [startAssistFirstIncompleteSubtask, startAssistTask?.firstAction]
  );
  const cleanSpeechSnippet = useCallback((value = "", maxChars = 120) => {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, Math.max(24, maxChars - 1)).trim()}...`;
  }, []);

  const smartActionTask = useMemo(() => {
    const activeTask = activeTaskId
      ? tasks.find((task) => task.id === activeTaskId && !task.completed)
      : null;
    if (activeTask) {
      return {
        task: activeTask,
        ctaLabel: "Continue",
        icon: "⚡",
      };
    }

    if (!pendingActionableTasks.length) return null;

    const nowTime = Date.now();
    const scheduledFuture = pendingActionableTasks
      .map((task) => ({
        task,
        timestamp: toTaskTimestamp(task.scheduledTime),
      }))
      .filter((item) => Number.isFinite(item.timestamp) && item.timestamp >= nowTime)
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return (a.task.id || 0) - (b.task.id || 0);
      })[0]?.task;

    if (scheduledFuture) {
      return {
        task: scheduledFuture,
        ctaLabel: "Upcoming",
        icon: "▶",
      };
    }

    const unscheduledFallback = [...pendingActionableTasks].sort((a, b) => {
      const aTime = toTaskTimestamp(a.scheduledTime);
      const bTime = toTaskTimestamp(b.scheduledTime);
      if (aTime === null && bTime === null) {
        return (b.id || 0) - (a.id || 0);
      }
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return bTime - aTime;
    })[0];

    return unscheduledFallback
      ? {
          task: unscheduledFallback,
          ctaLabel: "Start",
          icon: "🚀",
        }
      : null;
  }, [activeTaskId, pendingActionableTasks, tasks]);

  const smartTaskInitiationAffirmation = useMemo(() => {
    if (!smartActionTask?.task) return "";
    return pickStableBySeed(
      TASK_START_AFFIRMATIONS,
      `${todayDateKey}:${smartActionTask.task.id}:${pendingTodayTasks}:${completedTodayTasks}`
    );
  }, [completedTodayTasks, pendingTodayTasks, smartActionTask, todayDateKey]);
  const smartActionTaskId = smartActionTask?.task?.id || null;

  const sectionTasksByName = useMemo(() => {
    const groupedTasks = SECTION_ORDER.reduce((acc, sectionName) => {
      acc[sectionName] = [];
      return acc;
    }, {});

    tasks.forEach((task) => {
      if (task.isPinned) return;
      if (groupedTasks[task.section]) {
        groupedTasks[task.section].push(task);
      }
    });

    return groupedTasks;
  }, [tasks]);

  const sectionTasksMap = useMemo(() => {
    const now = new Date();
    return SECTION_ORDER.reduce((acc, sectionName) => {
      acc[sectionName] = sortTasksForSection(
        sectionTasksByName[sectionName] || [],
        sectionName,
        now
      );
      return acc;
    }, {});
  }, [sectionTasksByName]);

  const sectionHeaderStats = useMemo(() => {
    const now = new Date();
    const nowTime = now.getTime();
    const { start, end } = getDayBounds(now);

    return SECTION_ORDER.reduce((acc, sectionName) => {
      const sectionTasks = sectionTasksByName[sectionName] || [];
      const pendingTasks = [];
      const completedTasks = [];

      sectionTasks.forEach((task) => {
        if (task.completed) {
          completedTasks.push(task);
          return;
        }

        pendingTasks.push(task);
      });

      const todayPendingCount = pendingTasks.reduce((count, task) => {
        const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);
        return isTimestampWithinRange(scheduledTimestamp, start, end)
          ? count + 1
          : count;
      }, 0);

      const todayCompletedCount = completedTasks.reduce((count, task) => {
        const completedTimestamp = toTaskTimestamp(task.completedAt);
        return isTimestampWithinRange(completedTimestamp, start, end)
          ? count + 1
          : count;
      }, 0);

      const nearestUpcomingTaskTitle =
        pendingTasks
          .map((task) => ({
            task,
            timestamp: toTaskTimestamp(task.scheduledTime),
          }))
          .filter((item) => item.timestamp !== null && item.timestamp >= nowTime)
          .sort((a, b) => {
            if (a.timestamp !== b.timestamp) {
              return a.timestamp - b.timestamp;
            }
            return (a.task.id ?? 0) - (b.task.id ?? 0);
          })[0]?.task?.title ?? null;

      acc[sectionName] = {
        pendingCount: pendingTasks.length,
        todayPendingCount,
        todayCompletedCount,
        nearestUpcomingTaskTitle,
      };
      return acc;
    }, {});
  }, [sectionTasksByName]);

  const nearestUpcomingSection = useMemo(
    () => getNearestUpcomingSection(tasks),
    [tasks]
  );

  const pinnedTasks = useMemo(() => sortPinnedTasks(tasks), [tasks]);
  const pinnedTaskCount = pinnedTasks.length;
  const pinnedHeaderStats = useMemo(() => {
    const now = new Date();
    const nowTime = now.getTime();
    const { start, end } = getDayBounds(now);

    let todayPendingCount = 0;
    let nearestUpcomingTaskTitle = null;
    let nearestUpcomingTime = Number.POSITIVE_INFINITY;

    pinnedTasks.forEach((task) => {
      const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);

      if (isTimestampWithinRange(scheduledTimestamp, start, end)) {
        todayPendingCount += 1;
      }

      if (
        scheduledTimestamp !== null &&
        scheduledTimestamp >= nowTime &&
        scheduledTimestamp < nearestUpcomingTime
      ) {
        nearestUpcomingTime = scheduledTimestamp;
        nearestUpcomingTaskTitle = task.title || null;
      }
    });

    return {
      pendingCount: pinnedTaskCount,
      todayPendingCount,
      todayCompletedCount: 0,
      nearestUpcomingTaskTitle,
    };
  }, [pinnedTaskCount, pinnedTasks]);

  const repeatLabelByTaskId = useMemo(() => {
    const labels = {};

    tasks.forEach((task) => {
      const label = formatRepeatLabel(task);
      if (label) {
        labels[task.id] = label;
      }
    });

    return labels;
  }, [tasks]);

  const taskSupportSignalById = useMemo(() => {
    const now = new Date();
    const nextMap = {};

    tasks.forEach((task) => {
      if (!task || typeof task.id !== "number") return;
      nextMap[task.id] = getTaskAvoidanceSignal(task, now);
    });

    return nextMap;
  }, [tasks]);

  const handleEnergyFilterPress = useCallback((filter) => {
    setActiveEnergyFilter((current) => (current === filter ? null : filter));
  }, []);

  const energyFilteredSectionTasksMap = useMemo(() => {
    if (!activeEnergyFilter) return sectionTasksMap;
    const now = new Date();

    return SECTION_ORDER.reduce((acc, sectionName) => {
      acc[sectionName] = filterTasksByEnergyFilter(
        sectionTasksMap[sectionName] || [],
        activeEnergyFilter,
        now,
        {
          taskSupportSignalById,
          keepInputOrderForTodayOnly: true,
        }
      );
      return acc;
    }, {});
  }, [activeEnergyFilter, sectionTasksMap, taskSupportSignalById]);

  const energyFilteredPinnedTasks = useMemo(() => {
    if (!activeEnergyFilter) return pinnedTasks;
    return filterTasksByEnergyFilter(pinnedTasks, activeEnergyFilter, new Date(), {
      taskSupportSignalById,
      keepInputOrderForTodayOnly: true,
    });
  }, [activeEnergyFilter, pinnedTasks, taskSupportSignalById]);

  const visibleSectionTasksMap = activeEnergyFilter
    ? energyFilteredSectionTasksMap
    : sectionTasksMap;
  const visiblePinnedTasks = activeEnergyFilter ? energyFilteredPinnedTasks : pinnedTasks;

  const energyFilteredSectionHeaderStats = useMemo(() => {
    if (!activeEnergyFilter) return null;
    const now = new Date();
    const nowTime = now.getTime();
    const { start, end } = getDayBounds(now);

    return SECTION_ORDER.reduce((acc, sectionName) => {
      const sectionTasks = energyFilteredSectionTasksMap[sectionName] || [];
      const todayPendingCount = sectionTasks.reduce((count, task) => {
        const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);
        return isTimestampWithinRange(scheduledTimestamp, start, end)
          ? count + 1
          : count;
      }, 0);

      const nearestUpcomingTaskTitle =
        sectionTasks
          .map((task) => ({
            task,
            timestamp: toTaskTimestamp(task.scheduledTime),
          }))
          .filter((item) => item.timestamp !== null && item.timestamp >= nowTime)
          .sort((a, b) => {
            if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            return (a.task.id ?? 0) - (b.task.id ?? 0);
          })[0]?.task?.title ?? null;

      acc[sectionName] = {
        pendingCount: sectionTasks.length,
        todayPendingCount,
        todayCompletedCount: 0,
        nearestUpcomingTaskTitle,
      };
      return acc;
    }, {});
  }, [activeEnergyFilter, energyFilteredSectionTasksMap]);

  const energyFilteredPinnedHeaderStats = useMemo(() => {
    if (!activeEnergyFilter) return null;
    const now = new Date();
    const nowTime = now.getTime();
    const { start, end } = getDayBounds(now);

    let todayPendingCount = 0;
    let nearestUpcomingTaskTitle = null;
    let nearestUpcomingTime = Number.POSITIVE_INFINITY;

    energyFilteredPinnedTasks.forEach((task) => {
      const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);
      if (isTimestampWithinRange(scheduledTimestamp, start, end)) {
        todayPendingCount += 1;
      }

      if (
        scheduledTimestamp !== null &&
        scheduledTimestamp >= nowTime &&
        scheduledTimestamp < nearestUpcomingTime
      ) {
        nearestUpcomingTime = scheduledTimestamp;
        nearestUpcomingTaskTitle = task.title || null;
      }
    });

    return {
      pendingCount: energyFilteredPinnedTasks.length,
      todayPendingCount,
      todayCompletedCount: 0,
      nearestUpcomingTaskTitle,
    };
  }, [activeEnergyFilter, energyFilteredPinnedTasks]);

  const activeEnergyFilterEmptyMessage = activeEnergyFilter
    ? ENERGY_FILTER_EMPTY_MESSAGES[activeEnergyFilter] || ""
    : "";

  const energyFilterMoodSuggestion = useMemo(() => {
    if (
      effectiveMoodTypeForDailyProgress === MOOD_TYPES.FRUSTRATED ||
      effectiveMoodTypeForDailyProgress === MOOD_TYPES.SAD
    ) {
      return "Pick one tiny task to reduce pressure.";
    }
    if (
      effectiveMoodTypeForDailyProgress === MOOD_TYPES.HAPPY ||
      effectiveMoodTypeForDailyProgress === MOOD_TYPES.VERY_HAPPY
    ) {
      return "This may be a good time for a focus task.";
    }
    if (effectiveMoodTypeForDailyProgress === MOOD_TYPES.NEUTRAL) {
      return "Try a low-energy task first.";
    }
    return "Match tasks to your energy.";
  }, [effectiveMoodTypeForDailyProgress]);

  const isTaskMatchingActiveEnergyFilter = useCallback(
    (task, now = new Date()) => {
      if (!activeEnergyFilter) return true;
      return doesTaskMatchEnergyFilter(task, activeEnergyFilter, now, {
        taskSupportSignalById,
      });
    },
    [activeEnergyFilter, taskSupportSignalById]
  );

  const overwhelmSuggestions = useMemo(
    () => getOverwhelmSuggestions(tasks, new Date()),
    [tasks]
  );

  const overwhelmMoodMessage = useMemo(() => {
    if (
      dailyMoodType === MOOD_TYPES.FRUSTRATED ||
      dailyMoodType === MOOD_TYPES.SAD
    ) {
      return "One tiny task can reduce pressure.";
    }

    if (dailyMoodType === MOOD_TYPES.NEUTRAL) {
      return "Try the smallest task first.";
    }

    if (
      dailyMoodType === MOOD_TYPES.HAPPY ||
      dailyMoodType === MOOD_TYPES.VERY_HAPPY
    ) {
      return "You may be ready for one important task.";
    }

    return "";
  }, [dailyMoodType]);

  // 1. Prepare the JSON string for the DB
  const subtasksJSON = JSON.stringify([]); 

  //*****Focus time */

  // Convert seconds → readable format
  const hours = Math.floor(focusTime / 3600);
  const minutes = Math.floor((focusTime % 3600) / 60);
  const seconds = focusTime % 60;

  const format = (n) => n.toString().padStart(2, "0");

  const focusTimeText = `⏱ ${format(hours)}:${format(minutes)}:${format(seconds)} `;

  const radius = 100;
  const circumference = 2 * Math.PI * radius;

  // Define session duration (25 min = 1500 sec)
  const totalDuration = 1500;

  const totalHours = Math.floor(totalFocusTime / 3600);
  const totalMinutes = Math.floor((totalFocusTime % 3600) / 60);
  const totalSeconds = totalFocusTime % 60;

  const totalFormat = (n) => n.toString().padStart(2, "0");

  const totalFocusText = `⏱ ${totalFormat(totalHours)}:${totalFormat(totalMinutes)}:${totalFormat(totalSeconds)} 🎯`;

  // progress (0 → 1)
  // const progress = Math.min(focusTime / totalDuration, 1);
  const progress = Math.min(focusTime / currentDuration, 1);

  // stroke offset
  const strokeDashoffset = circumference * (1 - progress);

  // 🔥 UPDATED TIMER PALETTE
  let ringColor = COLORS.accent; // Calm Cyan
  if (progress >= 0.5) {
    ringColor = COLORS.success; // Soft Mint Success
  } else if (progress >= 0.25) {
    ringColor = "#5EEAD4"; // Teal Cyan
  }

  const dailyProgressValue = useSharedValue(progressPercentage);
  const [animatedProgressPercent, setAnimatedProgressPercent] = useState(
    Math.round(progressPercentage)
  );
  const dailyProgressBarStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, dailyProgressValue.value))}%`,
  }));

  useAnimatedReaction(
    () => Math.round(dailyProgressValue.value),
    (next, prev) => {
      if (next !== prev) {
        runOnJS(setAnimatedProgressPercent)(next);
      }
    },
    []
  );
  const recoverySheetProgress = useSharedValue(0);
  const todayPlanSheetProgress = useSharedValue(0);
  const recoverySuccessPulse = useSharedValue(0);
  const headerCollapsedProgress = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const floatingMenuOpacity = useSharedValue(0);
  const lastHomeScrollY = useSharedValue(0);
  const headerAffirmationTranslateX = useSharedValue(0);
  const smartTaskBorderPhase = useSharedValue(0);
  const smartTaskShimmerPhase = useSharedValue(0);
  const smartTaskEmojiPulse = useSharedValue(0);
  const currentTaskFabPulse = useSharedValue(0);
  const recoveryBackdropStyle = useAnimatedStyle(() => ({
    opacity: recoverySheetProgress.value * 0.86,
  }));
  const recoverySheetStyle = useAnimatedStyle(() => ({
    opacity: recoverySheetProgress.value,
    transform: [{ translateY: (1 - recoverySheetProgress.value) * 52 }],
  }));
  const recoverySuccessStyle = useAnimatedStyle(() => ({
    opacity: recoverySuccessPulse.value,
    transform: [{ scale: 0.94 + recoverySuccessPulse.value * 0.06 }],
  }));
  const todayPlanBackdropStyle = useAnimatedStyle(() => ({
    opacity: todayPlanSheetProgress.value * 0.82,
  }));
  const todayPlanSheetStyle = useAnimatedStyle(() => ({
    opacity: todayPlanSheetProgress.value,
    transform: [{ translateY: (1 - todayPlanSheetProgress.value) * 46 }],
  }));
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));
  const headerAffirmationMarqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: headerAffirmationTranslateX.value }],
  }));
  const smartTaskButtonBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      smartTaskBorderPhase.value,
      [0, 0.5, 1],
      [
        "rgba(255, 209, 102, 0.72)",
        "rgba(255, 123, 123, 0.72)",
        "rgba(255, 209, 102, 0.72)",
      ]
    ),
    shadowColor: interpolateColor(
      smartTaskBorderPhase.value,
      [0, 1],
      ["rgba(255, 209, 102, 0.4)", "rgba(255, 123, 123, 0.35)"]
    ),
    shadowOpacity: 0.32,
  }));
  const smartTaskShimmerStyle = useAnimatedStyle(() => {
    const width = Math.max(smartTaskButtonWidth, 1);
    const translateX =
      smartTaskShimmerPhase.value * (width + SMART_TASK_SHIMMER_WIDTH * 2) -
      SMART_TASK_SHIMMER_WIDTH;
    return {
      transform: [{ translateX }],
      opacity: 0.42,
    };
  });
  const smartTaskEmojiStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -smartTaskEmojiPulse.value * 1.2 },
      { scale: 1 + smartTaskEmojiPulse.value * 0.05 },
    ],
    opacity: 0.86 + smartTaskEmojiPulse.value * 0.14,
  }));
  const currentTaskFabAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      currentTaskFabPulse.value,
      [0, 1],
      ["rgba(182, 194, 110, 0.55)", "rgba(125, 255, 179, 0.82)"]
    ),
    shadowColor: interpolateColor(
      currentTaskFabPulse.value,
      [0, 1],
      ["rgba(182, 194, 110, 0.45)", "rgba(125, 255, 179, 0.35)"]
    ),
    shadowOpacity: 0.18 + currentTaskFabPulse.value * 0.18,
    transform: [{ scale: 1 + currentTaskFabPulse.value * 0.035 }],
  }));
  const floatingMenuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: floatingMenuOpacity.value,
    transform: [
      { translateY: (1 - floatingMenuOpacity.value) * -8 },
      { scale: 0.96 + floatingMenuOpacity.value * 0.04 },
    ],
  }));

  const homeScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const y = Math.max(0, event.contentOffset.y || 0);
        const delta = y - lastHomeScrollY.value;
        lastHomeScrollY.value = y;

        if (y <= HEADER_SHOW_SCROLL_THRESHOLD) {
          if (headerCollapsedProgress.value !== 0) {
            headerCollapsedProgress.value = 0;
            headerTranslateY.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.cubic),
            });
            floatingMenuOpacity.value = withTiming(0, {
              duration: 180,
              easing: Easing.out(Easing.cubic),
            });
            runOnJS(syncHeaderCollapsedState)(false);
          }
          return;
        }

        if (
          y > HEADER_HIDE_SCROLL_THRESHOLD &&
          delta > 1.5 &&
          headerCollapsedProgress.value !== 1
        ) {
          headerCollapsedProgress.value = 1;
          headerTranslateY.value = withTiming(
            -Math.max(headerContainerHeight, HEADER_HIDE_OFFSET_FALLBACK) - 10,
            {
              duration: 240,
              easing: Easing.out(Easing.cubic),
            }
          );
          floatingMenuOpacity.value = withTiming(1, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
          });
          runOnJS(syncHeaderCollapsedState)(true);
          return;
        }

        if (
          delta < -4 &&
          y < HEADER_HIDE_SCROLL_THRESHOLD * 0.7 &&
          headerCollapsedProgress.value !== 0
        ) {
          headerCollapsedProgress.value = 0;
          headerTranslateY.value = withTiming(0, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
          });
          floatingMenuOpacity.value = withTiming(0, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
          });
          runOnJS(syncHeaderCollapsedState)(false);
        }
      },
    },
    [headerContainerHeight, syncHeaderCollapsedState]
  );

  useEffect(() => {
    cancelAnimation(smartTaskBorderPhase);
    cancelAnimation(smartTaskShimmerPhase);
    cancelAnimation(smartTaskEmojiPulse);

    if (!smartActionTaskId) {
      smartTaskBorderPhase.value = 0;
      smartTaskShimmerPhase.value = 0;
      smartTaskEmojiPulse.value = 0;
      return;
    }

    smartTaskBorderPhase.value = withRepeat(
      withTiming(1, {
        duration: SMART_TASK_BORDER_CYCLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    smartTaskShimmerPhase.value = withRepeat(
      withTiming(1, {
        duration: SMART_TASK_SHIMMER_CYCLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    smartTaskEmojiPulse.value = withRepeat(
      withTiming(1, {
        duration: 1850,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      true
    );

    return () => {
      cancelAnimation(smartTaskBorderPhase);
      cancelAnimation(smartTaskShimmerPhase);
      cancelAnimation(smartTaskEmojiPulse);
    };
  }, [
    smartActionTaskId,
    smartTaskBorderPhase,
    smartTaskEmojiPulse,
    smartTaskShimmerPhase,
  ]);

  useEffect(() => {
    cancelAnimation(currentTaskFabPulse);
    currentTaskFabPulse.value = 0;

    if (!currentTaskQuickTaskId) return;

    currentTaskFabPulse.value = withRepeat(
      withTiming(1, {
        duration: CURRENT_TASK_FAB_BREATH_MS,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );

    return () => {
      cancelAnimation(currentTaskFabPulse);
      currentTaskFabPulse.value = 0;
    };
  }, [currentTaskFabPulse, currentTaskQuickTaskId]);

  useEffect(() => {
    setHeaderAffirmationTextWidth(0);
  }, [currentAffirmation]);

  useEffect(() => {
    cancelAnimation(headerAffirmationTranslateX);
    headerAffirmationTranslateX.value = 0;

    if (!shouldScrollHeaderAffirmation || !headerAffirmationTextWidth) return;

    const travelDistance =
      headerAffirmationTextWidth + HEADER_AFFIRMATION_MARQUEE_GAP;
    const rawDurationMs =
      (travelDistance / HEADER_AFFIRMATION_SCROLL_SPEED_PX_PER_SEC) * 1000;
    const duration = Math.min(
      HEADER_AFFIRMATION_MAX_DURATION_MS,
      Math.max(HEADER_AFFIRMATION_MIN_DURATION_MS, Math.round(rawDurationMs))
    );

    headerAffirmationTranslateX.value = withRepeat(
      withTiming(-travelDistance, {
        duration,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [
    currentAffirmation,
    headerAffirmationTextWidth,
    headerAffirmationTranslateX,
    shouldScrollHeaderAffirmation,
  ]);

  //******useRef********** */

  const scrollRef = useRef(null);
  const recoveryListRef = useRef(null);
  const recoveryScrollOffsetRef = useRef(0);
  const activeFocusY = useRef(0);
  const fabScale = useRef(new Animated.Value(1)).current;
  const taskPositions = useRef({});
  const sectionPositions = useRef({});
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const affirmationOpacity = useRef(new Animated.Value(1)).current;
  const drawerX = useRef(new Animated.Value(-320)).current;
  const focusDismissTimeoutRef = useRef(null);
  const welcomeVoiceTimeoutRef = useRef(null);
  const focusSessionRecordedRef = useRef(false);
  const hasAutoExpandedInitialSection = useRef(false);
  const sectionChevronAnims = useRef(
    SECTION_ORDER.reduce((acc, sectionName) => {
      acc[sectionName] = new Animated.Value(0);
      return acc;
    }, {})
  ).current;
  const pinnedChevronAnim = useRef(new Animated.Value(0)).current;
  const focusCompletionNotificationIdRef = useRef(null);
  const timerCompletionStampRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const hasPlayedWelcomeVoiceRef = useRef(false);
  const notificationSpeechHistoryRef = useRef({
    message: "",
    at: 0,
  });
  const taskHighlightPulse = useRef(new Animated.Value(0)).current;
  const taskHighlightLoopRef = useRef(null);
  const taskHighlightTimeoutRef = useRef(null);
  const taskNavigationTimeoutRef = useRef(null);
  const handledNotificationResponseKeysRef = useRef(new Set());
  const handledNotificationResponseKeyOrderRef = useRef([]);
  const notificationActionContextRef = useRef(null);
  const snoozeAffirmationTimeoutRef = useRef(null);
  const todayPlanCelebrationTimeoutRef = useRef(null);
  const todayPlanRescheduleTaskIdRef = useRef(null);
  const tasksRef = useRef([]);
  const startFocusActionRef = useRef(null);
  const subtaskDragStateRef = useRef({
    taskId: null,
    subtaskId: null,
    index: -1,
    startPageY: 0,
    deltaY: 0,
  });
  const startAssistVoiceHintTimeoutRef = useRef(null);
  const startAssistAutoReadKeyRef = useRef("");
  const focusCompletionIntervalRef = useRef(null);
  const focusCompletionDeadlineRef = useRef(null);
  const focusCompletionTaskIdRef = useRef(null);
  const activeTaskIdRef = useRef(activeTaskId);
  const isFocusCompletedRef = useRef(isFocusCompleted);
  const currentFocusedTaskIdRef = useRef(currentFocusedTaskId);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);
  useEffect(() => {
    isFocusCompletedRef.current = isFocusCompleted;
  }, [isFocusCompleted]);
  useEffect(() => {
    currentFocusedTaskIdRef.current = currentFocusedTaskId;
  }, [currentFocusedTaskId]);

  const saveSetting = (key, value) => {
    db.runSync("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [
      key,
      String(value),
    ]);
  };

  const getSettingsMap = () => {
    const rows = db.getAllSync("SELECT key, value FROM app_settings") || [];
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  };

  const loadDailyMoodEntries = useCallback(() => {
    try {
      const rows =
        db.getAllSync(
          `SELECT id, date, moodType, note, createdAt, updatedAt
           FROM daily_moods
           ORDER BY date DESC, updatedAt DESC`
        ) || [];

      const mapped = rows.map((row) => ({
        ...row,
        moodType: row.moodType || "",
        note: row.note || "",
      }));

      setDailyMoodEntries(mapped);
      const todayEntry = mapped.find((row) => row.date === todayDateKey) || null;
      setDailyMoodType(todayEntry?.moodType || "");
      setDailyMoodNote(todayEntry?.note || "");
      if (todayEntry?.moodType) {
        setDismissedDailyMoodPromptDate(todayDateKey);
      }
    } catch (error) {
      console.log("Daily mood load error:", error);
      setDailyMoodEntries([]);
    }
  }, [todayDateKey]);

  const saveDailyMoodCheckIn = useCallback(
    (moodType, noteValue = dailyMoodNote) => {
      if (!isValidMoodType(moodType)) return;

      const normalizedNote = (noteValue || "").trim();
      const nowStamp = formatSqliteDateTime(new Date());

      try {
        db.runSync(
          `INSERT INTO daily_moods (date, moodType, note, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(date)
           DO UPDATE SET
             moodType = excluded.moodType,
             note = excluded.note,
             updatedAt = excluded.updatedAt`,
          [todayDateKey, moodType, normalizedNote, nowStamp, nowStamp]
        );
      } catch (error) {
        console.log("Daily mood save error:", error);
        return;
      }

      setDailyMoodType(moodType);
      setDailyMoodNote(normalizedNote);
      setDismissedDailyMoodPromptDate(todayDateKey);
      loadDailyMoodEntries();
    },
    [dailyMoodNote, loadDailyMoodEntries, todayDateKey]
  );

  const updateTaskMood = useCallback((taskId, moodType) => {
    if (!isValidMoodType(moodType)) return;
    try {
      db.runSync("UPDATE tasks SET moodType = ? WHERE id = ?", [moodType, taskId]);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                moodType,
              }
            : task
        )
      );
      if (taskMoodPromptTaskId === taskId) {
        setTaskMoodPromptVisible(false);
        setTaskMoodPromptTaskId(null);
      }
    } catch (error) {
      console.log("Task mood update error:", error);
    }
  }, [taskMoodPromptTaskId]);

  const persistFocusTimerState = useCallback((timerState) => {
    saveSetting(FOCUS_TIMER_STATE_KEY, serializeTimerState(timerState));
  }, []);

  const clearPersistedFocusTimerState = useCallback(() => {
    persistFocusTimerState({
      activeTaskId: null,
      focusTime: 0,
      currentDuration: 0,
      isTimerRunning: false,
      isFocusCompleted: false,
      focusStartTimestamp: null,
      focusEndTimestamp: null,
    });
  }, [persistFocusTimerState]);

  const clearFocusCompletionAutoClose = useCallback(
    ({ resetCountdown = false, clearTaskContext = true } = {}) => {
      if (focusDismissTimeoutRef.current) {
        clearTimeout(focusDismissTimeoutRef.current);
        focusDismissTimeoutRef.current = null;
      }
      if (focusCompletionIntervalRef.current) {
        clearInterval(focusCompletionIntervalRef.current);
        focusCompletionIntervalRef.current = null;
      }
      if (clearTaskContext) {
        focusCompletionDeadlineRef.current = null;
        focusCompletionTaskIdRef.current = null;
      }
      if (resetCountdown) {
        setFocusCompletionCountdown((prev) => (prev === 0 ? prev : 0));
      }
    },
    []
  );

  const closeCompletedFocusPanel = useCallback(
    (sessionTaskId = null) => {
      const expectedTaskId = sessionTaskId ?? focusCompletionTaskIdRef.current;
      const hasCompletedSession =
        isFocusCompletedRef.current &&
        activeTaskIdRef.current !== null &&
        activeTaskIdRef.current !== undefined &&
        (expectedTaskId === null ||
          Number(activeTaskIdRef.current) === Number(expectedTaskId));

      clearFocusCompletionAutoClose({ resetCountdown: true });

      if (!hasCompletedSession) return;

      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch {
        // LayoutAnimation can fail silently on some platforms; closing should still proceed.
      }

      setActiveTaskId(null);
      setFocusTime(0);
      setIsTimerRunning(false);
      setIsFocusCompleted(false);
      setFocusStartTimestamp(null);
      setFocusEndTimestamp(null);
      setCurrentFocusedTaskId((prev) =>
        expectedTaskId !== null && Number(prev) === Number(expectedTaskId)
          ? null
          : prev
      );
      focusSessionRecordedRef.current = false;
      timerCompletionStampRef.current = null;
      focusCompletionNotificationIdRef.current = null;
      clearPersistedFocusTimerState();
    },
    [clearFocusCompletionAutoClose, clearPersistedFocusTimerState]
  );

  const refreshSectionAffirmations = useCallback(() => {
    setSectionAffirmations((prev) =>
      getSectionAffirmations(
        SECTION_AFFIRMATION_KEYS,
        SECTION_HEADER_AFFIRMATIONS,
        prev
      )
    );
  }, []);

  const speakNotificationReminder = useCallback(
    async (content = null) => {
      if (isVoiceMuted) return false;
      if (!content || appStateRef.current !== "active") return false;

      const rawType = String(content?.data?.type || "").toLowerCase();
      if (rawType === "task-complete") return false;

      const isReminderLikeType =
        rawType === "" ||
        rawType === "task-reminder" ||
        rawType === "reminder-alert" ||
        rawType === "focus-session-complete";
      if (!isReminderLikeType) return false;

      const title = String(content?.title || "").trim();
      const body = String(content?.body || "").trim();
      const message = body || title;
      if (!message) return false;

      const now = Date.now();
      const history = notificationSpeechHistoryRef.current;
      if (
        history.message === message &&
        now - history.at < NOTIFICATION_SPEECH_MIN_GAP_MS
      ) {
        return false;
      }

      const didSpeak = await speakEncouragement({
        muted: false,
        message,
        minGapMs: NOTIFICATION_SPEECH_MIN_GAP_MS,
      });

      if (didSpeak) {
        notificationSpeechHistoryRef.current = {
          message,
          at: Date.now(),
        };
      }

      return didSpeak;
    },
    [isVoiceMuted]
  );

  const ensureDailyStatsRow = (dateKey = getDateKey()) => {
    db.runSync(
      `INSERT OR IGNORE INTO daily_stats
       (date, completedTasks, totalFocusTime, streakValue, createdAt, updatedAt)
       VALUES (?, 0, 0, 0, datetime('now'), datetime('now'))`,
      [dateKey]
    );
  };

  const getDailyStatsRow = (dateKey = getDateKey()) => {
    ensureDailyStatsRow(dateKey);
    const rows =
      db.getAllSync("SELECT * FROM daily_stats WHERE date = ?", [dateKey]) ||
      [];
    return (
      rows[0] || {
        date: dateKey,
        completedTasks: 0,
        totalFocusTime: 0,
        streakValue: 0,
      }
    );
  };

  const saveProfile = (nextProfile) => {
    db.runSync(
      `INSERT OR REPLACE INTO app_profile
       (id, name, profileImage, vibe, onboardingComplete, updatedAt)
       VALUES (1, ?, ?, ?, ?, datetime('now'))`,
      [
        nextProfile.name,
        nextProfile.profileImage || "",
        nextProfile.vibe || "🌿",
        nextProfile.onboardingComplete ? 1 : 0,
      ]
    );
    setProfile(nextProfile);
    setProfileDraftName(nextProfile.name);
    setProfileDraftVibe(nextProfile.vibe || "🌿");
  };

  const refreshSpecialTasks = () => {
    const rows =
      db.getAllSync("SELECT * FROM special_tasks ORDER BY createdAt DESC") ||
      [];
    setSpecialTasks(rows);
  };

  const checkDailyReset = () => {
    const today = getDateKey();
    const settings = getSettingsMap();
    const lastActiveDate = settings.lastActiveDate || today;
    const lastQualifiedDate = settings.lastQualifiedDate || "";
    let currentStreak = Number(settings.currentStreak || 0);

    ensureDailyStatsRow(today);

    if (lastActiveDate !== today) {
      const streakStillWarm =
        lastQualifiedDate === today || lastQualifiedDate === getYesterdayKey();

      if (!streakStillWarm) {
        currentStreak = 0;
        saveSetting("currentStreak", 0);
      }

      saveSetting("lastActiveDate", today);
      const todayRow = getDailyStatsRow(today);
      setDailyStats({
        date: today,
        completedTasks: todayRow.completedTasks || 0,
        totalFocusTime: todayRow.totalFocusTime || 0,
        streakValue: todayRow.streakValue || 0,
      });
      setTotalFocusTime(todayRow.totalFocusTime || 0);
      setProductivityStats((prev) => ({
        ...prev,
        currentStreak,
        lastActiveDate: today,
        lastQualifiedDate,
      }));
    }
  };

  const qualifyTodayForStreak = (nextCompleted, nextFocusTime) => {
    const today = getDateKey();
    const settings = getSettingsMap();
    const alreadyQualified = settings.lastQualifiedDate === today;
    const meaningfulDay = nextCompleted >= 1 || nextFocusTime >= 300;

    if (!meaningfulDay || alreadyQualified) return;

    const wasYesterday = settings.lastQualifiedDate === getYesterdayKey();
    const nextStreak = wasYesterday ? Number(settings.currentStreak || 0) + 1 : 1;
    const nextBest = Math.max(Number(settings.bestStreak || 0), nextStreak);

    saveSetting("currentStreak", nextStreak);
    saveSetting("bestStreak", nextBest);
    saveSetting("lastQualifiedDate", today);

    db.runSync("UPDATE daily_stats SET streakValue = ? WHERE date = ?", [
      nextStreak,
      today,
    ]);

    setProductivityStats((prev) => ({
      ...prev,
      currentStreak: nextStreak,
      bestStreak: nextBest,
      lastQualifiedDate: today,
    }));
  };

  const recordDailyCompletion = () => {
    checkDailyReset();
    const today = getDateKey();
    const row = getDailyStatsRow(today);
    const nextCompleted = (row.completedTasks || 0) + 1;
    const lifetimeCompletedTasks =
      productivityStats.lifetimeCompletedTasks + 1;

    db.runSync(
      `UPDATE daily_stats
       SET completedTasks = ?, updatedAt = datetime('now')
       WHERE date = ?`,
      [nextCompleted, today]
    );
    saveSetting("lifetimeCompletedTasks", lifetimeCompletedTasks);

    setDailyStats((prev) => ({
      ...prev,
      completedTasks: nextCompleted,
      totalFocusTime: row.totalFocusTime || prev.totalFocusTime,
    }));
    setProductivityStats((prev) => ({
      ...prev,
      lifetimeCompletedTasks,
    }));
    qualifyTodayForStreak(nextCompleted, row.totalFocusTime || 0);
  };

  const recordFocusSession = (secondsToAdd) => {
    if (!secondsToAdd || secondsToAdd <= 0) return;

    checkDailyReset();
    const today = getDateKey();
    const row = getDailyStatsRow(today);
    const nextFocusTime = (row.totalFocusTime || 0) + secondsToAdd;
    const lifetimeFocusTime =
      productivityStats.lifetimeFocusTime + secondsToAdd;

    db.runSync(
      `UPDATE daily_stats
       SET totalFocusTime = ?, updatedAt = datetime('now')
       WHERE date = ?`,
      [nextFocusTime, today]
    );
    saveSetting("lifetimeFocusTime", lifetimeFocusTime);

    setTotalFocusTime((total) => total + secondsToAdd);
    setDailyStats((prev) => ({
      ...prev,
      totalFocusTime: nextFocusTime,
      completedTasks: row.completedTasks || prev.completedTasks,
    }));
    setProductivityStats((prev) => ({
      ...prev,
      lifetimeFocusTime,
    }));
    qualifyTodayForStreak(row.completedTasks || 0, nextFocusTime);
  };

  const getTaskTitleById = useCallback(
    (taskId) => tasks.find((task) => task.id === taskId)?.title || "Focus Session",
    [tasks]
  );
  const getTaskById = useCallback(
    (taskId) => tasks.find((task) => task.id === taskId) || null,
    [tasks]
  );

  const cancelFocusCompletionReminder = useCallback(async () => {
    if (!focusCompletionNotificationIdRef.current) return;
    await cancelNotificationById(focusCompletionNotificationIdRef.current);
    focusCompletionNotificationIdRef.current = null;
  }, []);

  const scheduleFocusCompletionReminder = useCallback(
    async (taskId, endTimestamp) => {
      if (!taskId || !endTimestamp) return;
      await cancelFocusCompletionReminder();
      const targetTask = getTaskById(taskId);
      const notificationId = await scheduleFocusCompletionNotification({
        taskTitle: getTaskTitleById(taskId),
        taskId,
        sectionId: targetTask?.isPinned ? "Pinned" : targetTask?.section || null,
        endTimestamp,
      });
      focusCompletionNotificationIdRef.current = notificationId;
    },
    [cancelFocusCompletionReminder, getTaskById, getTaskTitleById]
  );

  const completeFocusSession = useCallback(
    (completionTimestamp = Date.now()) => {
      const completionKey = `${activeTaskId || "none"}-${completionTimestamp}`;
      if (timerCompletionStampRef.current === completionKey) return;
      timerCompletionStampRef.current = completionKey;

      setIsTimerRunning(false);
      setIsFocusCompleted(true);
      setFocusStartTimestamp(null);
      setFocusEndTimestamp(null);
      setFocusTime(currentDuration);

      const completionMessage = getRandomAffirmation(FOCUS_COMPLETION_AFFIRMATIONS);
      showCelebration(completionMessage, "⏱");

      if (!focusSessionRecordedRef.current) {
        recordFocusSession(currentDuration);
        focusSessionRecordedRef.current = true;
      }

      persistFocusTimerState({
        activeTaskId,
        focusTime: currentDuration,
        currentDuration,
        isTimerRunning: false,
        isFocusCompleted: true,
        focusStartTimestamp: null,
        focusEndTimestamp: null,
      });

      void speakEncouragement({
        muted: isVoiceMuted,
        message: buildFocusCompletionSpeechMessage(getTaskTitleById(activeTaskId)),
      });

      clearFocusCompletionAutoClose({ resetCountdown: false, clearTaskContext: false });
      focusCompletionTaskIdRef.current = activeTaskId;
      focusCompletionDeadlineRef.current = Date.now() + FOCUS_AUTO_DISMISS_DELAY_MS;
      setFocusCompletionCountdown(FOCUS_AUTO_DISMISS_COUNTDOWN_SECONDS);
    },
    [
      activeTaskId,
      clearFocusCompletionAutoClose,
      currentDuration,
      getTaskTitleById,
      isVoiceMuted,
      persistFocusTimerState,
    ]
  );

  const pickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert("Photo access is needed to update your profile image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const pickedUri = result.assets[0].uri;
    let imageUri = pickedUri;

    try {
      const profileDir = new Directory(Paths.document, "profile");
      profileDir.create({ intermediates: true, idempotent: true });

      const extension = pickedUri.split(".").pop()?.split("?")[0] || "jpg";
      const sourceFile = new File(pickedUri);
      const avatarFile = new File(
        profileDir,
        `avatar-${Date.now()}.${extension}`
      );
      sourceFile.copy(avatarFile);
      imageUri = avatarFile.uri;
    } catch (e) {
      console.log("Profile image copy skipped:", e);
    }

    const nextProfile = { ...profile, profileImage: imageUri };
    saveProfile(nextProfile);
  };

  const openDrawer = () => {
    drawerX.setValue(-320);
    setDrawerVisible(true);
    Animated.timing(drawerX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerX, {
      toValue: -320,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setDrawerVisible(false));
  };

  const openSupport = () => {
    Linking.openURL("https://researchzeal.com").catch(() => {
      setActivePage("support");
    });
  };

  const toggleVoiceMuted = useCallback(() => {
    setIsVoiceMuted((prev) => {
      const next = !prev;
      saveSetting("voiceMuted", next ? "true" : "false");
      if (next) {
        void stopEncouragement();
      }
      return next;
    });
  }, []);

  const toggleStartAssistReadAloud = useCallback(() => {
    setStartAssistReadAloudEnabled((prev) => {
      const next = !prev;
      saveSetting("startAssistReadAloudEnabled", next ? "true" : "false");
      return next;
    });
  }, []);

  const pastPendingTaskCount = todayPlanPastPendingTasks.length;

  const loadRecoveryPendingTasks = useCallback((preserveScroll = false) => {
    try {
      const { start } = getDayBounds(new Date());
      const rows =
        db.getAllSync(
          `SELECT * FROM tasks
           WHERE completed = 0
             AND scheduledTime IS NOT NULL
             AND TRIM(scheduledTime) <> ''
           ORDER BY scheduledTime DESC`
        ) || [];

      const parsedRows = rows
        .map((row) => {
          let parsedSubtasks = [];
          let parsedNotificationIds = [];

          try {
            parsedSubtasks = JSON.parse(row.subtasks || "[]");
          } catch {
            parsedSubtasks = [];
          }

          try {
            parsedNotificationIds = JSON.parse(row.notificationId || "[]");
          } catch {
            parsedNotificationIds = [];
          }

          return {
            ...row,
            completed: row.completed === 1,
            isPinned: row.isPinned === 1,
            subtasks: Array.isArray(parsedSubtasks) ? parsedSubtasks : [],
            notificationId: Array.isArray(parsedNotificationIds)
              ? parsedNotificationIds
              : [],
          };
        })
        .filter((task) => {
          const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);
          return scheduledTimestamp !== null && scheduledTimestamp < start;
        })
        .sort((a, b) => {
          const aTime = toTaskTimestamp(a.scheduledTime) || 0;
          const bTime = toTaskTimestamp(b.scheduledTime) || 0;
          return bTime - aTime;
        });

      setRecoveryPendingTasks(parsedRows);

      if (preserveScroll) {
        requestAnimationFrame(() => {
          recoveryListRef.current?.scrollToOffset?.({
            offset: recoveryScrollOffsetRef.current,
            animated: false,
          });
        });
      }
    } catch (error) {
      console.log("Recovery pending query error:", error);
      setRecoveryPendingTasks([]);
    }
  }, []);

  const clearTodayPlanCelebrationTimer = useCallback(() => {
    if (todayPlanCelebrationTimeoutRef.current) {
      clearTimeout(todayPlanCelebrationTimeoutRef.current);
      todayPlanCelebrationTimeoutRef.current = null;
    }
  }, []);

  const closeTodayPlanCelebration = useCallback(() => {
    clearTodayPlanCelebrationTimer();
    setTodayPlanCelebration((prev) =>
      prev.visible ? { ...prev, visible: false } : prev
    );
  }, [clearTodayPlanCelebrationTimer]);

  const showTodayPlanCelebration = useCallback(
    (kind = "create") => {
      clearTodayPlanCelebrationTimer();
      const nextCelebration =
        kind === "reschedule"
          ? {
              title: "Moved gently 🌿",
              message: "This task has a place today now. No reset needed.",
              buttonLabel: "Good",
            }
          : {
              title: "Today has a starting point ✨",
              message: "One useful task is enough to begin. You made the day clearer.",
              buttonLabel: "Nice",
            };

      setTodayPlanCelebration({
        visible: true,
        ...nextCelebration,
      });

      todayPlanCelebrationTimeoutRef.current = setTimeout(() => {
        setTodayPlanCelebration((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        todayPlanCelebrationTimeoutRef.current = null;
      }, TODAY_PLAN_CELEBRATION_AUTO_CLOSE_DELAY_MS);
    },
    [clearTodayPlanCelebrationTimer]
  );

  const markTodayPlanPromptShown = useCallback((dateKey = getLocalDateKey()) => {
    setLastTodayPlanPromptDate((prev) => (prev === dateKey ? prev : dateKey));
    saveSetting(LAST_TODAY_PLAN_PROMPT_DATE_KEY, dateKey);
  }, []);

  const openTodayPlanSheet = useCallback((section = null) => {
    const normalizedSection = normalizeTodayPlanSection(section);
    setTodayPlanNotificationSection(normalizedSection);
    setTodayPlanSheetVisible(true);
  }, []);

  const closeTodayPlanSheet = useCallback(() => {
    todayPlanSheetProgress.value = withTiming(
      0,
      {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (!finished) return;
        runOnJS(setTodayPlanSheetVisible)(false);
        runOnJS(setTodayPlanNotificationSection)(null);
      }
    );
  }, [todayPlanSheetProgress]);

  const openRecoveryModalFromTodayPlanTask = useCallback(
    (task) => {
      if (!task) return;
      todayPlanRescheduleTaskIdRef.current = task.id;
      setRecoveryEditingTaskId(task.id);
      setRecoveryDraftSection(task.section || "Morning");
      setRecoveryDraftDateTime(formatSqliteDateTime(new Date()));
      setRecoverySuccessMessage("");
      setRecoveryFabPromptVisible(false);
      recoveryScrollOffsetRef.current = 0;
      loadRecoveryPendingTasks(false);
      setRecoveryModalVisible(true);
    },
    [loadRecoveryPendingTasks]
  );

  const scheduleTodayPlanNotifications = useCallback(async () => {
    try {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== "granted") return;

      const allScheduled =
        await Notifications.getAllScheduledNotificationsAsync();
      const scheduledBySection = {};

      for (const slot of TODAY_PLAN_NOTIFICATION_SLOTS) {
        const matches = allScheduled.filter((notification) => {
          const data = notification?.content?.data || {};
          return (
            data?.type === "planTodayReminder" &&
            normalizeTodayPlanSection(data?.section) === slot.section
          );
        });

        if (matches.length > 0) {
          const primary = matches[0];
          if (primary?.identifier) {
            scheduledBySection[slot.section] = primary.identifier;
          }

          if (matches.length > 1) {
            await Promise.all(
              matches
                .slice(1)
                .map((item) =>
                  Notifications.cancelScheduledNotificationAsync(
                    item.identifier
                  ).catch(() => null)
                )
            );
          }
          continue;
        }

        const localDateKey = getLocalDateKey(new Date());
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: slot.title,
            body: slot.body,
            sound: "default",
            data: {
              type: "planTodayReminder",
              section: slot.section,
              localDateKey,
              source: "dailyPlanNotification",
            },
            android: {
              channelId: "adhd-alarms",
              pressAction: { id: "default" },
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: slot.hour,
            minute: slot.minute,
          },
        });

        scheduledBySection[slot.section] = id;
      }

      saveSetting(
        TODAY_PLAN_NOTIFICATION_SETTINGS_KEY,
        JSON.stringify(scheduledBySection)
      );
    } catch (error) {
      console.log("Today plan notification schedule error:", error);
    }
  }, []);

  const openRecoveryModal = useCallback(() => {
    todayPlanRescheduleTaskIdRef.current = null;
    setRecoveryEditingTaskId(null);
    setRecoveryDraftDateTime("");
    setRecoveryDraftSection("Morning");
    setRecoverySuccessMessage("");
    setRecoveryFabPromptVisible(false);
    recoveryScrollOffsetRef.current = 0;
    loadRecoveryPendingTasks(false);
    setRecoveryModalVisible(true);
  }, [loadRecoveryPendingTasks]);

  const handleRecoveryFabPress = useCallback(() => {
    if (!recoveryFabPromptVisible) {
      setRecoveryFabPromptVisible(true);
      return;
    }
    openRecoveryModal();
  }, [openRecoveryModal, recoveryFabPromptVisible]);

  const closeRecoveryModal = useCallback(() => {
    todayPlanRescheduleTaskIdRef.current = null;
    recoverySheetProgress.value = withTiming(
      0,
      {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (!finished) return;
        runOnJS(setRecoveryModalVisible)(false);
        runOnJS(setRecoveryEditingTaskId)(null);
        runOnJS(setRecoveryDraftDateTime)("");
        runOnJS(setRecoverySuccessMessage)("");
      }
    );
  }, [recoverySheetProgress]);

  const startRecoveryEdit = useCallback((task) => {
    if (!task) return;
    setRecoveryEditingTaskId(task.id);
    setRecoveryDraftSection(task.section || "Morning");
    setRecoveryDraftDateTime(
      task.scheduledTime || formatSqliteDateTime(new Date())
    );
  }, []);

  const cancelRecoveryEdit = useCallback(() => {
    setRecoveryEditingTaskId(null);
    setRecoveryDraftDateTime("");
  }, []);

  const saveRecoveryEdit = async () => {
    if (!recoveryEditingTaskId || !recoveryDraftDateTime) return;

    const targetTask = tasks.find((task) => task.id === recoveryEditingTaskId);
    if (!targetTask) return;

    const parsedDraft =
      parseStoredDateTime(recoveryDraftDateTime) ||
      parseStoredDateTime(targetTask.scheduledTime);
    if (!parsedDraft) return;

    const adjustedDate = restrictToSection(recoveryDraftSection, parsedDraft);
    const scheduledTime = formatSqliteDateTime(adjustedDate);
    const nowIso = new Date().toISOString();
    const nextRescheduleCount = Number(targetTask.rescheduleCount || 0) + 1;

    setRecoverySavingTaskId(targetTask.id);
    try {
      await cancelTaskReminders(targetTask.notificationId);
      const reminderIds = await scheduleProReminders({
        ...targetTask,
        section: recoveryDraftSection,
        scheduledTime,
      }, { source: "reschedule" });

      db.runSync(
        `UPDATE tasks
         SET section = ?,
             scheduledTime = ?,
             notificationId = ?,
             isPinned = ?,
             rescheduleCount = ?,
             lastRescheduledAt = ?
         WHERE id = ?`,
        [
          recoveryDraftSection,
          scheduledTime,
          JSON.stringify(reminderIds),
          targetTask.isPinned ? 1 : 0,
          nextRescheduleCount,
          nowIso,
          targetTask.id,
        ]
      );

      setTasks((prev) =>
        prev.map((task) =>
          task.id === targetTask.id
            ? {
                ...task,
                section: recoveryDraftSection,
                scheduledTime,
                notificationId: reminderIds,
                rescheduleCount: nextRescheduleCount,
                lastRescheduledAt: nowIso,
              }
            : task
        )
      );

      setRecoverySuccessMessage("Task rescheduled gently ✨");
      recoverySuccessPulse.value = 0;
      recoverySuccessPulse.value = withTiming(
        1,
        {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (!finished) return;
          recoverySuccessPulse.value = withTiming(0, {
            duration: 620,
            easing: Easing.inOut(Easing.quad),
          });
        }
      );

      setRecoveryEditingTaskId(null);
      setRecoveryDraftDateTime("");
      loadRecoveryPendingTasks(true);

      const launchedFromTodayPlan =
        todayPlanRescheduleTaskIdRef.current === targetTask.id;
      if (launchedFromTodayPlan) {
        const { start, end } = getDayBounds(new Date());
        const scheduledTimestamp = toTaskTimestamp(scheduledTime);
        if (isTimestampWithinRange(scheduledTimestamp, start, end)) {
          showTodayPlanCelebration("reschedule");
        }
        todayPlanRescheduleTaskIdRef.current = null;
        closeRecoveryModal();
      }
    } catch (error) {
      console.log("Recovery task update error:", error);
    } finally {
      setRecoverySavingTaskId(null);
    }
  };

  //**************useEffect************** */
  //************************************ */

  // 🚀 MASTER BOOT SEQUENCE (Run once on startup)
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 2. Setup Database Schema & Migrations
        db.execSync(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT, section TEXT, completed INTEGER,
          completedAt TEXT,
          createdAt TEXT,
          repeatType TEXT DEFAULT 'none',
          repeatDays TEXT DEFAULT '[]',
          repeatMonthlyType TEXT DEFAULT '',
          repeatCustomDate TEXT DEFAULT '',
          repeatYearlyDate TEXT DEFAULT '',
          repeatGroupId TEXT DEFAULT '',
          scheduledTime TEXT, details TEXT, attachment TEXT,
          subtasks TEXT DEFAULT '[]', notificationId TEXT DEFAULT '[]',
          isPinned INTEGER DEFAULT 0,
          moodType TEXT DEFAULT '',
          firstAction TEXT DEFAULT '',
          minimumVersion TEXT DEFAULT '',
          energyRequired TEXT DEFAULT '',
          focusRequired TEXT DEFAULT '',
          taskContext TEXT DEFAULT '',
          estimatedMinutes INTEGER,
          startAssistUsedCount INTEGER DEFAULT 0,
          lastStartAssistAt TEXT,
          stuckCount INTEGER DEFAULT 0,
          lastStuckAt TEXT,
          reminderOpenCount INTEGER DEFAULT 0,
          reminderStartNowCount INTEGER DEFAULT 0,
          reminderSnoozeCount INTEGER DEFAULT 0,
          reminderMoveGentlyCount INTEGER DEFAULT 0,
          reminderMakeSmallerCount INTEGER DEFAULT 0,
          lastReminderActionAt TEXT,
          lastReminderAction TEXT,
          reminderActionHistory TEXT DEFAULT '[]',
          snoozeCount INTEGER DEFAULT 0,
          lastSnoozedAt TEXT,
          rescheduleCount INTEGER DEFAULT 0,
          lastRescheduledAt TEXT
        );
        CREATE TABLE IF NOT EXISTS section_settings (
          section_name TEXT PRIMARY KEY,
          start_time TEXT, end_time TEXT
        );
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

        // Migration check for missing columns
        const tableInfo = db.getAllSync("PRAGMA table_info(tasks)");
        const columnNames = tableInfo.map((c) => c.name);
        if (!columnNames.includes("notificationId")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN notificationId TEXT DEFAULT '[]';"
          );
        }
        if (!columnNames.includes("isPinned")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN isPinned INTEGER DEFAULT 0;");
        }
        if (!columnNames.includes("completedAt")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN completedAt TEXT;");
        }
        if (!columnNames.includes("createdAt")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN createdAt TEXT;");
        }
        if (!columnNames.includes("repeatType")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN repeatType TEXT DEFAULT 'none';");
        }
        if (!columnNames.includes("repeatDays")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN repeatDays TEXT DEFAULT '[]';");
        }
        if (!columnNames.includes("repeatMonthlyType")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN repeatMonthlyType TEXT DEFAULT '';"
          );
        }
        if (!columnNames.includes("repeatCustomDate")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN repeatCustomDate TEXT DEFAULT '';"
          );
        }
        if (!columnNames.includes("repeatYearlyDate")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN repeatYearlyDate TEXT DEFAULT '';"
          );
        }
        if (!columnNames.includes("repeatGroupId")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN repeatGroupId TEXT DEFAULT '';");
        }
        if (!columnNames.includes("moodType")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN moodType TEXT DEFAULT '';");
        }
        if (!columnNames.includes("firstAction")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN firstAction TEXT DEFAULT '';");
        }
        if (!columnNames.includes("minimumVersion")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN minimumVersion TEXT DEFAULT '';"
          );
        }
        if (!columnNames.includes("energyRequired")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN energyRequired TEXT DEFAULT '';");
        }
        if (!columnNames.includes("focusRequired")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN focusRequired TEXT DEFAULT '';");
        }
        if (!columnNames.includes("taskContext")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN taskContext TEXT DEFAULT '';");
        }
        if (!columnNames.includes("estimatedMinutes")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN estimatedMinutes INTEGER;");
        }
        if (!columnNames.includes("startAssistUsedCount")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN startAssistUsedCount INTEGER DEFAULT 0;"
          );
        }
        if (!columnNames.includes("lastStartAssistAt")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN lastStartAssistAt TEXT;");
        }
        if (!columnNames.includes("stuckCount")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN stuckCount INTEGER DEFAULT 0;");
        }
        if (!columnNames.includes("lastStuckAt")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN lastStuckAt TEXT;");
        }
        if (!columnNames.includes("reminderOpenCount")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN reminderOpenCount INTEGER DEFAULT 0;");
        }
        if (!columnNames.includes("reminderStartNowCount")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN reminderStartNowCount INTEGER DEFAULT 0;"
          );
        }
        if (!columnNames.includes("reminderSnoozeCount")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN reminderSnoozeCount INTEGER DEFAULT 0;");
        }
        if (!columnNames.includes("reminderMoveGentlyCount")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN reminderMoveGentlyCount INTEGER DEFAULT 0;"
          );
        }
        if (!columnNames.includes("reminderMakeSmallerCount")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN reminderMakeSmallerCount INTEGER DEFAULT 0;"
          );
        }
        if (!columnNames.includes("lastReminderActionAt")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN lastReminderActionAt TEXT;");
        }
        if (!columnNames.includes("lastReminderAction")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN lastReminderAction TEXT;");
        }
        if (!columnNames.includes("reminderActionHistory")) {
          db.execSync(
            "ALTER TABLE tasks ADD COLUMN reminderActionHistory TEXT DEFAULT '[]';"
          );
        }
        if (!columnNames.includes("snoozeCount")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN snoozeCount INTEGER DEFAULT 0;");
        }
        if (!columnNames.includes("lastSnoozedAt")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN lastSnoozedAt TEXT;");
        }
        if (!columnNames.includes("rescheduleCount")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN rescheduleCount INTEGER DEFAULT 0;");
        }
        if (!columnNames.includes("lastRescheduledAt")) {
          db.execSync("ALTER TABLE tasks ADD COLUMN lastRescheduledAt TEXT;");
        }
        db.runSync(
          `UPDATE tasks
           SET createdAt = COALESCE(NULLIF(scheduledTime, ''), NULLIF(completedAt, ''), createdAt)
           WHERE createdAt IS NULL OR TRIM(createdAt) = ''`
        );

        // 3. Load All Data (Tasks + Section Settings)
        const taskResult = db.getAllSync("SELECT * FROM tasks") || [];
        const loadedTasks = taskResult.map((t) => ({
          ...t,
          completed: t.completed === 1,
          completedAt: t.completedAt || null,
          createdAt: t.createdAt || null,
          moodType: t.moodType || "",
          firstAction: t.firstAction || "",
          minimumVersion: t.minimumVersion || "",
          energyRequired: normalizeEnergyRequiredValue(t.energyRequired),
          focusRequired: normalizeFocusRequiredValue(t.focusRequired),
          taskContext: normalizeTaskContextValue(t.taskContext),
          estimatedMinutes: normalizeEstimatedMinutesValue(t.estimatedMinutes),
          startAssistUsedCount: Number(t.startAssistUsedCount || 0),
          lastStartAssistAt: t.lastStartAssistAt || "",
          stuckCount: Number(t.stuckCount || 0),
          lastStuckAt: t.lastStuckAt || "",
          reminderOpenCount: Number(t.reminderOpenCount || 0),
          reminderStartNowCount: Number(t.reminderStartNowCount || 0),
          reminderSnoozeCount: Number(t.reminderSnoozeCount || 0),
          reminderMoveGentlyCount: Number(t.reminderMoveGentlyCount || 0),
          reminderMakeSmallerCount: Number(t.reminderMakeSmallerCount || 0),
          lastReminderActionAt: toIsoStringOrEmpty(t.lastReminderActionAt),
          lastReminderAction:
            typeof t.lastReminderAction === "string" ? t.lastReminderAction : "",
          reminderActionHistory: parseReminderActionHistory(t.reminderActionHistory),
          snoozeCount: Number(t.snoozeCount || 0),
          lastSnoozedAt: toIsoStringOrEmpty(t.lastSnoozedAt),
          rescheduleCount: Number(t.rescheduleCount || 0),
          lastRescheduledAt: toIsoStringOrEmpty(t.lastRescheduledAt),
          repeatType: normalizeRepeatType(t.repeatType),
          repeatDays: parseRepeatDays(t.repeatDays),
          repeatMonthlyType: t.repeatMonthlyType || "",
          repeatCustomDate: t.repeatCustomDate || "",
          repeatYearlyDate: t.repeatYearlyDate || "",
          repeatGroupId: t.repeatGroupId || "",
          subtasks: JSON.parse(t.subtasks || "[]"),
          notificationId: JSON.parse(t.notificationId || "[]"),
          isPinned: t.isPinned === 1,
        }));
        setTasks(loadedTasks);
        loadDailyMoodEntries();

        const settingsResult =
          db.getAllSync("SELECT * FROM section_settings") || [];
        if (settingsResult.length > 0) {
          const savedTimes = { ...sectionTimes };
          settingsResult.forEach((row) => {
            savedTimes[row.section_name] = {
              start: row.start_time || "",
              end: row.end_time || "",
            };
          });
          setSectionTimes(savedTimes);
        }

        console.log("✅ App fully armed and data loaded.");
        const today = getDateKey();
        ensureDailyStatsRow(today);

        const profileRows =
          db.getAllSync("SELECT * FROM app_profile WHERE id = 1") || [];
        const profileRow = profileRows[0];
        const nextProfile = profileRow
          ? {
              name: profileRow.name || "",
              profileImage: profileRow.profileImage || "",
              vibe: profileRow.vibe || "🌿",
              onboardingComplete: profileRow.onboardingComplete === 1,
            }
          : DEFAULT_PROFILE;

        if (!profileRow) {
          saveProfile(DEFAULT_PROFILE);
        } else {
          setProfile(nextProfile);
          setProfileDraftName(nextProfile.name);
          setProfileDraftVibe(nextProfile.vibe);
        }
        setOnboardingVisible(!nextProfile.onboardingComplete);

        const appSettings = getSettingsMap();
        setLastTodayPlanPromptDate(
          appSettings[LAST_TODAY_PLAN_PROMPT_DATE_KEY] || ""
        );
        const todayRow = getDailyStatsRow(today);
        const existingCompleted = loadedTasks.filter((t) => t.completed).length;
        const lifetimeCompletedTasks = Number(
          appSettings.lifetimeCompletedTasks || existingCompleted
        );
        const lifetimeFocusTime = Number(appSettings.lifetimeFocusTime || 0);
        const isMutedFromSettings = appSettings.voiceMuted === "true";
        const startAssistReadAloudFromSettings =
          appSettings.startAssistReadAloudEnabled === "true";
        setIsVoiceMuted(isMutedFromSettings);
        setStartAssistReadAloudEnabled(startAssistReadAloudFromSettings);

        if (
          !hasPlayedWelcomeVoiceRef.current &&
          !isMutedFromSettings &&
          appStateRef.current === "active"
        ) {
          const welcomeMessage = pickWelcomeMessage(
            appSettings.lastWelcomeVoiceMessage || ""
          );
          if (welcomeMessage) {
            hasPlayedWelcomeVoiceRef.current = true;
            if (welcomeVoiceTimeoutRef.current) {
              clearTimeout(welcomeVoiceTimeoutRef.current);
            }
            welcomeVoiceTimeoutRef.current = setTimeout(() => {
              void speakEncouragement({
                muted: false,
                message: welcomeMessage,
                minGapMs: 1600,
                interruptExisting: false,
              }).then((didSpeak) => {
                if (didSpeak) {
                  saveSetting("lastWelcomeVoiceMessage", welcomeMessage);
                }
              });
              welcomeVoiceTimeoutRef.current = null;
            }, WELCOME_VOICE_DELAY_MS);
          }
        }

        if (!appSettings.lifetimeCompletedTasks) {
          saveSetting("lifetimeCompletedTasks", lifetimeCompletedTasks);
        }
        if (!appSettings.lastActiveDate) {
          saveSetting("lastActiveDate", today);
        }

        const restoredTimerState = deserializeTimerState(
          appSettings[FOCUS_TIMER_STATE_KEY]
        );
        if (
          restoredTimerState?.activeTaskId &&
          loadedTasks.some((task) => task.id === restoredTimerState.activeTaskId)
        ) {
          const restoredIsFocusCompleted = Boolean(
            restoredTimerState.isFocusCompleted
          );
          setActiveTaskId(restoredTimerState.activeTaskId);
          setFocusTime(restoredTimerState.focusTime || 0);
          setCurrentDuration(restoredTimerState.currentDuration || 1500);
          setIsTimerRunning(Boolean(restoredTimerState.isTimerRunning));
          setIsFocusCompleted(restoredIsFocusCompleted);
          setFocusCompletionCountdown(
            restoredIsFocusCompleted
              ? FOCUS_AUTO_DISMISS_COUNTDOWN_SECONDS
              : 0
          );
          setFocusStartTimestamp(restoredTimerState.focusStartTimestamp || null);
          setFocusEndTimestamp(restoredTimerState.focusEndTimestamp || null);
        } else {
          clearPersistedFocusTimerState();
        }

        setDailyStats({
          date: today,
          completedTasks: todayRow.completedTasks || 0,
          totalFocusTime: todayRow.totalFocusTime || 0,
          streakValue: todayRow.streakValue || 0,
        });
        setTotalFocusTime(todayRow.totalFocusTime || 0);
        setProductivityStats({
          currentStreak: Number(appSettings.currentStreak || 0),
          bestStreak: Number(appSettings.bestStreak || 0),
          lifetimeFocusTime,
          lifetimeCompletedTasks,
          lastActiveDate: appSettings.lastActiveDate || today,
          lastQualifiedDate: appSettings.lastQualifiedDate || "",
          showStreak: appSettings.showStreak !== "false",
        });
        refreshSpecialTasks();
        checkDailyReset();
      } catch (e) {
        console.log("🚨 Master Boot Error:", e);
      } finally {
        setTasksHydrated(true);
      }
    };

    initializeApp();
  }, [clearPersistedFocusTimerState, loadDailyMoodEntries]);

  const hasHandledNotificationResponse = useCallback((dedupeKey = "") => {
    if (!dedupeKey) return false;
    return handledNotificationResponseKeysRef.current.has(dedupeKey);
  }, []);

  const markNotificationResponseHandled = useCallback((dedupeKey = "") => {
    if (!dedupeKey) return;
    if (handledNotificationResponseKeysRef.current.has(dedupeKey)) return;

    handledNotificationResponseKeysRef.current.add(dedupeKey);
    handledNotificationResponseKeyOrderRef.current.push(dedupeKey);

    if (handledNotificationResponseKeyOrderRef.current.length > 80) {
      const evicted = handledNotificationResponseKeyOrderRef.current.shift();
      if (evicted) {
        handledNotificationResponseKeysRef.current.delete(evicted);
      }
    }
  }, []);

  const trackReminderAction = useCallback((taskId, action, metadata = {}) => {
    const numericTaskId = Number(taskId);
    if (!Number.isFinite(numericTaskId) || !action) return false;

    const allTasks = Array.isArray(tasksRef.current) ? tasksRef.current : [];
    const currentTask = allTasks.find((task) => task.id === numericTaskId);
    if (!currentTask || currentTask.completed) return false;

    const nowIso =
      typeof metadata.at === "string" && metadata.at.trim()
        ? metadata.at.trim()
        : new Date().toISOString();
    const isSnoozeAction =
      action === REMINDER_ACTIONS.SNOOZE_10 ||
      action === REMINDER_ACTIONS.SNOOZE_30;

    const reminderOffsetRaw =
      metadata.reminderOffsetMinutes ?? metadata.minutesBefore;
    const reminderOffsetMinutes = Number.isFinite(Number(reminderOffsetRaw))
      ? Number(reminderOffsetRaw)
      : undefined;

    const historyEntry = {
      id: `${metadata.notificationId || numericTaskId}:${action}:${nowIso}`,
      action,
      at: nowIso,
      notificationId: metadata.notificationId || undefined,
      reminderOffsetMinutes,
      source: metadata.source || "notificationAction",
    };

    const nextTask = {
      ...currentTask,
      reminderOpenCount:
        action === REMINDER_ACTIONS.OPENED
          ? Number(currentTask.reminderOpenCount || 0) + 1
          : Number(currentTask.reminderOpenCount || 0),
      reminderStartNowCount:
        action === REMINDER_ACTIONS.START_NOW
          ? Number(currentTask.reminderStartNowCount || 0) + 1
          : Number(currentTask.reminderStartNowCount || 0),
      reminderSnoozeCount: isSnoozeAction
        ? Number(currentTask.reminderSnoozeCount || 0) + 1
        : Number(currentTask.reminderSnoozeCount || 0),
      reminderMoveGentlyCount:
        action === REMINDER_ACTIONS.MOVE_GENTLY
          ? Number(currentTask.reminderMoveGentlyCount || 0) + 1
          : Number(currentTask.reminderMoveGentlyCount || 0),
      reminderMakeSmallerCount:
        action === REMINDER_ACTIONS.MAKE_SMALLER
          ? Number(currentTask.reminderMakeSmallerCount || 0) + 1
          : Number(currentTask.reminderMakeSmallerCount || 0),
      lastReminderAction: action,
      lastReminderActionAt: nowIso,
      reminderActionHistory: [
        ...parseReminderActionHistory(currentTask.reminderActionHistory),
        historyEntry,
      ].slice(-REMINDER_ACTION_HISTORY_LIMIT),
      snoozeCount: isSnoozeAction
        ? Number(currentTask.snoozeCount || 0) + 1
        : Number(currentTask.snoozeCount || 0),
      lastSnoozedAt: isSnoozeAction
        ? nowIso
        : toIsoStringOrEmpty(currentTask.lastSnoozedAt),
      rescheduleCount: Number(currentTask.rescheduleCount || 0),
      lastRescheduledAt: toIsoStringOrEmpty(currentTask.lastRescheduledAt),
    };

    try {
      db.runSync(
        `UPDATE tasks
         SET reminderOpenCount = ?,
             reminderStartNowCount = ?,
             reminderSnoozeCount = ?,
             reminderMoveGentlyCount = ?,
             reminderMakeSmallerCount = ?,
             lastReminderAction = ?,
             lastReminderActionAt = ?,
             reminderActionHistory = ?,
             snoozeCount = ?,
             lastSnoozedAt = ?,
             rescheduleCount = ?,
             lastRescheduledAt = ?
         WHERE id = ?`,
        [
          Number(nextTask.reminderOpenCount || 0),
          Number(nextTask.reminderStartNowCount || 0),
          Number(nextTask.reminderSnoozeCount || 0),
          Number(nextTask.reminderMoveGentlyCount || 0),
          Number(nextTask.reminderMakeSmallerCount || 0),
          nextTask.lastReminderAction || "",
          nextTask.lastReminderActionAt || null,
          JSON.stringify(nextTask.reminderActionHistory || []),
          Number(nextTask.snoozeCount || 0),
          nextTask.lastSnoozedAt || null,
          Number(nextTask.rescheduleCount || 0),
          nextTask.lastRescheduledAt || null,
          numericTaskId,
        ]
      );
    } catch (error) {
      console.log("Reminder tracking update error:", error);
    }

    setTasks((prev) =>
      prev.map((task) => (task.id === numericTaskId ? nextTask : task))
    );
    return true;
  }, []);

  const clearSnoozeAffirmationTimer = useCallback(() => {
    if (!snoozeAffirmationTimeoutRef.current) return;
    clearTimeout(snoozeAffirmationTimeoutRef.current);
    snoozeAffirmationTimeoutRef.current = null;
  }, []);

  const closeSnoozeAffirmation = useCallback(() => {
    clearSnoozeAffirmationTimer();
    setSnoozeAffirmationModal((prev) =>
      prev.visible ? { ...prev, visible: false } : prev
    );
  }, [clearSnoozeAffirmationTimer]);

  const showSnoozeAffirmation = useCallback(
    ({ taskId, minutes }) => {
      const normalizedMinutes = Number(minutes) === 30 ? 30 : 10;
      const numericTaskId = Number(taskId);

      clearSnoozeAffirmationTimer();
      setSnoozeAffirmationModal({
        visible: true,
        taskId: Number.isFinite(numericTaskId) ? numericTaskId : null,
        minutes: normalizedMinutes,
        title: `Snoozed gently for ${normalizedMinutes} minutes`,
        message: SNOOZE_AFFIRMATION_MESSAGE,
      });

      snoozeAffirmationTimeoutRef.current = setTimeout(() => {
        setSnoozeAffirmationModal((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        snoozeAffirmationTimeoutRef.current = null;
      }, SNOOZE_AFFIRMATION_AUTO_CLOSE_DELAY_MS);
    },
    [clearSnoozeAffirmationTimer]
  );

  const handleSnoozeTaskReminder = useCallback(
    async (taskId, minutes, metadata = {}) => {
      const numericTaskId = Number(taskId);
      const snoozeMinutes = Number(minutes);
      if (
        !Number.isFinite(numericTaskId) ||
        !Number.isFinite(snoozeMinutes) ||
        snoozeMinutes <= 0
      ) {
        return null;
      }

      const allTasks = Array.isArray(tasksRef.current) ? tasksRef.current : [];
      const targetTask = allTasks.find((task) => task.id === numericTaskId);
      if (!targetTask || targetTask.completed) return null;

      const reminderDate = new Date(Date.now() + snoozeMinutes * 60 * 1000);
      const contentBody =
        snoozeMinutes === 30
          ? "Still here gently. Want to try the smallest version?"
          : "Still here gently. Start with one tiny step.";

      const reminderContent = buildTaskReminderNotificationContent({
        task: targetTask,
        payload: {
          ...(metadata.originalData || {}),
          taskId: numericTaskId,
          sectionId:
            metadata.sectionId ||
            metadata.section ||
            targetTask.section ||
            null,
          section:
            metadata.section ||
            metadata.category ||
            targetTask.section ||
            null,
          category:
            metadata.category ||
            metadata.section ||
            targetTask.section ||
            null,
          taskTitle: metadata.taskTitle || targetTask.title || "",
          minutesBefore: 0,
          scheduledAt: reminderDate.toISOString(),
          snoozeMinutes,
          originalNotificationId: metadata.notificationId || undefined,
        },
        prefix: "Gentle reminder",
        body: contentBody,
        source: "snooze",
        reminderOffsetMinutes: 0,
      });

      try {
        return await Notifications.scheduleNotificationAsync({
          content: {
            title: reminderContent.title,
            body: reminderContent.body,
            sound: "default",
            data: reminderContent.data,
            categoryIdentifier: TASK_REMINDER_ACTIONS_CATEGORY_ID,
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 250, 250, 250],
            android: {
              channelId: "adhd-alarms",
              color: COLORS.accent,
              pressAction: {
                id: "default",
              },
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderDate,
          },
        });
      } catch (error) {
        console.log("Snooze schedule error:", error);
        return null;
      }
    },
    []
  );

  const queueNotificationTaskNavigation = useCallback((payload, actionMeta = {}) => {
    if (!payload?.taskId) return false;
    notificationActionContextRef.current = actionMeta;
    setPendingNotificationTaskTarget({
      ...payload,
      handled: false,
      actionIdentifier: actionMeta.actionIdentifier || null,
      reminderAction: actionMeta.reminderAction || null,
    });
    return true;
  }, []);

  useEffect(() => {
    const checkSystemSchedule = async () => {
      try {
        const scheduled =
          await Notifications.getAllScheduledNotificationsAsync();
        console.log("------------------------------------------");
        console.log("📊 Count of system reminders:", scheduled.length);

        scheduled.forEach((n, index) => {
          // n.trigger.value is the timestamp for 'date' triggers
          const triggerTime =
            n.trigger.type === "date" || n.trigger.type === "timeInterval"
              ? new Date(n.trigger.value).toLocaleString()
              : "Recurring/Calendar Trigger";

          console.log(
            `${index + 1}. Task: ${n.content.title} | Time: ${triggerTime}`
          );
        });
        console.log("------------------------------------------");
      } catch (e) {
        console.log("❌ Error fetching schedule:", e);
      }
    };

    checkSystemSchedule(); // 🔑 THIS LINE RUNS THE FUNCTION
  }, []); // Runs once when the component mounts

  useEffect(() => {
    const handleNotificationResponse = async (response) => {
      void speakNotificationReminder(
        response?.notification?.request?.content || null
      );

      const data = response?.notification?.request?.content?.data || {};
      const payload = extractTaskNavigationPayload(data);
      const actionIdentifier =
        response?.actionIdentifier || Notifications.DEFAULT_ACTION_IDENTIFIER;
      const notificationIdentifier =
        response?.notification?.request?.identifier || "";
      const dedupeTaskId = payload?.taskId ?? data?.taskId ?? "unknown-task";
      const dedupeKey = `${notificationIdentifier}:${actionIdentifier}:${dedupeTaskId}`;
      if (hasHandledNotificationResponse(dedupeKey)) return;
      markNotificationResponseHandled(dedupeKey);

      if (data?.type === "planTodayReminder") {
        const section = normalizeTodayPlanSection(data?.section);
        setPendingTodayPlanSheet({ open: true, section });
        setTodayPlanNotificationSection(section);
        void Notifications.clearLastNotificationResponseAsync().catch(() => null);
        return;
      }

      const isTaskReminderType = data?.type === "taskReminder";

      if (!isTaskReminderType) {
        if (payload?.taskId) {
          queueNotificationTaskNavigation(payload, {
            actionIdentifier,
            reminderAction: null,
            taskId: payload.taskId,
            notificationId: notificationIdentifier,
            source: "notification",
          });
        }
        void Notifications.clearLastNotificationResponseAsync().catch(() => null);
        return;
      }

      if (!payload?.taskId) {
        void Notifications.clearLastNotificationResponseAsync().catch(() => null);
        return;
      }

      const trackingMetadata = {
        notificationId: notificationIdentifier,
        reminderOffsetMinutes:
          data?.reminderOffsetMinutes ?? data?.minutesBefore ?? undefined,
        source:
          actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
            ? "notification"
            : "notificationAction",
      };

      if (actionIdentifier === TASK_REMINDER_ACTION_IDS.SNOOZE_10) {
        trackReminderAction(
          payload.taskId,
          REMINDER_ACTIONS.SNOOZE_10,
          trackingMetadata
        );
        await handleSnoozeTaskReminder(payload.taskId, 10, {
          ...data,
          originalData: data,
          notificationId: notificationIdentifier,
          sectionId: payload.sectionId || data?.sectionId,
          section: data?.section || data?.category,
          category: data?.category || payload.sectionId,
          taskTitle: payload.taskTitle || data?.taskTitle,
        });
        queueNotificationTaskNavigation(payload, {
          actionIdentifier,
          reminderAction: REMINDER_ACTIONS.SNOOZE_10,
          taskId: payload.taskId,
          taskTitle: payload.taskTitle || data?.taskTitle || "",
          notificationId: notificationIdentifier,
          sectionId: payload.sectionId || data?.sectionId || data?.section || "",
          snoozeMinutes: 10,
        });
        void Notifications.clearLastNotificationResponseAsync().catch(() => null);
        return;
      }

      if (actionIdentifier === TASK_REMINDER_ACTION_IDS.SNOOZE_30) {
        trackReminderAction(
          payload.taskId,
          REMINDER_ACTIONS.SNOOZE_30,
          trackingMetadata
        );
        await handleSnoozeTaskReminder(payload.taskId, 30, {
          ...data,
          originalData: data,
          notificationId: notificationIdentifier,
          sectionId: payload.sectionId || data?.sectionId,
          section: data?.section || data?.category,
          category: data?.category || payload.sectionId,
          taskTitle: payload.taskTitle || data?.taskTitle,
        });
        queueNotificationTaskNavigation(payload, {
          actionIdentifier,
          reminderAction: REMINDER_ACTIONS.SNOOZE_30,
          taskId: payload.taskId,
          taskTitle: payload.taskTitle || data?.taskTitle || "",
          notificationId: notificationIdentifier,
          sectionId: payload.sectionId || data?.sectionId || data?.section || "",
          snoozeMinutes: 30,
        });
        void Notifications.clearLastNotificationResponseAsync().catch(() => null);
        return;
      }

      let reminderAction = REMINDER_ACTIONS.OPENED;
      if (actionIdentifier === TASK_REMINDER_ACTION_IDS.START_NOW) {
        reminderAction = REMINDER_ACTIONS.START_NOW;
      } else if (actionIdentifier === TASK_REMINDER_ACTION_IDS.MOVE_GENTLY) {
        reminderAction = REMINDER_ACTIONS.MOVE_GENTLY;
      } else if (actionIdentifier === TASK_REMINDER_ACTION_IDS.MAKE_SMALLER) {
        reminderAction = REMINDER_ACTIONS.MAKE_SMALLER;
      } else if (actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        reminderAction = REMINDER_ACTIONS.OPENED;
      }

      trackReminderAction(payload.taskId, reminderAction, trackingMetadata);
      queueNotificationTaskNavigation(payload, {
        actionIdentifier,
        reminderAction,
        taskId: payload.taskId,
        taskTitle: payload.taskTitle || data?.taskTitle || "",
        notificationId: notificationIdentifier,
        sectionId: payload.sectionId || data?.sectionId || data?.section || "",
      });

      void Notifications.clearLastNotificationResponseAsync().catch(() => null);
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        void speakNotificationReminder(notification?.request?.content || null);
      }
    );
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void handleNotificationResponse(response);
      }
    );

    void Notifications.getLastNotificationResponseAsync()
      .then((lastResponse) => {
        if (!lastResponse) return;
        void handleNotificationResponse(lastResponse);
      })
      .catch(() => null);

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [
    handleSnoozeTaskReminder,
    hasHandledNotificationResponse,
    markNotificationResponseHandled,
    queueNotificationTaskNavigation,
    speakNotificationReminder,
    trackReminderAction,
  ]);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    loadDailyMoodEntries();
  }, [loadDailyMoodEntries, dailyStats.date]);

  useEffect(() => {
    if (!taskMoodPromptTaskId) return;
    const exists = tasks.some((task) => task.id === taskMoodPromptTaskId);
    if (!exists) {
      setTaskMoodPromptVisible(false);
      setTaskMoodPromptTaskId(null);
    }
  }, [taskMoodPromptTaskId, tasks]);

  useEffect(
    () => () => {
      if (taskHighlightTimeoutRef.current) {
        clearTimeout(taskHighlightTimeoutRef.current);
        taskHighlightTimeoutRef.current = null;
      }
      if (taskNavigationTimeoutRef.current) {
        clearTimeout(taskNavigationTimeoutRef.current);
        taskNavigationTimeoutRef.current = null;
      }
      if (taskHighlightLoopRef.current?.stop) {
        taskHighlightLoopRef.current.stop();
        taskHighlightLoopRef.current = null;
      }
      taskHighlightPulse.stopAnimation();
      taskHighlightPulse.setValue(0);
    },
    [taskHighlightPulse]
  );

  useEffect(() => {
    if (isPinnedSectionExpanded || activeTaskId || !nearestUpcomingSection) return;

    setExpandedSection((prev) => {
      if (prev) return prev;
      if (hasAutoExpandedInitialSection.current) return prev;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const nextAnim = sectionChevronAnims[nearestUpcomingSection];
      if (nextAnim) {
        Animated.timing(nextAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start();
      }
      hasAutoExpandedInitialSection.current = true;
      return nearestUpcomingSection;
    });
  }, [
    activeTaskId,
    isPinnedSectionExpanded,
    nearestUpcomingSection,
    sectionChevronAnims,
  ]);

  useEffect(() => {
    if (!activeTaskId || isPinnedSectionExpanded) return;
    const activeTask = tasks.find((task) => task.id === activeTaskId);
    if (!activeTask || activeTask.isPinned) return;

    setExpandedSection((prev) => {
      if (prev === activeTask.section) return prev;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (prev) {
        const prevAnim = sectionChevronAnims[prev];
        if (prevAnim) {
          Animated.timing(prevAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();
        }
      }

      const nextAnim = sectionChevronAnims[activeTask.section];
      if (nextAnim) {
        Animated.timing(nextAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start();
      }

      return activeTask.section;
    });
  }, [activeTaskId, isPinnedSectionExpanded, sectionChevronAnims, tasks]);

  useEffect(() => {
    if (scheduledDateTime) {
      setTimeError(false);
    }
  }, [scheduledDateTime]);

  useEffect(() => {
    if (lastDeletedTask) {
      setUndoTimer(10); // reset to 10

      const interval = setInterval(() => {
        setUndoTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setLastDeletedTask(null); // hide undo bar
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [lastDeletedTask]);

  useEffect(() => {
    if (isEditMode && editingTask) {
      setTaskName(editingTask.title);
    }
  }, [editingTask, isEditMode]);

  useEffect(() => {
    if (celebration.visible) {
      Animated.spring(modalScale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    } else {
      modalScale.setValue(0.8);
    }
  }, [celebration.visible]);

  useEffect(() => {
    if (
      !isTimerRunning ||
      !activeTaskId ||
      !focusStartTimestamp ||
      !focusEndTimestamp
    ) {
      return;
    }

    const syncTick = () => {
      const nowTimestamp = Date.now();
      const elapsedSeconds = getElapsedSecondsFromTimestamp({
        startTimestamp: focusStartTimestamp,
        nowTimestamp,
        maxDurationSeconds: currentDuration,
      });
      setFocusTime((prev) => (prev === elapsedSeconds ? prev : elapsedSeconds));

      const remainingSeconds = getRemainingSecondsFromTimestamp({
        endTimestamp: focusEndTimestamp,
        nowTimestamp,
      });

      if (remainingSeconds <= 0) {
        completeFocusSession(focusEndTimestamp);
      }
    };

    syncTick();
    const interval = setInterval(syncTick, 1000);
    return () => clearInterval(interval);
  }, [
    activeTaskId,
    completeFocusSession,
    currentDuration,
    focusEndTimestamp,
    focusStartTimestamp,
    isTimerRunning,
  ]);

  useEffect(() => {
    if (!isFocusCompleted || !activeTaskId) {
      clearFocusCompletionAutoClose({ resetCountdown: true });
      return;
    }

    const completedTaskId = activeTaskId;
    focusCompletionTaskIdRef.current = completedTaskId;
    focusCompletionDeadlineRef.current = Date.now() + FOCUS_AUTO_DISMISS_DELAY_MS;

    const syncCountdown = () => {
      const deadline = focusCompletionDeadlineRef.current;
      if (!deadline) return;

      const remainingSeconds = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000)
      );
      setFocusCompletionCountdown((prev) =>
        prev === remainingSeconds ? prev : remainingSeconds
      );

      if (remainingSeconds <= 0) {
        closeCompletedFocusPanel(completedTaskId);
      }
    };

    syncCountdown();
    if (focusCompletionIntervalRef.current) {
      clearInterval(focusCompletionIntervalRef.current);
    }
    focusCompletionIntervalRef.current = setInterval(syncCountdown, 1000);

    return () => {
      if (focusCompletionIntervalRef.current) {
        clearInterval(focusCompletionIntervalRef.current);
        focusCompletionIntervalRef.current = null;
      }
    };
  }, [
    activeTaskId,
    clearFocusCompletionAutoClose,
    closeCompletedFocusPanel,
    isFocusCompleted,
  ]);

  useEffect(() => {
    if (!activeTaskId) return;

    const activeTaskExists = tasks.some(
      (task) =>
        Number(task?.id) === Number(activeTaskId) &&
        !task?.completed &&
        !isTaskDeletedOrArchived(task)
    );
    if (activeTaskExists) return;

    if (isFocusCompleted) {
      closeCompletedFocusPanel(activeTaskId);
      return;
    }

    clearFocusCompletionAutoClose({ resetCountdown: true });
    setIsTimerRunning(false);
    setIsFocusCompleted(false);
    setFocusTime(0);
    setFocusStartTimestamp(null);
    setFocusEndTimestamp(null);
    setActiveTaskId(null);
    setCurrentFocusedTaskId((prev) =>
      Number(prev) === Number(activeTaskId) ? null : prev
    );
    focusSessionRecordedRef.current = false;
    timerCompletionStampRef.current = null;
    clearPersistedFocusTimerState();
    void cancelFocusCompletionReminder();
  }, [
    activeTaskId,
    cancelFocusCompletionReminder,
    clearFocusCompletionAutoClose,
    clearPersistedFocusTimerState,
    closeCompletedFocusPanel,
    isFocusCompleted,
    tasks,
  ]);

  useEffect(
    () => () => {
      clearFocusCompletionAutoClose({ resetCountdown: false });
      if (welcomeVoiceTimeoutRef.current) {
        clearTimeout(welcomeVoiceTimeoutRef.current);
        welcomeVoiceTimeoutRef.current = null;
      }
      if (startAssistVoiceHintTimeoutRef.current) {
        clearTimeout(startAssistVoiceHintTimeoutRef.current);
        startAssistVoiceHintTimeoutRef.current = null;
      }
      if (snoozeAffirmationTimeoutRef.current) {
        clearTimeout(snoozeAffirmationTimeoutRef.current);
        snoozeAffirmationTimeoutRef.current = null;
      }
      if (todayPlanCelebrationTimeoutRef.current) {
        clearTimeout(todayPlanCelebrationTimeoutRef.current);
        todayPlanCelebrationTimeoutRef.current = null;
      }
      void cancelFocusCompletionReminder();
      void stopEncouragement();
    },
    [cancelFocusCompletionReminder, clearFocusCompletionAutoClose]
  );

  useEffect(() => {
    dailyProgressValue.value = withTiming(progressPercentage, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
  }, [dailyProgressValue, progressPercentage]);

  useEffect(() => {
    if (!recoveryModalVisible) return;
    recoverySheetProgress.value = 0;
    requestAnimationFrame(() => {
      recoverySheetProgress.value = withTiming(1, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    });
  }, [recoveryModalVisible, recoverySheetProgress]);

  useEffect(() => {
    if (!recoverySuccessMessage) return;
    const timer = setTimeout(() => {
      setRecoverySuccessMessage("");
    }, 1800);
    return () => clearTimeout(timer);
  }, [recoverySuccessMessage]);

  useEffect(() => {
    if (!recoveryModalVisible) return;
    loadRecoveryPendingTasks(true);
  }, [loadRecoveryPendingTasks, recoveryModalVisible, tasks]);

  useEffect(() => {
    if (!todayPlanSheetVisible) return;
    todayPlanSheetProgress.value = 0;
    requestAnimationFrame(() => {
      todayPlanSheetProgress.value = withTiming(1, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      });
    });
  }, [todayPlanSheetProgress, todayPlanSheetVisible]);

  useEffect(() => {
    if (!tasksHydrated || !pendingTodayPlanSheet.open) return;
    openTodayPlanSheet(pendingTodayPlanSheet.section);
    setPendingTodayPlanSheet({ open: false, section: null });
  }, [openTodayPlanSheet, pendingTodayPlanSheet, tasksHydrated]);

  useEffect(() => {
    if (!tasksHydrated) return;
    if (hasPendingTodayTasksFlag) return;

    const todayKey = getLocalDateKey(new Date());
    if (lastTodayPlanPromptDate === todayKey) return;

    openTodayPlanSheet();
    markTodayPlanPromptShown(todayKey);
  }, [
    hasPendingTodayTasksFlag,
    lastTodayPlanPromptDate,
    markTodayPlanPromptShown,
    openTodayPlanSheet,
    tasksHydrated,
  ]);

  useEffect(() => {
    if (!tasksHydrated) return;
    void scheduleTodayPlanNotifications();
  }, [scheduleTodayPlanNotifications, tasksHydrated]);

  useEffect(() => {
    const interval = setInterval(checkDailyReset, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    refreshSectionAffirmations();
    const interval = setInterval(refreshSectionAffirmations, 45000);
    return () => clearInterval(interval);
  }, [refreshSectionAffirmations]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;

      if (nextState === "active") {
        refreshSectionAffirmations();

        if (isFocusCompleted && activeTaskId) {
          const deadline = focusCompletionDeadlineRef.current;
          if (deadline) {
            const remainingSeconds = Math.max(
              0,
              Math.ceil((deadline - Date.now()) / 1000)
            );
            setFocusCompletionCountdown((prev) =>
              prev === remainingSeconds ? prev : remainingSeconds
            );
            if (remainingSeconds <= 0) {
              closeCompletedFocusPanel(activeTaskId);
              return;
            }
          }
        }

        if (isTimerRunning && focusStartTimestamp && focusEndTimestamp) {
          const nowTimestamp = Date.now();
          const elapsedSeconds = getElapsedSecondsFromTimestamp({
            startTimestamp: focusStartTimestamp,
            nowTimestamp,
            maxDurationSeconds: currentDuration,
          });
          setFocusTime((prev) => (prev === elapsedSeconds ? prev : elapsedSeconds));

          const remainingSeconds = getRemainingSecondsFromTimestamp({
            endTimestamp: focusEndTimestamp,
            nowTimestamp,
          });
          if (remainingSeconds <= 0) {
            completeFocusSession(focusEndTimestamp);
          }
        }

        return;
      }

      const elapsedForSave =
        isTimerRunning && focusStartTimestamp
          ? getElapsedSecondsFromTimestamp({
              startTimestamp: focusStartTimestamp,
              nowTimestamp: Date.now(),
              maxDurationSeconds: currentDuration,
            })
          : focusTime;

      persistFocusTimerState({
        activeTaskId,
        focusTime: elapsedForSave,
        currentDuration,
        isTimerRunning,
        isFocusCompleted,
        focusStartTimestamp,
        focusEndTimestamp,
      });
    });

    return () => subscription.remove();
  }, [
    activeTaskId,
    completeFocusSession,
    currentDuration,
    focusEndTimestamp,
    focusStartTimestamp,
    focusTime,
    closeCompletedFocusPanel,
    isFocusCompleted,
    isTimerRunning,
    persistFocusTimerState,
    refreshSectionAffirmations,
  ]);

  useEffect(() => {
    const getContextAffirmations = () => {
      if (activeTaskId) {
        return [
          "Stay with the moment. You're doing great 🎯",
          "Calm focus beats rushed effort ☁️",
          "This one task deserves gentle attention ✨",
        ];
      }
      if (tasks.length === 0) {
        return ["Let's begin with one simple win 🌱", "A tiny first step is enough today ✨"];
      }
      if (tasks.filter((task) => !task.completed).length >= 6) {
        return ["One task at a time is enough today 💙", "You do not need to carry the whole list at once 🌊"];
      }
      if (progressPercentage >= 70) {
        return ["Look how far you've already come 🚀", "Momentum is already on your side ✨"];
      }
      return affirmations;
    };

    const interval = setInterval(() => {
      const options = getContextAffirmations();
      const nextOptions = options.filter((item) => item !== currentAffirmation);
      const next =
        nextOptions[Math.floor(Math.random() * nextOptions.length)] || options[0];

      Animated.sequence([
        Animated.timing(affirmationOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(affirmationOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => setCurrentAffirmation(next), 220);
    }, 6500);

    return () => clearInterval(interval);
  }, [activeTaskId, currentAffirmation, progressPercentage, tasks]);

  const [modalVisible, setModalVisible] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskFirstAction, setTaskFirstAction] = useState("");
  const [taskMinimumVersion, setTaskMinimumVersion] = useState("");
  const [taskEnergyRequired, setTaskEnergyRequired] = useState("");
  const [taskFocusRequired, setTaskFocusRequired] = useState("");
  const [taskContext, setTaskContext] = useState("");
  const [taskEstimatedMinutes, setTaskEstimatedMinutes] = useState(null);
  const [isEnergyEffortExpanded, setIsEnergyEffortExpanded] = useState(false);
  const [selectedSection, setSelectedSection] = useState("Morning");
  const [repeatType, setRepeatType] = useState(REPEAT_TYPES.NONE);
  const [repeatDays, setRepeatDays] = useState([]);
  const [repeatMonthlyType, setRepeatMonthlyType] = useState(
    MONTHLY_REPEAT_TYPES.FIRST
  );
  const [repeatCustomDate, setRepeatCustomDate] = useState("");
  const [repeatYearlyDate, setRepeatYearlyDate] = useState("");
  const [editRepeatScopeModalVisible, setEditRepeatScopeModalVisible] =
    useState(false);
  const [pendingEditPayload, setPendingEditPayload] = useState(null);

  const runLayoutAnimation = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, []);

  const animateSectionChevron = useCallback(
    (section, expanded) => {
      const anim = sectionChevronAnims[section];
      if (!anim) return;

      Animated.timing(anim, {
        toValue: expanded ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    },
    [sectionChevronAnims]
  );

  const toggleSectionExpansion = useCallback(
    (section) => {
      setExpandedSection((prev) => {
        const nextSection = prev === section ? null : section;
        if (nextSection === prev) return prev;

        runLayoutAnimation();
        if (isPinnedSectionExpanded) {
          setIsPinnedSectionExpanded(false);
          Animated.timing(pinnedChevronAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();
        }
        if (prev) animateSectionChevron(prev, false);
        if (nextSection) animateSectionChevron(nextSection, true);
        if (nextSection) {
          hasAutoExpandedInitialSection.current = true;
        }

        return nextSection;
      });
    },
    [animateSectionChevron, isPinnedSectionExpanded, pinnedChevronAnim, runLayoutAnimation]
  );

  const togglePinnedSection = useCallback(() => {
    runLayoutAnimation();
    setIsPinnedSectionExpanded((prev) => {
      const next = !prev;
      Animated.timing(pinnedChevronAnim, {
        toValue: next ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
      if (next) {
        setExpandedSection((current) => {
          if (current) {
            animateSectionChevron(current, false);
          }
          return null;
        });
      }
      return next;
    });
  }, [animateSectionChevron, pinnedChevronAnim, runLayoutAnimation]);

  useEffect(() => {
    if (!isPinnedSectionExpanded || pinnedTaskCount > 0) return;
    runLayoutAnimation();
    setIsPinnedSectionExpanded(false);
    Animated.timing(pinnedChevronAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isPinnedSectionExpanded, pinnedChevronAnim, pinnedTaskCount, runLayoutAnimation]);

  const toggleTaskCardExpansion = useCallback(
    (taskId) => {
      if (isSubtaskReordering) return;
      runLayoutAnimation();
      setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
    },
    [isSubtaskReordering, runLayoutAnimation]
  );

  const cancelTaskReminders = useCallback(async (notificationValue) => {
    if (!notificationValue) return;

    try {
      const ids = Array.isArray(notificationValue)
        ? notificationValue
        : JSON.parse(notificationValue || "[]");

      if (!Array.isArray(ids) || !ids.length) return;

      await Promise.all(
        ids.map((notifId) =>
          Notifications.cancelScheduledNotificationAsync(notifId).catch(
            () => null
          )
        )
      );
    } catch (error) {
      console.log("Reminder cancel error:", error);
    }
  }, []);

  const createNextRecurringTaskInstance = async (completedTask) => {
      if (!completedTask || !isRepeatingTask(completedTask)) return;

      const normalized = normalizeTaskRepeatSettings(completedTask);
      const sourceWithRepeat = {
        ...completedTask,
        ...normalized,
      };
      const nextTask = buildNextRecurringTask(sourceWithRepeat);
      if (!nextTask?.scheduledTime) return;

      const repeatGroupId = normalized.repeatGroupId || createRepeatGroupId();
      const existing =
        db.getFirstSync(
          "SELECT id FROM tasks WHERE repeatGroupId = ? AND scheduledTime = ? LIMIT 1",
          [repeatGroupId, nextTask.scheduledTime]
        ) || null;

      if (existing?.id) return;

      const createdAt = formatSqliteDateTime(new Date());

      const result = db.runSync(
        `INSERT INTO tasks (
          title,
          section,
          completed,
          completedAt,
          createdAt,
          repeatType,
          repeatDays,
          repeatMonthlyType,
          repeatCustomDate,
          repeatYearlyDate,
          repeatGroupId,
          scheduledTime,
          details,
          attachment,
          subtasks,
          notificationId,
          isPinned,
          moodType,
          firstAction,
          minimumVersion,
          energyRequired,
          focusRequired,
          taskContext,
          estimatedMinutes,
          startAssistUsedCount,
          lastStartAssistAt,
          stuckCount,
          lastStuckAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nextTask.title || "Task",
          nextTask.section || "Morning",
          0,
          null,
          createdAt,
          normalized.repeatType,
          serializeRepeatDays(normalized.repeatDays),
          normalized.repeatMonthlyType || "",
          normalized.repeatCustomDate || "",
          normalized.repeatYearlyDate || "",
          repeatGroupId,
          nextTask.scheduledTime || "",
          nextTask.details || "",
          nextTask.attachment || "",
          JSON.stringify(nextTask.subtasks || []),
          JSON.stringify([]),
          0,
          nextTask.moodType || "",
          nextTask.firstAction || "",
          nextTask.minimumVersion || "",
          normalizeEnergyRequiredValue(nextTask.energyRequired),
          normalizeFocusRequiredValue(nextTask.focusRequired),
          normalizeTaskContextValue(nextTask.taskContext),
          normalizeEstimatedMinutesValue(nextTask.estimatedMinutes),
          Number(nextTask.startAssistUsedCount || 0),
          nextTask.lastStartAssistAt || null,
          Number(nextTask.stuckCount || 0),
          nextTask.lastStuckAt || null,
        ]
      );

      const insertedId = result.lastInsertRowId;
      const scheduledIds = await scheduleProReminders({
        ...nextTask,
        id: insertedId,
        title: sourceWithRepeat.title,
      }, { source: "recurring" });
      db.runSync("UPDATE tasks SET notificationId = ? WHERE id = ?", [
        JSON.stringify(scheduledIds),
        insertedId,
      ]);

      setTasks((prev) => [
        ...prev,
        {
          ...nextTask,
          id: insertedId,
          repeatType: normalized.repeatType,
          repeatDays: normalized.repeatDays,
          repeatMonthlyType: normalized.repeatMonthlyType,
          repeatCustomDate: normalized.repeatCustomDate,
          repeatYearlyDate: normalized.repeatYearlyDate,
          repeatGroupId,
          notificationId: scheduledIds,
          completed: false,
          completedAt: null,
          createdAt,
          isPinned: false,
          moodType: nextTask.moodType || "",
          firstAction: nextTask.firstAction || "",
          minimumVersion: nextTask.minimumVersion || "",
          energyRequired: normalizeEnergyRequiredValue(nextTask.energyRequired),
          focusRequired: normalizeFocusRequiredValue(nextTask.focusRequired),
          taskContext: normalizeTaskContextValue(nextTask.taskContext),
          estimatedMinutes: normalizeEstimatedMinutesValue(nextTask.estimatedMinutes),
          startAssistUsedCount: Number(nextTask.startAssistUsedCount || 0),
          lastStartAssistAt: nextTask.lastStartAssistAt || "",
          stuckCount: Number(nextTask.stuckCount || 0),
          lastStuckAt: nextTask.lastStuckAt || "",
          reminderOpenCount: 0,
          reminderStartNowCount: 0,
          reminderSnoozeCount: 0,
          reminderMoveGentlyCount: 0,
          reminderMakeSmallerCount: 0,
          lastReminderActionAt: "",
          lastReminderAction: "",
          reminderActionHistory: [],
          snoozeCount: 0,
          lastSnoozedAt: "",
          rescheduleCount: 0,
          lastRescheduledAt: "",
        },
      ]);
  };

  //*****handler functions*********** */
  // ✅ TOGGLE TASK
  const toggleTask = async (id) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;

        const updated = !task.completed;
        const nextPinned = updated ? false : !!task.isPinned;
        const completedAt = updated ? formatSqliteDateTime(new Date()) : null;
        const normalizedRepeat = normalizeTaskRepeatSettings(task);
        const repeatGroupId =
          normalizedRepeat.repeatGroupId ||
          (isRepeatingTask(task) ? createRepeatGroupId() : "");

        if (updated) {
          setLastCompletedTaskId(task.id);
          recordDailyCompletion();
          showCelebration("Task completed! Keep going", "OK");
          cancelTaskReminders(task.notificationId);
          void sendTaskCompletionNotification({ taskTitle: task.title });
          void speakEncouragement({
            muted: isVoiceMuted,
            message: buildTaskCompletionSpeechMessage(task.title),
          });
          if (!isValidMoodType(task.moodType)) {
            setTaskMoodPromptTaskId(task.id);
            setTaskMoodPromptVisible(true);
          }
        }

        if (task.id === activeTaskId && updated) {
          setIsTimerRunning(false);
          clearFocusCompletionAutoClose({ resetCountdown: true });

          if (focusTime > 0 && !focusSessionRecordedRef.current) {
            recordFocusSession(focusTime);
          }
          focusSessionRecordedRef.current = false;
          timerCompletionStampRef.current = null;

          setFocusTime(0);
          setIsFocusCompleted(false);
          setFocusStartTimestamp(null);
          setFocusEndTimestamp(null);
          setActiveTaskId(null);
          clearPersistedFocusTimerState();
          void cancelFocusCompletionReminder();
        }

        try {
          db.runSync(
            "UPDATE tasks SET completed = ?, isPinned = ?, completedAt = ?, repeatGroupId = ? WHERE id = ?",
            [updated ? 1 : 0, nextPinned ? 1 : 0, completedAt, repeatGroupId, id]
          );
        } catch (error) {
          console.log("Update error:", error);
        }

        if (updated && isRepeatingTask(task)) {
          createNextRecurringTaskInstance({
            ...task,
            ...normalizedRepeat,
            repeatGroupId,
            completed: true,
            completedAt,
            isPinned: false,
          }).catch((error) => {
            console.log("Recurring generation error:", error);
          });
        }

        return {
          ...task,
          completed: updated,
          completedAt,
          repeatType: normalizedRepeat.repeatType,
          repeatDays: normalizedRepeat.repeatDays,
          repeatMonthlyType: normalizedRepeat.repeatMonthlyType,
          repeatCustomDate: normalizedRepeat.repeatCustomDate,
          repeatYearlyDate: normalizedRepeat.repeatYearlyDate,
          repeatGroupId,
          isPinned: nextPinned,
        };
      })
    );
  };

  const togglePinnedTask = useCallback((taskId) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId || task.completed) return task;
        const nextPinned = !task.isPinned;

        try {
          db.runSync("UPDATE tasks SET isPinned = ? WHERE id = ?", [
            nextPinned ? 1 : 0,
            taskId,
          ]);
        } catch (error) {
          console.log("Pin update error:", error);
          return task;
        }

        return { ...task, isPinned: nextPinned };
      })
    );
  }, []);

  const recreateCompletedTask = async (task) => {
    if (!task || !task.completed) return;

    try {
      const newScheduledTime = formatSqliteDateTime(new Date());
      const createdAt = formatSqliteDateTime(new Date());
      const normalizedRepeat = normalizeTaskRepeatSettings(task);
      const repeatGroupId =
        normalizedRepeat.repeatGroupId ||
        (isRepeatingTask(task) ? createRepeatGroupId() : "");
      const sourceSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
      const recreatedSubtasks = sourceSubtasks.map((subtask) => ({
        id: Date.now() + Math.floor(Math.random() * 100000),
        title: subtask.title,
        completed: false,
      }));
      const shouldCopyNotifications =
        Array.isArray(task.notificationId) && task.notificationId.length > 0;

      const result = db.runSync(
        `INSERT INTO tasks (
        title,
        section,
        completed,
        completedAt,
        createdAt,
        repeatType,
        repeatDays,
        repeatMonthlyType,
        repeatCustomDate,
        repeatYearlyDate,
        repeatGroupId,
        scheduledTime,
        details,
        attachment,
        subtasks,
        notificationId,
        isPinned,
        moodType,
        firstAction,
        minimumVersion,
        energyRequired,
        focusRequired,
        taskContext,
        estimatedMinutes,
        startAssistUsedCount,
        lastStartAssistAt,
        stuckCount,
        lastStuckAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          task.title || "Task",
          task.section || "Morning",
          0,
          null,
          createdAt,
          normalizedRepeat.repeatType,
          serializeRepeatDays(normalizedRepeat.repeatDays),
          normalizedRepeat.repeatMonthlyType || "",
          normalizedRepeat.repeatCustomDate || "",
          normalizedRepeat.repeatYearlyDate || "",
          repeatGroupId,
          newScheduledTime,
          task.details || "",
          task.attachment || "",
          JSON.stringify(recreatedSubtasks),
          JSON.stringify([]),
          0,
          "",
          task.firstAction || "",
          task.minimumVersion || "",
          normalizeEnergyRequiredValue(task.energyRequired),
          normalizeFocusRequiredValue(task.focusRequired),
          normalizeTaskContextValue(task.taskContext),
          normalizeEstimatedMinutesValue(task.estimatedMinutes),
          Number(task.startAssistUsedCount || 0),
          task.lastStartAssistAt || null,
          Number(task.stuckCount || 0),
          task.lastStuckAt || null,
        ]
      );

      const newTaskId = result.lastInsertRowId;
      const recreatedNotificationIds = shouldCopyNotifications
        ? await scheduleProReminders({
            ...task,
            id: newTaskId,
            scheduledTime: newScheduledTime,
          }, { source: "recurring" })
        : [];
      db.runSync("UPDATE tasks SET notificationId = ? WHERE id = ?", [
        JSON.stringify(recreatedNotificationIds),
        newTaskId,
      ]);

      setTasks((prev) => [
        ...prev,
        {
          ...task,
          id: newTaskId,
          completed: false,
          completedAt: null,
          repeatType: normalizedRepeat.repeatType,
          repeatDays: normalizedRepeat.repeatDays,
          repeatMonthlyType: normalizedRepeat.repeatMonthlyType,
          repeatCustomDate: normalizedRepeat.repeatCustomDate,
          repeatYearlyDate: normalizedRepeat.repeatYearlyDate,
          repeatGroupId,
          createdAt,
          scheduledTime: newScheduledTime,
          subtasks: recreatedSubtasks,
          notificationId: recreatedNotificationIds,
          isPinned: false,
          moodType: "",
          firstAction: task.firstAction || "",
          minimumVersion: task.minimumVersion || "",
          energyRequired: normalizeEnergyRequiredValue(task.energyRequired),
          focusRequired: normalizeFocusRequiredValue(task.focusRequired),
          taskContext: normalizeTaskContextValue(task.taskContext),
          estimatedMinutes: normalizeEstimatedMinutesValue(task.estimatedMinutes),
          startAssistUsedCount: Number(task.startAssistUsedCount || 0),
          lastStartAssistAt: task.lastStartAssistAt || "",
          stuckCount: Number(task.stuckCount || 0),
          lastStuckAt: task.lastStuckAt || "",
          reminderOpenCount: 0,
          reminderStartNowCount: 0,
          reminderSnoozeCount: 0,
          reminderMoveGentlyCount: 0,
          reminderMakeSmallerCount: 0,
          lastReminderActionAt: "",
          lastReminderAction: "",
          reminderActionHistory: [],
          snoozeCount: 0,
          lastSnoozedAt: "",
          rescheduleCount: 0,
          lastRescheduledAt: "",
        },
      ]);

      if (taskDurations[task.id]) {
        setTaskDurations((prev) => ({
          ...prev,
          [newTaskId]: taskDurations[task.id],
        }));
      }
    } catch (error) {
      console.log("Repeat task error:", error);
    }
  };

  const resetTaskForm = () => {
    setTaskName("");
    setTaskDetails("");
    setTaskFirstAction("");
    setTaskMinimumVersion("");
    setTaskEnergyRequired("");
    setTaskFocusRequired("");
    setTaskContext("");
    setTaskEstimatedMinutes(null);
    setIsEnergyEffortExpanded(false);
    setScheduledDateTime("");
    setSelectedSection("Morning");
    setRepeatType(REPEAT_TYPES.NONE);
    setRepeatDays([]);
    setRepeatMonthlyType(MONTHLY_REPEAT_TYPES.FIRST);
    setRepeatCustomDate("");
    setRepeatYearlyDate("");
    setAttachmentUri(null);
    setAttachmentName("");
    setTimeAdjusted(false);
    setTimeError(false);
    setDetailsHeight(80);
    setStartAssistEditHint("");

    setEditingTask(null);
    setIsEditMode(false);
    setTodayPlanCreateContextActive(false);

    setModalVisible(false);
  };

  const openModal = useCallback(() => {
    // ✅ RESET EDIT STATE
    setEditingTask(null);
    setIsEditMode(false);

    // Reset the create form so stale schedule values never reopen the picker.
    setTaskName("");
    setTaskDetails("");
    setTaskFirstAction("");
    setTaskMinimumVersion("");
    setTaskEnergyRequired("");
    setTaskFocusRequired("");
    setTaskContext("");
    setTaskEstimatedMinutes(null);
    setIsEnergyEffortExpanded(false);
    setSelectedSection("Morning");
    setScheduledDateTime("");
    setRepeatType(REPEAT_TYPES.NONE);
    setRepeatDays([]);
    setRepeatMonthlyType(MONTHLY_REPEAT_TYPES.FIRST);
    setRepeatCustomDate("");
    setRepeatYearlyDate("");
    setAttachmentUri(null);
    setAttachmentName("");
    setTimeAdjusted(false);
    setTimeError(false);
    setStartAssistEditHint("");

    setDetailsHeight(80);
    setTodayPlanCreateContextActive(false);

    setModalVisible(true);
  }, []);

  const closeTaskModal = useCallback(() => {
    setModalVisible(false);
    setTodayPlanCreateContextActive(false);
  }, []);

  const openModalFromTodayPlan = useCallback(() => {
    const now = new Date();
    openModal();
    setTodayPlanCreateContextActive(true);
    setSelectedSection(getSectionForCurrentTime(now));
    setScheduledDateTime(formatSqliteDateTime(now));
  }, [openModal]);

  const startFocus = (taskId, durationOverride = null) => {
    const duration =
      (Number.isFinite(durationOverride) && durationOverride > 0
        ? durationOverride
        : taskDurations[taskId]) || 1500; // default 25 min

    clearFocusCompletionAutoClose({ resetCountdown: true });

    if (activeTaskId !== taskId && focusTime > 0 && !focusSessionRecordedRef.current) {
      recordFocusSession(focusTime);
    }

    focusSessionRecordedRef.current = false;
    timerCompletionStampRef.current = null;
    setIsFocusCompleted(false);

    const session = buildTimerSession({
      durationSeconds: duration,
      elapsedSeconds: 0,
      nowTimestamp: Date.now(),
    });

    setActiveTaskId(taskId);
    setFocusTime(0);
    setCurrentDuration(duration);
    setFocusStartTimestamp(session.startTimestamp);
    setFocusEndTimestamp(session.endTimestamp);
    setIsTimerRunning(true);

    persistFocusTimerState({
      activeTaskId: taskId,
      focusTime: 0,
      currentDuration: duration,
      isTimerRunning: true,
      isFocusCompleted: false,
      focusStartTimestamp: session.startTimestamp,
      focusEndTimestamp: session.endTimestamp,
    });
    void scheduleFocusCompletionReminder(taskId, session.endTimestamp);
    void stopEncouragement();

    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: activeFocusY.current,
        animated: true,
      });
    }, 100);
  };
  startFocusActionRef.current = startFocus;

  const toggleTimer = () => {
    if (!activeTaskId) return;

    if (isTimerRunning) {
      const pausedElapsed = getElapsedSecondsFromTimestamp({
        startTimestamp: focusStartTimestamp,
        nowTimestamp: Date.now(),
        maxDurationSeconds: currentDuration,
      });

      setFocusTime(pausedElapsed);
      setIsTimerRunning(false);
      setFocusStartTimestamp(null);
      setFocusEndTimestamp(null);
      persistFocusTimerState({
        activeTaskId,
        focusTime: pausedElapsed,
        currentDuration,
        isTimerRunning: false,
        isFocusCompleted: false,
        focusStartTimestamp: null,
        focusEndTimestamp: null,
      });
      void cancelFocusCompletionReminder();
      return;
    }

    const session = buildTimerSession({
      durationSeconds: currentDuration,
      elapsedSeconds: focusTime,
      nowTimestamp: Date.now(),
    });

    setIsFocusCompleted(false);
    setFocusStartTimestamp(session.startTimestamp);
    setFocusEndTimestamp(session.endTimestamp);
    setIsTimerRunning(true);
    persistFocusTimerState({
      activeTaskId,
      focusTime,
      currentDuration,
      isTimerRunning: true,
      isFocusCompleted: false,
      focusStartTimestamp: session.startTimestamp,
      focusEndTimestamp: session.endTimestamp,
    });
    void scheduleFocusCompletionReminder(activeTaskId, session.endTimestamp);
  };

  const pauseFocus = () => {
    if (isTimerRunning) {
      toggleTimer();
    }
  };

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  const saveCustomTime = () => {
    const hours = parseInt(customHour) || 0;
    const minutes = parseInt(customMinute) || 0;

    const totalSeconds = hours * 3600 + minutes * 60;

    if (totalSeconds === 0) {
      setTimeModalVisible(false);
      return;
    }

    setTaskDurations((prev) => ({
      ...prev,
      [currentTaskForTime]: totalSeconds,
    }));

    setCustomHour("0");
    setCustomMinute("0");
    setTimeModalVisible(false);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return null;

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);

    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  };

  const activeTaskDuration = taskDurations[activeTaskId];

  const handlePressIn = () => {
    Animated.spring(fabScale, {
      toValue: 0.92,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(fabScale, {
      toValue: 1,
      friction: 3,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const stopTaskHighlight = useCallback(() => {
    if (taskHighlightTimeoutRef.current) {
      clearTimeout(taskHighlightTimeoutRef.current);
      taskHighlightTimeoutRef.current = null;
    }
    if (taskHighlightLoopRef.current?.stop) {
      taskHighlightLoopRef.current.stop();
      taskHighlightLoopRef.current = null;
    }
    taskHighlightPulse.stopAnimation();
    taskHighlightPulse.setValue(0);
    setHighlightedTaskId(null);
  }, [taskHighlightPulse]);

  const triggerTaskHighlight = useCallback(
    (taskId) => {
      if (!taskId) return;

      stopTaskHighlight();
      setHighlightedTaskId(taskId);
      taskHighlightPulse.setValue(0.25);

      taskHighlightLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(taskHighlightPulse, {
            toValue: 1,
            duration: TASK_HIGHLIGHT_PULSE_IN_MS,
            useNativeDriver: false,
          }),
          Animated.timing(taskHighlightPulse, {
            toValue: 0.25,
            duration: TASK_HIGHLIGHT_PULSE_OUT_MS,
            useNativeDriver: false,
          }),
        ])
      );

      taskHighlightLoopRef.current.start();

      taskHighlightTimeoutRef.current = setTimeout(() => {
        if (taskHighlightLoopRef.current?.stop) {
          taskHighlightLoopRef.current.stop();
          taskHighlightLoopRef.current = null;
        }
        taskHighlightPulse.stopAnimation();
        taskHighlightPulse.setValue(0);
        setHighlightedTaskId(null);
        taskHighlightTimeoutRef.current = null;
      }, TASK_HIGHLIGHT_DURATION_MS);
    },
    [stopTaskHighlight, taskHighlightPulse]
  );

  const focusTaskById = useCallback(
    (taskId, options = {}) => {
      const { highlight = false, onComplete = null } = options;
      if (!taskId) return false;

      const targetTask = tasks.find((task) => task.id === taskId);
      if (!targetTask || targetTask.completed) return false;

      if (taskNavigationTimeoutRef.current) {
        clearTimeout(taskNavigationTimeoutRef.current);
        taskNavigationTimeoutRef.current = null;
      }

      let changedExpansion = false;
      const targetSectionKey = targetTask.isPinned ? "Pinned" : targetTask.section;
      setExpandedTaskId(targetTask.id);
      setCurrentFocusedTaskId(targetTask.id);

      if (targetTask.isPinned) {
        if (!isPinnedSectionExpanded) {
          changedExpansion = true;
          runLayoutAnimation();
          setIsPinnedSectionExpanded(true);
          Animated.timing(pinnedChevronAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }).start();
        }
        setExpandedSection((current) => {
          if (!current) return current;
          changedExpansion = true;
          animateSectionChevron(current, false);
          return null;
        });
      } else {
        if (isPinnedSectionExpanded) {
          changedExpansion = true;
          runLayoutAnimation();
          setIsPinnedSectionExpanded(false);
          Animated.timing(pinnedChevronAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();
        }

        setExpandedSection((current) => {
          if (current === targetTask.section) return current;
          changedExpansion = true;
          runLayoutAnimation();
          if (current) {
            animateSectionChevron(current, false);
          }
          animateSectionChevron(targetTask.section, true);
          hasAutoExpandedInitialSection.current = true;
          return targetTask.section;
        });
      }

      const navigateToTask = (attempt = 0) => {
        const sectionY = sectionPositions.current[targetSectionKey] || 0;
        const taskY = taskPositions.current[targetTask.id] || 0;
        const hasTaskPosition = Number.isFinite(taskY) && taskY > 0;

        if (!hasTaskPosition && attempt < TASK_NAVIGATION_MAX_RETRIES) {
          taskNavigationTimeoutRef.current = setTimeout(() => {
            navigateToTask(attempt + 1);
          }, TASK_NAVIGATION_RETRY_DELAY_MS);
          return;
        }

        const absoluteY = hasTaskPosition ? sectionY + taskY : sectionY;
        const screenHeight = Dimensions.get("window").height;
        const cardHeight = 116;
        const centeredY = absoluteY - screenHeight / 2 + cardHeight / 2;

        scrollRef.current?.scrollTo({
          y: centeredY > 0 ? centeredY : 0,
          animated: true,
        });

        taskNavigationTimeoutRef.current = setTimeout(() => {
          setExpandedTaskId(targetTask.id);
          if (highlight) {
            triggerTaskHighlight(targetTask.id);
          }
          if (typeof onComplete === "function") {
            onComplete();
          }
        }, hasTaskPosition ? 140 : 80);
      };

      taskNavigationTimeoutRef.current = setTimeout(() => {
        navigateToTask(0);
      }, changedExpansion ? 280 : 90);

      return true;
    },
    [
      animateSectionChevron,
      isPinnedSectionExpanded,
      pinnedChevronAnim,
      runLayoutAnimation,
      tasks,
      triggerTaskHighlight,
    ]
  );

  const scrollToTask = useCallback(
    (taskId, options = {}) => {
      const numericTaskId = Number(taskId);
      if (!Number.isFinite(numericTaskId)) return false;

      const targetTask =
        tasks.find((task) => Number(task?.id) === numericTaskId) || null;
      if (!targetTask || targetTask.completed) return false;

      if (
        activeEnergyFilter &&
        !isTaskMatchingActiveEnergyFilter(targetTask, new Date())
      ) {
        setActiveEnergyFilter(null);
        setTimeout(() => {
          focusTaskById(numericTaskId, options);
        }, 110);
        return true;
      }

      return focusTaskById(numericTaskId, options);
    },
    [
      activeEnergyFilter,
      focusTaskById,
      isTaskMatchingActiveEnergyFilter,
      tasks,
    ]
  );

  const openTaskInMakeSmallerSupport = useCallback(
    (task) => {
      if (!task || task.completed) return;
      setFirstStepOnlyTaskId(null);
      scrollToTask(task.id, {
        highlight: true,
        onComplete: () => {
          setStartAssistTaskId(task.id);
          setStartAssistMode("make-easier");
          setStartAssistFirstActionDraft(task.firstAction || "");
          setStartAssistBreakdownDraft("");
          setStartAssistMinimumVersionDraft(task.minimumVersion || "");
          setIsStartAssistVisible(true);
        },
      });
    },
    [scrollToTask]
  );

  const handleSupportStartTwoMinutes = useCallback(
    (taskId) => {
      const numericTaskId = Number(taskId);
      if (!Number.isFinite(numericTaskId)) return;

      setFirstStepOnlyTaskId(null);
      scrollToTask(numericTaskId, {
        highlight: true,
        onComplete: () => {
          startFocusActionRef.current?.(
            numericTaskId,
            START_ASSIST_SHORT_FOCUS_SECONDS
          );
          setRecoverySuccessMessage("Just 2 minutes. Starting counts.");
        },
      });
    },
    [scrollToTask]
  );

  const handleSupportStartMinimumVersion = useCallback(
    (task) => {
      if (!task || task.completed) return;
      if (typeof task.minimumVersion !== "string" || !task.minimumVersion.trim()) {
        return;
      }

      setFirstStepOnlyTaskId(null);
      scrollToTask(task.id, {
        highlight: true,
        onComplete: () => {
          startFocusActionRef.current?.(
            task.id,
            HEAVY_SUPPORT_MINIMUM_FOCUS_SECONDS
          );
          setRecoverySuccessMessage(
            "Small counts. Start with the minimum version."
          );
        },
      });
    },
    [scrollToTask]
  );

  const openTaskInMoveGentlySupport = useCallback(
    (task) => {
      if (!task || task.completed) return;
      setFirstStepOnlyTaskId(null);
      scrollToTask(task.id, {
        highlight: true,
        onComplete: () => {
          startRecoveryEdit(task);
          setRecoveryModalVisible(true);
          setRecoverySuccessMessage("");
        },
      });
    },
    [scrollToTask, startRecoveryEdit]
  );

  const openOverwhelmMode = useCallback(() => {
    setIsOverwhelmModeVisible(true);
  }, []);

  const closeOverwhelmMode = useCallback(() => {
    setIsOverwhelmModeVisible(false);
  }, []);

  const handleOverwhelmGoToTask = useCallback(
    (taskId) => {
      const numericTaskId = Number(taskId);
      closeOverwhelmMode();
      if (!Number.isFinite(numericTaskId)) return;
      setFirstStepOnlyTaskId(null);
      scrollToTask(numericTaskId, { highlight: true });
    },
    [closeOverwhelmMode, scrollToTask]
  );

  const handleOverwhelmStartTwoMinutes = useCallback(
    (task) => {
      if (!task || task.completed) return;
      closeOverwhelmMode();
      setFirstStepOnlyTaskId(null);
      scrollToTask(task.id, {
        highlight: true,
        onComplete: () => {
          startFocusActionRef.current?.(
            task.id,
            START_ASSIST_SHORT_FOCUS_SECONDS
          );
          setRecoverySuccessMessage("Just 2 minutes. Starting counts.");
        },
      });
    },
    [closeOverwhelmMode, scrollToTask]
  );

  const handleOverwhelmMakeSmaller = useCallback(
    (task) => {
      if (!task || task.completed) return;
      closeOverwhelmMode();
      setFirstStepOnlyTaskId(null);
      scrollToTask(task.id, {
        highlight: true,
        onComplete: () => {
          setStartAssistTaskId(task.id);
          setStartAssistMode("make-easier");
          setStartAssistFirstActionDraft(task.firstAction || "");
          setStartAssistBreakdownDraft("");
          setStartAssistMinimumVersionDraft(task.minimumVersion || "");
          setIsStartAssistVisible(true);
          setRecoverySuccessMessage("Let's make this easier to begin.");
        },
      });
    },
    [closeOverwhelmMode, scrollToTask]
  );

  const handleOverwhelmStartSmall = useCallback(
    (task) => {
      if (!task || task.completed) return;

      const hasMinimumVersion =
        typeof task.minimumVersion === "string" && task.minimumVersion.trim().length > 0;
      const hasFirstAction =
        typeof task.firstAction === "string" && task.firstAction.trim().length > 0;

      if (!hasMinimumVersion && !hasFirstAction) {
        handleOverwhelmMakeSmaller(task);
        return;
      }

      closeOverwhelmMode();
      setFirstStepOnlyTaskId(hasFirstAction ? task.id : null);
      scrollToTask(task.id, {
        highlight: true,
        onComplete: () => {
          startFocusActionRef.current?.(
            task.id,
            HEAVY_SUPPORT_MINIMUM_FOCUS_SECONDS
          );
          setRecoverySuccessMessage(
            hasMinimumVersion
              ? "Small counts. Start with the minimum version."
              : "Small counts. Start with one small step."
          );
        },
      });
    },
    [closeOverwhelmMode, handleOverwhelmMakeSmaller, scrollToTask]
  );

  const handleOverwhelmMoveGently = useCallback(
    (task) => {
      if (!task || task.completed) return;
      closeOverwhelmMode();
      setFirstStepOnlyTaskId(null);
      scrollToTask(task.id, {
        highlight: true,
        onComplete: () => {
          startRecoveryEdit(task);
          setRecoveryModalVisible(true);
          setRecoverySuccessMessage("No guilt. Let's find a better time.");
        },
      });
    },
    [closeOverwhelmMode, scrollToTask, startRecoveryEdit]
  );

  useEffect(() => {
    if (!pendingNotificationTaskTarget?.taskId) return;
    if (pendingNotificationTaskTarget.handled) return;

    const taskId = pendingNotificationTaskTarget.taskId;
    const task = tasks.find((row) => row.id === taskId);
    const pendingAction =
      pendingNotificationTaskTarget.reminderAction ||
      notificationActionContextRef.current?.reminderAction ||
      null;
    const pendingSnoozeMinutesRaw =
      pendingNotificationTaskTarget.snoozeMinutes ??
      notificationActionContextRef.current?.snoozeMinutes ??
      null;
    const pendingSnoozeMinutes = Number(pendingSnoozeMinutesRaw);

    if (!task || task.completed) {
      notificationActionContextRef.current = null;
      setPendingNotificationTaskTarget(null);
      return;
    }

    setPendingNotificationTaskTarget((prev) =>
      prev ? { ...prev, handled: true } : prev
    );

    const didNavigate = scrollToTask(task.id, {
      highlight: true,
      onComplete: () => {
        if (
          pendingAction === REMINDER_ACTIONS.SNOOZE_10 ||
          pendingAction === REMINDER_ACTIONS.SNOOZE_30
        ) {
          const snoozeMinutes =
            pendingSnoozeMinutes === 30 ||
            pendingAction === REMINDER_ACTIONS.SNOOZE_30
              ? 30
              : 10;
          showSnoozeAffirmation({ taskId: task.id, minutes: snoozeMinutes });
        }

        if (pendingAction === REMINDER_ACTIONS.START_NOW) {
          setFirstStepOnlyTaskId(null);
          startFocusActionRef.current?.(
            task.id,
            START_ASSIST_SHORT_FOCUS_SECONDS
          );
          setRecoverySuccessMessage("Just 2 minutes. Starting counts.");
        }

        if (pendingAction === REMINDER_ACTIONS.MOVE_GENTLY) {
          setFirstStepOnlyTaskId(null);
          startRecoveryEdit(task);
          setRecoveryModalVisible(true);
          setRecoverySuccessMessage("Moved gently. No reset needed.");
        }

        if (pendingAction === REMINDER_ACTIONS.MAKE_SMALLER) {
          setFirstStepOnlyTaskId(null);
          setStartAssistTaskId(task.id);
          setStartAssistMode("make-easier");
          setStartAssistFirstActionDraft(task.firstAction || "");
          setStartAssistBreakdownDraft("");
          setStartAssistMinimumVersionDraft(task.minimumVersion || "");
          setIsStartAssistVisible(true);
        }

        notificationActionContextRef.current = null;
        setPendingNotificationTaskTarget(null);
      },
    });

    if (!didNavigate) {
      notificationActionContextRef.current = null;
      setPendingNotificationTaskTarget(null);
    }
  }, [
    pendingNotificationTaskTarget,
    scrollToTask,
    showSnoozeAffirmation,
    startRecoveryEdit,
    tasks,
  ]);

  const toggleDailyMoodSection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDailyMoodExpanded((prev) => !prev);
  }, []);

  const openTaskEditor = useCallback(
    (task, assistHint = "") => {
      if (!task) return;
      const repeatSettings = normalizeTaskRepeatSettings(task);
      const normalizedEnergyRequired = normalizeEnergyRequiredValue(task.energyRequired);
      const normalizedFocusRequired = normalizeFocusRequiredValue(task.focusRequired);
      const normalizedTaskContext = normalizeTaskContextValue(task.taskContext);
      const normalizedEstimatedMinutes = normalizeEstimatedMinutesValue(
        task.estimatedMinutes ?? task.estimateMinutes
      );
      setEditingTask(task);
      setIsEditMode(true);
      setTaskName(task.title || "");
      setTaskDetails(task.details || "");
      setTaskFirstAction(task.firstAction || "");
      setTaskMinimumVersion(task.minimumVersion || "");
      setTaskEnergyRequired(normalizedEnergyRequired);
      setTaskFocusRequired(normalizedFocusRequired);
      setTaskContext(normalizedTaskContext);
      setTaskEstimatedMinutes(normalizedEstimatedMinutes);
      setIsEnergyEffortExpanded(
        Boolean(
          normalizedEnergyRequired ||
            normalizedFocusRequired ||
            normalizedTaskContext ||
            normalizedEstimatedMinutes !== null
        )
      );
      setScheduledDateTime(task.scheduledTime || "");
      setSelectedSection(task.section || "Morning");
      setRepeatType(repeatSettings.repeatType);
      setRepeatDays(repeatSettings.repeatDays);
      setRepeatMonthlyType(repeatSettings.repeatMonthlyType);
      setRepeatCustomDate(repeatSettings.repeatCustomDate);
      setRepeatYearlyDate(repeatSettings.repeatYearlyDate);
      setStartAssistEditHint(assistHint || "");
      setModalVisible(true);
    },
    []
  );

  const clearStartAssistVoiceHint = useCallback(() => {
    if (startAssistVoiceHintTimeoutRef.current) {
      clearTimeout(startAssistVoiceHintTimeoutRef.current);
      startAssistVoiceHintTimeoutRef.current = null;
    }
    setStartAssistVoiceHint("");
  }, []);

  const showStartAssistVoiceHint = useCallback(
    (hint = "") => {
      if (!hint) {
        clearStartAssistVoiceHint();
        return;
      }
      setStartAssistVoiceHint(hint);
      if (startAssistVoiceHintTimeoutRef.current) {
        clearTimeout(startAssistVoiceHintTimeoutRef.current);
      }
      startAssistVoiceHintTimeoutRef.current = setTimeout(() => {
        setStartAssistVoiceHint("");
        startAssistVoiceHintTimeoutRef.current = null;
      }, 2200);
    },
    [clearStartAssistVoiceHint]
  );

  const buildStartAssistMainSpeechMessage = useCallback(
    (task) => {
      const taskTitle = cleanSpeechSnippet(task?.title || "", 72);
      if (!taskTitle) return "Need a gentle start? Pick one tiny way in.";
      return `Need a gentle start? Your task is ${taskTitle}. Pick one tiny way in.`;
    },
    [cleanSpeechSnippet]
  );

  const buildStartAssistFirstStepSpeechMessage = useCallback(
    (task, firstIncompleteSubtask = null) => {
      const firstSubtaskTitle = cleanSpeechSnippet(
        firstIncompleteSubtask?.title || "",
        96
      );
      if (firstSubtaskTitle) {
        return `Your first step is: ${firstSubtaskTitle}. One tiny action is enough.`;
      }

      const firstAction = cleanSpeechSnippet(task?.firstAction || "", 96);
      if (firstAction) {
        return `Your first small action is: ${firstAction}. Starting small still counts.`;
      }

      return "Choose one tiny first move. You do not need to do the whole task right now.";
    },
    [cleanSpeechSnippet]
  );

  const buildStartAssistStuckSpeechMessage = useCallback(
    () =>
      "It's okay to feel stuck. You are not failing. The task may just need a smaller doorway. One tiny action is enough to restart.",
    []
  );

  const speakStartAssist = useCallback(
    async (message = "") => {
      const normalized = String(message || "").trim();
      if (!normalized) return false;

      if (isVoiceMuted) {
        showStartAssistVoiceHint("Voice is muted.");
        return false;
      }

      try {
        await stopEncouragement();
        return await speakEncouragement({
          muted: false,
          message: normalized,
          minGapMs: 900,
          interruptExisting: true,
        });
      } catch (error) {
        console.log("Start assist speech error:", error);
        return false;
      }
    },
    [isVoiceMuted, showStartAssistVoiceHint]
  );

  const closeStartAssist = useCallback(() => {
    setIsStartAssistVisible(false);
    setStartAssistTaskId(null);
    setStartAssistMode("main");
    setStartAssistFirstActionDraft("");
    setStartAssistBreakdownDraft("");
    setStartAssistMinimumVersionDraft("");
    startAssistAutoReadKeyRef.current = "";
    clearStartAssistVoiceHint();
    void stopEncouragement();
  }, [clearStartAssistVoiceHint]);

  const persistStartAssistTaskFields = useCallback(
    (taskId, patch = {}) => {
      if (!taskId) return null;
      const currentTask = tasks.find((task) => task.id === taskId);
      if (!currentTask) return null;

      const nextTask = {
        ...currentTask,
        ...patch,
        firstAction: patch.firstAction ?? currentTask.firstAction ?? "",
        minimumVersion: patch.minimumVersion ?? currentTask.minimumVersion ?? "",
        startAssistUsedCount: Number(
          patch.startAssistUsedCount ?? currentTask.startAssistUsedCount ?? 0
        ),
        lastStartAssistAt:
          patch.lastStartAssistAt ?? currentTask.lastStartAssistAt ?? "",
        stuckCount: Number(patch.stuckCount ?? currentTask.stuckCount ?? 0),
        lastStuckAt: patch.lastStuckAt ?? currentTask.lastStuckAt ?? "",
      };

      try {
        db.runSync(
          `UPDATE tasks
           SET firstAction = ?,
               minimumVersion = ?,
               startAssistUsedCount = ?,
               lastStartAssistAt = ?,
               stuckCount = ?,
               lastStuckAt = ?
           WHERE id = ?`,
          [
            nextTask.firstAction || "",
            nextTask.minimumVersion || "",
            Number(nextTask.startAssistUsedCount || 0),
            nextTask.lastStartAssistAt || null,
            Number(nextTask.stuckCount || 0),
            nextTask.lastStuckAt || null,
            taskId,
          ]
        );
      } catch (error) {
        console.log("Start assist update error:", error);
      }

      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? nextTask : task))
      );

      return nextTask;
    },
    [tasks]
  );

  const markStartAssistUsage = useCallback(
    (taskId, { markStuck = false } = {}) => {
      const currentTask = tasks.find((task) => task.id === taskId);
      if (!currentTask) return;
      const nowIso = new Date().toISOString();

      persistStartAssistTaskFields(taskId, {
        startAssistUsedCount: Number(currentTask.startAssistUsedCount || 0) + 1,
        lastStartAssistAt: nowIso,
        stuckCount: markStuck
          ? Number(currentTask.stuckCount || 0) + 1
          : Number(currentTask.stuckCount || 0),
        lastStuckAt: markStuck ? nowIso : currentTask.lastStuckAt || "",
      });
    },
    [persistStartAssistTaskFields, tasks]
  );

  const handleStartAssistTwoMinutes = () => {
    if (!startAssistTaskId) return;
    markStartAssistUsage(startAssistTaskId);
    closeStartAssist();
    setFirstStepOnlyTaskId(null);
    scrollToTask(startAssistTaskId, { highlight: true });
    startFocus(startAssistTaskId, START_ASSIST_SHORT_FOCUS_SECONDS);
  };

  const handleStartAssistShowFirstStep = useCallback(() => {
    if (!startAssistTaskId) return;
    markStartAssistUsage(startAssistTaskId);
    setFirstStepOnlyTaskId(startAssistTaskId);
    closeStartAssist();
    scrollToTask(startAssistTaskId, { highlight: true });
  }, [closeStartAssist, markStartAssistUsage, scrollToTask, startAssistTaskId]);

  const handleStartAssistBreakDown = useCallback(() => {
    if (!startAssistTask) return;
    markStartAssistUsage(startAssistTask.id);
    setFirstStepOnlyTaskId(null);
    setStartAssistBreakdownDraft("");
    setStartAssistMode("breakdown");
  }, [markStartAssistUsage, startAssistTask]);

  const handleStartAssistSaveMinimumVersion = useCallback(() => {
    if (!startAssistTaskId) return;
    const normalized = (startAssistMinimumVersionDraft || "").trim();
    persistStartAssistTaskFields(startAssistTaskId, {
      minimumVersion: normalized,
    });
    setStartAssistMode("main");
  }, [
    persistStartAssistTaskFields,
    startAssistMinimumVersionDraft,
    startAssistTaskId,
  ]);

  const handleStartAssistSaveFirstAction = () => {
    if (!startAssistTaskId) return;
    const normalized = (startAssistFirstActionDraft || "").trim();
    persistStartAssistTaskFields(startAssistTaskId, {
      firstAction: normalized,
    });
    if (normalized) {
      addSubtask(startAssistTaskId, normalized, {
        prepend: true,
        skipDuplicate: true,
      });
    }
    setStartAssistMode("main");
  };

  const handleStartAssistAddBreakdownSubtask = () => {
    if (!startAssistTaskId) return;
    const normalized = (startAssistBreakdownDraft || "").trim();
    if (!normalized) return;
    addSubtask(startAssistTaskId, normalized, {
      prepend: false,
      skipDuplicate: true,
    });
    setStartAssistBreakdownDraft("");
  };

  const handleStartAssistOpenMakeEasier = useCallback(() => {
    if (!startAssistTask) return;
    markStartAssistUsage(startAssistTask.id);
    setStartAssistMinimumVersionDraft(startAssistTask.minimumVersion || "");
    setStartAssistMode("make-easier");
  }, [markStartAssistUsage, startAssistTask]);

  const handleStartAssistOpenAddFirstStep = useCallback(() => {
    if (!startAssistTask) return;
    markStartAssistUsage(startAssistTask.id);
    setStartAssistFirstActionDraft(startAssistTask.firstAction || "");
    setStartAssistMode("add-first-step");
  }, [markStartAssistUsage, startAssistTask]);

  const handleStartAssistStuck = useCallback(() => {
    if (!startAssistTaskId) return;
    markStartAssistUsage(startAssistTaskId, { markStuck: true });
    setStartAssistMode("stuck");
  }, [markStartAssistUsage, startAssistTaskId]);

  const handleStartAssistRescheduleLater = useCallback(() => {
    if (!startAssistTask) return;
    markStartAssistUsage(startAssistTask.id);
    closeStartAssist();
    setFirstStepOnlyTaskId(null);
    startRecoveryEdit(startAssistTask);
    setRecoveryModalVisible(true);
    setRecoverySuccessMessage("");
  }, [closeStartAssist, markStartAssistUsage, startRecoveryEdit, startAssistTask]);

  const handleStartAssistReadMain = useCallback(() => {
    if (!startAssistTask) return;
    void speakStartAssist(buildStartAssistMainSpeechMessage(startAssistTask));
  }, [buildStartAssistMainSpeechMessage, speakStartAssist, startAssistTask]);

  const handleStartAssistReadFirstStep = useCallback(() => {
    if (!startAssistTask) return;
    void speakStartAssist(
      buildStartAssistFirstStepSpeechMessage(
        startAssistTask,
        startAssistFirstIncompleteSubtask
      )
    );
  }, [
    buildStartAssistFirstStepSpeechMessage,
    speakStartAssist,
    startAssistFirstIncompleteSubtask,
    startAssistTask,
  ]);

  const handleStartAssistReadStuck = useCallback(() => {
    void speakStartAssist(buildStartAssistStuckSpeechMessage());
  }, [buildStartAssistStuckSpeechMessage, speakStartAssist]);

  const handleTaskFirstStepReadAloud = useCallback(
    (task, firstIncompleteSubtask = null) => {
      if (!task || task.completed) return;
      void speakStartAssist(
        buildStartAssistFirstStepSpeechMessage(task, firstIncompleteSubtask)
      );
    },
    [buildStartAssistFirstStepSpeechMessage, speakStartAssist]
  );

  const handleStartAssistReadCurrentPanel = useCallback(() => {
    if (startAssistMode === "stuck") {
      handleStartAssistReadStuck();
      return;
    }
    if (startAssistMode === "add-first-step") {
      handleStartAssistReadFirstStep();
      return;
    }
    handleStartAssistReadMain();
  }, [
    handleStartAssistReadFirstStep,
    handleStartAssistReadMain,
    handleStartAssistReadStuck,
    startAssistMode,
  ]);

  useEffect(() => {
    if (!isStartAssistVisible) return;
    if (!startAssistTaskId) return;
    const task = tasks.find((item) => item.id === startAssistTaskId);
    if (!task || task.completed) {
      closeStartAssist();
    }
  }, [closeStartAssist, isStartAssistVisible, startAssistTaskId, tasks]);

  useEffect(() => {
    if (!firstStepOnlyTaskId) return;
    const task = tasks.find((item) => item.id === firstStepOnlyTaskId);
    if (!task || task.completed) {
      setFirstStepOnlyTaskId(null);
    }
  }, [firstStepOnlyTaskId, tasks]);

  useEffect(() => {
    if (!startAssistReadAloudEnabled) return;
    if (isVoiceMuted) return;
    if (!isStartAssistVisible || startAssistMode !== "main" || !startAssistTask) return;

    const key = `${startAssistTask.id}:main`;
    if (startAssistAutoReadKeyRef.current === key) return;
    startAssistAutoReadKeyRef.current = key;
    void speakStartAssist(buildStartAssistMainSpeechMessage(startAssistTask));
  }, [
    buildStartAssistMainSpeechMessage,
    isStartAssistVisible,
    isVoiceMuted,
    speakStartAssist,
    startAssistMode,
    startAssistReadAloudEnabled,
    startAssistTask,
  ]);

  const handleCurrentTaskFabPress = useCallback(() => {
    if (!currentTaskQuickTaskId) return;
    scrollToTask(currentTaskQuickTaskId, {
      highlight: true,
    });
  }, [currentTaskQuickTaskId, scrollToTask]);

  const handleSmartTaskPress = useCallback(() => {
    const targetTask = smartActionTask?.task;
    if (!targetTask) return;
    scrollToTask(targetTask.id);
  }, [smartActionTask?.task, scrollToTask]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 6,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -6,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const showCelebration = (message, emoji = "🎉") => {
    setCelebration({ visible: true, message, emoji });

    // auto close after 2.5 sec
    setTimeout(() => {
      setCelebration((prev) => ({ ...prev, visible: false }));
    }, 5500);
  };

  const toggleWeeklyRepeatDay = useCallback((weekday) => {
    setRepeatDays((prev) => {
      const current = parseRepeatDays(prev);
      return current.includes(weekday)
        ? current.filter((day) => day !== weekday)
        : [...current, weekday].sort((a, b) => a - b);
    });
  }, []);

  const buildTaskDraftPayload = () => {
    let finalTime = "";

    if (scheduledDateTime) {
      const selectedDate = parseStoredDateTime(scheduledDateTime);
      if (selectedDate) {
        const corrected = restrictToSection(selectedSection, selectedDate);
        finalTime = formatSqliteDateTime(corrected);
      }
    }

    const normalizedType = normalizeRepeatType(repeatType);
    let normalizedDays =
      normalizedType === REPEAT_TYPES.WEEKLY ? parseRepeatDays(repeatDays) : [];

    if (normalizedType === REPEAT_TYPES.WEEKLY && !normalizedDays.length) {
      const fallbackDate = parseStoredDateTime(finalTime) || new Date();
      normalizedDays = [fallbackDate.getDay()];
    }

    const normalizedMonthlyType =
      normalizedType === REPEAT_TYPES.MONTHLY
        ? repeatMonthlyType || MONTHLY_REPEAT_TYPES.FIRST
        : "";

    const normalizedCustomDate =
      normalizedType === REPEAT_TYPES.MONTHLY &&
      normalizedMonthlyType === MONTHLY_REPEAT_TYPES.CUSTOM
        ? repeatCustomDate || finalTime || ""
        : "";

    const normalizedYearlyDate =
      normalizedType === REPEAT_TYPES.YEARLY
        ? repeatYearlyDate || finalTime || ""
        : "";

    const normalizedFirstAction = (taskFirstAction || "").trim();
    const normalizedMinimumVersion = (taskMinimumVersion || "").trim();
    const normalizedEnergyRequired = normalizeEnergyRequiredValue(taskEnergyRequired);
    const normalizedFocusRequired = normalizeFocusRequiredValue(taskFocusRequired);
    const normalizedTaskContext = normalizeTaskContextValue(taskContext);
    const normalizedEstimatedMinutes = normalizeEstimatedMinutesValue(taskEstimatedMinutes);
    const baseSubtasks =
      isEditMode && Array.isArray(editingTask?.subtasks) ? editingTask.subtasks : [];
    const firstActionAlreadyInSubtasks = baseSubtasks.some(
      (subtask) =>
        normalizeSubtaskTitle(subtask?.title || "").toLowerCase() ===
        normalizeSubtaskTitle(normalizedFirstAction).toLowerCase()
    );
    const subtasksToSave =
      normalizedFirstAction && !firstActionAlreadyInSubtasks
        ? [buildSubtask(normalizedFirstAction), ...baseSubtasks]
        : baseSubtasks;

    return {
      finalTime,
      repeatType: normalizedType,
      repeatDays: normalizedDays,
      repeatMonthlyType: normalizedMonthlyType,
      repeatCustomDate: normalizedCustomDate,
      repeatYearlyDate: normalizedYearlyDate,
      firstAction: normalizedFirstAction,
      minimumVersion: normalizedMinimumVersion,
      energyRequired: normalizedEnergyRequired,
      focusRequired: normalizedFocusRequired,
      taskContext: normalizedTaskContext,
      estimatedMinutes: normalizedEstimatedMinutes,
      subtasksToSave,
    };
  };
  const executeTaskSave = async (scope = "single", explicitDraft = null) => {
    if (!taskName.trim()) return;

    const draft = explicitDraft || buildTaskDraftPayload();
    const {
      finalTime,
      repeatType: draftRepeatType,
      repeatDays: draftRepeatDays,
      repeatMonthlyType: draftRepeatMonthlyType,
      repeatCustomDate: draftRepeatCustomDate,
      repeatYearlyDate: draftRepeatYearlyDate,
      firstAction: draftFirstAction,
      minimumVersion: draftMinimumVersion,
      energyRequired: draftEnergyRequired,
      focusRequired: draftFocusRequired,
      taskContext: draftTaskContext,
      estimatedMinutes: draftEstimatedMinutes,
      subtasksToSave,
    } = draft;

    if (isEditMode && editingTask) {
      const editingTime =
        toTaskTimestamp(editingTask.scheduledTime) ?? Number.NEGATIVE_INFINITY;
      const seriesGroupId = editingTask.repeatGroupId || "";
      const canApplySeries = Boolean(seriesGroupId) && isRepeatingTask(editingTask);

      let targets = [editingTask];
      if (canApplySeries && scope !== "single") {
        targets = tasks.filter((task) => {
          if (task.repeatGroupId !== seriesGroupId) return false;
          if (task.completed) return false;

          if (scope === "future") {
            const taskTime =
              toTaskTimestamp(task.scheduledTime) ?? Number.NEGATIVE_INFINITY;
            return taskTime >= editingTime;
          }

          return scope === "all";
        });

        if (!targets.length) {
          targets = [editingTask];
        }
      }

      const updatedById = new Map();

      for (const targetTask of targets) {
        await cancelTaskReminders(targetTask.notificationId);

        const scheduleForTarget =
          targetTask.id === editingTask.id
            ? finalTime
            : targetTask.scheduledTime || finalTime;

        const nextGroupId =
          draftRepeatType !== REPEAT_TYPES.NONE
            ? targetTask.repeatGroupId ||
              seriesGroupId ||
              createRepeatGroupId()
            : "";

        const reminderIds = scheduleForTarget
          ? await scheduleProReminders({
              id: targetTask.id,
              title: taskName,
              section: selectedSection,
              isPinned: targetTask.isPinned,
              scheduledTime: scheduleForTarget,
            }, { source: "normal" })
          : [];

        db.runSync(
          `UPDATE tasks
           SET title = ?,
               section = ?,
               scheduledTime = ?,
               details = ?,
               attachment = ?,
               subtasks = ?,
               notificationId = ?,
               isPinned = ?,
               repeatType = ?,
                repeatDays = ?,
                repeatMonthlyType = ?,
                repeatCustomDate = ?,
                repeatYearlyDate = ?,
                 repeatGroupId = ?,
                 firstAction = ?,
                 minimumVersion = ?,
                 energyRequired = ?,
                 focusRequired = ?,
                 taskContext = ?,
                 estimatedMinutes = ?,
                 moodType = ?
             WHERE id = ?`,
          [
            taskName,
            selectedSection,
            scheduleForTarget,
            taskDetails,
            attachmentUri || "",
            JSON.stringify(subtasksToSave),
            JSON.stringify(reminderIds),
            targetTask.isPinned ? 1 : 0,
            draftRepeatType,
            serializeRepeatDays(draftRepeatDays),
            draftRepeatMonthlyType || "",
            draftRepeatCustomDate || "",
            draftRepeatYearlyDate || "",
            nextGroupId,
            draftFirstAction,
            draftMinimumVersion,
            draftEnergyRequired,
            draftFocusRequired,
            draftTaskContext,
            draftEstimatedMinutes,
            targetTask.moodType || "",
            targetTask.id,
          ]
        );

        updatedById.set(targetTask.id, {
          ...targetTask,
          title: taskName,
          section: selectedSection,
          scheduledTime: scheduleForTarget,
          details: taskDetails,
          attachment: attachmentUri,
          subtasks: subtasksToSave,
          notificationId: reminderIds,
          isPinned: !!targetTask.isPinned,
          repeatType: draftRepeatType,
          repeatDays: draftRepeatDays,
          repeatMonthlyType: draftRepeatMonthlyType,
          repeatCustomDate: draftRepeatCustomDate,
          repeatYearlyDate: draftRepeatYearlyDate,
          repeatGroupId: nextGroupId,
          firstAction: draftFirstAction,
          minimumVersion: draftMinimumVersion,
          energyRequired: draftEnergyRequired,
          focusRequired: draftFocusRequired,
          taskContext: draftTaskContext,
          estimatedMinutes: draftEstimatedMinutes,
          moodType: targetTask.moodType || "",
        });
      }

      setTasks((prev) =>
        prev.map((task) => (updatedById.has(task.id) ? updatedById.get(task.id) : task))
      );

      setAttachmentUri(null);
      setAttachmentName("");
      resetTaskForm();
      return {
        mode: "edit",
        finalTime,
        tasks: Array.from(updatedById.values()),
      };
    }

    const repeatGroupId =
      draftRepeatType !== REPEAT_TYPES.NONE ? createRepeatGroupId() : "";

    const createdAt = formatSqliteDateTime(new Date());

    const result = db.runSync(
      `INSERT INTO tasks (
        title,
        section,
        completed,
        completedAt,
        createdAt,
        repeatType,
        repeatDays,
        repeatMonthlyType,
        repeatCustomDate,
        repeatYearlyDate,
        repeatGroupId,
        scheduledTime,
        details,
        attachment,
        subtasks,
        notificationId,
        isPinned,
        moodType,
        firstAction,
        minimumVersion,
        energyRequired,
        focusRequired,
        taskContext,
        estimatedMinutes,
        startAssistUsedCount,
        lastStartAssistAt,
        stuckCount,
        lastStuckAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        taskName,
        selectedSection,
        0,
        null,
        createdAt,
        draftRepeatType,
        serializeRepeatDays(draftRepeatDays),
        draftRepeatMonthlyType || "",
        draftRepeatCustomDate || "",
        draftRepeatYearlyDate || "",
        repeatGroupId,
        finalTime,
        taskDetails,
        attachmentUri || "",
        JSON.stringify(subtasksToSave),
        JSON.stringify([]),
        0,
        "",
        draftFirstAction,
        draftMinimumVersion,
        draftEnergyRequired,
        draftFocusRequired,
        draftTaskContext,
        draftEstimatedMinutes,
        0,
        null,
        0,
        null,
      ]
    );

    const insertedId = result.lastInsertRowId;
    const reminderIds = finalTime
      ? await scheduleProReminders({
          id: insertedId,
          title: taskName,
          section: selectedSection,
          scheduledTime: finalTime,
        }, { source: "normal" })
      : [];
    db.runSync("UPDATE tasks SET notificationId = ? WHERE id = ?", [
      JSON.stringify(reminderIds),
      insertedId,
    ]);

    const createdTask = {
      id: insertedId,
      title: taskName,
      section: selectedSection,
      completed: false,
      completedAt: null,
      repeatType: draftRepeatType,
      repeatDays: draftRepeatDays,
      repeatMonthlyType: draftRepeatMonthlyType,
      repeatCustomDate: draftRepeatCustomDate,
      repeatYearlyDate: draftRepeatYearlyDate,
      repeatGroupId,
      createdAt,
      scheduledTime: finalTime,
      details: taskDetails,
      attachment: attachmentUri,
      subtasks: subtasksToSave,
      notificationId: reminderIds,
      isPinned: false,
      moodType: "",
      firstAction: draftFirstAction,
      minimumVersion: draftMinimumVersion,
      energyRequired: draftEnergyRequired,
      focusRequired: draftFocusRequired,
      taskContext: draftTaskContext,
      estimatedMinutes: draftEstimatedMinutes,
      startAssistUsedCount: 0,
      lastStartAssistAt: "",
      stuckCount: 0,
      lastStuckAt: "",
      reminderOpenCount: 0,
      reminderStartNowCount: 0,
      reminderSnoozeCount: 0,
      reminderMoveGentlyCount: 0,
      reminderMakeSmallerCount: 0,
      lastReminderActionAt: "",
      lastReminderAction: "",
      reminderActionHistory: [],
      snoozeCount: 0,
      lastSnoozedAt: "",
      rescheduleCount: 0,
      lastRescheduledAt: "",
    };

    setTasks((prev) => [...prev, createdTask]);

    setAttachmentUri(null);
    setAttachmentName("");
    resetTaskForm();
    return {
      mode: "create",
      finalTime,
      tasks: [createdTask],
    };
  };

  const applyEditScopeAndSave = async (scope) => {
    if (!pendingEditPayload) return;
    try {
      await executeTaskSave(scope, pendingEditPayload);
    } catch (error) {
      console.log("Task Save Error:", error);
      alert("Task Save Error:\n" + error.message);
    } finally {
      setPendingEditPayload(null);
      setEditRepeatScopeModalVisible(false);
    }
  };

  const handleSaveTask = async () => {
    if (!taskName.trim()) return;

    const draft = buildTaskDraftPayload();

    if (
      isEditMode &&
      editingTask &&
      isRepeatingTask(editingTask) &&
      editingTask.repeatGroupId
    ) {
      setPendingEditPayload(draft);
      setEditRepeatScopeModalVisible(true);
      return;
    }

    try {
      const saveResult = await executeTaskSave("single", draft);
      if (todayPlanCreateContextActive) {
        const { start, end } = getDayBounds(new Date());
        const savedTasks = Array.isArray(saveResult?.tasks) ? saveResult.tasks : [];
        const hasTodayTask = savedTasks.some((task) => {
          const scheduledTimestamp = toTaskTimestamp(task?.scheduledTime);
          const createdTimestamp = toTaskTimestamp(task?.createdAt);
          return (
            isTimestampWithinRange(scheduledTimestamp, start, end) ||
            (scheduledTimestamp === null &&
              isTimestampWithinRange(createdTimestamp, start, end))
          );
        });
        if (hasTodayTask) {
          showTodayPlanCelebration("create");
        }
      }
    } catch (error) {
      console.log("Task Save Error:", error);
      alert("Task Save Error:\n" + error.message);
    }
  };

  const confirmDeleteTask = async (scope = "single") => {
    if (!deleteTask) return;

    const isRepeatSeries = isRepeatingTask(deleteTask) && deleteTask.repeatGroupId;
    const taskTime =
      toTaskTimestamp(deleteTask.scheduledTime) ?? Number.NEGATIVE_INFINITY;

    let targets = [deleteTask];

    if (isRepeatingTask(deleteTask) && deleteTask.completed) {
      targets = [];
    }

    if (isRepeatSeries && scope !== "single") {
      targets = tasks.filter((task) => {
        if (task.repeatGroupId !== deleteTask.repeatGroupId) return false;
        if (task.completed) return false;

        const rowTime =
          toTaskTimestamp(task.scheduledTime) ?? Number.NEGATIVE_INFINITY;
        if (scope === "future") return rowTime >= taskTime;
        if (scope === "past") return rowTime <= taskTime;
        return false;
      });
    }

    if (!targets.length) {
      setDeleteModalVisible(false);
      setDeleteTask(null);
      return;
    }

    for (const task of targets) {
      await cancelTaskReminders(task.notificationId);
    }

    const idsToDelete = [...new Set(targets.map((task) => task.id))];
    idsToDelete.forEach((taskId) => {
      db.runSync("DELETE FROM tasks WHERE id = ?", [taskId]);
    });

    const idSet = new Set(idsToDelete);
    setTasks((prev) => prev.filter((task) => !idSet.has(task.id)));

    if (idsToDelete.length === 1) {
      setLastDeletedTask(deleteTask);
      if (expandedTaskId === deleteTask.id) {
        setExpandedTaskId(null);
      }
    } else {
      setLastDeletedTask(null);
      if (expandedTaskId && idSet.has(expandedTaskId)) {
        setExpandedTaskId(null);
      }
    }

    setDeleteModalVisible(false);
    setDeleteTask(null);
  };

  const handleUndoDelete = () => {
    if (!lastDeletedTask) return;

    db.runSync(
      `INSERT INTO tasks (
        id,
        title,
        section,
        completed,
        completedAt,
        createdAt,
        repeatType,
        repeatDays,
        repeatMonthlyType,
        repeatCustomDate,
        repeatYearlyDate,
        repeatGroupId,
        scheduledTime,
        details,
        attachment,
        subtasks,
        notificationId,
        isPinned,
        moodType,
        firstAction,
        minimumVersion,
        energyRequired,
        focusRequired,
        taskContext,
        estimatedMinutes,
        startAssistUsedCount,
        lastStartAssistAt,
        stuckCount,
        lastStuckAt,
        reminderOpenCount,
        reminderStartNowCount,
        reminderSnoozeCount,
        reminderMoveGentlyCount,
        reminderMakeSmallerCount,
        lastReminderActionAt,
        lastReminderAction,
        reminderActionHistory,
        snoozeCount,
        lastSnoozedAt,
        rescheduleCount,
        lastRescheduledAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        lastDeletedTask.id,
        lastDeletedTask.title,
        lastDeletedTask.section,
        lastDeletedTask.completed ? 1 : 0,
        lastDeletedTask.completedAt || null,
        lastDeletedTask.createdAt || formatSqliteDateTime(new Date()),
        normalizeRepeatType(lastDeletedTask.repeatType),
        serializeRepeatDays(lastDeletedTask.repeatDays),
        lastDeletedTask.repeatMonthlyType || "",
        lastDeletedTask.repeatCustomDate || "",
        lastDeletedTask.repeatYearlyDate || "",
        lastDeletedTask.repeatGroupId || "",
        lastDeletedTask.scheduledTime || "",
        lastDeletedTask.details || "",
        lastDeletedTask.attachment || "",
        JSON.stringify(lastDeletedTask.subtasks || []),
        JSON.stringify(lastDeletedTask.notificationId || []),
        lastDeletedTask.isPinned ? 1 : 0,
        lastDeletedTask.moodType || "",
        lastDeletedTask.firstAction || "",
        lastDeletedTask.minimumVersion || "",
        normalizeEnergyRequiredValue(lastDeletedTask.energyRequired),
        normalizeFocusRequiredValue(lastDeletedTask.focusRequired),
        normalizeTaskContextValue(lastDeletedTask.taskContext),
        normalizeEstimatedMinutesValue(lastDeletedTask.estimatedMinutes),
        Number(lastDeletedTask.startAssistUsedCount || 0),
        lastDeletedTask.lastStartAssistAt || null,
        Number(lastDeletedTask.stuckCount || 0),
        lastDeletedTask.lastStuckAt || null,
        Number(lastDeletedTask.reminderOpenCount || 0),
        Number(lastDeletedTask.reminderStartNowCount || 0),
        Number(lastDeletedTask.reminderSnoozeCount || 0),
        Number(lastDeletedTask.reminderMoveGentlyCount || 0),
        Number(lastDeletedTask.reminderMakeSmallerCount || 0),
        lastDeletedTask.lastReminderActionAt || null,
        lastDeletedTask.lastReminderAction || "",
        JSON.stringify(
          parseReminderActionHistory(lastDeletedTask.reminderActionHistory)
        ),
        Number(lastDeletedTask.snoozeCount || 0),
        lastDeletedTask.lastSnoozedAt || null,
        Number(lastDeletedTask.rescheduleCount || 0),
        lastDeletedTask.lastRescheduledAt || null,
      ]
    );

    setTasks((prev) => [...prev, lastDeletedTask]);
    setLastDeletedTask(null);
  };

  // ✅ Update handleSaveSectionTime in Home.js
  const handleSaveSectionTime = () => {
    if (!editingSection) return;

    // 1. Update the UI State
    setSectionTimes((prev) => ({
      ...prev,
      [editingSection]: {
        start: sectionStartTime,
        end: sectionEndTime,
      },
    }));

    // 2. Update the Database
    try {
      db.runSync(
        `UPDATE tasks SET sectionStart = ?, sectionEnd = ? WHERE section = ?`,
        [sectionStartTime, sectionEndTime, editingSection]
      );
      console.log(`Saved ${editingSection} times to all existing tasks.`);
    } catch (error) {
      console.log("Error updating tasks with section times:", error);
    }

    setSectionTimeModalVisible(false);
    setEditingSection(null);
  };

  const parseDateTime = (str) => {
    if (!str) return null;

    try {
      const storedDate = parseStoredDateTime(str);
      if (storedDate) return storedDate.getTime();

      // .trim() handles accidental leading/trailing spaces
      // .replace(/\s+/g, ' ') handles accidental double spaces
      const cleanStr = str.trim().replace(/\s+/g, " ");
      const [datePart, timePart, ampm] = cleanStr.split(" ");

      const [day, monthStr, year] = datePart.split("-");
      const months = {
        JAN: 0,
        FEB: 1,
        MAR: 2,
        APR: 3,
        MAY: 4,
        JUN: 5,
        JUL: 6,
        AUG: 7,
        SEP: 8,
        OCT: 9,
        NOV: 10,
        DEC: 11,
      };

      // Ensure month is uppercase to match the keys above
      const monthIndex = months[monthStr.toUpperCase()];

      if (monthIndex === undefined) {
        console.log("🚨 Month Parsing Failed for:", monthStr);
        return null;
      }

      let [hours, minutes] = timePart.split(":").map(Number);

      // Standard 12-hour to 24-hour conversion
      if (ampm.toUpperCase() === "PM" && hours !== 12) hours += 12;
      if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;

      const date = new Date(
        parseInt(year),
        monthIndex,
        parseInt(day),
        hours,
        minutes
      );

      const timestamp = date.getTime();
      return isNaN(timestamp) ? null : timestamp;
    } catch (e) {
      console.log("🚨 Parse Error:", e);
      return null;
    }
  };

  const isTaskWithinSection = (section, taskTime) => {
    const sectionData = sectionTimes[section];

    // ✅ if section time not set → allow
    if (!sectionData || !sectionData.start || !sectionData.end) {
      return true;
    }

    const task = parseDateTime(taskTime);
    const start = parseDateTime(sectionData.start);
    const end = parseDateTime(sectionData.end);

    // ❗ CRITICAL FIX
    if (!task || !start || !end) {
      console.log("VALIDATION SKIPPED:", {
        taskTime,
        sectionData,
      });
      return true; // allow instead of blocking
    }

    return task >= start && task <= end;
  };

  const restrictToSection = (section, dateObj) => {
    const sectionData = sectionTimes[section];

    // 🔍 DEBUG START
    console.log("SECTION TIMES:", sectionTimes);
    console.log("CURRENT SECTION:", section);
    console.log("SECTION DATA:", sectionData);
    console.log("INPUT DATE:", dateObj);

    if (!sectionData?.start || !sectionData?.end) {
      console.log("❌ Section time missing → skipping restriction");
      return dateObj;
    }

    // 🔥 EXTRACT TIME DIRECTLY (NO PARSE)
    const getMinutes = (str) => {
      if (!str) return null;

      const storedDate = parseStoredDateTime(str);
      if (storedDate) {
        return storedDate.getHours() * 60 + storedDate.getMinutes();
      }

      const parts = str.split(" ");
      const timePart = parts[1] || parts[0];

      const [hh, mm] = timePart.split(":").map(Number);

      let hours = hh;

      if (parts.includes("PM") && hours !== 12) hours += 12;
      if (parts.includes("AM") && hours === 12) hours = 0;

      return hours * 60 + mm;
    };

    const startMin = getMinutes(sectionData.start);
    const endMin = getMinutes(sectionData.end);

    console.log("START MINUTES:", startMin);
    console.log("END MINUTES:", endMin);

    if (startMin === null || endMin === null) {
      console.log("❌ INVALID SECTION TIME FORMAT:", sectionData);
      return dateObj;
    }

    const selectedMin = dateObj.getHours() * 60 + dateObj.getMinutes();

    console.log("SELECTED MINUTES:", selectedMin);

    const result = new Date(dateObj);

    if (selectedMin < startMin) {
      console.log("⬆️ Adjusting to START time");
      result.setHours(Math.floor(startMin / 60), startMin % 60);
    } else if (selectedMin > endMin) {
      console.log("⬇️ Adjusting to END time");
      result.setHours(Math.floor(endMin / 60), endMin % 60);
    } else {
      console.log("✅ Within range → no adjustment");
    }

    console.log("FINAL RESULT:", result);

    return result;
  };

  const updateSectionTimesInDB = (section, start, end) => {
    try {
      db.runSync(
        `UPDATE tasks SET sectionStart = ?, sectionEnd = ? WHERE section = ?`,
        [start, end, section]
      );
      console.log(`✅ DB Updated: ${section} [${start} - ${end}]`);
    } catch (error) {
      console.log("❌ DB Update Error:", error);
    }
  };

  const saveSectionConfig = useCallback((section, start, end) => {
    try {
      db.runSync(
        `INSERT OR REPLACE INTO section_settings (section_name, start_time, end_time) 
       VALUES (?, ?, ?)`,
        [section, start, end]
      );
    } catch (e) {
      console.log("Save Error:", e);
    }
  }, []);

  const openSchedulePicker = useCallback(
    ({ target, section = null, title = "Schedule", value = null }) => {
      setDatePickerModal({
        visible: true,
        target,
        section,
        title,
        value: parseStoredDateTime(value) || value || new Date(),
      });
    },
    []
  );

  const closeSchedulePicker = useCallback(() => {
    setDatePickerModal({
      visible: false,
      target: null,
      section: null,
      title: "Schedule",
      value: null,
    });
  }, []);

  const handleScheduleConfirm = useCallback(
    (selectedDate, formattedValue) => {
      const formatted = formattedValue || formatSqliteDateTime(selectedDate);
      if (!formatted) {
        closeSchedulePicker();
        return;
      }

      if (datePickerModal.target === "task") {
        setScheduledDateTime(formatted);
        setTimeAdjusted(false);
      }

      if (datePickerModal.target === "recovery-task") {
        setRecoveryDraftDateTime(formatted);
      }

      if (datePickerModal.target === "repeat-monthly-custom") {
        setRepeatCustomDate(formatted);
      }

      if (datePickerModal.target === "repeat-yearly") {
        setRepeatYearlyDate(formatted);
      }

      if (datePickerModal.target === "section-start" && datePickerModal.section) {
        const section = datePickerModal.section;
        const end = sectionTimes[section]?.end || "";

        setSectionTimes((prev) => ({
          ...prev,
          [section]: { ...prev[section], start: formatted },
        }));
        saveSectionConfig(section, formatted, end);
      }

      if (datePickerModal.target === "section-end" && datePickerModal.section) {
        const section = datePickerModal.section;
        const start = sectionTimes[section]?.start || "";

        setSectionTimes((prev) => ({
          ...prev,
          [section]: { ...prev[section], end: formatted },
        }));
        saveSectionConfig(section, start, formatted);
      }

      closeSchedulePicker();
    },
    [closeSchedulePicker, datePickerModal, saveSectionConfig, sectionTimes]
  );

  const pickDocument = async () => {
    let result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"], // Limit to images and PDFs
      copyToCacheDirectory: true,
    });

    if (!result.canceled) {
      setAttachmentUri(result.assets[0].uri);
      setAttachmentName(result.assets[0].name);
    }
  };

  const saveOnboardingProfile = () => {
    const name = profileDraftName.trim();
    if (!name) return;

    const nextProfile = {
      ...profile,
      name,
      vibe: profileDraftVibe || "🌿",
      onboardingComplete: true,
    };
    saveProfile(nextProfile);
    setOnboardingVisible(false);
  };

  const saveProfileEdits = () => {
    const name = profileDraftName.trim() || profile.name || "Friend";
    saveProfile({
      ...profile,
      name,
      vibe: profileDraftVibe || profile.vibe || "🌿",
      onboardingComplete: true,
    });
  };

  const addSpecialTask = () => {
    if (!specialTaskTitle.trim()) return;

    db.runSync(
      `INSERT INTO special_tasks (title, note, createdAt)
       VALUES (?, ?, datetime('now'))`,
      [specialTaskTitle.trim(), specialTaskNote.trim()]
    );
    setSpecialTaskTitle("");
    setSpecialTaskNote("");
    refreshSpecialTasks();
  };

  const deleteSpecialTask = (id) => {
    db.runSync("DELETE FROM special_tasks WHERE id = ?", [id]);
    refreshSpecialTasks();
  };

  const toggleStreakVisibility = () => {
    const nextValue = !productivityStats.showStreak;
    saveSetting("showStreak", nextValue ? "true" : "false");
    setProductivityStats((prev) => ({ ...prev, showStreak: nextValue }));
  };

  const resetStreak = () => {
    saveSetting("currentStreak", 0);
    saveSetting("lastQualifiedDate", "");
    setProductivityStats((prev) => ({
      ...prev,
      currentStreak: 0,
      lastQualifiedDate: "",
    }));
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = profile.name || "Friend";
    if (hour < 12) return `Good Morning, ${name} ${profile.vibe || "🌿"}`;
    if (hour < 17) return `Good Afternoon, ${name} ${profile.vibe || "🌿"}`;
    return `Good Evening, ${name} ${profile.vibe || "🌿"}`;
  };

  const formatLongDate = () =>
    new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

  const getStreakLabel = () => {
    if (!productivityStats.currentStreak) return "🌱 Fresh start today";
    if (productivityStats.currentStreak === 1) return "🌱 New Beginning";
    if (productivityStats.currentStreak < 5)
      return `🔥 ${productivityStats.currentStreak} Day Focus Streak`;
    if (productivityStats.currentStreak < 10)
      return `⚡ ${productivityStats.currentStreak} Days Momentum`;
    return `🚀 ${productivityStats.currentStreak} Days Consistent`;
  };

  const getMostProductiveSection = () => {
    const counts = tasks.reduce((acc, task) => {
      if (task.completed) acc[task.section] = (acc[task.section] || 0) + 1;
      return acc;
    }, {});
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : "Building soon";
  };

  const groupTasksByDate = () => {
    return tasks.reduce((acc, task) => {
      const date = parseStoredDateTime(task.scheduledTime);
      const key =
        date && !isNaN(date.getTime())
          ? date.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : "Unscheduled";
      acc[key] = [...(acc[key] || []), task];
      return acc;
    }, {});
  };

  // --- Inside export default function Home() ---

  // Helper to update subtasks in DB
  const updateSubtasksInDB = (taskId, updatedSubtasks) => {
    try {
      db.runSync("UPDATE tasks SET subtasks = ? WHERE id = ?", [
        JSON.stringify(updatedSubtasks),
        taskId,
      ]);
    } catch (e) {
      console.log("Error saving subtasks:", e);
    }
  };

  const normalizeSubtaskTitle = (value = "") =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  const buildSubtask = (title = "") => ({
    id: Date.now() + Math.floor(Math.random() * 1000),
    title,
    completed: false,
  });

  const addSubtask = (taskId, title, options = {}) => {
    const normalizedTitle = normalizeSubtaskTitle(title);
    if (!normalizedTitle) return;

    const { prepend = false, skipDuplicate = true } = options;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;

        const currentSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
        const hasDuplicate = currentSubtasks.some(
          (subtask) =>
            normalizeSubtaskTitle(subtask?.title || "").toLowerCase() ===
            normalizedTitle.toLowerCase()
        );
        if (skipDuplicate && hasDuplicate) return task;

        const nextSubtask = buildSubtask(normalizedTitle);
        const updatedSubtasks = prepend
          ? [nextSubtask, ...currentSubtasks]
          : [...currentSubtasks, nextSubtask];
        updateSubtasksInDB(taskId, updatedSubtasks);
        return { ...task, subtasks: updatedSubtasks };
      })
    );
  };

  const toggleSubtask = (taskId, subtaskId) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          const updatedSubtasks = task.subtasks.map((st) =>
            st.id === subtaskId ? { ...st, completed: !st.completed } : st
          );
          updateSubtasksInDB(taskId, updatedSubtasks);
          return { ...task, subtasks: updatedSubtasks };
        }
        return task;
      })
    );
  };

  const updateSubtaskTitle = (taskId, subtaskId, nextTitle) => {
    const normalizedTitle = normalizeSubtaskTitle(nextTitle);
    if (!normalizedTitle) return;

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;

        const currentSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
        const duplicateExists = currentSubtasks.some(
          (subtask) =>
            subtask.id !== subtaskId &&
            normalizeSubtaskTitle(subtask?.title || "").toLowerCase() ===
              normalizedTitle.toLowerCase()
        );
        if (duplicateExists) return task;

        const updatedSubtasks = currentSubtasks.map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, title: normalizedTitle } : subtask
        );
        updateSubtasksInDB(taskId, updatedSubtasks);
        return { ...task, subtasks: updatedSubtasks };
      })
    );
  };

  const moveSubtask = (taskId, fromIndex, toIndex) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;

        const currentSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
        if (!currentSubtasks.length) return task;

        const safeFrom = Math.max(0, Math.min(fromIndex, currentSubtasks.length - 1));
        const safeTo = Math.max(0, Math.min(toIndex, currentSubtasks.length - 1));
        if (safeFrom === safeTo) return task;

        const reordered = [...currentSubtasks];
        const [moved] = reordered.splice(safeFrom, 1);
        reordered.splice(safeTo, 0, moved);
        updateSubtasksInDB(taskId, reordered);
        return { ...task, subtasks: reordered };
      })
    );
  };

  const startSubtaskEditing = (taskId, subtask) => {
    setEditingSubtaskTaskId(taskId);
    setEditingSubtaskId(subtask?.id ?? null);
    setEditingSubtaskDraft(subtask?.title || "");
  };

  const cancelSubtaskEditing = () => {
    setEditingSubtaskTaskId(null);
    setEditingSubtaskId(null);
    setEditingSubtaskDraft("");
  };

  const saveSubtaskEditing = () => {
    if (!editingSubtaskTaskId || !editingSubtaskId) return;
    updateSubtaskTitle(editingSubtaskTaskId, editingSubtaskId, editingSubtaskDraft);
    cancelSubtaskEditing();
  };

  const handleSubtaskDragStart = (taskId, subtaskId, index, startPageY = 0) => {
    subtaskDragStateRef.current = {
      taskId,
      subtaskId,
      index,
      startPageY,
      deltaY: 0,
    };
    setIsSubtaskReordering(true);
    setDraggingSubtaskKey(`${taskId}:${subtaskId}`);
  };

  const handleSubtaskDragMove = (currentPageY = 0) => {
    const state = subtaskDragStateRef.current;
    if (!state?.taskId || !state?.subtaskId) return;
    state.deltaY = currentPageY - Number(state.startPageY || 0);
    subtaskDragStateRef.current = state;
  };

  const resetSubtaskDrag = () => {
    subtaskDragStateRef.current = {
      taskId: null,
      subtaskId: null,
      index: -1,
      startPageY: 0,
      deltaY: 0,
    };
    setIsSubtaskReordering(false);
    setDraggingSubtaskKey("");
  };

  const handleSubtaskDragRelease = () => {
    const state = subtaskDragStateRef.current;
    const hasDragTarget = state?.taskId && Number.isFinite(state.index);
    const deltaY = Number(state?.deltaY || 0);

    if (!hasDragTarget) {
      resetSubtaskDrag();
      return;
    }

    // gentle threshold so accidental taps don't reorder subtasks
    if (Math.abs(deltaY) > 18) {
      const approximateSteps = Math.round(deltaY / 32);
      if (approximateSteps !== 0) {
        moveSubtask(state.taskId, state.index, state.index + approximateSteps);
      }
    }

    resetSubtaskDrag();
  };

  useEffect(() => {
    if (!draggingSubtaskKey) return;
    const [taskIdPart, subtaskIdPart] = draggingSubtaskKey.split(":");
    const activeTaskId = Number(taskIdPart);
    const activeSubtaskId = Number(subtaskIdPart);

    const taskExists = tasks.some((task) => {
      if (task.id !== activeTaskId) return false;
      const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
      return subtasks.some((subtask) => subtask.id === activeSubtaskId);
    });

    if (!taskExists) {
      resetSubtaskDrag();
    }
  }, [draggingSubtaskKey, tasks]);

  const deleteSubtask = (taskId, subtaskId) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          const updatedSubtasks = task.subtasks.filter(
            (st) => st.id !== subtaskId
          );
          updateSubtasksInDB(taskId, updatedSubtasks);
          return { ...task, subtasks: updatedSubtasks };
        }
        return task;
      })
    );
  };

  const scheduleProReminders = async (task, options = {}) => {
    if (!task.scheduledTime) return [];
    const taskDate = parseStoredDateTime(task.scheduledTime);
    if (!taskDate) return [];
    const now = new Date();
    const source =
      typeof options.source === "string" && options.source.trim()
        ? options.source.trim()
        : "normal";

    const intervals = [20, 10, 5, 0]; // Minutes before task
    const scheduledIds = [];

    for (let mins of intervals) {
      const triggerDate = new Date(taskDate.getTime() - mins * 60000);
      const reminderPayload = buildTaskReminderPayload({
        task,
        type: "taskReminder",
        minutesBefore: mins,
      });
      const reminderContent = buildTaskReminderNotificationContent({
        task,
        payload: reminderPayload,
        prefix: "Reminder",
        body: "Start with one small step.",
        source,
        reminderOffsetMinutes: mins,
      });

      // Only schedule if the trigger time is in the future
      if (triggerDate > now) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: reminderContent.title,
            body: reminderContent.body,
            sound: "default",
            data: reminderContent.data,
            categoryIdentifier: TASK_REMINDER_ACTIONS_CATEGORY_ID,

            priority: Notifications.AndroidNotificationPriority.MAX,

            vibrate: [0, 250, 250, 250],

            android: {
              channelId: "adhd-alarms",
              color: COLORS.accent, // Premium Cyan
              pressAction: {
                id: "default",
              },
            },
          },

          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
        });

        console.log("✅ Scheduled notification ID:", id);
        scheduledIds.push(id);
      }
    }
    return scheduledIds; // Returns array of 4 IDs
  };

  const renderAvatar = (size = "large") => {
    const avatarSize = size === "small" ? "w-12 h-12" : "w-16 h-16";
    const textSize = size === "small" ? "text-lg" : "text-2xl";

    return (
      <TouchableOpacity
        onPress={pickProfileImage}
        activeOpacity={0.8}
        className={`${avatarSize} rounded-full bg-[#123131] border-2 border-[#66b9b9]/50 shadow-lg shadow-[#66b9b9]/20 items-center justify-center overflow-hidden`}
      >
        {profile.profileImage ? (
          <Image source={{ uri: profile.profileImage }} className="w-full h-full" />
        ) : (
          <Text className={`${textSize}`}>{profile.vibe || "🌿"}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderStatPill = (label, value, accent = "#66b9b9") => (
    <View className="flex-1 bg-[#061414]/45 border border-[#337a7a]/30 rounded-2xl p-3">
      <Text className="text-[#9FB5B5] text-[10px] font-bold uppercase tracking-widest">
        {label}
      </Text>
      <Text style={{ color: accent }} className="text-base font-black mt-1">
        {value}
      </Text>
    </View>
  );

  const renderMoodSelectorRow = ({
    selectedMoodType,
    onSelect,
    compact = false,
  }) => (
    <View className={`flex-row ${compact ? "justify-between" : "justify-start"} flex-wrap`}>
      {MOOD_OPTIONS.map((option) => {
        const selected = selectedMoodType === option.type;
        return (
          <TouchableOpacity
            key={option.type}
            activeOpacity={0.82}
            onPress={() => onSelect(option.type)}
            className={`mr-2 mb-2 rounded-full border ${
              compact ? "px-2.5 py-1.5" : "px-3 py-2"
            } ${
              selected
                ? "bg-[#66b9b9]/22 border-[#66b9b9]/60"
                : "bg-[#123131]/75 border-[#337a7a]/35"
            }`}
          >
            <Text
              className={`font-bold ${
                compact ? "text-[11px]" : "text-xs"
              } ${selected ? "text-[#E8F4F4]" : "text-[#9FB5B5]"}`}
            >
              {option.emoji}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderMoodSummaryChip = (prefix, moodType) => {
    const meta = getMoodMeta(moodType);
    return (
      <View className="bg-[#123131]/70 border border-[#66b9b9]/25 rounded-full px-3 py-1.5 mr-2 mb-2">
        <Text className="text-[#66b9b9] text-[10px] font-black">
          {prefix}: {meta ? `${meta.emoji} ${meta.label}` : "Not logged yet"}
        </Text>
      </View>
    );
  };

  const handleHeaderLayout = useCallback((event) => {
    const measured = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    if (!measured) return;
    setHeaderContainerHeight((prev) => {
      if (Math.abs(prev - measured) < 2) return prev;
      return measured;
    });
  }, []);

  const renderFixedHeader = () => (
    <Reanimated.View
      onLayout={handleHeaderLayout}
      style={[headerAnimatedStyle, { paddingTop: Math.max(insets.top, 8) + 4 }]}
      className="absolute top-0 left-0 right-0 z-30 bg-[#061414]/95 px-4 pb-4 border-b border-[#66b9b9]/25 shadow-2xl shadow-[#66b9b9]/20 rounded-b-[32px]"
    >
      <View className="flex-row items-center">
        {renderAvatar("small")}
        <View className="flex-1 px-3">
          <Text numberOfLines={1} className="text-[#E8F4F4] text-lg font-black tracking-tight">
            {getGreeting()}
          </Text>
          <Text className="text-[#9FB5B5] text-xs font-semibold mt-0.5">
            {formatLongDate()}
          </Text>
          <Text className="text-[#66b9b9] text-[10px] font-bold uppercase tracking-widest mt-1">
            Ready to focus today? ✨
          </Text>
        </View>
        <TouchableOpacity
          onPress={openDrawer}
          activeOpacity={0.8}
          className="w-11 h-11 rounded-2xl bg-[#123131]/80 border border-[#66b9b9]/30 items-center justify-center"
        >
          <Text className="text-[#E8F4F4] text-2xl leading-none">≡</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={{ opacity: affirmationOpacity }}
        className="mt-4 bg-[#123131]/60 border border-[#66b9b9]/25 rounded-2xl px-3 h-[44px] justify-center"
      >
        <View
          onLayout={handleHeaderAffirmationViewportLayout}
          className="relative h-5 justify-center overflow-hidden"
        >
          {shouldScrollHeaderAffirmation ? (
            <Reanimated.View
              style={headerAffirmationMarqueeStyle}
              className="flex-row items-center"
            >
              <Text numberOfLines={1} className="text-[#E8F4F4] text-sm font-bold leading-5">
                {currentAffirmation}
              </Text>
              <View style={{ width: HEADER_AFFIRMATION_MARQUEE_GAP }} />
              <Text numberOfLines={1} className="text-[#E8F4F4] text-sm font-bold leading-5">
                {currentAffirmation}
              </Text>
            </Reanimated.View>
          ) : (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-[#E8F4F4] text-sm font-bold leading-5"
            >
              {currentAffirmation}
            </Text>
          )}

          <View className="absolute opacity-0 left-0 top-0">
            <Text
              numberOfLines={1}
              onLayout={handleHeaderAffirmationTextLayout}
              className="text-[#E8F4F4] text-sm font-bold leading-5"
            >
              {currentAffirmation}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Reanimated.View>
  );
  const renderFloatingMenuShortcut = () => (
    <Reanimated.View
      pointerEvents={isHeaderCollapsed ? "auto" : "none"}
      style={[
        floatingMenuAnimatedStyle,
        { top: Math.max(insets.top, 8) + 6 },
      ]}
      className="absolute right-4 z-40"
    >
      <TouchableOpacity
        onPress={openDrawer}
        activeOpacity={0.8}
        className="w-11 h-11 rounded-2xl bg-[#123131]/85 border border-[#66b9b9]/35 items-center justify-center shadow-lg shadow-[#66b9b9]/15"
      >
        <Text className="text-[#E8F4F4] text-2xl leading-none">{"\u2261"}</Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
  const renderFixedFooter = () => (
    <View pointerEvents="box-none" className="absolute left-0 right-0 z-20" style={{ bottom: footerSafeBottom }}>
      <View
        className="mx-4 bg-[#0B1F1F] border border-[#66b9b9]/30 rounded-xl px-3 py-1 shadow-xl shadow-[#66b9b9]/10"
        style={{ minHeight: footerHeight }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[#E8F4F4] text-[10px] font-black uppercase tracking-widest pr-3">
            {"\u00A9"} researchzeal.com
          </Text>
          <TouchableOpacity
            onPress={openSupport}
            activeOpacity={0.86}
            className="bg-[#66b9b9]/20 border border-[#66b9b9]/50 rounded-full px-3 py-1.5"
          >
            <Text className="text-[#66b9b9] text-[9px] font-black uppercase tracking-widest">
              Support Us {"\u{1F91D}"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
  const renderRecoveryPendingTaskCard = ({ item, index }) => {
    const scheduledTimestamp = toTaskTimestamp(item.scheduledTime) || 0;
    const startOfToday = getDayBounds(new Date()).start;
    const dayAge = Math.max(
      1,
      Math.floor((startOfToday - scheduledTimestamp) / (24 * 60 * 60 * 1000))
    );
    const supportLabel =
      dayAge <= 2 ? "Ready to continue" : "Needs rescheduling";
    const isEditing = recoveryEditingTaskId === item.id;
    const isSaving = recoverySavingTaskId === item.id;
    const durationSeconds = taskDurations[item.id];
    const subtasksCount = Array.isArray(item.subtasks) ? item.subtasks.length : 0;
    const scheduleLabel =
      formatDateTimeForDisplay(item.scheduledTime) || "No schedule";
    const draftScheduleLabel =
      formatDateTimeForDisplay(recoveryDraftDateTime) || "Pick date & time";

    return (
      <Reanimated.View
        entering={FadeInDown.duration(220).delay(Math.min(index, 6) * 45)}
        className="bg-[#123131]/62 border border-[#337a7a]/30 rounded-[24px] p-5 mb-3"
      >
        <View>
          <Text className="text-[#E8F4F4] text-2xl leading-8 font-black" numberOfLines={3}>
            {item.title}
          </Text>
          <Text className="text-[#9FB5B5] text-[11px] mt-2 font-black uppercase tracking-widest">
            {item.section}
          </Text>
          <Text className="text-[#9FB5B5] text-sm mt-1 font-semibold leading-5">
            {scheduleLabel}
          </Text>
        </View>

        <View className="flex-row flex-wrap mt-3.5">
          <View className="bg-[#66b9b9]/12 border border-[#66b9b9]/30 rounded-full px-2.5 py-1 mr-2 mb-2">
            <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-wide">
              {supportLabel}
            </Text>
          </View>
          {durationSeconds ? (
            <View className="bg-[#061414]/55 border border-[#337a7a]/25 rounded-full px-2.5 py-1 mr-2 mb-2">
              <Text className="text-[#9FB5B5] text-[10px] font-bold">
                {formatDuration(durationSeconds)}
              </Text>
            </View>
          ) : null}
          {subtasksCount > 0 ? (
            <View className="bg-[#061414]/55 border border-[#337a7a]/25 rounded-full px-2.5 py-1 mr-2 mb-2">
              <Text className="text-[#9FB5B5] text-[10px] font-bold">
                {subtasksCount} steps
              </Text>
            </View>
          ) : null}
        </View>

        {!isEditing ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => startRecoveryEdit(item)}
            className="mt-2 bg-[#66b9b9]/15 border border-[#66b9b9]/30 rounded-2xl px-3.5 py-3 flex-row items-center justify-center"
          >
            <Feather name="refresh-cw" size={12} color={COLORS.accent} />
            <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest ml-1.5">
              Continue & Reschedule
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="mt-3 bg-[#061414]/45 border border-[#66b9b9]/25 rounded-2xl p-3.5">
            <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest mb-2">
              Reschedule
            </Text>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() =>
                openSchedulePicker({
                  target: "recovery-task",
                  title: "Update Date & Time",
                  value: recoveryDraftDateTime || item.scheduledTime || new Date(),
                })
              }
              className="bg-[#123131]/80 border border-[#66b9b9]/25 rounded-xl px-3 py-3 mb-3"
            >
              <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                Date & Time
              </Text>
              <Text className="text-[#E8F4F4] text-sm font-bold mt-1">
                {draftScheduleLabel}
              </Text>
            </TouchableOpacity>

            <View className="flex-row justify-between mb-3">
              {SECTION_ORDER.map((sectionName) => (
                <TouchableOpacity
                  key={`${item.id}-${sectionName}`}
                  onPress={() => setRecoveryDraftSection(sectionName)}
                  className={`flex-1 py-2.5 rounded-xl border mx-0.5 ${
                    recoveryDraftSection === sectionName
                      ? "bg-[#66b9b9] border-[#66b9b9]"
                      : "bg-[#123131]/80 border-[#337a7a]/35"
                  }`}
                >
                  <Text
                    className={`text-center text-[10px] font-black uppercase tracking-widest ${
                      recoveryDraftSection === sectionName
                        ? "text-[#061414]"
                        : "text-[#9FB5B5]"
                    }`}
                  >
                    {sectionName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row">
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={cancelRecoveryEdit}
                className="flex-1 h-11 rounded-xl border border-[#337a7a]/40 bg-[#123131]/70 items-center justify-center mr-2"
              >
                <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={isSaving}
                onPress={saveRecoveryEdit}
                className={`flex-1 h-11 rounded-xl items-center justify-center ${
                  isSaving
                    ? "bg-[#66b9b9]/30 border border-[#66b9b9]/35"
                    : "bg-[#66b9b9] border border-[#99bdbd]/60"
                }`}
              >
                <Text
                  className={`text-[10px] font-black uppercase tracking-widest ${
                    isSaving ? "text-[#9FB5B5]" : "text-[#061414]"
                  }`}
                >
                  {isSaving ? "Saving..." : "Save Update"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Reanimated.View>
    );
  };
  const renderRecoveryModal = () => (
    <Modal
      visible={recoveryModalVisible}
      transparent
      animationType="none"
      onRequestClose={closeRecoveryModal}
    >
      <View className="flex-1 justify-end">
        <Pressable onPress={closeRecoveryModal} className="absolute inset-0">
          <Reanimated.View
            style={recoveryBackdropStyle}
            className="flex-1 bg-[#061414]"
          />
        </Pressable>

        <Reanimated.View
          style={recoverySheetStyle}
          className="max-h-[84%] bg-[#0B1F1F] rounded-t-[34px] border-t border-[#66b9b9]/35 shadow-2xl shadow-[#66b9b9]/20"
        >
          <View className="items-center pt-3">
            <View className="w-14 h-1.5 rounded-full bg-[#337a7a]/70" />
          </View>
          <View className="px-5 pt-2 pb-4 border-b border-[#66b9b9]/25 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[#E8F4F4] text-xl font-black">
                Reschedule Pending Tasks
              </Text>
              <Text className="text-[#9FB5B5] text-xs font-semibold mt-1">
                Continue gently, one task at a time.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={closeRecoveryModal}
              className="bg-[#123131]/80 border border-[#66b9b9]/30 rounded-full px-3 py-2"
            >
              <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                Close
              </Text>
            </TouchableOpacity>
          </View>

          {recoverySuccessMessage ? (
            <Reanimated.View
              style={recoverySuccessStyle}
              className="mx-5 mt-3 bg-[#7DFFB3]/12 border border-[#7DFFB3]/35 rounded-xl px-3 py-2"
            >
              <Text className="text-[#7DFFB3] text-[11px] font-black text-center">
                {recoverySuccessMessage}
              </Text>
            </Reanimated.View>
          ) : null}

          {recoveryPendingTasks.length === 0 ? (
            <View className="px-6 py-10 items-center">
              <Text className="text-[#E8F4F4] text-lg font-black">
                You are all caught up.
              </Text>
              <Text className="text-[#9FB5B5] text-sm font-semibold mt-2 text-center">
                Nothing waiting behind you.
              </Text>
              <Text className="text-[#66b9b9] text-xs font-bold mt-3 text-center">
                Fresh start feels good.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={recoveryListRef}
              data={recoveryPendingTasks}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderRecoveryPendingTaskCard}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 42,
              }}
              onScroll={(event) => {
                recoveryScrollOffsetRef.current =
                  event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            />
          )}
        </Reanimated.View>
      </View>
    </Modal>
  );

  const renderTodayPlanSheet = () => (
    <Modal
      visible={todayPlanSheetVisible}
      transparent
      animationType="none"
      onRequestClose={closeTodayPlanSheet}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={modalKeyboardOffset}
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={closeTodayPlanSheet} className="absolute inset-0">
            <Reanimated.View
              style={todayPlanBackdropStyle}
              className="flex-1 bg-[#061414]"
            />
          </Pressable>

          <Reanimated.View
            style={todayPlanSheetStyle}
            className="max-h-[84%] bg-[#0B1F1F] rounded-t-[34px] border-t border-[#66b9b9]/35 shadow-2xl shadow-[#66b9b9]/20"
          >
            <View className="items-center pt-3">
              <View className="w-14 h-1.5 rounded-full bg-[#337a7a]/70" />
            </View>

            <View className="px-5 pt-2 pb-3 border-b border-[#66b9b9]/25">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text
                    accessibilityRole="header"
                    className="text-[#E8F4F4] text-xl font-black"
                  >
                    Plan today gently 🗓️
                  </Text>
                  <Text className="text-[#9FB5B5] text-xs font-semibold mt-1">
                    No pending tasks are planned for today. Let’s choose one small next step.
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={closeTodayPlanSheet}
                  className="bg-[#123131]/80 border border-[#66b9b9]/30 rounded-full px-3 py-2"
                >
                  <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                    Not now
                  </Text>
                </TouchableOpacity>
              </View>
              <Text className="text-[#9FB5B5] text-xs mt-2">
                You do not need to plan the whole day. One useful task is enough. 🌿
              </Text>
              {todayPlanNotificationSection ? (
                <View className="self-start mt-2 bg-[#123131]/80 border border-[#66b9b9]/25 rounded-full px-3 py-1.5">
                  <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                    {todayPlanNotificationSection} planning prompt
                  </Text>
                </View>
              ) : null}
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: Math.max(insets.bottom, 14) + 8,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={openModalFromTodayPlan}
                className="bg-[#66b9b9]/18 border border-[#66b9b9]/40 rounded-2xl px-4 py-3.5"
              >
                <Text className="text-[#66b9b9] text-[11px] font-black uppercase tracking-widest">
                  Add a task for today
                </Text>
                <Text className="text-[#9FB5B5] text-xs mt-1">
                  Create one small starting point. ✨
                </Text>
              </TouchableOpacity>

              <View className="mt-4 bg-[#123131]/55 border border-[#337a7a]/25 rounded-2xl p-3.5">
                <Text className="text-[#E8F4F4] text-sm font-black">
                  Past tasks you can move gently
                </Text>
                <Text className="text-[#9FB5B5] text-xs mt-1">
                  No guilt. You can bring one task back into today. 🌿
                </Text>

                {todayPlanPreviewPastTasks.length === 0 ? (
                  <Text className="text-[#9FB5B5] text-xs mt-3">
                    No past pending tasks need recovery right now. 🤍
                  </Text>
                ) : (
                  <View className="mt-2">
                    {todayPlanPreviewPastTasks.map((task) => (
                      <View
                        key={`today-plan-task-${task.id}`}
                        className="bg-[#0B1F1F] border border-[#337a7a]/25 rounded-xl px-3 py-3 mb-2"
                      >
                        <Text
                          accessibilityLabel={`${task.title || "Task"} pending task`}
                          className="text-[#E8F4F4] text-sm font-black"
                          numberOfLines={2}
                        >
                          {task.title || "Task"}
                        </Text>
                        <Text className="text-[#9FB5B5] text-[11px] mt-1">
                          {formatDateTimeForDisplay(task.scheduledTime) || "No schedule"} •{" "}
                          {task.section || "Morning"}
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.86}
                          accessibilityLabel={`Move ${task.title || "task"} to today`}
                          onPress={() => openRecoveryModalFromTodayPlanTask(task)}
                          className="self-start mt-2 bg-[#66b9b9]/15 border border-[#66b9b9]/35 rounded-full px-3 py-1.5"
                        >
                          <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                            Move to today
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </Reanimated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderDrawer = () => (
    <Modal visible={drawerVisible} transparent animationType="fade">
      <Pressable onPress={closeDrawer} className="flex-1 bg-[#061414]/80">
        <Animated.View
          style={{ transform: [{ translateX: drawerX }] }}
          className="w-[82%] max-w-[320px] h-full bg-[#0B1F1F] border-r border-[#66b9b9]/30 px-5 pt-14 pb-8 shadow-2xl shadow-[#66b9b9]/20"
        >
          <Pressable>
            <View className="flex-row items-center mb-6">
              {renderAvatar("small")}
              <View className="ml-3 flex-1">
                <Text className="text-[#E8F4F4] font-black text-lg">
                  {profile.name || "Welcome"}
                </Text>
                <Text className="text-[#9FB5B5] text-xs font-semibold">
                  {getStreakLabel()}
                </Text>
              </View>
            </View>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.82}
                onPress={() => {
                  closeDrawer();
                  setActivePage(item.key);
                }}
                className="flex-row items-center bg-[#123131]/55 border border-[#337a7a]/25 rounded-2xl px-4 py-3 mb-2"
              >
                <Text className="text-lg mr-3">{item.icon}</Text>
                <Text className="text-[#E8F4F4] font-bold flex-1">
                  {item.label}
                </Text>
                <Text className="text-[#66b9b9] font-black">›</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );

  const renderTaskMiniCard = (task, tone = "accent", allowRepeat = false) => (
    <View key={task.id} className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-2xl p-3 mb-2">
      <Text className="text-[#E8F4F4] font-black">{task.title}</Text>
      <Text className="text-[#9FB5B5] text-xs mt-1">
        {task.section} {task.scheduledTime ? `• ${formatDateTimeForDisplay(task.scheduledTime)}` : "• No schedule yet"}
      </Text>
      {tone === "success" && (
        <Text className="text-[#7DFFB3] text-xs font-bold mt-2">
          You completed this. That counts. ✨
        </Text>
      )}
      {allowRepeat && (
        <TouchableOpacity
          onPress={() => recreateCompletedTask(task)}
          className="self-start mt-2 flex-row items-center bg-[#66b9b9]/15 px-2.5 py-1.5 rounded-full border border-[#66b9b9]/30"
        >
          <Feather name="rotate-cw" size={12} color={COLORS.accent} />
          <Text className="text-[#66b9b9] text-[10px] font-black ml-1.5 uppercase tracking-widest">
            Repeat
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderPageContent = () => {
    const pendingTasks = [...tasks]
      .filter((task) => !task.completed)
      .sort(
        (a, b) =>
          (parseStoredDateTime(a.scheduledTime)?.getTime() || 0) -
          (parseStoredDateTime(b.scheduledTime)?.getTime() || 0)
      );
    const completedTaskList = tasks.filter((task) => task.completed);
    const groupedTasks = groupTasksByDate();

    if (activePage === "profile") {
      return (
        <>
          <View className="items-center mb-5">
            {renderAvatar()}
            <Text className="text-[#E8F4F4] text-2xl font-black mt-3">
              {profile.name || "Your Profile"}
            </Text>
            <Text className="text-[#9FB5B5] text-sm mt-1">
              Gentle focus, your way {profile.vibe || "🌿"}
            </Text>
          </View>
          <TextInput
            value={profileDraftName}
            onChangeText={setProfileDraftName}
            placeholder="Your name"
            placeholderTextColor={COLORS.muted}
            className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-3 border border-[#66b9b9]/25 font-semibold"
          />
          <View className="flex-row flex-wrap mb-4">
            {VIBE_OPTIONS.map((vibe) => (
              <TouchableOpacity
                key={vibe.emoji}
                onPress={() => setProfileDraftVibe(vibe.emoji)}
                className={`px-3 py-2 rounded-full mr-2 mb-2 border ${
                  profileDraftVibe === vibe.emoji
                    ? "bg-[#66b9b9] border-[#66b9b9]"
                    : "bg-[#123131]/70 border-[#337a7a]/35"
                }`}
              >
                <Text className={`font-bold text-xs ${profileDraftVibe === vibe.emoji ? "text-[#061414]" : "text-[#E8F4F4]"}`}>
                  {vibe.emoji} {vibe.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={saveProfileEdits} className="bg-[#66b9b9] p-4 rounded-2xl mb-5 shadow-lg shadow-[#66b9b9]/25">
            <Text className="text-[#061414] text-center font-black uppercase tracking-widest">
              Save Profile
            </Text>
          </TouchableOpacity>
          <View className="flex-row gap-2 mb-2">
            {renderStatPill("Current Streak", productivityStats.currentStreak || "Fresh", COLORS.warning)}
            {renderStatPill("Best Streak", productivityStats.bestStreak || 0, COLORS.success)}
          </View>
          <View className="flex-row gap-2 mb-2">
            {renderStatPill("Lifetime Focus", formatDuration(productivityStats.lifetimeFocusTime) || "0m")}
            {renderStatPill("Completed", productivityStats.lifetimeCompletedTasks, COLORS.success)}
          </View>
          <View className="bg-[#123131]/55 rounded-2xl p-4 border border-[#337a7a]/25 mt-2">
            <Text className="text-[#E8F4F4] font-black">Weekly Focus</Text>
            <Text className="text-[#9FB5B5] text-xs mt-2">
              Calm graph placeholder • More history can grow here without pressure.
            </Text>
            <Text className="text-[#66b9b9] text-xs font-bold mt-3">
              Most productive section: {getMostProductiveSection()}
            </Text>
          </View>
        </>
      );
    }

    if (activePage === "special") {
      return (
        <>
          <Text className="text-[#9FB5B5] text-sm mb-4">
            Keep important goals separate from the busy list. Gentle priorities only.
          </Text>
          <TextInput
            value={specialTaskTitle}
            onChangeText={setSpecialTaskTitle}
            placeholder="Important goal"
            placeholderTextColor={COLORS.muted}
            className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-3 border border-[#66b9b9]/25 font-semibold"
          />
          <TextInput
            value={specialTaskNote}
            onChangeText={setSpecialTaskNote}
            placeholder="Why it matters"
            placeholderTextColor={COLORS.muted}
            className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-3 border border-[#66b9b9]/25 font-semibold"
          />
          <TouchableOpacity onPress={addSpecialTask} className="bg-[#66b9b9] p-4 rounded-2xl mb-4">
            <Text className="text-[#061414] text-center font-black uppercase tracking-widest">
              Add Special Task
            </Text>
          </TouchableOpacity>
          {specialTasks.map((item) => (
            <View key={item.id} className="bg-[#123131]/65 rounded-2xl p-4 border border-[#FFD166]/25 mb-3">
              <Text className="text-[#FFD166] font-black">⭐ {item.title}</Text>
              {item.note ? <Text className="text-[#E8F4F4] text-sm mt-2">{item.note}</Text> : null}
              <TouchableOpacity onPress={() => deleteSpecialTask(item.id)} className="self-start mt-3">
                <Text className="text-[#FF7B7B] text-xs font-bold">Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      );
    }

    if (activePage === "pending") {
      return pendingTasks.length ? (
        pendingTasks.map((task) => renderTaskMiniCard(task))
      ) : (
        <Text className="text-[#7DFFB3] font-bold">No pending tasks. Breathe that in. 🌿</Text>
      );
    }

    if (activePage === "completed") {
      return completedTaskList.length ? (
        completedTaskList.map((task) => renderTaskMiniCard(task, "success", true))
      ) : (
        <Text className="text-[#9FB5B5] font-bold">Completed wins will appear here.</Text>
      );
    }

    if (activePage === "calendar") {
      return Object.entries(groupedTasks).map(([date, dateTasks]) => (
        <View key={date} className="bg-[#123131]/55 rounded-2xl p-4 border border-[#337a7a]/25 mb-3">
          <Text className="text-[#66b9b9] font-black uppercase tracking-widest text-xs mb-3">
            {date}
          </Text>
          {dateTasks.map((task) => renderTaskMiniCard(task, task.completed ? "success" : "accent"))}
        </View>
      ));
    }

    if (activePage === "mood-tracker") {
      const weeklyTotal = weeklyMoodSummary.totalEntries || 0;

      return (
        <>
          <View className="bg-[#123131]/60 rounded-2xl p-4 border border-[#66b9b9]/25 mb-3">
            <Text className="text-[#E8F4F4] font-black text-lg">
              Mood Tracker
            </Text>
            <Text className="text-[#9FB5B5] text-xs mt-1 leading-5">
              Gentle emotional awareness, no pressure.
            </Text>
            <View className="flex-row mt-3">
              {[
                { key: "daily", label: "Daily" },
                { key: "weekly", label: "Weekly" },
                { key: "monthly", label: "Monthly" },
                { key: "yearly", label: "Yearly" },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.82}
                  onPress={() => setMoodTrackerView(tab.key)}
                  className={`px-3 py-1.5 rounded-full border mr-2 ${
                    moodTrackerView === tab.key
                      ? "bg-[#66b9b9] border-[#66b9b9]"
                      : "bg-[#123131]/75 border-[#337a7a]/35"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      moodTrackerView === tab.key ? "text-[#061414]" : "text-[#9FB5B5]"
                    }`}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {moodTrackerView === "daily" ? (
            <View className="bg-[#123131]/60 rounded-2xl p-4 border border-[#337a7a]/25 mb-3">
              <Text className="text-[#E8F4F4] font-black">How are you feeling today?</Text>
              <Text className="text-[#9FB5B5] text-xs mt-1">
                Select one mood, add a note if it helps.
              </Text>
              <View className="mt-3">
                {renderMoodSelectorRow({
                  selectedMoodType: dailyMoodType,
                  onSelect: setDailyMoodType,
                })}
              </View>
              <TextInput
                value={dailyMoodNote}
                onChangeText={setDailyMoodNote}
                placeholder="Optional note..."
                placeholderTextColor={COLORS.muted}
                multiline
                className="mt-2 bg-[#061414]/45 text-[#E8F4F4] p-3 rounded-2xl border border-[#66b9b9]/25 text-sm"
              />
              <TouchableOpacity
                activeOpacity={0.86}
                disabled={!isValidMoodType(dailyMoodType)}
                onPress={() => saveDailyMoodCheckIn(dailyMoodType, dailyMoodNote)}
                className={`mt-3 p-3 rounded-2xl border ${
                  isValidMoodType(dailyMoodType)
                    ? "bg-[#66b9b9] border-[#99bdbd]/70"
                    : "bg-[#123131]/70 border-[#337a7a]/35"
                }`}
              >
                <Text
                  className={`text-center font-black uppercase tracking-widest text-xs ${
                    isValidMoodType(dailyMoodType) ? "text-[#061414]" : "text-[#9FB5B5]"
                  }`}
                >
                  Save Mood Check-In
                </Text>
              </TouchableOpacity>
              {todayDailyMoodEntry?.updatedAt ? (
                <Text className="text-[#9FB5B5] text-[10px] mt-2 font-semibold">
                  Logged: {formatDateTimeForDisplay(todayDailyMoodEntry.updatedAt)}
                </Text>
              ) : null}

              <Text className="text-[#66b9b9] text-xs font-bold mt-3">
                {dailyMoodAffirmation}
              </Text>

              {dailyMoodEntries.length > 0 ? (
                <View className="mt-3 pt-3 border-t border-[#337a7a]/25">
                  <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest mb-2">
                    Recent Check-Ins
                  </Text>
                  {dailyMoodEntries.slice(0, 5).map((entry) => {
                    const meta = getMoodMeta(entry.moodType);
                    return (
                      <View
                        key={`daily-mood-${entry.date}`}
                        className="flex-row items-center justify-between py-1.5"
                      >
                        <Text className="text-[#E8F4F4] text-[11px] font-semibold">
                          {entry.date}
                        </Text>
                        <Text className="text-[#9FB5B5] text-[11px]">
                          {meta ? `${meta.emoji} ${meta.label}` : "No mood"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {moodTrackerView === "weekly" ? (
            <View className="bg-[#123131]/60 rounded-2xl p-4 border border-[#337a7a]/25 mb-3">
              <Text className="text-[#E8F4F4] font-black">Weekly Reflection</Text>
              <Text className="text-[#9FB5B5] text-xs mt-1">Last 7 days</Text>
              <View className="flex-row flex-wrap mt-3">
                {renderMoodSummaryChip("Average", weeklyMoodSummary.averageMoodType)}
                {renderMoodSummaryChip("Most Frequent", weeklyMoodSummary.mostFrequentMoodType)}
              </View>
              {MOOD_OPTIONS.map((option) => {
                const count = weeklyMoodSummary.distribution?.[option.type] || 0;
                const percent = weeklyTotal > 0 ? Math.round((count / weeklyTotal) * 100) : 0;
                return (
                  <View key={`weekly-${option.type}`} className="mb-2">
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-[#9FB5B5] text-[11px]">{option.emoji} {option.label}</Text>
                      <Text className="text-[#9FB5B5] text-[11px] font-bold">{count}</Text>
                    </View>
                    <View className="h-2 rounded-full bg-[#061414]/70 overflow-hidden border border-[#337a7a]/20">
                      <View
                        className="h-full bg-[#66b9b9]/80 rounded-full"
                        style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }}
                      />
                    </View>
                  </View>
                );
              })}
              <Text className="text-[#66b9b9] text-xs font-bold mt-3">{weeklyMoodAffirmation}</Text>
            </View>
          ) : null}

          {moodTrackerView === "monthly" ? (
            <View className="bg-[#123131]/60 rounded-2xl p-4 border border-[#337a7a]/25 mb-3">
              <Text className="text-[#E8F4F4] font-black">Monthly Mood</Text>
              <View className="flex-row flex-wrap mt-3">
                {renderMoodSummaryChip("Average", monthlyMoodSummary.averageMoodType)}
                {renderMoodSummaryChip("Most Frequent", monthlyMoodSummary.mostFrequentMoodType)}
              </View>
              <View className="mt-2 flex-row flex-wrap">
                {monthlyMoodCalendar.map((day) => (
                  <View
                    key={day.key}
                    className="w-[14.28%] px-0.5 mb-1.5"
                  >
                    <View className="h-11 rounded-xl border border-[#337a7a]/35 bg-[#061414]/50 items-center justify-center">
                      <Text className="text-[#9FB5B5] text-[9px] font-bold">{day.day}</Text>
                      <Text className="text-[11px] mt-0.5">{day.moodMeta?.emoji || "•"}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text className="text-[#66b9b9] text-xs font-bold mt-2">{monthlyMoodAffirmation}</Text>
            </View>
          ) : null}

          {moodTrackerView === "yearly" ? (
            <View className="bg-[#123131]/60 rounded-2xl p-4 border border-[#337a7a]/25 mb-3">
              <Text className="text-[#E8F4F4] font-black">Yearly Emotional Overview</Text>
              <View className="flex-row flex-wrap mt-3">
                {renderMoodSummaryChip("Average", yearlyMoodSummary.averageMoodType)}
                {renderMoodSummaryChip("Most Frequent", yearlyMoodSummary.mostFrequentMoodType)}
              </View>

              {yearlyMoodByMonth.map((monthItem) => (
                <View key={`year-${monthItem.month}`} className="flex-row items-center justify-between mb-2">
                  <Text className="text-[#9FB5B5] text-[11px] font-bold w-14">
                    {new Date(new Date().getFullYear(), monthItem.month, 1).toLocaleString("en-US", {
                      month: "short",
                    })}
                  </Text>
                  <Text className="text-[#E8F4F4] text-[11px] flex-1 ml-2">
                    {monthItem.summary.averageMoodMeta
                      ? `${monthItem.summary.averageMoodMeta.emoji} ${monthItem.summary.averageMoodMeta.label}`
                      : "No logs yet"}
                  </Text>
                  <Text className="text-[#66b9b9] text-[10px] font-bold ml-2">
                    {monthItem.summary.totalEntries || 0}
                  </Text>
                </View>
              ))}

              <Text className="text-[#66b9b9] text-xs font-bold mt-3">{yearlyMoodAffirmation}</Text>
            </View>
          ) : null}
        </>
      );
    }

    if (activePage === "settings") {
      return (
        <>
          {[
            "Theme presets placeholder",
            "Notification settings placeholder",
            "Backup progress placeholder",
            "Restore progress placeholder",
            "Export focus history placeholder",
            "Reset app placeholder",
          ].map((item) => (
            <View key={item} className="bg-[#123131]/55 rounded-2xl p-4 border border-[#337a7a]/25 mb-3">
              <Text className="text-[#E8F4F4] font-bold">{item}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={toggleStreakVisibility} className="bg-[#123131]/70 p-4 rounded-2xl border border-[#66b9b9]/25 mb-3">
            <Text className="text-[#66b9b9] font-black">
              {productivityStats.showStreak ? "Hide streak badge" : "Show streak badge"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleStartAssistReadAloud}
            className="bg-[#123131]/70 p-4 rounded-2xl border border-[#B6C26E]/30 mb-3"
          >
            <Text className="text-[#B6C26E] font-black">
              {startAssistReadAloudEnabled
                ? "Read Start Assist prompts aloud: On"
                : "Read Start Assist prompts aloud: Off"}
            </Text>
            <Text className="text-[#9FB5B5] text-xs font-semibold mt-1">
              Optional. Global voice mute still overrides this.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={resetStreak} className="bg-[#FFD166]/15 p-4 rounded-2xl border border-[#FFD166]/25">
            <Text className="text-[#FFD166] font-black">Reset streak gently</Text>
          </TouchableOpacity>
        </>
      );
    }

    if (activePage === "support") {
      return (
        <View className="bg-[#123131]/60 rounded-2xl p-5 border border-[#66b9b9]/25">
          <Text className="text-[#E8F4F4] text-base font-bold leading-6">
            This app is built to make focus feel kinder. Support link placeholder:
          </Text>
          <TouchableOpacity onPress={openSupport} className="bg-[#66b9b9] rounded-2xl p-4 mt-4">
            <Text className="text-[#061414] text-center font-black">
              Open researchzeal.com
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="bg-[#123131]/60 rounded-2xl p-5 border border-[#66b9b9]/25">
        <Text className="text-[#E8F4F4] text-base font-bold leading-6">
          ADHD Task Manager is a calm productivity space for gentle starts, focused sessions, and visible wins.
        </Text>
        <Text className="text-[#9FB5B5] text-sm mt-3 leading-6">
          Built with React Native, Expo, SQLite, NativeWind, SVG timers, and local-first progress tracking.
        </Text>
      </View>
    );
  };

  const renderPageModal = () => {
    const activeItem = MENU_ITEMS.find((item) => item.key === activePage);
    return (
      <Modal visible={!!activePage} transparent animationType="slide">
        <View className="flex-1 bg-[#061414]/95 pt-12">
          <View className="flex-row items-center justify-between px-5 pb-4 border-b border-[#66b9b9]/25">
            <View className="flex-1 pr-3">
              <Text className="text-[#E8F4F4] text-2xl font-black">
                {activeItem?.icon} {activeItem?.label || "About"}
              </Text>
              <Text className="text-[#9FB5B5] text-xs font-bold mt-1">
                Calm details, no pressure.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setActivePage(null)} className="bg-[#123131]/80 px-4 py-2 rounded-full border border-[#66b9b9]/30">
              <Text className="text-[#66b9b9] font-black">Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 80 }}>
            {renderPageContent()}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const renderOnboardingModal = () => (
    <Modal visible={onboardingVisible} transparent animationType="fade">
      <View className="flex-1 bg-[#061414]/95 justify-center px-5">
        <View className="bg-[#0B1F1F] rounded-[32px] border border-[#66b9b9]/35 p-6 shadow-2xl shadow-[#66b9b9]/20">
          <Text className="text-[#E8F4F4] text-2xl font-black text-center">
            Welcome in 🌿
          </Text>
          <Text className="text-[#9FB5B5] text-sm text-center mt-3 leading-6">
            What should we call you? This helps the app feel a little more human.
          </Text>
          <View className="items-center my-5">{renderAvatar()}</View>
          <TextInput
            value={profileDraftName}
            onChangeText={setProfileDraftName}
            placeholder="Your name"
            placeholderTextColor={COLORS.muted}
            className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-4 border border-[#66b9b9]/25 font-semibold"
          />
          <Text className="text-[#66b9b9] text-xs font-black uppercase tracking-widest mb-3">
            Choose your vibe
          </Text>
          <View className="flex-row flex-wrap mb-4">
            {VIBE_OPTIONS.map((vibe) => (
              <TouchableOpacity
                key={vibe.emoji}
                onPress={() => setProfileDraftVibe(vibe.emoji)}
                className={`px-3 py-2 rounded-full mr-2 mb-2 border ${
                  profileDraftVibe === vibe.emoji
                    ? "bg-[#66b9b9] border-[#66b9b9]"
                    : "bg-[#123131]/70 border-[#337a7a]/35"
                }`}
              >
                <Text className={`font-bold text-xs ${profileDraftVibe === vibe.emoji ? "text-[#061414]" : "text-[#E8F4F4]"}`}>
                  {vibe.emoji} {vibe.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={saveOnboardingProfile} className="bg-[#66b9b9] rounded-2xl p-4 shadow-lg shadow-[#66b9b9]/30">
            <Text className="text-[#061414] text-center font-black uppercase tracking-widest">
              Begin Gently
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderSection = (title, section) => {
    const isPinnedVirtualSection = section === "Pinned";
    const sectionTasks = isPinnedVirtualSection
      ? visiblePinnedTasks
      : visibleSectionTasksMap[section] || [];
    const isSectionExpanded = isPinnedVirtualSection
      ? isPinnedSectionExpanded
      : expandedSection === section;
    const chevronAnim = isPinnedVirtualSection
      ? pinnedChevronAnim
      : sectionChevronAnims[section];
    const chevronRotation = chevronAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "180deg"],
    });
    const collapsedSummaryOpacity = chevronAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    });
    const sectionSurfaceClass =
      SECTION_SURFACE_CLASSES[section] || SECTION_SURFACE_CLASSES.Work;
    const sectionHeaderClass =
      SECTION_HEADER_CLASSES[section] || SECTION_HEADER_CLASSES.Work;
    const filteredStatsForSection = isPinnedVirtualSection
      ? energyFilteredPinnedHeaderStats
      : energyFilteredSectionHeaderStats?.[section];
    const sectionStats = isPinnedVirtualSection
      ? activeEnergyFilter
        ? filteredStatsForSection || {
            pendingCount: 0,
            todayPendingCount: 0,
            todayCompletedCount: 0,
            nearestUpcomingTaskTitle: null,
          }
        : pinnedHeaderStats
      : activeEnergyFilter
        ? filteredStatsForSection || {
            pendingCount: 0,
            todayPendingCount: 0,
            todayCompletedCount: 0,
            nearestUpcomingTaskTitle: null,
          }
        : sectionHeaderStats[section] || {
          pendingCount: 0,
          todayPendingCount: 0,
          todayCompletedCount: 0,
          nearestUpcomingTaskTitle: null,
        };
    const pendingCount = sectionStats?.pendingCount || 0;
    const hasCollapsedSummary = !isSectionExpanded;
    const nextUpcomingLabel =
      sectionStats?.nearestUpcomingTaskTitle || "No upcoming tasks";
    const sectionSupportMessage =
      sectionAffirmations[section] ||
      getRandomAffirmation(SECTION_HEADER_AFFIRMATIONS);

    return (
      <View
        className="px-4 mb-4"
        onLayout={(event) => {
          sectionPositions.current[section] = event.nativeEvent.layout.y;
        }}
      >
        <View
          className={`rounded-[28px] border border-[#337a7a]/35 shadow-md shadow-[#061414]/45 overflow-hidden ${sectionSurfaceClass}`}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              isPinnedVirtualSection
                ? togglePinnedSection()
                : toggleSectionExpansion(section)
            }
            className={`px-4 py-3 flex-row items-start justify-between border-b border-[#337a7a]/25 ${sectionHeaderClass}`}
          >
            <View className="flex-1 pr-3">
              <Text className="text-[#E8F4F4] text-lg font-black tracking-widest uppercase">
                {title}
              </Text>
              {hasCollapsedSummary ? (
                <Animated.View style={{ opacity: collapsedSummaryOpacity }} className="mt-1.5">
                  <Text className="text-[#99bdbd] text-[10px] font-bold">
                    Pending: {sectionStats?.pendingCount ?? pendingCount} | Today: {sectionStats?.todayPendingCount ?? 0} | Done: {sectionStats?.todayCompletedCount ?? 0}
                  </Text>
                  <Text numberOfLines={1} className="text-[#9FB5B5] text-[10px] font-semibold mt-0.5">
                    Next: {nextUpcomingLabel}
                  </Text>
                </Animated.View>
              ) : null}
              <Text className="text-[#E8F4F4] text-[10px] font-semibold mt-2">
                {sectionSupportMessage}
              </Text>
            </View>
            <View className="flex-row items-center pt-1">
              {isPinnedVirtualSection || pendingCount > 0 ? (
                <Text className="text-[#9FB5B5] text-[10px] font-bold mr-2">
                  {pendingCount}
                </Text>
              ) : null}
              <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
                <Feather name="chevron-down" size={16} color={COLORS.accent} />
              </Animated.View>
            </View>
          </TouchableOpacity>

          {isSectionExpanded && (
            <View className="px-3 pb-3">
              {activeEnergyFilter && sectionTasks.length === 0 ? (
                <View className="rounded-2xl border border-[#337a7a]/25 bg-[#061414]/55 px-3 py-2.5 mt-1">
                  <Text className="text-[#9FB5B5] text-[11px] leading-4">
                    {activeEnergyFilterEmptyMessage}
                  </Text>
                </View>
              ) : null}

              {sectionTasks.map((task) => {
            const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
            const taskDate = parseStoredDateTime(task.scheduledTime);
            const taskTimestamp = taskDate?.getTime() || 0;
            const totalSubtasks = subtasks.length;
            const completedSubtasks = subtasks.filter((s) => s.completed).length;
            const isTaskExpanded = expandedTaskId === task.id;
            const isFirstStepOnly = firstStepOnlyTaskId === task.id;
            const firstIncompleteSubtask =
              subtasks.find((subtask) => !subtask.completed) || null;
            const firstStepText =
              firstIncompleteSubtask?.title ||
              (task.firstAction || "").trim() ||
              "Choose one tiny first move.";
            const hasPendingNotification =
              Array.isArray(task.notificationId) && task.notificationId.length > 0;
            const repeatLabel = repeatLabelByTaskId[task.id] || "";
            const hasRepeatLabel = Boolean(repeatLabel);
            const showTaskHeaderMeta = task.isPinned || hasRepeatLabel;
            const energyMetadataPills = getTaskEnergyMetadataPills(task);
            const taskSupportSignal =
              taskSupportSignalById[task.id] || EMPTY_TASK_SUPPORT_SIGNAL;
            const supportReasonText = getAvoidanceReasonText(taskSupportSignal);
            const isArchivedOrDeletedTask = isTaskDeletedOrArchived(task);
            const showTaskSupportHint =
              isTaskExpanded &&
              !task.completed &&
              !isArchivedOrDeletedTask &&
              taskSupportSignal.level !== "none";
            const isHeavySupportSignal = taskSupportSignal.level === "heavy";
            const hasMinimumVersion =
              typeof task.minimumVersion === "string" &&
              task.minimumVersion.trim().length > 0;
            const taskMoodMeta = getMoodMeta(task.moodType);
            const taskMoodAffirmation = isValidMoodType(task.moodType)
              ? pickMoodAffirmation({
                  context: "task",
                  moodType: task.moodType,
                  seed: `${todayDateKey}:task:${task.id}`,
                })
              : "How did this task feel?";

            const upcomingReminders = [];
            if (task.scheduledTime) {
              const intervals = [20, 10, 5, 0];
              intervals.forEach((mins) => {
                const triggerTime = taskTimestamp - mins * 60000;
                if (triggerTime + 60000 > Date.now()) {
                  const dateObj = new Date(triggerTime);
                  upcomingReminders.push(
                    dateObj.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  );
                }
              });
            }

            const cardBgClass = activeTaskId === task.id ? "bg-[#123131]" : task.completed ? "bg-[#0B1F1F]/90 opacity-90" : "bg-[#0B1F1F]";
            const cardBorderClass = activeTaskId === task.id ? "border-[#5EEAD4] border" : task.completed ? "border-[#7DFFB3]/60 border-l-4" : "border-[#337a7a]/35 border border-l-4 border-l-[#9FB88D]/85";
            const cardShadowClass = activeTaskId === task.id ? "shadow-2xl shadow-[#5EEAD4]/20" : task.completed ? "shadow-lg shadow-[#7DFFB3]/10" : "shadow-md shadow-[#66b9b9]/10";
            const isTaskHighlighted = highlightedTaskId === task.id;
            const highlightOverlayOpacity = taskHighlightPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.18, 0.58],
            });
            const highlightScale = taskHighlightPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.01],
            });
            const highlightShadowOpacity = taskHighlightPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.1, 0.36],
            });

            return (
              <Animated.View
                key={task.id}
                onLayout={(event) => {
                  taskPositions.current[task.id] = event.nativeEvent.layout.y;
                }}
                style={
                  isTaskHighlighted
                    ? {
                        transform: [{ scale: highlightScale }],
                        shadowColor: "#B6C26E",
                        shadowOpacity: highlightShadowOpacity,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: 7,
                      }
                    : undefined
                }
                className={`p-4 rounded-[24px] mb-3 ${cardBgClass} ${cardBorderClass} ${cardShadowClass}`}
              >
                {isTaskHighlighted ? (
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      borderRadius: 24,
                      borderWidth: 1.8,
                      borderColor: "#B6C26E",
                      backgroundColor: "rgba(139, 154, 78, 0.08)",
                      opacity: highlightOverlayOpacity,
                    }}
                  />
                ) : null}
                <Pressable onPress={() => toggleTaskCardExpansion(task.id)}>
                  <View className="flex-row items-center justify-between pb-3 mb-2 border-b border-[#337a7a]/25">
                    <View className="flex-row items-center flex-1">
                      <TouchableOpacity
                        onPress={(event) => {
                          event.stopPropagation?.();
                          toggleTask(task.id);
                        }}
                        className={`w-7 h-7 rounded-[10px] border-2 mr-3 items-center justify-center ${
                          task.completed
                            ? "bg-[#7DFFB3] border-[#7DFFB3]"
                            : "bg-[#061414]/40 border-[#337a7a]"
                        }`}
                      >
                        {task.completed ? (
                          <Feather name="check" size={12} color={COLORS.bg} />
                        ) : null}
                      </TouchableOpacity>

                      <View className="flex-1 pr-2">
                        <Text
                          numberOfLines={2}
                          className={`text-base font-bold flex-1 tracking-wide ${
                            task.completed
                              ? "text-[#9FB5B5] line-through"
                              : "text-[#E8F4F4]"
                          }`}
                        >
                          {task.title}
                        </Text>

                        {showTaskHeaderMeta ? (
                          <View className="flex-row items-center flex-wrap mt-1">
                            {task.isPinned ? (
                              <View className="flex-row items-center mr-2">
                                <Feather
                                  name="bookmark"
                                  size={11}
                                  color={
                                    task.completed ? COLORS.muted : COLORS.warning
                                  }
                                />
                              </View>
                            ) : null}

                            {hasRepeatLabel ? (
                              <View className="flex-row items-center flex-1 min-w-0">
                                <Feather
                                  name="repeat"
                                  size={12}
                                  color={
                                    task.completed ? COLORS.accentSoft : COLORS.accent
                                  }
                                />
                                <Text
                                  numberOfLines={1}
                                  className={`ml-1 text-[10px] font-bold ${
                                    task.completed
                                      ? "text-[#99bdbd]"
                                      : "text-[#66b9b9]"
                                  }`}
                                >
                                  {repeatLabel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}

                        {!task.completed ? (
                          <TouchableOpacity
                            accessibilityLabel="Help Me Start"
                            accessibilityHint="Opens gentle start options for this task"
                            activeOpacity={0.85}
                            onPress={(event) => {
                              event.stopPropagation?.();
                              setStartAssistTaskId(task.id);
                              setStartAssistMode("main");
                              setStartAssistFirstActionDraft(task.firstAction || "");
                              setStartAssistBreakdownDraft("");
                              setStartAssistMinimumVersionDraft(
                                task.minimumVersion || ""
                              );
                              setIsStartAssistVisible(true);
                            }}
                            className="self-start mt-2 px-2.5 py-1 rounded-full border border-[#D9A441]/45 bg-[#2A2218]/75"
                          >
                            <Text className="text-[#D9A441] text-[9px] font-black uppercase tracking-widest">
                              Help Me Start
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <View className="flex-row items-center">
                        {!task.completed && (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={(event) => {
                              event.stopPropagation?.();
                              togglePinnedTask(task.id);
                            }}
                            className="p-1.5 mr-2 bg-[#FFD166]/15 rounded-xl border border-[#FFD166]/25"
                          >
                            <Feather
                              name="bookmark"
                              size={14}
                              color={task.isPinned ? COLORS.warning : COLORS.muted}
                            />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            openTaskEditor(task);
                          }}
                          className="p-1.5 mr-2 bg-[#66b9b9]/15 rounded-xl border border-[#66b9b9]/25"
                        >
                          <Feather name="edit-2" size={14} color={COLORS.accent} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            setDeleteTask(task);
                            setDeleteModalVisible(true);
                          }}
                          className="p-1.5 bg-[#FF7B7B]/15 rounded-xl border border-[#FF7B7B]/25"
                        >
                          <Feather name="trash-2" size={14} color={COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between mt-1">
                    {task.scheduledTime ? (
                      <Text className="text-[#9FB5B5] text-xs font-semibold">
                        {formatDateTimeForDisplay(task.scheduledTime)}
                      </Text>
                    ) : (
                      <Text className="text-[#9FB5B5] text-xs font-semibold">
                        No schedule yet
                      </Text>
                    )}
                    {hasPendingNotification ? (
                      <Feather name="bell" size={13} color={COLORS.success} />
                    ) : null}
                  </View>
                </Pressable>

                {isFirstStepOnly ? (
                  <View className="mt-2 rounded-2xl border border-[#B6C26E]/35 bg-[#182419]/70 p-3">
                    <Text className="text-[#B6C26E] text-[10px] font-black uppercase tracking-widest">
                      First Step Only
                    </Text>
                    <Text className="text-[#E8F4F4] text-xs mt-1.5">
                      {firstStepText}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      accessibilityLabel="Read first step aloud"
                      accessibilityHint="Reads a short first-step prompt for this task"
                      onPress={() =>
                        handleTaskFirstStepReadAloud(task, firstIncompleteSubtask)
                      }
                      className="self-start mt-2 px-2.5 py-1 rounded-full border border-[#66b9b9]/35 bg-[#123131]/70 flex-row items-center"
                    >
                      <Feather name="volume-2" size={11} color={COLORS.accent} />
                      <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest ml-1.5">
                        Read Aloud
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setFirstStepOnlyTaskId(null)}
                      className="self-start mt-2 px-3 py-1.5 rounded-full border border-[#B6C26E]/45 bg-[#2A2218]/75"
                    >
                      <Text className="text-[#B6C26E] text-[10px] font-black uppercase tracking-widest">
                        Show Full Task
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => toggleTaskCardExpansion(task.id)}
                      className="mt-2 self-start flex-row items-center"
                    >
                      <Text className="text-[#66b9b9] text-xs font-bold mr-1.5">
                        Details
                      </Text>
                      <Feather
                        name={isTaskExpanded ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={COLORS.accent}
                      />
                    </TouchableOpacity>

                    {isTaskExpanded && (
                      <>
                        {showTaskSupportHint ? (
                          <View className="mt-2 p-3 rounded-2xl border border-[#66b9b9]/30 bg-[#123131]/70">
                            <Text className="text-[#E8F4F4] text-xs font-black">
                              {isHeavySupportSignal
                                ? "This may be feeling heavy."
                                : "This may need a softer start."}
                            </Text>
                            <Text className="text-[#9FB5B5] text-[11px] leading-4 mt-1">
                              {isHeavySupportSignal
                                ? "No guilt. Try the smallest useful version or move it to a better time."
                                : "Want to make the next step smaller?"}
                            </Text>
                            {supportReasonText ? (
                              <Text className="text-[#66b9b9] text-[10px] mt-2 font-semibold">
                                {supportReasonText}
                              </Text>
                            ) : null}
                            <View className="flex-row flex-wrap mt-2">
                              {isHeavySupportSignal && hasMinimumVersion ? (
                                <TouchableOpacity
                                  onPress={() =>
                                    handleSupportStartMinimumVersion(task)
                                  }
                                  className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#B6C26E]/45 bg-[#182419]/80"
                                >
                                  <Text className="text-[#B6C26E] text-[10px] font-black uppercase tracking-widest">
                                    Start Minimum Version
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                              <TouchableOpacity
                                onPress={() => handleSupportStartTwoMinutes(task.id)}
                                className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#66b9b9]/40 bg-[#123131]/80"
                              >
                                <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                                  Start 2 Min
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => openTaskInMakeSmallerSupport(task)}
                                className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#D9A441]/45 bg-[#2A2218]/80"
                              >
                                <Text className="text-[#D9A441] text-[10px] font-black uppercase tracking-widest">
                                  Make Smaller
                                </Text>
                              </TouchableOpacity>
                              {isHeavySupportSignal ? (
                                <TouchableOpacity
                                  onPress={() => openTaskInMoveGentlySupport(task)}
                                  className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#66b9b9]/35 bg-[#123131]/70"
                                >
                                  <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest">
                                    Move Gently
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        ) : null}

                        {energyMetadataPills.length > 0 ? (
                          <View className="mt-2 flex-row flex-wrap">
                            {energyMetadataPills.map((pillLabel) => (
                              <View
                                key={`${task.id}-energy-pill-${pillLabel}`}
                                className="mr-2 mb-2 px-2.5 py-1 rounded-full border border-[#66b9b9]/28 bg-[#061414]/65"
                              >
                                <Text className="text-[#9FB5B5] text-[10px] font-bold">
                                  {pillLabel}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {__DEV__ ? (
                          <View className="mt-2 px-2.5 py-2 rounded-xl border border-[#337a7a]/30 bg-[#061414]/55">
                            <Text className="text-[#9FB5B5] text-[9px] font-black uppercase tracking-widest">
                              Support Debug
                            </Text>
                            <Text className="text-[#99bdbd] text-[9px] mt-1">
                              Score {taskSupportSignal.score} | Level{" "}
                              {taskSupportSignal.level} | Reasons{" "}
                              {taskSupportSignal.reasons.length
                                ? taskSupportSignal.reasons.join(", ")
                                : "none"}
                            </Text>
                            <Text className="text-[#99bdbd] text-[9px] mt-0.5">
                              reminderSnoozeCount {Number(task.reminderSnoozeCount || 0)} | reminderMoveGentlyCount {Number(task.reminderMoveGentlyCount || 0)} | reminderMakeSmallerCount {Number(task.reminderMakeSmallerCount || 0)}
                            </Text>
                            <Text className="text-[#99bdbd] text-[9px] mt-0.5">
                              snoozeCount {Number(task.snoozeCount || 0)} | rescheduleCount {Number(task.rescheduleCount || 0)} | stuckCount {Number(task.stuckCount || 0)} | reminderActionHistory {Array.isArray(task.reminderActionHistory) ? task.reminderActionHistory.length : 0}
                            </Text>
                          </View>
                        ) : null}

                        {task.details ? (
                          <View className="mt-2 p-3 bg-[#061414]/45 rounded-2xl border border-[#337a7a]/25">
                            <Text className="text-[#E8F4F4] text-xs leading-5">
                              {task.details}
                            </Text>
                          </View>
                        ) : null}

                        {task.firstAction ? (
                          <View className="mt-2 p-3 rounded-2xl border border-[#B6C26E]/30 bg-[#182419]/65">
                            <Text className="text-[#B6C26E] text-[10px] font-black uppercase tracking-widest">
                              First Small Action
                            </Text>
                            <Text className="text-[#E8F4F4] text-xs mt-1.5">
                              {task.firstAction}
                            </Text>
                          </View>
                        ) : null}

                        {task.minimumVersion ? (
                          <View className="mt-2 p-3 rounded-2xl border border-[#D9A441]/25 bg-[#2A2218]/65">
                            <Text className="text-[#D9A441] text-[10px] font-black uppercase tracking-widest">
                              Smallest Useful Version
                            </Text>
                            <Text className="text-[#E8F4F4] text-xs mt-1.5">
                              {task.minimumVersion}
                            </Text>
                          </View>
                        ) : null}

                        <View className="pl-3 border-l-2 border-[#66b9b9]/35 my-2 mt-3">
                          <View className="flex-row justify-between mb-2">
                            <Text className="text-[#99bdbd] text-[10px] font-bold tracking-widest uppercase">
                              Sub-Tasks
                            </Text>
                            {totalSubtasks > 0 && (
                              <Text className="text-[#9FB5B5] text-[10px] font-bold">
                                {completedSubtasks}/{totalSubtasks}
                              </Text>
                            )}
                          </View>
                          {totalSubtasks > 1 ? (
                            <Text className="text-[#9FB5B5] text-[9px] font-semibold mb-2">
                              Drag steps up or down to reorder.
                            </Text>
                          ) : null}

                          {subtasks.map((sub, subIndex) => {
                            const isEditingSubtask =
                              editingSubtaskTaskId === task.id &&
                              editingSubtaskId === sub.id;
                            const isDraggingSubtask =
                              draggingSubtaskKey === `${task.id}:${sub.id}`;

                            return (
                              <View
                                key={sub.id}
                                className={`flex-row items-center mb-2 rounded-xl px-1.5 py-1 ${
                                  isDraggingSubtask ? "bg-[#123131]/75 border border-[#D9A441]/35" : ""
                                }`}
                              >
                                <View
                                  accessible
                                  accessibilityRole="button"
                                  accessibilityLabel="Reorder subtask"
                                  accessibilityHint="Hold and drag to change subtask order"
                                  onStartShouldSetResponder={() => true}
                                  onStartShouldSetResponderCapture={() => true}
                                  onMoveShouldSetResponder={() => true}
                                  onMoveShouldSetResponderCapture={() => true}
                                  onResponderGrant={(event) =>
                                    {
                                      event.stopPropagation?.();
                                      handleSubtaskDragStart(
                                        task.id,
                                        sub.id,
                                        subIndex,
                                        event.nativeEvent.pageY
                                      );
                                    }
                                  }
                                  onResponderMove={(event) => {
                                    event.stopPropagation?.();
                                    handleSubtaskDragMove(event.nativeEvent.pageY);
                                  }}
                                  onResponderRelease={(event) => {
                                    event.stopPropagation?.();
                                    handleSubtaskDragRelease();
                                  }}
                                  onResponderTerminate={(event) => {
                                    event.stopPropagation?.();
                                    handleSubtaskDragRelease();
                                  }}
                                  onResponderTerminationRequest={() => false}
                                  hitSlop={8}
                                  className="p-1 mr-1"
                                >
                                  <Feather
                                    name="menu"
                                    size={12}
                                    color={isDraggingSubtask ? "#D9A441" : COLORS.muted}
                                  />
                                </View>

                                <TouchableOpacity
                                  disabled={isSubtaskReordering}
                                  onPress={() => toggleSubtask(task.id, sub.id)}
                                  className={`w-4 h-4 rounded-[4px] border border-[#66b9b9] mr-2 justify-center items-center ${
                                    sub.completed ? "bg-[#66b9b9]" : "bg-transparent"
                                  }`}
                                >
                                  {sub.completed ? (
                                    <Feather name="check" size={9} color={COLORS.bg} />
                                  ) : null}
                                </TouchableOpacity>

                                {isEditingSubtask ? (
                                  <TextInput
                                    value={editingSubtaskDraft}
                                    onChangeText={setEditingSubtaskDraft}
                                    onSubmitEditing={saveSubtaskEditing}
                                    autoFocus
                                    className="flex-1 text-xs text-[#E8F4F4] border-b border-[#66b9b9]/35 py-0.5"
                                  />
                                ) : (
                                  <Text
                                    className={`flex-1 text-xs ${
                                      sub.completed
                                        ? "text-[#9FB5B5] line-through"
                                        : "text-[#E8F4F4]"
                                    }`}
                                  >
                                    {sub.title}
                                  </Text>
                                )}

                                {isEditingSubtask ? (
                                  <>
                                    <TouchableOpacity
                                      disabled={isSubtaskReordering}
                                      onPress={saveSubtaskEditing}
                                      className="p-1 ml-1"
                                    >
                                      <Feather name="check" size={12} color={COLORS.success} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      disabled={isSubtaskReordering}
                                      onPress={cancelSubtaskEditing}
                                      className="p-1"
                                    >
                                      <Feather name="x" size={12} color={COLORS.muted} />
                                    </TouchableOpacity>
                                  </>
                                ) : (
                                  <>
                                    <TouchableOpacity
                                      disabled={isSubtaskReordering}
                                      onPress={() => startSubtaskEditing(task.id, sub)}
                                      className="p-1 ml-1"
                                    >
                                      <Feather name="edit-3" size={12} color={COLORS.accent} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      disabled={isSubtaskReordering}
                                      onPress={() => deleteSubtask(task.id, sub.id)}
                                      className="p-1"
                                    >
                                      <Feather name="x" size={12} color={COLORS.danger} />
                                    </TouchableOpacity>
                                  </>
                                )}
                              </View>
                            );
                          })}

                          <TextInput
                            placeholder="+ Add step..."
                            placeholderTextColor={COLORS.muted}
                            onSubmitEditing={(e) => {
                              addSubtask(task.id, e.nativeEvent.text);
                              e.currentTarget.clear();
                            }}
                            className="text-[#E8F4F4] text-xs py-1 border-b border-[#66b9b9]/35"
                          />
                        </View>
                    <Animated.View
                      style={{ transform: [{ translateX: shakeAnim }] }}
                      className="flex-row mt-3 items-center flex-wrap"
                    >
                      {[10, 20, 30].map((min) => (
                        <TouchableOpacity
                          key={min}
                          onPress={() =>
                            setTaskDurations((prev) => ({
                              ...prev,
                              [task.id]: min * 60,
                            }))
                          }
                          className={`p-1.5 px-3 rounded-full mr-2 mb-2 border ${
                            showDurationError === task.id
                              ? "bg-[#FF7B7B]/20 border-[#FF7B7B]"
                              : taskDurations[task.id] === min * 60
                              ? "bg-[#66b9b9] border-[#66b9b9]"
                              : "bg-[#123131]/80 border-[#337a7a]/40"
                          }`}
                        >
                          <Text
                            className={`text-[11px] font-bold ${
                              taskDurations[task.id] === min * 60
                                ? "text-[#061414]"
                                : "text-[#E8F4F4]"
                            }`}
                          >
                            {min}m
                          </Text>
                        </TouchableOpacity>
                      ))}

                      <TouchableOpacity
                        onPress={() => {
                          setCurrentTaskForTime(task.id);
                          setTimeModalVisible(true);
                        }}
                        className={`p-1.5 px-3 rounded-full mr-2 mb-2 border ${
                          showDurationError === task.id
                            ? "bg-[#FF7B7B]/20 border-[#FF7B7B]"
                            : "bg-[#123131]/80 border-[#337a7a]/40"
                        }`}
                      >
                        <Text className="text-[#E8F4F4] text-[11px] font-bold">
                          Custom
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>

                    {showDurationError === task.id && (
                      <Text className="text-[#FF7B7B] text-[10px] mt-1 font-bold">
                        Please select focus time
                      </Text>
                    )}

                    {lastCompletedTaskId === task.id && (
                      <Text className="text-[#7DFFB3] text-[10px] mt-2 font-bold uppercase tracking-widest">
                        Last completed
                      </Text>
                    )}

                    {activeTaskId === task.id && (
                      <Text className="text-[#5EEAD4] text-[10px] mt-1 font-bold uppercase tracking-widest">
                        In Focus
                      </Text>
                    )}

                    <TouchableOpacity
                      onPress={() => {
                        if (task.completed) return;

                        const duration = taskDurations[task.id];

                        if (!duration) {
                          setShowDurationError(task.id);
                          triggerShake();

                          setTimeout(() => setShowDurationError(null), 2000);
                          return;
                        }

                        startFocus(task.id);
                      }}
                      className={`mt-2 self-start px-3 py-2 rounded-full border ${
                        taskDurations[task.id]
                          ? "bg-[#66b9b9]/15 border-[#66b9b9]/40"
                          : "bg-[#123131]/70 border-[#337a7a]/35"
                      }`}
                    >
                      <Text
                        className={`font-bold text-xs uppercase tracking-widest ${
                          taskDurations[task.id] ? "text-[#66b9b9]" : "text-[#9FB5B5]"
                        }`}
                      >
                        {taskDurations[task.id] ? "Start Focus" : "Select Focus Time"}
                      </Text>
                    </TouchableOpacity>

                    {taskDurations[task.id] && (
                      <Text className="text-[#99bdbd] text-[10px] mt-1.5 font-semibold">
                        {formatDuration(taskDurations[task.id])} selected
                      </Text>
                    )}

                    {task.attachment ? (
                      <TouchableOpacity
                        onPress={() => {
                          const isPdf = task.attachment
                            .toLowerCase()
                            .endsWith(".pdf");
                          setCurrentFile({
                            uri: task.attachment,
                            type: isPdf ? "pdf" : "image",
                          });
                          setViewerVisible(true);
                        }}
                        className="mt-3 flex-row items-center bg-[#123131]/80 self-start p-1.5 px-3 rounded-full border border-[#66b9b9]/25"
                      >
                        <Text className="text-[#66b9b9] text-xs font-bold">
                          View Attachment
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    <View className="mt-3 p-3 rounded-2xl bg-[#123131]/70 border border-[#66b9b9]/25">
                      <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest mb-2">
                        Mood Tracking
                      </Text>
                      {renderMoodSelectorRow({
                        selectedMoodType: task.moodType,
                        onSelect: (moodType) => updateTaskMood(task.id, moodType),
                        compact: true,
                      })}
                      <Text className="text-[#66b9b9] text-[10px] font-bold mt-1">
                        {taskMoodMeta
                          ? `${taskMoodMeta.emoji} ${taskMoodMeta.label} • ${taskMoodAffirmation}`
                          : taskMoodAffirmation}
                      </Text>
                    </View>

                    {upcomingReminders.length > 0 ? (
                      <View className="mt-3 p-3 rounded-2xl bg-[#123131]/80 border border-[#66b9b9]/25 shadow-sm shadow-[#66b9b9]/10">
                        <View className="flex-row items-center mb-1.5">
                          <View
                            className={`w-2 h-2 rounded-full mr-2 ${
                              hasPendingNotification
                                ? "bg-[#7DFFB3]"
                                : upcomingReminders.length > 0
                                ? "bg-[#FF7B7B]"
                                : "bg-[#9FB5B5]"
                            }`}
                          />
                          <Text className="text-[#66b9b9] text-[10px] font-bold tracking-widest uppercase">
                            {hasPendingNotification
                              ? "ALARMS ACTIVE"
                              : "ALARMS OFFLINE"}
                          </Text>
                        </View>
                        <View className="flex-row flex-wrap gap-1.5">
                          {upcomingReminders.map((time, idx) => (
                            <View
                              key={idx}
                              className="bg-[#061414]/70 px-2 py-1 rounded-full border border-[#337a7a]/35 flex-row items-center"
                            >
                              <Feather name="bell" size={10} color={COLORS.success} />
                              <Text className="text-[#7DFFB3] text-[9px] font-semibold tracking-wide ml-1">
                                {time}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {!hasPendingNotification && (
                          <Text className="text-[#FF7B7B] text-[9px] mt-1.5 font-bold">
                            Tap Edit and Save to re-arm alarms
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </>
                )}
                  </>
                )}
              </Animated.View>
            );
              })}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      {renderFixedHeader()}
      {renderFloatingMenuShortcut()}
      <Reanimated.ScrollView
        ref={scrollRef}
        className="flex-1 bg-[#061414]"
        scrollEnabled={!isSubtaskReordering}
        onScroll={homeScrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerContainerHeight + 14,
          paddingBottom: listBottomPadding,
        }}
      >
        <Text
          className="hidden"
        >
          ADHD Task Manager <Text className="text-[#66b9b9]">✨</Text>
        </Text>

        {/* ✅ Daily Progress Banner */}
        <View className="bg-[#0B1F1F] p-5 rounded-[28px] mx-4 mt-2 mb-4 border border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/15">
          {/* Top Row */}
          <View className="flex-row justify-between mb-3 items-end">
            <Text className="text-[#E8F4F4] text-lg font-black uppercase tracking-widest">
              Daily Progress 🚀
            </Text>

            {/* RIGHT */}
            <View className="items-end">
              {totalTodayTasks > 0 ? (
                <>
                  {completedTodayTasks > 0 && (
                    <Text className="text-[#66b9b9] text-sm font-black">
                      {animatedProgressPercent}%
                    </Text>
                  )}
                  <Text className="text-[#9FB5B5] text-xs font-bold">
                    {dailyProgressSummary}
                  </Text>
                </>
              ) : (
                <Text className="text-[#9FB5B5] text-xs font-bold">
                  Your day is ready 🌅
                </Text>
              )}

              <Text className="text-[#66b9b9] text-[10px] font-bold mt-1 tracking-widest uppercase">
                {totalFocusText}
              </Text>

              <TouchableOpacity
                onPress={toggleVoiceMuted}
                className="mt-2 flex-row items-center bg-[#123131]/70 border border-[#66b9b9]/30 rounded-full px-3 py-1.5"
                activeOpacity={0.85}
              >
                <Feather
                  name={isVoiceMuted ? "volume-x" : "volume-2"}
                  size={12}
                  color={isVoiceMuted ? COLORS.muted : COLORS.accent}
                />
                <Text
                  className={`ml-1.5 text-[10px] font-black uppercase tracking-widest ${
                    isVoiceMuted ? "text-[#9FB5B5]" : "text-[#66b9b9]"
                  }`}
                >
                  {isVoiceMuted ? "Voice muted" : "Voice on"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row flex-wrap mb-3">
            {productivityStats.showStreak && (
              <View className="bg-[#FFD166]/15 border border-[#FFD166]/25 rounded-full px-3 py-1.5 mr-2 mb-2">
                <Text className="text-[#FFD166] text-[10px] font-black">
                  {getStreakLabel()}
                </Text>
              </View>
            )}
            <View className="bg-[#123131]/70 border border-[#66b9b9]/25 rounded-full px-3 py-1.5 mr-2 mb-2">
              <Text className="text-[#66b9b9] text-[10px] font-black">
                ⏱ {formatDuration(dailyStats.totalFocusTime) || "0m"} Focused Today
              </Text>
            </View>
            <View className="bg-[#123131]/70 border border-[#7DFFB3]/25 rounded-full px-3 py-1.5 mr-2 mb-2">
              <Text className="text-[#7DFFB3] text-[10px] font-black">
                ✅ {completedTodayTasks} Tasks Completed
              </Text>
            </View>
            {totalTodayTasks > 0 && (
              <View className="bg-[#123131]/70 border border-[#66b9b9]/25 rounded-full px-3 py-1.5 mr-2 mb-2">
                <Text className="text-[#9FB5B5] text-[10px] font-black">
                  ⏳ {pendingTodayTasks} Pending Today
                </Text>
              </View>
            )}
          </View>

          <View className="mb-3 flex-row flex-wrap">
            <TouchableOpacity
              onPress={openOverwhelmMode}
              activeOpacity={0.86}
              accessibilityLabel="I’m overwhelmed"
              accessibilityHint="Opens a gentle list of small next steps"
              className="self-start px-3.5 py-2 rounded-full border border-[#D9A441]/45 bg-[#2A2218]/75 flex-row items-center mr-2 mb-2"
            >
              <Feather name="life-buoy" size={12} color={COLORS.warning} />
              <Text className="ml-1.5 text-[#D9A441] text-[10px] font-black uppercase tracking-widest">
                {"I'm overwhelmed"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openTodayPlanSheet(todayPlanNotificationSection)}
              activeOpacity={0.86}
              accessibilityLabel="Today’s plan"
              accessibilityHint="Open planning options for today"
              className="self-start px-3.5 py-2 rounded-full border border-[#66b9b9]/40 bg-[#123131]/80 flex-row items-center mb-2"
            >
              <Text className="text-[11px]">🗓️</Text>
              <Text className="ml-1.5 text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                Today’s plan
              </Text>
            </TouchableOpacity>
          </View>

          {/* Empty State OR Progress */}
          <View className="h-3 bg-[#061414]/70 rounded-full overflow-hidden border border-[#337a7a]/25">
            <Reanimated.View
              style={dailyProgressBarStyle}
              className={`h-full rounded-full ${
                totalTodayTasks > 0 ? "bg-[#66b9b9]" : "bg-[#9FB5B5]/30"
              }`}
            />
          </View>

          {smartActionTask?.task ? (
            <View className="mt-3">
              <Reanimated.View
                style={smartTaskButtonBorderStyle}
                onLayout={({ nativeEvent }) => {
                  const width = Math.round(nativeEvent.layout.width);
                  if (width > 0 && Math.abs(width - smartTaskButtonWidth) > 1) {
                    setSmartTaskButtonWidth(width);
                  }
                }}
                className="relative rounded-2xl p-[1.5px] overflow-hidden"
              >
                <Reanimated.View
                  pointerEvents="none"
                  style={smartTaskShimmerStyle}
                  className="absolute top-[-1] bottom-[-1] rounded-full bg-[#FFD166]/20"
                />
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleSmartTaskPress}
                  className="rounded-2xl bg-[#123131]/88 border border-[#66b9b9]/20 px-3.5 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                        {smartActionTask.ctaLabel === "Upcoming"
                          ? "Upcoming Task"
                          : `${smartActionTask.ctaLabel} Current Task`}
                      </Text>
                      <Text className="text-[#E8F4F4] text-sm font-black mt-1" numberOfLines={1}>
                        {smartActionTask.icon} {smartActionTask.task.title}
                      </Text>
                    </View>
                    <Feather name="arrow-up-right" size={16} color={COLORS.warning} />
                  </View>
                </TouchableOpacity>
              </Reanimated.View>
              <View className="mt-2 flex-row items-center">
                <Reanimated.Text style={smartTaskEmojiStyle} className="text-[14px]">
                  ✨
                </Reanimated.Text>
                <Text className="ml-1.5 text-[#9FB5B5] text-[11px] font-semibold flex-1">
                  {smartTaskInitiationAffirmation}
                </Text>
              </View>
            </View>
          ) : null}

          <View className="mt-3 rounded-2xl border border-[#66b9b9]/25 bg-[#123131]/60 overflow-hidden">
            <TouchableOpacity
              onPress={toggleDailyMoodSection}
              activeOpacity={0.88}
              className="px-3.5 py-3 border-b border-[#337a7a]/20"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 pr-3">
                  <Text className="text-[16px] mr-2">{moodHeaderEmoji}</Text>
                  <Text className="text-[#E8F4F4] text-xs font-black flex-1" numberOfLines={1}>
                    Mood Today • {moodHeaderLabel}
                  </Text>
                </View>
                <Feather
                  name={isDailyMoodExpanded ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={COLORS.accent}
                />
              </View>
              {!isDailyMoodExpanded && collapsedMoodSupportMessage ? (
                <Text className="text-[#9FB5B5] text-[11px] mt-1.5 leading-4" numberOfLines={1}>
                  {collapsedMoodSupportMessage}
                </Text>
              ) : null}
            </TouchableOpacity>

            {isDailyMoodExpanded ? (
              <View className="px-3.5 py-3">
                {renderMoodSelectorRow({
                  selectedMoodType: dailyMoodType,
                  onSelect: (type) => {
                    setDailyMoodType(type);
                    saveDailyMoodCheckIn(type, dailyMoodNote);
                  },
                  compact: true,
                })}
                <TextInput
                  value={dailyMoodNote}
                  onChangeText={setDailyMoodNote}
                  placeholder="Optional note..."
                  placeholderTextColor={COLORS.muted}
                  multiline
                  className="mt-2 bg-[#061414]/45 text-[#E8F4F4] p-3 rounded-2xl border border-[#66b9b9]/20 text-xs"
                />
                <View className="mt-2 flex-row items-center">
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={!isValidMoodType(dailyMoodType)}
                    onPress={() => saveDailyMoodCheckIn(dailyMoodType, dailyMoodNote)}
                    className={`px-3 py-2 rounded-full border mr-2 ${
                      isValidMoodType(dailyMoodType)
                        ? "bg-[#66b9b9] border-[#66b9b9]"
                        : "bg-[#123131]/70 border-[#337a7a]/30"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-black uppercase tracking-widest ${
                        isValidMoodType(dailyMoodType)
                          ? "text-[#061414]"
                          : "text-[#9FB5B5]"
                      }`}
                    >
                      Save Mood
                    </Text>
                  </TouchableOpacity>
                  {moodPromptVisibleInBanner ? (
                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => setDismissedDailyMoodPromptDate(todayDateKey)}
                      className="px-3 py-2 rounded-full border border-[#337a7a]/35 bg-[#061414]/45"
                    >
                      <Text className="text-[#9FB5B5] text-[10px] font-bold uppercase tracking-widest">
                        Skip
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text className="text-[#66b9b9] text-xs font-bold mt-2">
                  {dailyMoodAffirmation}
                </Text>

                {(todayTaskMoodSummary.averageMoodType ||
                  weeklyMoodSummary.averageMoodType) && (
                  <View className="mt-2 flex-row flex-wrap">
                    {renderMoodSummaryChip(
                      "Today's Task Mood",
                      todayTaskMoodSummary.averageMoodType
                    )}
                    {renderMoodSummaryChip(
                      "Weekly Trend",
                      weeklyMoodSummary.averageMoodType
                    )}
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => setActivePage("mood-tracker")}
                  activeOpacity={0.82}
                  className="self-start mt-2 px-3 py-1.5 rounded-full border border-[#66b9b9]/35 bg-[#123131]/70"
                >
                  <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                    Open Mood Tracker
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <Text className="text-[#9FB5B5] text-xs font-bold mt-3">
            {dailyProgressCaption}
          </Text>
        </View>

        <View className="mx-4 mb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 8 }}
          >
            {ENERGY_TASK_FILTERS.map((filterOption) => {
              const isActive = activeEnergyFilter === filterOption.key;
              return (
                <TouchableOpacity
                  key={filterOption.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${filterOption.label} filter`}
                  activeOpacity={0.86}
                  onPress={() => handleEnergyFilterPress(filterOption.key)}
                  className={`mr-2 px-3 py-1.5 rounded-full border ${
                    isActive
                      ? "bg-[#D9A441]/18 border-[#D9A441]/55"
                      : "bg-[#123131]/72 border-[#337a7a]/35"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      isActive ? "text-[#D9A441]" : "text-[#9FB5B5]"
                    }`}
                  >
                    {filterOption.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {energyFilterMoodSuggestion ? (
            <Text className="text-[#9FB5B5] text-[11px] mt-2 ml-1">
              {energyFilterMoodSuggestion}
            </Text>
          ) : null}
        </View>

        {renderSection("📌 Pinned Tasks", "Pinned")}

        {activeTaskId && (
          <View className="bg-[#0B1F1F] mx-4 p-5 rounded-[32px] border border-[#5EEAD4]/35 shadow-2xl shadow-[#5EEAD4]/15 mb-4">
            <Text className="text-[#5EEAD4] font-black text-xs uppercase tracking-widest mb-4">
              Active Focus 🎯
            </Text>
            {isFocusCompleted ? (
              <Text className="text-[#7DFFB3] text-[10px] font-black uppercase tracking-widest mb-3">
                Session complete - closing in{" "}
                {focusCompletionCountdown}s
              </Text>
            ) : null}

            {activeTaskId && (
              <View className="items-center mt-2">
                {/* SECTION NAME */}
                <Text className="text-[#99bdbd] text-xs font-black uppercase tracking-[2px] mb-4">
                  {tasks.find((t) => t.id === activeTaskId)?.section}
                </Text>

                {/* RING */}
                <View className="justify-center items-center w-[252px] h-[252px] rounded-full bg-[#061414]/45 border border-[#337a7a]/20 shadow-lg shadow-[#5EEAD4]/10">
                  <Svg width={240} height={240}>
                    {/* Background */}
                    <Circle
                      cx="110"
                      cy="110"
                      r="100"
                      stroke={COLORS.card2}
                      strokeWidth="10"
                      fill="none"
                    />

                    {/* Progress Ring */}
                    <Circle
                      cx="110"
                      cy="110"
                      r="100"
                      stroke={ringColor} // Updated to Cyan palette in state
                      strokeWidth="14"
                      fill="none"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      rotation="90"
                      origin="110,110"
                    />
                  </Svg>

                  {/* TIMER INSIDE */}
                  <View className="absolute items-center">
                    <Text className="text-[#5EEAD4] text-[40px] font-black tracking-tight">
                      {focusTimeText.replace('⏱ ', '')}
                    </Text>
                  </View>
                </View>

                {/* TASK NAME */}
                <Text
                  onPress={() => scrollToTask(activeTaskId)}
                  className="text-[#E8F4F4] text-center underline font-black mt-4 text-base"
                >
                  {tasks.find((t) => t.id === activeTaskId)?.title}
                </Text>

                {/* Task assigned durration */}
                {activeTaskDuration && (
                  <Text className="text-[#99bdbd] text-xs mt-1 text-center font-semibold">
                    ⏱ {formatDuration(activeTaskDuration)} session
                  </Text>
                )}

                {/* CONTROL */}
                {isFocusCompleted ? (
                  <View className="mt-5 bg-[#7DFFB3]/10 px-6 py-3 rounded-full border border-[#7DFFB3]/30">
                    <Text className="text-[#7DFFB3] font-black uppercase tracking-widest text-[10px]">
                      Completed
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={toggleTimer} className="mt-5 bg-[#66b9b9]/15 px-6 py-3 rounded-full border border-[#66b9b9]/40 shadow-md shadow-[#66b9b9]/10">
                    <Text className="text-[#5EEAD4] font-black uppercase tracking-widest text-xs">
                      {isTimerRunning ? "⏸ Pause" : "▶ Resume"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {renderSection("Morning ☀️", "Morning")}
        {renderSection("Work 💼", "Work")}
        {renderSection("Evening 🌙", "Evening")}
      </Reanimated.ScrollView>
      {renderFixedFooter()}
      {renderDrawer()}
      {renderPageModal()}
      {renderOnboardingModal()}
      {renderRecoveryModal()}
      {renderTodayPlanSheet()}
      <Modal
        visible={todayPlanCelebration.visible}
        transparent
        animationType="fade"
        onRequestClose={closeTodayPlanCelebration}
      >
        <View className="flex-1 bg-[#061414]/88 justify-center px-6">
          <View
            accessible
            accessibilityRole="alert"
            className="bg-[#0B1F1F] p-5 rounded-[30px] border border-[#66b9b9]/35 shadow-2xl shadow-[#66b9b9]/15"
          >
            <View className="flex-row items-start justify-between mb-3">
              <Text
                accessibilityRole="header"
                className="flex-1 text-[#E8F4F4] text-base font-black pr-3"
              >
                {todayPlanCelebration.title}
              </Text>
              <TouchableOpacity
                onPress={closeTodayPlanCelebration}
                accessibilityLabel="Close planning encouragement"
                className="w-8 h-8 rounded-full bg-[#123131]/85 border border-[#66b9b9]/35 items-center justify-center"
              >
                <Feather name="x" size={14} color="#9FB5B5" />
              </TouchableOpacity>
            </View>

            <Text className="text-[#9FB5B5] text-[13px] leading-5 mb-5">
              {todayPlanCelebration.message}
            </Text>

            <TouchableOpacity
              onPress={closeTodayPlanCelebration}
              accessibilityLabel="Close planning encouragement"
              className="self-end bg-[#66b9b9]/15 border border-[#66b9b9]/35 rounded-2xl px-4 py-2.5"
            >
              <Text className="text-[#66b9b9] font-black uppercase tracking-widest text-[11px]">
                {todayPlanCelebration.buttonLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <OverwhelmModeSheet
        visible={isOverwhelmModeVisible}
        suggestions={overwhelmSuggestions}
        onClose={closeOverwhelmMode}
        onGoToTask={handleOverwhelmGoToTask}
        onStartTwoMinutes={handleOverwhelmStartTwoMinutes}
        onStartSmall={handleOverwhelmStartSmall}
        onMakeSmaller={handleOverwhelmMakeSmaller}
        onMoveGently={handleOverwhelmMoveGently}
        moodMessage={overwhelmMoodMessage}
      />
      <Modal
        visible={taskMoodPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTaskMoodPromptVisible(false);
          setTaskMoodPromptTaskId(null);
        }}
      >
        <View className="flex-1 bg-[#061414]/90 justify-end px-4 pb-8">
          <View className="bg-[#0B1F1F] rounded-[28px] border border-[#66b9b9]/30 p-5 shadow-2xl shadow-[#66b9b9]/15">
            <Text className="text-[#E8F4F4] text-lg font-black">
              How did this task feel?
            </Text>
            {taskMoodPromptTask ? (
              <Text className="text-[#9FB5B5] text-xs mt-1">
                {taskMoodPromptTask.title}
              </Text>
            ) : null}

            <View className="mt-4">
              {renderMoodSelectorRow({
                selectedMoodType: taskMoodPromptTask?.moodType || "",
                onSelect: (moodType) => {
                  if (!taskMoodPromptTaskId) return;
                  updateTaskMood(taskMoodPromptTaskId, moodType);
                },
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => {
                setTaskMoodPromptVisible(false);
                setTaskMoodPromptTaskId(null);
              }}
              className="self-start mt-2 px-3 py-1.5 rounded-full border border-[#337a7a]/35 bg-[#123131]/70"
            >
              <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest">
                Skip
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Start Assist Sheet */}
      <Modal
        visible={isStartAssistVisible}
        transparent
        animationType="fade"
        onRequestClose={closeStartAssist}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={modalKeyboardOffset}
        >
          <View
            className="flex-1 bg-[#061414]/90 justify-end px-4"
            style={{ paddingBottom: modalBottomPadding }}
          >
            <View className="max-h-[86%] bg-[#0B1F1F] rounded-[28px] border border-[#66b9b9]/30 p-5 shadow-2xl shadow-[#66b9b9]/15">
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 8 }}
              >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[#E8F4F4] text-lg font-black">
                  Need a gentle start?
                </Text>
                <Text className="text-[#9FB5B5] text-xs mt-1" numberOfLines={2}>
                  {startAssistTask?.title || "Task"}
                </Text>
                <Text className="text-[#66b9b9] text-[11px] font-semibold mt-2">
                  Pick one tiny way in.
                </Text>
              </View>

              <View className="flex-row items-center">
                <TouchableOpacity
                  activeOpacity={0.82}
                  accessibilityLabel="Read Start Assist aloud"
                  accessibilityHint="Reads a short supportive start prompt for this task"
                  onPress={handleStartAssistReadCurrentPanel}
                  className="w-8 h-8 rounded-full border border-[#66b9b9]/35 bg-[#123131]/70 items-center justify-center mr-2"
                >
                  <Feather name="volume-2" size={14} color={COLORS.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={closeStartAssist}
                  className="w-8 h-8 rounded-full border border-[#337a7a]/35 bg-[#123131]/70 items-center justify-center"
                >
                  <Feather name="x" size={14} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {!startAssistTask ? (
              <View className="mt-4 rounded-2xl border border-[#337a7a]/25 bg-[#123131]/70 p-3">
                <Text className="text-[#9FB5B5] text-xs">
                  This task is no longer available.
                </Text>
              </View>
            ) : null}

            {startAssistVoiceHint ? (
              <View className="mt-3 self-start rounded-full border border-[#337a7a]/30 bg-[#123131]/75 px-3 py-1.5">
                <Text className="text-[#9FB5B5] text-[10px] font-bold">
                  {startAssistVoiceHint}
                </Text>
              </View>
            ) : null}

            {startAssistTask && startAssistMode === "main" ? (
              <View className="mt-4">
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistTwoMinutes}
                  className="p-3 rounded-2xl border border-[#B6C26E]/40 bg-[#182419]/70 mb-2.5"
                >
                  <Text className="text-[#B6C26E] text-[11px] font-black uppercase tracking-widest">
                    Start For 2 Minutes
                  </Text>
                  <Text className="text-[#E8F4F4] text-xs mt-1">
                    One tiny action is enough.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistShowFirstStep}
                  className="p-3 rounded-2xl border border-[#66b9b9]/35 bg-[#123131]/75 mb-2.5"
                >
                  <Text className="text-[#66b9b9] text-[11px] font-black uppercase tracking-widest">
                    Show First Step Only
                  </Text>
                  <Text className="text-[#9FB5B5] text-xs mt-1" numberOfLines={1}>
                    {startAssistFirstStepPreview}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistBreakDown}
                  className="p-3 rounded-2xl border border-[#66b9b9]/35 bg-[#123131]/75 mb-2.5"
                >
                  <Text className="text-[#66b9b9] text-[11px] font-black uppercase tracking-widest">
                    Break This Down
                  </Text>
                  <Text className="text-[#9FB5B5] text-xs mt-1">
                    Add one or two tiny steps.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistOpenMakeEasier}
                  className="p-3 rounded-2xl border border-[#D9A441]/35 bg-[#2A2218]/70 mb-2.5"
                >
                  <Text className="text-[#D9A441] text-[11px] font-black uppercase tracking-widest">
                    Make This Easier
                  </Text>
                  <Text className="text-[#E8F4F4] text-xs mt-1">
                    A smaller version still counts.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistStuck}
                  className="p-3 rounded-2xl border border-[#D9A441]/35 bg-[#2A2218]/70"
                >
                  <Text className="text-[#D9A441] text-[11px] font-black uppercase tracking-widest">
                    I Feel Stuck
                  </Text>
                  <Text className="text-[#E8F4F4] text-xs mt-1">
                    It is okay to feel stuck.
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {startAssistTask && startAssistMode === "make-easier" ? (
              <View className="mt-4">
                <Text className="text-[#D9A441] text-[11px] font-black uppercase tracking-widest">
                  What is the smallest useful version of this task?
                </Text>
                <Text className="text-[#E8F4F4] text-xs mt-2">
                  You can make progress without doing the whole thing.
                </Text>
                <Text className="text-[#9FB5B5] text-xs mt-1.5">
                  What would make this feel 20% easier?
                </Text>

                <TextInput
                  placeholder="Smallest useful version"
                  placeholderTextColor={COLORS.muted}
                  value={startAssistMinimumVersionDraft}
                  onChangeText={setStartAssistMinimumVersionDraft}
                  multiline
                  textAlignVertical="top"
                  className="mt-3 bg-[#061414]/45 text-[#E8F4F4] p-3 rounded-2xl border border-[#D9A441]/30 text-sm min-h-[72px]"
                />

                <View className="flex-row mt-3">
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={handleStartAssistSaveMinimumVersion}
                    className="flex-1 mr-2 p-3 rounded-2xl border border-[#D9A441]/45 bg-[#2A2218]/75"
                  >
                    <Text className="text-[#D9A441] text-center text-[10px] font-black uppercase tracking-widest">
                      Save
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => setStartAssistMode("main")}
                    className="flex-1 ml-2 p-3 rounded-2xl border border-[#337a7a]/35 bg-[#123131]/70"
                  >
                    <Text className="text-[#9FB5B5] text-center text-[10px] font-black uppercase tracking-widest">
                      Back
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {startAssistTask && startAssistMode === "add-first-step" ? (
              <View className="mt-4">
                <Text className="text-[#B6C26E] text-[11px] font-black uppercase tracking-widest">
                  First small action
                </Text>
                <Text className="text-[#E8F4F4] text-xs mt-2">
                  Starting small still counts.
                </Text>
                <Text className="text-[#9FB5B5] text-xs mt-1.5">
                  Saved action is also added to Sub-Tasks.
                </Text>

                <TextInput
                  placeholder="Write one tiny first move"
                  placeholderTextColor={COLORS.muted}
                  value={startAssistFirstActionDraft}
                  onChangeText={setStartAssistFirstActionDraft}
                  className="mt-3 bg-[#061414]/45 text-[#E8F4F4] p-3 rounded-2xl border border-[#B6C26E]/30 text-sm"
                />

                <View className="flex-row mt-3">
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={handleStartAssistSaveFirstAction}
                    className="flex-1 mr-2 p-3 rounded-2xl border border-[#B6C26E]/45 bg-[#182419]/75"
                  >
                    <Text className="text-[#B6C26E] text-center text-[10px] font-black uppercase tracking-widest">
                      Save
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => setStartAssistMode("main")}
                    className="flex-1 ml-2 p-3 rounded-2xl border border-[#337a7a]/35 bg-[#123131]/70"
                  >
                    <Text className="text-[#9FB5B5] text-center text-[10px] font-black uppercase tracking-widest">
                      Back
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {startAssistTask && startAssistMode === "breakdown" ? (
              <View className="mt-4">
                <Text className="text-[#66b9b9] text-[11px] font-black uppercase tracking-widest">
                  Break Into Smaller Steps
                </Text>
                <Text className="text-[#E8F4F4] text-xs mt-2">
                  Add one tiny step at a time.
                </Text>
                <Text className="text-[#9FB5B5] text-xs mt-1.5">
                  New steps are added to Sub-Tasks.
                </Text>

                <TextInput
                  placeholder="Type one small step"
                  placeholderTextColor={COLORS.muted}
                  value={startAssistBreakdownDraft}
                  onChangeText={setStartAssistBreakdownDraft}
                  onSubmitEditing={handleStartAssistAddBreakdownSubtask}
                  className="mt-3 bg-[#061414]/45 text-[#E8F4F4] p-3 rounded-2xl border border-[#66b9b9]/30 text-sm"
                />

                <View className="flex-row mt-3">
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={handleStartAssistAddBreakdownSubtask}
                    className="flex-1 mr-2 p-3 rounded-2xl border border-[#66b9b9]/45 bg-[#123131]/75"
                  >
                    <Text className="text-[#66b9b9] text-center text-[10px] font-black uppercase tracking-widest">
                      Add Step
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => setStartAssistMode("main")}
                    className="flex-1 ml-2 p-3 rounded-2xl border border-[#337a7a]/35 bg-[#123131]/70"
                  >
                    <Text className="text-[#9FB5B5] text-center text-[10px] font-black uppercase tracking-widest">
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {startAssistTask && startAssistMode === "stuck" ? (
              <View className="mt-4">
                <View className="rounded-2xl border border-[#B6C26E]/35 bg-[#182419]/70 p-3">
                  <Text className="text-[#B6C26E] text-sm font-black">
                    It is okay to feel stuck.
                  </Text>
                  <Text className="text-[#E8F4F4] text-xs mt-1">
                    Let us make this smaller, not harder.
                  </Text>
                  <Text className="text-[#9FB5B5] text-xs mt-2">
                    You are not failing. The task may just need a smaller doorway.
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.82}
                  accessibilityLabel="Read stuck support aloud"
                  accessibilityHint="Reads a short compassionate stuck support message"
                  onPress={handleStartAssistReadStuck}
                  className="mt-3 self-start px-2.5 py-1 rounded-full border border-[#66b9b9]/35 bg-[#123131]/70 flex-row items-center"
                >
                  <Feather name="volume-2" size={11} color={COLORS.accent} />
                  <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest ml-1.5">
                    Read Aloud
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistOpenAddFirstStep}
                  className="mt-3 p-3 rounded-2xl border border-[#B6C26E]/40 bg-[#182419]/70"
                >
                  <Text className="text-[#B6C26E] text-[11px] font-black uppercase tracking-widest">
                    Add First Step
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistTwoMinutes}
                  className="mt-2.5 p-3 rounded-2xl border border-[#66b9b9]/35 bg-[#123131]/75"
                >
                  <Text className="text-[#66b9b9] text-[11px] font-black uppercase tracking-widest">
                    Start 2-Minute Timer
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistRescheduleLater}
                  className="mt-2.5 p-3 rounded-2xl border border-[#D9A441]/35 bg-[#2A2218]/70"
                >
                  <Text className="text-[#D9A441] text-[11px] font-black uppercase tracking-widest">
                    Move To Later Today
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={handleStartAssistBreakDown}
                  className="mt-2.5 p-3 rounded-2xl border border-[#66b9b9]/35 bg-[#123131]/75"
                >
                  <Text className="text-[#66b9b9] text-[11px] font-black uppercase tracking-widest">
                    Break Into Smaller Steps
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => setStartAssistMode("main")}
                  className="mt-3 self-start px-3 py-1.5 rounded-full border border-[#337a7a]/35 bg-[#123131]/70"
                >
                  <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest">
                    Back
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ✅ CREATE TASK MODAL */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeTaskModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={modalKeyboardOffset}
        >
          <View
            className="flex-1 justify-end bg-[#061414]/95 pt-10"
            style={{ paddingBottom: modalBottomPadding }}
          >
            <ScrollView
              className="bg-[#0B1F1F] rounded-t-[40px] border-t border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/20"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              contentContainerStyle={{
                padding: 24,
                paddingBottom: Math.max(insets.bottom, 20) + 148,
              }}
            >
            <Text className="text-[#E8F4F4] text-2xl font-black mb-6 uppercase tracking-tight">
              {isEditMode ? "Edit Task ✏️" : "New Task ✨"}
            </Text>

            <TextInput
              placeholder="Enter task..."
              placeholderTextColor={COLORS.muted}
              value={taskName}
              onChangeText={setTaskName}
              className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-4 border border-[#66b9b9]/25 font-semibold text-base"
            />
            <TextInput
              placeholder="Add details (optional)"
              placeholderTextColor={COLORS.muted}
              value={taskDetails}
              onChangeText={setTaskDetails}
              multiline
              textAlignVertical="top"
              onContentSizeChange={(e) => {
                setDetailsHeight(e.nativeEvent.contentSize.height);
              }}
              style={{ minHeight: 80, height: Math.max(80, detailsHeight) }}
              className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-4 border border-[#66b9b9]/25 font-medium"
            />

            <TextInput
              placeholder="First small action (optional)"
              placeholderTextColor={COLORS.muted}
              value={taskFirstAction}
              onChangeText={setTaskFirstAction}
              className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-3 border border-[#66b9b9]/20 font-medium text-sm"
            />

            <TextInput
              placeholder="Smallest useful version (optional)"
              placeholderTextColor={COLORS.muted}
              value={taskMinimumVersion}
              onChangeText={setTaskMinimumVersion}
              multiline
              textAlignVertical="top"
              className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-4 border border-[#66b9b9]/20 font-medium text-sm min-h-[68px]"
            />

            {startAssistEditHint ? (
              <View className="mb-4 rounded-2xl border border-[#B6C26E]/35 bg-[#182419]/70 p-3">
                <Text className="text-[#B6C26E] text-[11px] font-bold">
                  {startAssistEditHint}
                </Text>
              </View>
            ) : null}

            <View className="flex-row justify-between mb-5 space-x-2">
              {["Morning", "Work", "Evening"].map((sec) => (
                <TouchableOpacity
                  key={sec}
                  onPress={() => setSelectedSection(sec)}
                  className={`flex-1 py-3 rounded-xl border ${
                    selectedSection === sec ? "bg-[#66b9b9] border-[#66b9b9]" : "bg-[#123131]/80 border-[#337a7a]/40"
                  }`}
                >
                  <Text
                    className={`text-center font-black uppercase text-[10px] tracking-widest ${
                      selectedSection === sec ? "text-[#061414]" : "text-[#9FB5B5]"
                    }`}
                  >
                    {sec}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => {
                openSchedulePicker({
                  target: "task",
                  title: isEditMode ? "Update Schedule" : "Task Schedule",
                  value: scheduledDateTime,
                });
              }}
              className="bg-[#101416] p-4 rounded-2xl mb-3 border border-[#D9A441]/35"
            >
              <Text className="text-[#E8F4F4] font-semibold text-sm">
                {scheduledDateTime
                  ? formatDateTimeForDisplay(scheduledDateTime)
                  : "Select Date & Time"}
              </Text>
            </TouchableOpacity>

            {timeAdjusted && (
              <Text className="text-[#FFD166] text-xs font-bold mb-3">
                ⏱ Adjusted to section time
              </Text>
            )}
            <View className="bg-[#061414]/40 border border-[#337a7a]/30 rounded-2xl p-3 mb-3">
              <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest mb-2">
                Repeat Task
              </Text>
              <View className="flex-row flex-wrap">
                {REPEAT_TYPE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setRepeatType(option.key)}
                    className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${
                      repeatType === option.key
                        ? "bg-[#66b9b9] border-[#66b9b9]"
                        : "bg-[#123131]/70 border-[#337a7a]/35"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-black uppercase tracking-wider ${
                        repeatType === option.key
                          ? "text-[#061414]"
                          : "text-[#9FB5B5]"
                      }`}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {repeatType === REPEAT_TYPES.WEEKLY && (
                <View className="flex-row flex-wrap mt-1">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <TouchableOpacity
                      key={day.key}
                      onPress={() => toggleWeeklyRepeatDay(day.key)}
                      className={`px-2.5 py-1.5 rounded-full border mr-2 mb-2 ${
                        repeatDays.includes(day.key)
                          ? "bg-[#66b9b9]/20 border-[#66b9b9]/60"
                          : "bg-[#101416] border-[#337a7a]/35"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold ${
                          repeatDays.includes(day.key)
                            ? "text-[#66b9b9]"
                            : "text-[#9FB5B5]"
                        }`}
                      >
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {repeatType === REPEAT_TYPES.MONTHLY && (
                <View className="mt-1">
                  <View className="flex-row flex-wrap">
                    {[
                      { key: MONTHLY_REPEAT_TYPES.FIRST, label: "First Day" },
                      { key: MONTHLY_REPEAT_TYPES.LAST, label: "Last Day" },
                      { key: MONTHLY_REPEAT_TYPES.CUSTOM, label: "Custom" },
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        onPress={() => setRepeatMonthlyType(item.key)}
                        className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${
                          repeatMonthlyType === item.key
                            ? "bg-[#66b9b9]/20 border-[#66b9b9]/60"
                            : "bg-[#101416] border-[#337a7a]/35"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            repeatMonthlyType === item.key
                              ? "text-[#66b9b9]"
                              : "text-[#9FB5B5]"
                          }`}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {repeatMonthlyType === MONTHLY_REPEAT_TYPES.CUSTOM && (
                    <TouchableOpacity
                      onPress={() =>
                        openSchedulePicker({
                          target: "repeat-monthly-custom",
                          title: "Monthly Repeat Date",
                          value: repeatCustomDate || scheduledDateTime || new Date(),
                        })
                      }
                      className="bg-[#101416] p-3 rounded-xl border border-[#D9A441]/35"
                    >
                      <Text className="text-[#E8F4F4] font-semibold text-xs">
                        {repeatCustomDate
                          ? `Custom: ${formatDateTimeForDisplay(repeatCustomDate)}`
                          : "Select Custom Monthly Date"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {repeatType === REPEAT_TYPES.YEARLY && (
                <TouchableOpacity
                  onPress={() =>
                    openSchedulePicker({
                      target: "repeat-yearly",
                      title: "Yearly Repeat Date",
                      value: repeatYearlyDate || scheduledDateTime || new Date(),
                    })
                  }
                  className="bg-[#101416] p-3 rounded-xl border border-[#D9A441]/35 mt-1"
                >
                  <Text className="text-[#E8F4F4] font-semibold text-xs">
                    {repeatYearlyDate
                      ? `Every year on ${formatDateTimeForDisplay(repeatYearlyDate)}`
                      : "Select Yearly Date"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="bg-[#061414]/40 border border-[#337a7a]/30 rounded-2xl p-3 mb-3">
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setIsEnergyEffortExpanded((prev) => !prev)}
                className="flex-row items-center justify-between"
              >
                <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest">
                  Energy & effort
                </Text>
                <Feather
                  name={isEnergyEffortExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={COLORS.accent}
                />
              </TouchableOpacity>

              {isEnergyEffortExpanded ? (
                <View className="mt-2">
                  <Text className="text-[#9FB5B5] text-[10px] font-black mb-1">
                    Energy required
                  </Text>
                  <View className="flex-row flex-wrap mb-2">
                    {ENERGY_REQUIRED_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={`energy-required-${option.value}`}
                        onPress={() =>
                          setTaskEnergyRequired((prev) =>
                            prev === option.value ? "" : option.value
                          )
                        }
                        className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${
                          taskEnergyRequired === option.value
                            ? "bg-[#66b9b9]/20 border-[#66b9b9]/60"
                            : "bg-[#123131]/70 border-[#337a7a]/35"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            taskEnergyRequired === option.value
                              ? "text-[#66b9b9]"
                              : "text-[#9FB5B5]"
                          }`}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text className="text-[#9FB5B5] text-[10px] font-black mb-1">
                    Focus needed
                  </Text>
                  <View className="flex-row flex-wrap mb-2">
                    {FOCUS_REQUIRED_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={`focus-required-${option.value}`}
                        onPress={() =>
                          setTaskFocusRequired((prev) =>
                            prev === option.value ? "" : option.value
                          )
                        }
                        className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${
                          taskFocusRequired === option.value
                            ? "bg-[#66b9b9]/20 border-[#66b9b9]/60"
                            : "bg-[#123131]/70 border-[#337a7a]/35"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            taskFocusRequired === option.value
                              ? "text-[#66b9b9]"
                              : "text-[#9FB5B5]"
                          }`}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text className="text-[#9FB5B5] text-[10px] font-black mb-1">
                    Can be done at
                  </Text>
                  <View className="flex-row flex-wrap mb-2">
                    {TASK_CONTEXT_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={`task-context-${option.value}`}
                        onPress={() =>
                          setTaskContext((prev) =>
                            prev === option.value ? "" : option.value
                          )
                        }
                        className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${
                          taskContext === option.value
                            ? "bg-[#66b9b9]/20 border-[#66b9b9]/60"
                            : "bg-[#123131]/70 border-[#337a7a]/35"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            taskContext === option.value
                              ? "text-[#66b9b9]"
                              : "text-[#9FB5B5]"
                          }`}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text className="text-[#9FB5B5] text-[10px] font-black mb-1">
                    Estimated time
                  </Text>
                  <View className="flex-row flex-wrap">
                    {ESTIMATED_MINUTES_OPTIONS.map((minutes) => (
                      <TouchableOpacity
                        key={`estimated-minutes-${minutes}`}
                        onPress={() =>
                          setTaskEstimatedMinutes((prev) =>
                            prev === minutes ? null : minutes
                          )
                        }
                        className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${
                          taskEstimatedMinutes === minutes
                            ? "bg-[#66b9b9]/20 border-[#66b9b9]/60"
                            : "bg-[#123131]/70 border-[#337a7a]/35"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            taskEstimatedMinutes === minutes
                              ? "text-[#66b9b9]"
                              : "text-[#9FB5B5]"
                          }`}
                        >
                          {minutes} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={pickDocument}
              className={`mt-2 p-4 rounded-2xl border flex-row items-center ${attachmentUri ? "bg-[#123131]/80 border-[#7DFFB3]/70" : "bg-[#061414]/45 border-[#66b9b9]/25"}`}
            >
              <Text className="text-[#E8F4F4] flex-1 font-semibold text-sm">
                {attachmentUri
                  ? `📎 ${attachmentName || "File Selected"}`
                  : "📁 Upload Image or PDF"}
              </Text>
              {attachmentUri && (
                <TouchableOpacity onPress={() => setAttachmentUri(null)} className="ml-2 bg-[#FF7B7B]/15 px-2 py-1 rounded-lg border border-[#FF7B7B]/25">
                  <Text className="text-[#FF7B7B] font-black text-[10px] uppercase">Remove</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </ScrollView>
          <View className="bg-[#0B1F1F] px-6 pt-3 pb-2 border-t border-[#66b9b9]/20">
            {timeError ? (
              <Text className="text-[#FF7B7B] font-bold text-xs mb-2 text-center">
                ⚠️ Task time must be within section time
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={handleSaveTask}
              className="bg-[#66b9b9] p-4 rounded-2xl shadow-lg shadow-[#66b9b9]/30 border border-[#99bdbd]/60"
            >
              <Text className="text-[#061414] text-center font-black uppercase tracking-widest text-base">
                {isEditMode ? "Update Task" : "Save Task"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={closeTaskModal} className="mt-3 p-2">
              <Text className="text-[#9FB5B5] text-center font-bold text-xs uppercase tracking-widest">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editRepeatScopeModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-[#061414]/90 justify-center px-6">
          <View className="bg-[#0B1F1F] p-6 rounded-[32px] border border-[#66b9b9]/35 shadow-2xl shadow-[#66b9b9]/15">
            <Text className="text-[#66b9b9] text-xl font-black mb-4 uppercase tracking-tight">
              Apply Changes
            </Text>
            <Text className="text-[#E8F4F4] text-sm mb-4">
              Update repeating task:
            </Text>

            <TouchableOpacity
              onPress={() => applyEditScopeAndSave("single")}
              className="p-3 rounded-2xl bg-[#66b9b9]/15 border border-[#66b9b9]/40 mb-2"
            >
              <Text className="text-[#66b9b9] text-center font-black uppercase tracking-widest text-[10px]">
                Only This Task
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => applyEditScopeAndSave("future")}
              className="p-3 rounded-2xl bg-[#66b9b9]/15 border border-[#66b9b9]/40 mb-2"
            >
              <Text className="text-[#66b9b9] text-center font-black uppercase tracking-widest text-[10px]">
                This And Future Tasks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => applyEditScopeAndSave("all")}
              className="p-3 rounded-2xl bg-[#66b9b9]/15 border border-[#66b9b9]/40 mb-3"
            >
              <Text className="text-[#66b9b9] text-center font-black uppercase tracking-widest text-[10px]">
                All Tasks In Series
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setEditRepeatScopeModalVisible(false);
                setPendingEditPayload(null);
              }}
              className="p-3 rounded-2xl bg-[#123131]/80 border border-[#337a7a]/40"
            >
              <Text className="text-[#9FB5B5] text-center font-bold uppercase tracking-widest text-xs">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Section Date Time Modal */}
      <Modal visible={timeModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-[#061414]/90 justify-center px-6">
          <View className="bg-[#0B1F1F] p-6 rounded-[32px] border border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/15">
            <Text className="text-[#E8F4F4] text-xl font-black mb-6 uppercase tracking-tighter text-center">
              Set Focus Time ⏱
            </Text>

            {/* Inputs */}
            <View className="flex-row space-x-3 mb-6">
              <TextInput
                keyboardType="numeric"
                value={customHour}
                onChangeText={setCustomHour}
                placeholder="HH"
                placeholderTextColor={COLORS.muted}
                className="flex-1 bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl text-center text-lg font-bold border border-[#66b9b9]/25"
              />

              <TextInput
                keyboardType="numeric"
                value={customMinute}
                onChangeText={setCustomMinute}
                placeholder="MM"
                placeholderTextColor={COLORS.muted}
                className="flex-1 bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl text-center text-lg font-bold border border-[#66b9b9]/25"
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              onPress={saveCustomTime}
              className="bg-[#66b9b9] p-4 rounded-2xl shadow-lg shadow-[#66b9b9]/30 border border-[#99bdbd]/60"
            >
              <Text className="text-center text-[#061414] font-black uppercase tracking-widest">
                Save Time
              </Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity onPress={() => setTimeModalVisible(false)} className="mt-4 p-2">
              <Text className="text-[#9FB5B5] text-center font-bold text-xs uppercase tracking-widest">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Current Task Quick Access OR ✅ Last Completed Floating Button */}
      {currentTaskQuickTask ? (
        <Reanimated.View
          style={[{ bottom: focusFabBottom }, currentTaskFabAnimatedStyle]}
          className="absolute right-6"
        >
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={handleCurrentTaskFabPress}
            className="w-11 h-11 rounded-full bg-[#123131] border border-[#B6C26E]/65 items-center justify-center shadow-xl shadow-[#B6C26E]/25"
          >
            <Text className="text-[15px]">⏰</Text>
            {currentTaskQuickReason === "active-task" ||
            currentFocusedTaskId === currentTaskQuickTaskId ? (
              <View className="absolute -bottom-0.5 w-2 h-2 rounded-full bg-[#7DFFB3]" />
            ) : null}
          </TouchableOpacity>
        </Reanimated.View>
      ) : lastCompletedTaskId ? (
        <TouchableOpacity
          onPress={() => scrollToTask(lastCompletedTaskId)}
          style={{ bottom: focusFabBottom }}
          className="absolute right-6 bg-[#7DFFB3] py-3 px-5 rounded-full shadow-2xl shadow-[#7DFFB3]/35 border border-[#7DFFB3]"
        >
          <Text className="text-[#061414] font-black uppercase tracking-widest text-xs">
            ✅ Last Completed
          </Text>
        </TouchableOpacity>
      ) : null}

      <Animated.View
        style={{
          bottom: addTaskFabBottom,
          transform: [{ scale: fabScale }],
        }}
        className="absolute right-5"
      >
        <Pressable
          onPress={openModal}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          android_ripple={{ color: COLORS.border, borderless: false }}
          className="bg-[#66b9b9] flex-row items-center py-3.5 px-6 rounded-[28px] overflow-hidden shadow-2xl shadow-[#66b9b9]/40 border border-[#99bdbd]/70"
        >
          <Text className="text-[#061414] text-2xl font-black mr-2 leading-none mb-1">+</Text>
          <Text className="text-[#061414] text-sm font-black uppercase tracking-widest">
            Add Task
          </Text>
        </Pressable>
      </Animated.View>

      {recoveryFabPromptVisible ? (
        <Reanimated.View
          entering={FadeInDown.duration(220)}
          style={{ bottom: recoveryPromptBottom }}
          className="absolute right-20 bg-[#123131]/95 border border-[#66b9b9]/35 rounded-2xl px-3.5 py-2.5 max-w-[210px] shadow-xl shadow-[#66b9b9]/15"
        >
          <Text className="text-[#E8F4F4] text-[11px] font-bold">
            Ready when you are. Tap again to review pending tasks.
          </Text>
        </Reanimated.View>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.86}
        onPress={handleRecoveryFabPress}
        style={{ bottom: recoveryFabBottom }}
        className="absolute right-6 w-11 h-11 rounded-full bg-[#66b9b9] border border-[#99bdbd]/70 items-center justify-center shadow-xl shadow-[#66b9b9]/35"
      >
        <Feather name="refresh-cw" size={15} color="#061414" />
        {pastPendingTaskCount > 0 ? (
          <View className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#061414] border border-[#66b9b9]/70 items-center justify-center">
            <Text className="text-[#66b9b9] text-[9px] font-black">
              {pastPendingTaskCount > 9 ? "9+" : pastPendingTaskCount}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal visible={celebration.visible} transparent animationType="fade">
        <View className="flex-1 bg-[#061414]/90 justify-center items-center px-8">
          <Animated.View
            style={{
              transform: [{ scale: modalScale }],
            }}
            className="bg-[#0B1F1F] p-8 rounded-[40px] items-center w-full border border-[#7DFFB3]/50 shadow-2xl shadow-[#7DFFB3]/20"
          >
            {/* Emoji */}
            <Text className="text-5xl mb-4">{celebration.emoji}</Text>

            {/* Message */}
            <Text className="text-[#E8F4F4] text-xl text-center font-black tracking-tighter mb-6">
              {celebration.message}
            </Text>

            {/* Button */}
            <TouchableOpacity
              onPress={() =>
                setCelebration((prev) => ({ ...prev, visible: false }))
              }
              className="bg-[#7DFFB3] py-3.5 px-8 rounded-2xl w-full shadow-lg shadow-[#7DFFB3]/25"
            >
              <Text className="text-[#061414] font-black text-center uppercase tracking-widest">
                Continue
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={snoozeAffirmationModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeSnoozeAffirmation}
      >
        <View className="flex-1 bg-[#061414]/88 justify-center px-6">
          <View
            accessible
            accessibilityRole="alert"
            className="bg-[#0B1F1F] p-5 rounded-[30px] border border-[#66b9b9]/35 shadow-2xl shadow-[#66b9b9]/15"
          >
            <View className="flex-row items-start justify-between mb-3">
              <Text
                accessibilityRole="header"
                className="flex-1 text-[#E8F4F4] text-base font-black pr-3"
              >
                {snoozeAffirmationModal.title}
              </Text>
              <TouchableOpacity
                onPress={closeSnoozeAffirmation}
                accessibilityLabel="Close snooze message"
                className="w-8 h-8 rounded-full bg-[#123131]/85 border border-[#66b9b9]/35 items-center justify-center"
              >
                <Feather name="x" size={14} color="#9FB5B5" />
              </TouchableOpacity>
            </View>

            <Text className="text-[#9FB5B5] text-[13px] leading-5 mb-5">
              {snoozeAffirmationModal.message}
            </Text>

            <TouchableOpacity
              onPress={closeSnoozeAffirmation}
              accessibilityLabel="Close snooze message"
              className="self-end bg-[#66b9b9]/15 border border-[#66b9b9]/35 rounded-2xl px-4 py-2.5"
            >
              <Text className="text-[#66b9b9] font-black uppercase tracking-widest text-[11px]">
                Okay
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-[#061414]/90 justify-center px-6">
          <View className="bg-[#0B1F1F] p-6 rounded-[32px] border border-[#FF7B7B]/45 shadow-2xl shadow-[#FF7B7B]/15">
            <Text className="text-[#FF7B7B] text-xl font-black mb-4 uppercase tracking-tight">
              Delete Task
            </Text>

            <Text className="text-[#E8F4F4] mb-4 font-medium text-base">
              Delete <Text className="text-[#FF7B7B] font-bold">{deleteTask?.title}</Text>?
            </Text>

            {deleteTask &&
            isRepeatingTask(deleteTask) &&
            deleteTask.repeatGroupId ? (
              <>
                <Text className="text-[#9FB5B5] text-xs font-semibold mb-3">
                  Completed tasks stay preserved in history.
                </Text>
                <TouchableOpacity
                  onPress={() => confirmDeleteTask("single")}
                  className="p-3 rounded-2xl bg-[#FF7B7B]/20 border border-[#FF7B7B]/40 mb-2"
                >
                  <Text className="text-[#FF7B7B] text-center font-black uppercase tracking-widest text-[10px]">
                    Delete Only This Task
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDeleteTask("future")}
                  className="p-3 rounded-2xl bg-[#FF7B7B]/20 border border-[#FF7B7B]/40 mb-2"
                >
                  <Text className="text-[#FF7B7B] text-center font-black uppercase tracking-widest text-[10px]">
                    Delete This And Future Tasks
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDeleteTask("past")}
                  className="p-3 rounded-2xl bg-[#FF7B7B]/20 border border-[#FF7B7B]/40 mb-3"
                >
                  <Text className="text-[#FF7B7B] text-center font-black uppercase tracking-widest text-[10px]">
                    Delete This And Previous Tasks
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteModalVisible(false)}
                  className="p-3 rounded-2xl bg-[#123131]/80 border border-[#337a7a]/40"
                >
                  <Text className="text-[#9FB5B5] text-center font-bold uppercase tracking-widest text-xs">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View className="flex-row justify-between space-x-3">
                <TouchableOpacity
                  onPress={() => setDeleteModalVisible(false)}
                  className="flex-1 p-4 rounded-2xl bg-[#123131]/80 border border-[#337a7a]/40"
                >
                  <Text className="text-[#9FB5B5] text-center font-bold uppercase tracking-widest text-xs">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => confirmDeleteTask("single")}
                  className="flex-1 p-4 rounded-2xl bg-[#FF7B7B] shadow-md shadow-[#FF7B7B]/25"
                >
                  <Text className="text-[#061414] text-center font-black uppercase tracking-widest text-xs">
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {lastDeletedTask && (
        <View className="absolute bottom-24 left-5 right-5 bg-[#123131] p-4 rounded-2xl flex-row items-center border border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/15">
          <Text className="text-[#E8F4F4] flex-1 font-medium mr-3 text-xs leading-5">
            Task <Text className="text-[#FFD166] font-bold">{lastDeletedTask?.title}</Text> deleted ({undoTimer}s)
          </Text>

          <TouchableOpacity onPress={handleUndoDelete} className="bg-[#FFD166]/15 px-3 py-2 rounded-full border border-[#FFD166]/30">
            <Text className="text-[#FFD166] font-black text-[10px] uppercase tracking-widest">
              Undo
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={sectionTimeModalVisible}
        transparent
        animationType="slide"
      >
        <View className="flex-1 bg-[#061414]/95 justify-center items-center px-4">
          <View className="bg-[#0B1F1F] p-6 rounded-[32px] w-full border border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/15">
            <Text className="text-[#E8F4F4] text-xl font-black mb-6 uppercase tracking-tighter text-center">
              Edit {editingSection} Time
            </Text>

            <TextInput
              value={sectionStartTime}
              onChangeText={setSectionStartTime}
              placeholder="Start time"
              placeholderTextColor={COLORS.muted}
              className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-4 border border-[#66b9b9]/25 font-semibold"
            />

            <TextInput
              value={sectionEndTime}
              onChangeText={setSectionEndTime}
              placeholder="End time"
              placeholderTextColor={COLORS.muted}
              className="bg-[#061414]/45 text-[#E8F4F4] p-4 rounded-2xl mb-6 border border-[#66b9b9]/25 font-semibold"
            />

            <TouchableOpacity
              onPress={() => {
                console.log("🔥 SAVE BUTTON CLICKED");
                handleSaveSectionTime();
              }}
              className="bg-[#66b9b9] p-4 rounded-2xl shadow-lg shadow-[#66b9b9]/30 border border-[#99bdbd]/60"
            >
              <Text className="text-center text-[#061414] font-black uppercase tracking-widest">
                Save
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSectionTimeModalVisible(false)} className="mt-4 p-2">
              <Text className="text-[#9FB5B5] text-center font-bold text-xs uppercase tracking-widest">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={datePickerModal.visible}
        title={datePickerModal.title}
        value={datePickerModal.value}
        onCancel={closeSchedulePicker}
        onConfirm={handleScheduleConfirm}
      />
      <Modal visible={viewerVisible} animationType="fade" transparent={false}>
        <View className="flex-1 bg-[#061414]">
          {/* Header */}
          <View className="flex-row justify-between p-6 pt-14 bg-[#0B1F1F] border-b border-[#66b9b9]/25 shadow-lg shadow-[#66b9b9]/10">
            <Text className="text-[#E8F4F4] text-lg font-black tracking-tight">Attachment Viewer</Text>
            <TouchableOpacity onPress={() => setViewerVisible(false)} className="bg-[#123131]/80 px-4 py-1.5 rounded-full border border-[#66b9b9]/30">
              <Text className="text-[#66b9b9] font-bold text-xs uppercase tracking-widest">Close</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View className="flex-1">
            {currentFile.type === "image" ? (
              <Image
                source={{ uri: currentFile.uri }}
                className="flex-1"
                resizeMode="contain"
              />
            ) : (
              <WebView
                source={{ uri: currentFile.uri }}
                className="flex-1 bg-[#061414]"
                originWhitelist={["*"]}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

