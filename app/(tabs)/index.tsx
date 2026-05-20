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
} from "../../services/notificationService";
import {
  speakEncouragement,
  stopEncouragement,
} from "../../services/speechService";
import Reanimated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
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

const FOCUS_AUTO_DISMISS_DELAY_MS = 10000;

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

const isTimestampWithinRange = (timestamp, start, end) =>
  timestamp !== null && timestamp >= start && timestamp <= end;

//*************main component function********* */
export default function Home() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState([
    { id: 1, title: "Drink water 💧", section: "Morning", completed: false, notificationId: [], isPinned: false },
    { id: 2, title: "Goto office 💼", section: "Work", completed: false, notificationId: [], isPinned: false },
    { id: 3, title: "Walk 10 minutes 🚶", section: "Evening", completed: false, notificationId: [], isPinned: false },
  ]);
  const [totalFocusTime, setTotalFocusTime] = useState(0); // seconds

  const [focusTime, setFocusTime] = useState(0); // in seconds
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFocusCompleted, setIsFocusCompleted] = useState(false);
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
  const [isPinnedSectionExpanded, setIsPinnedSectionExpanded] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);
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
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [recoveryPendingTasks, setRecoveryPendingTasks] = useState([]);
  const [recoveryEditingTaskId, setRecoveryEditingTaskId] = useState(null);
  const [recoveryDraftDateTime, setRecoveryDraftDateTime] = useState("");
  const [recoveryDraftSection, setRecoveryDraftSection] = useState("Morning");
  const [recoverySavingTaskId, setRecoverySavingTaskId] = useState(null);
  const [recoverySuccessMessage, setRecoverySuccessMessage] = useState("");
  const [recoveryFabPromptVisible, setRecoveryFabPromptVisible] = useState(false);
  const [currentAffirmation, setCurrentAffirmation] = useState(affirmations[0]);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
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
  const footerHeight = 42;
  const floatingBaseBottom = footerSafeBottom + footerHeight + 10;
  const recoveryFabBottom = floatingBaseBottom;
  const addTaskFabBottom = recoveryFabBottom + 56;
  const focusFabBottom = addTaskFabBottom + 76;
  const recoveryPromptBottom = recoveryFabBottom + 2;
  const addTaskFabApproxHeight = 56;
  const listBottomPadding =
    addTaskFabBottom + addTaskFabApproxHeight + footerHeight + 28;

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
  const recoverySuccessPulse = useSharedValue(0);
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

  const refreshSectionAffirmations = useCallback(() => {
    setSectionAffirmations((prev) =>
      getSectionAffirmations(
        SECTION_AFFIRMATION_KEYS,
        SECTION_HEADER_AFFIRMATIONS,
        prev
      )
    );
  }, []);

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

  const cancelFocusCompletionReminder = useCallback(async () => {
    if (!focusCompletionNotificationIdRef.current) return;
    await cancelNotificationById(focusCompletionNotificationIdRef.current);
    focusCompletionNotificationIdRef.current = null;
  }, []);

  const scheduleFocusCompletionReminder = useCallback(
    async (taskId, endTimestamp) => {
      if (!taskId || !endTimestamp) return;
      await cancelFocusCompletionReminder();
      const notificationId = await scheduleFocusCompletionNotification({
        taskTitle: getTaskTitleById(taskId),
        endTimestamp,
      });
      focusCompletionNotificationIdRef.current = notificationId;
    },
    [cancelFocusCompletionReminder, getTaskTitleById]
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

      if (focusDismissTimeoutRef.current) {
        clearTimeout(focusDismissTimeoutRef.current);
      }
      focusDismissTimeoutRef.current = setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveTaskId(null);
        setFocusTime(0);
        setIsTimerRunning(false);
        setIsFocusCompleted(false);
        setFocusStartTimestamp(null);
        setFocusEndTimestamp(null);
        focusSessionRecordedRef.current = false;
        timerCompletionStampRef.current = null;
        focusCompletionNotificationIdRef.current = null;
        clearPersistedFocusTimerState();
        focusDismissTimeoutRef.current = null;
      }, FOCUS_AUTO_DISMISS_DELAY_MS);
    },
    [
      activeTaskId,
      clearPersistedFocusTimerState,
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

  const pastPendingTaskCount = useMemo(() => {
    const { start } = getDayBounds(new Date());
    return tasks.reduce((count, task) => {
      if (task.completed) return count;
      const scheduledTimestamp = toTaskTimestamp(task.scheduledTime);
      if (scheduledTimestamp === null || scheduledTimestamp >= start) {
        return count;
      }
      return count + 1;
    }, 0);
  }, [tasks]);

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

  const openRecoveryModal = useCallback(() => {
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

    setRecoverySavingTaskId(targetTask.id);
    try {
      await cancelTaskReminders(targetTask.notificationId);
      const reminderIds = await scheduleProReminders({
        ...targetTask,
        section: recoveryDraftSection,
        scheduledTime,
      });

      db.runSync(
        `UPDATE tasks
         SET section = ?,
             scheduledTime = ?,
             notificationId = ?,
             isPinned = ?
         WHERE id = ?`,
        [
          recoveryDraftSection,
          scheduledTime,
          JSON.stringify(reminderIds),
          targetTask.isPinned ? 1 : 0,
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
          isPinned INTEGER DEFAULT 0
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
        const todayRow = getDailyStatsRow(today);
        const existingCompleted = loadedTasks.filter((t) => t.completed).length;
        const lifetimeCompletedTasks = Number(
          appSettings.lifetimeCompletedTasks || existingCompleted
        );
        const lifetimeFocusTime = Number(appSettings.lifetimeFocusTime || 0);
        setIsVoiceMuted(appSettings.voiceMuted === "true");

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
          setActiveTaskId(restoredTimerState.activeTaskId);
          setFocusTime(restoredTimerState.focusTime || 0);
          setCurrentDuration(restoredTimerState.currentDuration || 1500);
          setIsTimerRunning(Boolean(restoredTimerState.isTimerRunning));
          setIsFocusCompleted(Boolean(restoredTimerState.isFocusCompleted));
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
      }
    };

    initializeApp();
  }, [clearPersistedFocusTimerState]);

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
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

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

  useEffect(
    () => () => {
      if (focusDismissTimeoutRef.current) {
        clearTimeout(focusDismissTimeoutRef.current);
        focusDismissTimeoutRef.current = null;
      }
      void cancelFocusCompletionReminder();
      void stopEncouragement();
    },
    [cancelFocusCompletionReminder]
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
      runLayoutAnimation();
      setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
    },
    [runLayoutAnimation]
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

      const scheduledIds = await scheduleProReminders({
        ...nextTask,
        title: sourceWithRepeat.title,
      });
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
          isPinned
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          JSON.stringify(scheduledIds),
          0,
        ]
      );

      const insertedId = result.lastInsertRowId;
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
        }

        if (task.id === activeTaskId && updated) {
          setIsTimerRunning(false);
          if (focusDismissTimeoutRef.current) {
            clearTimeout(focusDismissTimeoutRef.current);
            focusDismissTimeoutRef.current = null;
          }

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
      const recreatedNotificationIds = shouldCopyNotifications
        ? await scheduleProReminders({
            ...task,
            scheduledTime: newScheduledTime,
          })
        : [];

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
        isPinned
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
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
          JSON.stringify(recreatedNotificationIds),
          0,
        ]
      );

      const newTaskId = result.lastInsertRowId;
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

    setEditingTask(null);
    setIsEditMode(false);

    setModalVisible(false);
  };

  const openModal = () => {
    // ✅ RESET EDIT STATE
    setEditingTask(null);
    setIsEditMode(false);

    // Reset the create form so stale schedule values never reopen the picker.
    setTaskName("");
    setTaskDetails("");
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

    setDetailsHeight(80);

    setModalVisible(true);
  };

  const startFocus = (taskId) => {
    const duration = taskDurations[taskId] || 1500; // default 25 min

    if (focusDismissTimeoutRef.current) {
      clearTimeout(focusDismissTimeoutRef.current);
      focusDismissTimeoutRef.current = null;
    }

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

  const scrollToTask = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    let changedExpansion = false;
    const targetSectionKey = task.isPinned ? "Pinned" : task.section;

    if (task.isPinned) {
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
        if (current === task.section) return current;
        changedExpansion = true;
        runLayoutAnimation();
        if (current) {
          animateSectionChevron(current, false);
        }
        animateSectionChevron(task.section, true);
        hasAutoExpandedInitialSection.current = true;
        return task.section;
      });
    }

    setTimeout(
      () => {
        const sectionY = sectionPositions.current[targetSectionKey] || 0;
        const taskY = taskPositions.current[taskId] || 0;

        if (!taskY) {
          scrollRef.current?.scrollTo({
            y: sectionY > 0 ? sectionY : 0,
            animated: true,
          });
          return;
        }

        const absoluteY = sectionY + taskY;

        const screenHeight = Dimensions.get("window").height;
        const cardHeight = 110;
        const centerY = absoluteY - screenHeight / 2 + cardHeight / 2;

        scrollRef.current?.scrollTo({
          y: centerY > 0 ? centerY : 0,
          animated: true,
        });
      },
      changedExpansion ? 280 : 80
    );
  };

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

    return {
      finalTime,
      repeatType: normalizedType,
      repeatDays: normalizedDays,
      repeatMonthlyType: normalizedMonthlyType,
      repeatCustomDate: normalizedCustomDate,
      repeatYearlyDate: normalizedYearlyDate,
      subtasksToSave:
        isEditMode && editingTask?.subtasks ? editingTask.subtasks : [],
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
              title: taskName,
              scheduledTime: scheduleForTarget,
            })
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
               repeatGroupId = ?
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
        });
      }

      setTasks((prev) =>
        prev.map((task) => (updatedById.has(task.id) ? updatedById.get(task.id) : task))
      );

      setAttachmentUri(null);
      setAttachmentName("");
      resetTaskForm();
      return;
    }

    const repeatGroupId =
      draftRepeatType !== REPEAT_TYPES.NONE ? createRepeatGroupId() : "";

    const reminderIds = finalTime
      ? await scheduleProReminders({
          title: taskName,
          scheduledTime: finalTime,
        })
      : [];
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
        isPinned
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
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
        JSON.stringify(reminderIds),
        0,
      ]
    );

    const insertedId = result.lastInsertRowId;

    setTasks((prev) => [
      ...prev,
      {
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
      },
    ]);

    setAttachmentUri(null);
    setAttachmentName("");
    resetTaskForm();
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
      await executeTaskSave("single", draft);
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
        isPinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
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

  const addSubtask = (taskId, title) => {
    if (!title.trim()) return;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          const newSubtask = { id: Date.now(), title, completed: false };
          const updatedSubtasks = [...(task.subtasks || []), newSubtask];
          updateSubtasksInDB(taskId, updatedSubtasks);
          return { ...task, subtasks: updatedSubtasks };
        }
        return task;
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

  const getAffirmativeMessage = (title, time, minutesLeft) => {
    const sentences = [
      `You've got this! "${title}" is coming up at ${time}.`,
      `Ready to shine? "${title}" starts in ${minutesLeft} minutes.`,
      `Almost time to focus! "${title}" is scheduled for ${time}.`,
      `Success starts with preparation. "${title}" is in ${minutesLeft} mins.`,
    ];
    if (minutesLeft === 0)
      return `It's time! Let's conquer "${title}" right now! 🚀`;

    return sentences[Math.floor(Math.random() * sentences.length)];
  };

  const scheduleProReminders = async (task) => {
    if (!task.scheduledTime) return [];
    const taskDate = parseStoredDateTime(task.scheduledTime);
    if (!taskDate) return [];
    const now = new Date();

    const intervals = [20, 10, 5, 0]; // Minutes before task
    const scheduledIds = [];

    for (let mins of intervals) {
      const triggerDate = new Date(taskDate.getTime() - mins * 60000);

      // Only schedule if the trigger time is in the future
      if (triggerDate > now) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `🎯 ${task.title}`,
            body: getAffirmativeMessage(
              task.title,
              taskDate.toLocaleString(),
              mins
            ),
            sound: "default",

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

  const renderFixedHeader = () => (
    <View className="absolute top-0 left-0 right-0 z-30 bg-[#061414]/95 pt-10 px-4 pb-4 border-b border-[#66b9b9]/25 shadow-2xl shadow-[#66b9b9]/20 rounded-b-[32px]">
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
      <Animated.View style={{ opacity: affirmationOpacity }} className="mt-4 bg-[#123131]/60 border border-[#66b9b9]/25 rounded-2xl p-3">
        <Text className="text-[#E8F4F4] text-sm font-bold leading-5">
          {currentAffirmation}
        </Text>
      </Animated.View>
    </View>
  );
  const renderFixedFooter = () => (
    <View pointerEvents="box-none" className="absolute left-0 right-0 z-20" style={{ bottom: footerSafeBottom }}>
      <View
        className="mx-4 bg-[#0B1F1F] border border-[#66b9b9]/30 rounded-xl px-3 py-1.5 shadow-xl shadow-[#66b9b9]/10"
        style={{ minHeight: footerHeight }}
      >
        <View className="flex-row items-center">
          <View className="flex-1 pr-3">
            <Text className="text-[#E8F4F4] text-[10px] font-black uppercase tracking-widest">
              {"\u00A9"} researchzeal.com
            </Text>
            <Text className="text-[#9FB5B5] text-[10px] mt-0.5 font-semibold">
              {completedTodayTasks} done • {pendingTodayTasks} to continue
            </Text>
          </View>
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
      ? pinnedTasks
      : sectionTasksMap[section] || [];
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
    const sectionStats = isPinnedVirtualSection
      ? pinnedHeaderStats
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
              {sectionTasks.map((task) => {
            const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
            const taskDate = parseStoredDateTime(task.scheduledTime);
            const taskTimestamp = taskDate?.getTime() || 0;
            const totalSubtasks = subtasks.length;
            const completedSubtasks = subtasks.filter((s) => s.completed).length;
            const isTaskExpanded = expandedTaskId === task.id;
            const hasPendingNotification =
              Array.isArray(task.notificationId) && task.notificationId.length > 0;
            const repeatLabel = repeatLabelByTaskId[task.id] || "";
            const hasRepeatLabel = Boolean(repeatLabel);
            const showTaskHeaderMeta = task.isPinned || hasRepeatLabel;

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
            const cardBorderClass = activeTaskId === task.id ? "border-[#5EEAD4] border" : task.completed ? "border-[#7DFFB3]/60 border-l-4" : "border-[#337a7a]/35 border";
            const cardShadowClass = activeTaskId === task.id ? "shadow-2xl shadow-[#5EEAD4]/20" : task.completed ? "shadow-lg shadow-[#7DFFB3]/10" : "shadow-md shadow-[#66b9b9]/10";

            return (
              <View
                key={task.id}
                onLayout={(event) => {
                  taskPositions.current[task.id] = event.nativeEvent.layout.y;
                }}
                className={`p-4 rounded-[24px] mb-3 ${cardBgClass} ${cardBorderClass} ${cardShadowClass}`}
              >
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
                            const repeatSettings = normalizeTaskRepeatSettings(task);
                            setEditingTask(task);
                            setIsEditMode(true);
                            setTaskName(task.title);
                            setTaskDetails(task.details || "");
                            setScheduledDateTime(task.scheduledTime || "");
                            setSelectedSection(task.section);
                            setRepeatType(repeatSettings.repeatType);
                            setRepeatDays(repeatSettings.repeatDays);
                            setRepeatMonthlyType(repeatSettings.repeatMonthlyType);
                            setRepeatCustomDate(repeatSettings.repeatCustomDate);
                            setRepeatYearlyDate(repeatSettings.repeatYearlyDate);
                            setModalVisible(true);
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
                    {task.details ? (
                      <View className="mt-2 p-3 bg-[#061414]/45 rounded-2xl border border-[#337a7a]/25">
                        <Text className="text-[#E8F4F4] text-xs leading-5">
                          {task.details}
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

                      {subtasks.map((sub) => (
                        <View
                          key={sub.id}
                          className="flex-row items-center mb-2"
                        >
                          <TouchableOpacity
                            onPress={() => toggleSubtask(task.id, sub.id)}
                            className={`w-4 h-4 rounded-[4px] border border-[#66b9b9] mr-2 justify-center items-center ${
                              sub.completed ? "bg-[#66b9b9]" : "bg-transparent"
                            }`}
                          >
                            {sub.completed ? (
                              <Feather name="check" size={9} color={COLORS.bg} />
                            ) : null}
                          </TouchableOpacity>
                          <Text
                            className={`flex-1 text-xs ${
                              sub.completed ? "text-[#9FB5B5] line-through" : "text-[#E8F4F4]"
                            }`}
                          >
                            {sub.title}
                          </Text>
                          <TouchableOpacity
                            onPress={() => deleteSubtask(task.id, sub.id)}
                            className="p-1"
                          >
                            <Feather name="x" size={12} color={COLORS.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}

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
              </View>
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
      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-[#061414]"
        contentContainerStyle={{
          paddingTop: 190,
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

          {/* Empty State OR Progress */}
          <View className="h-3 bg-[#061414]/70 rounded-full overflow-hidden border border-[#337a7a]/25">
            <Reanimated.View
              style={dailyProgressBarStyle}
              className={`h-full rounded-full ${
                totalTodayTasks > 0 ? "bg-[#66b9b9]" : "bg-[#9FB5B5]/30"
              }`}
            />
          </View>

          <Text className="text-[#9FB5B5] text-xs font-bold mt-3">
            {dailyProgressCaption}
          </Text>
        </View>

        {renderSection("📌 Pinned Tasks", "Pinned")}

        {activeTaskId && (
          <View className="bg-[#0B1F1F] mx-4 p-5 rounded-[32px] border border-[#5EEAD4]/35 shadow-2xl shadow-[#5EEAD4]/15 mb-4">
            <Text className="text-[#5EEAD4] font-black text-xs uppercase tracking-widest mb-4">
              Active Focus 🎯
            </Text>
            {isFocusCompleted ? (
              <Text className="text-[#7DFFB3] text-[10px] font-black uppercase tracking-widest mb-3">
                Session complete - closing in 10s
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
      </ScrollView>
      {renderFixedFooter()}
      {renderDrawer()}
      {renderPageModal()}
      {renderOnboardingModal()}
      {renderRecoveryModal()}

      {/* ✅ CREATE TASK MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View className="flex-1 justify-end bg-[#061414]/95 pt-10">
          <ScrollView
            className="bg-[#0B1F1F] rounded-t-[40px] border-t border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/20"
            contentContainerStyle={{ padding: 24 }}
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
            <TouchableOpacity
              onPress={handleSaveTask}
              className="bg-[#66b9b9] p-4 rounded-2xl shadow-lg shadow-[#66b9b9]/30 border border-[#99bdbd]/60 mt-2"
            >
              <Text className="text-[#061414] text-center font-black uppercase tracking-widest text-base">
                {isEditMode ? "Update Task" : "Save Task"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModalVisible(false)} className="mt-4 p-2">
              <Text className="text-[#9FB5B5] text-center font-bold text-xs uppercase tracking-widest">
                Cancel
              </Text>
            </TouchableOpacity>

            {timeError && (
              <Text className="text-[#FF7B7B] font-bold text-xs mb-3 text-center mt-2">
                ⚠️ Task time must be within section time
              </Text>
            )}

            {/* Inside Task Modal ScrollView */}
            <TouchableOpacity
              onPress={pickDocument}
              className={`mt-4 p-4 rounded-2xl border flex-row items-center ${attachmentUri ? "bg-[#123131]/80 border-[#7DFFB3]/70" : "bg-[#061414]/45 border-[#66b9b9]/25"}`}
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
        </View>
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

      {/* 🎯 Focus OR ✅ Last Completed Floating Button */}
      {/* 🎯 Focus OR ✅ Last Completed Floating Button */}
      {activeTaskId ? (
        <TouchableOpacity
          onPress={() => {
            scrollRef.current?.scrollTo({
              y: activeFocusY.current,
              animated: true,
            });
          }}
          style={{ bottom: focusFabBottom }}
          className="absolute right-6 bg-[#66b9b9] py-3 px-5 rounded-full shadow-2xl shadow-[#66b9b9]/40 border border-[#99bdbd]/70"
        >
          <Text className="text-[#061414] font-black uppercase tracking-widest text-xs">
            🎯 Focus
          </Text>
        </TouchableOpacity>
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













