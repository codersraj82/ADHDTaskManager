import {
  View,
  Text,
  ScrollView,
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
} from "react-native";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db, initDB } from "../../database/db";
import Svg, { Circle } from "react-native-svg";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { WebView } from "react-native-webview"; // For PDF viewing
import * as Notifications from "expo-notifications";
import DatePickerModal from "../../components/DatePickerModal";
import {
  formatDateTimeForDisplay,
  formatSqliteDateTime,
  parseStoredDateTime,
} from "../../utils/formatDateTime";
import { sortTasksForSection, getPendingTaskCount } from "../../utils/sortTasks";
import {
  getNearestUpcomingSection,
  SECTION_ORDER,
} from "../../utils/sectionHelpers";

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

const affirmations = [
  "Small steps still move you forward 🌱",
  "Focus is built gently 🧠",
  "You are capable of consistency 💪",
  "One task at a time ✨",
  "Calm mind, clear direction 🌊",
  "Start small. Momentum will follow 🌱",
  "Progress matters more than perfection 💪",
  "Tiny wins create powerful habits 🧠",
  "You already survived harder days 🌊",
  "Start with just 5 minutes ⏱",
];

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

//*************main component function********* */
export default function Home() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Drink water 💧", section: "Morning", completed: false, notificationId: [] },
    { id: 2, title: "Goto office 💼", section: "Work", completed: false, notificationId: [] },
    { id: 3, title: "Walk 10 minutes 🚶", section: "Evening", completed: false, notificationId: [] },
  ]);
  const [totalFocusTime, setTotalFocusTime] = useState(0); // seconds

  const [focusTime, setFocusTime] = useState(0); // in seconds
  const [isTimerRunning, setIsTimerRunning] = useState(false);

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
  const [currentAffirmation, setCurrentAffirmation] = useState(affirmations[0]);
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

  //******Vriables */

  // ✅ Daily Progress Calculations
  const totalTasks = tasks.length;

  const completedTasks = tasks.filter((t) => t.completed).length;

  const percentage =
    totalTasks === 0
      ? 0
      : Math.min(100, Math.round((dailyStats.completedTasks / totalTasks) * 100));
  const modalScale = useRef(new Animated.Value(0.8)).current;

  const sectionTasksMap = useMemo(() => {
    const now = new Date();
    return SECTION_ORDER.reduce((acc, sectionName) => {
      acc[sectionName] = sortTasksForSection(tasks, sectionName, now);
      return acc;
    }, {});
  }, [tasks]);

  const sectionPendingCounts = useMemo(
    () =>
      SECTION_ORDER.reduce((acc, sectionName) => {
        acc[sectionName] = getPendingTaskCount(tasks, sectionName);
        return acc;
      }, {}),
    [tasks]
  );

  const nearestUpcomingSection = useMemo(
    () => getNearestUpcomingSection(tasks),
    [tasks]
  );

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

  //******useRef********** */

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const activeFocusY = useRef(0);
  const fabScale = useRef(new Animated.Value(1)).current;
  const taskPositions = useRef({});
  const sectionPositions = useRef({});
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const affirmationOpacity = useRef(new Animated.Value(1)).current;
  const drawerX = useRef(new Animated.Value(-320)).current;

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
          scheduledTime TEXT, details TEXT, attachment TEXT,
          subtasks TEXT DEFAULT '[]', notificationId TEXT DEFAULT '[]' 
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

        // 3. Load All Data (Tasks + Section Settings)
        const taskResult = db.getAllSync("SELECT * FROM tasks") || [];
        const loadedTasks = taskResult.map((t) => ({
          ...t,
          completed: t.completed === 1,
          subtasks: JSON.parse(t.subtasks || "[]"),
          notificationId: JSON.parse(t.notificationId || "[]"),
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

        if (!appSettings.lifetimeCompletedTasks) {
          saveSetting("lifetimeCompletedTasks", lifetimeCompletedTasks);
        }
        if (!appSettings.lastActiveDate) {
          saveSetting("lastActiveDate", today);
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
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    setExpandedSection((prev) => {
      if (!nearestUpcomingSection) {
        if (prev === null) return prev;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        return null;
      }

      if (prev === nearestUpcomingSection) return prev;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      return nearestUpcomingSection;
    });
  }, [nearestUpcomingSection]);

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
    let interval;

    if (isTimerRunning) {
      interval = setInterval(() => {
        setFocusTime((prev) => {
          const next = prev + 1;

          // ✅ STOP when duration reached
          if (next >= currentDuration) {
            clearInterval(interval);
            setIsTimerRunning(false);
            showCelebration("🔥 Amazing focus! You stayed consistent 💪", "⏱");

            // add to daily + lifetime focus time
            recordFocusSession(currentDuration);

            return currentDuration; // lock at max
          }

          return next;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isTimerRunning, currentDuration]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percentage,
      duration: 400,
      useNativeDriver: false, // width animation needs false
    }).start();
  }, [percentage]);

  useEffect(() => {
    const interval = setInterval(checkDailyReset, 60000);
    return () => clearInterval(interval);
  }, []);

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
      if (percentage >= 70) {
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
  }, [activeTaskId, currentAffirmation, percentage, tasks]);

  const [modalVisible, setModalVisible] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [selectedSection, setSelectedSection] = useState("Morning");

  const runLayoutAnimation = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, []);

  const toggleSectionExpansion = useCallback(
    (section) => {
      runLayoutAnimation();
      setExpandedSection((prev) => (prev === section ? null : section));
    },
    [runLayoutAnimation]
  );

  const toggleTaskCardExpansion = useCallback(
    (taskId) => {
      runLayoutAnimation();
      setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
    },
    [runLayoutAnimation]
  );

  //*****handler functions*********** */
  // ✅ TOGGLE TASK
  const toggleTask = async (id) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === id) {
          const updated = !task.completed;

          // 1. 🧠 TIMER LOGIC
          // STOP TIMER IF ACTIVE TASK COMPLETED
          if (updated === true) {
            setLastCompletedTaskId(task.id);
            recordDailyCompletion();
            showCelebration("🎉 Task completed! Keep going 🚀", "✅");

            // 🔕 CANCEL PENDING NOTIFICATIONS/ALARMS
            if (task.notificationId) {
              try {
                const ids = Array.isArray(task.notificationId)
                  ? task.notificationId
                  : JSON.parse(task.notificationId || "[]");
                if (Array.isArray(ids)) {
                  ids.forEach((notifId) => {
                    Notifications.cancelScheduledNotificationAsync(notifId);
                  });
                  console.log(
                    `Cancelled ${ids.length} reminders for task: ${task.title}`
                  );
                }
              } catch (e) {
                console.log("Error cancelling notifications:", e);
              }
            }
          }

          // Handle focus time session saving
          if (task.id === activeTaskId && updated === true) {
            setIsTimerRunning(false);

            // Save current session into total
            if (focusTime > 0) {
              recordFocusSession(focusTime);
            }

            setFocusTime(0);
            setActiveTaskId(null);
          }

          // 2. 💾 DATABASE UPDATE
          try {
            db.runSync("UPDATE tasks SET completed = ? WHERE id = ?", [
              updated ? 1 : 0,
              id,
            ]);
          } catch (e) {
            console.log("Update error:", e);
          }

          // 3. 🔄 RETURN UPDATED TASK TO STATE
          return { ...task, completed: updated };
        }
        return task;
      })
    );
  };

  const resetTaskForm = () => {
    setTaskName("");
    setTaskDetails("");
    setScheduledDateTime("");
    setSelectedSection("Morning");
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
    setAttachmentUri(null);
    setAttachmentName("");
    setTimeAdjusted(false);
    setTimeError(false);

    setDetailsHeight(80);

    setModalVisible(true);
  };

  const startFocus = (taskId) => {
    const duration = taskDurations[taskId] || 1500; // default 25 min

    if (activeTaskId !== taskId && focusTime > 0) {
      recordFocusSession(focusTime);
    }

    setActiveTaskId(taskId);
    setFocusTime(0);
    setIsTimerRunning(true);

    // store duration for ring logic
    setCurrentDuration(duration);

    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: activeFocusY.current,
        animated: true,
      });
    }, 100);
  };

  const toggleTimer = () => {
    setIsTimerRunning((prev) => {
      const newState = !prev;

      // If stopping timer → add session to total
      if (prev === true && newState === false) {
        recordFocusSession(focusTime);
      }

      return newState;
    });
  };

  const pauseFocus = () => {
    setIsTimerRunning(false);
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

    const sectionY = sectionPositions.current[task.section] || 0;
    const taskY = taskPositions.current[taskId] || 0;

    const absoluteY = sectionY + taskY;

    const screenHeight = Dimensions.get("window").height;
    const cardHeight = 110;

    const centerY = absoluteY - screenHeight / 2 + cardHeight / 2;

    scrollRef.current?.scrollTo({
      y: centerY > 0 ? centerY : 0,
      animated: true,
    });
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

  const handleSaveTask = async () => {
    if (!taskName.trim()) return;

    try {
      // =========================
      // 1. PREPARE FINAL DATE
      // =========================
      let finalTime = "";

      if (scheduledDateTime) {
        const selectedDate = parseStoredDateTime(scheduledDateTime);

        if (!selectedDate) {
          finalTime = "";
        } else {

          const corrected = restrictToSection(selectedSection, selectedDate);

          finalTime = formatSqliteDateTime(corrected);
        }
      }

      // =========================
      // 2. CANCEL OLD REMINDERS
      // =========================
      if (isEditMode && editingTask?.notificationId) {
        try {
          const oldIds = Array.isArray(editingTask.notificationId)
            ? editingTask.notificationId
            : JSON.parse(editingTask.notificationId);

          for (const id of oldIds) {
            try {
              await Notifications.cancelScheduledNotificationAsync(id);
            } catch (e) {
              console.log("Cancel Error:", e);
            }
          }
        } catch (e) {
          console.log("Old Notification Cleanup Error:", e);
        }
      }

      // =========================
      // 3. SCHEDULE REMINDERS
      // =========================
      let newScheduledIds = [];

      if (finalTime) {
        const taskDate = parseStoredDateTime(finalTime);

        console.log("📅 TASK DATE:", taskDate);

        // Reminder intervals
        const intervals = [20, 10, 5, 0];

        for (let mins of taskDate ? intervals : []) {
          const triggerDate = new Date(taskDate.getTime() - mins * 60000);

          console.log("⏰ Trigger:", triggerDate);

          // Only future alarms
          if (triggerDate.getTime() > Date.now()) {
            try {
              const id = await Notifications.scheduleNotificationAsync({
                content: {
                  title: `🎯 ${taskName}`,
                  body: getAffirmativeMessage(
                    taskName,
                    taskDate.toLocaleString(),
                    mins
                  ),

                  sound: "default",

                  priority: Notifications.AndroidNotificationPriority.MAX,

                  vibrate: [0, 250, 250, 250],

                  android: {
                    channelId: "adhd-alarms",
                    color: COLORS.accent, // Modernized accent
                    pressAction: {
                      id: "default",
                    },
                  },
                },

                // ✅ CRITICAL FIX
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: triggerDate,
                },
              });

              console.log("✅ Scheduled ID:", id);
              if (!id) {
                alert(`❌ Failed to schedule ${mins} minute reminder`);
              }

              newScheduledIds.push(id);
            } catch (schedError) {
              console.log(
                `❌ Error scheduling ${mins}min reminder:`,
                schedError
              );
            }
          }
        }
      }

      // =========================
      // 4. SAVE TO DATABASE
      // =========================
      const subtasksToSave =
        isEditMode && editingTask?.subtasks ? editingTask.subtasks : [];

      const subtasksJSON = JSON.stringify(subtasksToSave);

      const notificationIdJSON = JSON.stringify(newScheduledIds);

      if (isEditMode && editingTask) {
        // =====================
        // UPDATE TASK
        // =====================

        db.runSync(
          `UPDATE tasks 
         SET title = ?, 
             section = ?, 
             scheduledTime = ?, 
             details = ?, 
             attachment = ?, 
             subtasks = ?, 
             notificationId = ?
         WHERE id = ?`,
          [
            taskName,
            selectedSection,
            finalTime,
            taskDetails,
            attachmentUri || "",
            subtasksJSON,
            notificationIdJSON,
            editingTask.id,
          ]
        );

        setTasks((prev) =>
          prev.map((t) =>
            t.id === editingTask.id
              ? {
                  ...t,
                  title: taskName,
                  section: selectedSection,
                  scheduledTime: finalTime,
                  details: taskDetails,
                  attachment: attachmentUri,
                  subtasks: subtasksToSave,
                  notificationId: newScheduledIds,
                }
              : t
          )
        );
      } else {
        // =====================
        // INSERT TASK
        // =====================

        const result = db.runSync(
          `INSERT INTO tasks (
          title,
          section,
          completed,
          scheduledTime,
          details,
          attachment,
          subtasks,
          notificationId
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskName,
            selectedSection,
            0,
            finalTime,
            taskDetails,
            attachmentUri || "",
            subtasksJSON,
            notificationIdJSON,
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
            scheduledTime: finalTime,
            details: taskDetails,
            attachment: attachmentUri,
            subtasks: subtasksToSave,
            notificationId: newScheduledIds,
          },
        ]);
      }

      // =========================
      // 5. RESET UI
      // =========================
      setAttachmentUri(null);
      setAttachmentName("");

      resetTaskForm();

      console.log("✅ Success! Scheduled reminders:", newScheduledIds.length);
    } catch (error) {
      console.log("❌ HANDLE SAVE ERROR:", error);

      alert("Task Save Error:\n" + error.message);
    }
  };

  const confirmDeleteTask = () => {
    if (!deleteTask) return;

    // save for undo
    setLastDeletedTask(deleteTask);

    // delete from DB
    db.runSync("DELETE FROM tasks WHERE id = ?", [deleteTask.id]);

    // update UI
    setTasks((prev) => prev.filter((t) => t.id !== deleteTask.id));
    if (expandedTaskId === deleteTask.id) {
      setExpandedTaskId(null);
    }

    // close modal
    setDeleteModalVisible(false);
    setDeleteTask(null);
  };

  const handleUndoDelete = () => {
    if (!lastDeletedTask) return;

    db.runSync("INSERT INTO tasks (id, title, section) VALUES (?, ?, ?)", [
      lastDeletedTask.id,
      lastDeletedTask.title,
      lastDeletedTask.section,
    ]);

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
            title: `🎯 ${taskName}`,
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

  const testNotification = async () => {
    console.log("Scheduling test...");

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 TEST WORKING!",
        body: "If you see this, notification system works.",
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
      },

      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
      },
    });

    alert("Test scheduled! Wait 5 seconds.");
  };

  //********************************** */
  //***********UI******************** */
  //*********Component Start UI*** */

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
    <View className="absolute bottom-0 left-0 right-0 z-30 bg-[#061414]/95 px-5 pt-3 pb-5 border-t border-[#66b9b9]/25 shadow-2xl shadow-[#66b9b9]/20">
      <View className="flex-row items-center justify-between">
        <Text className="text-[#9FB5B5] text-xs font-bold">
          © researchzeal.com
        </Text>
        <TouchableOpacity onPress={openSupport} className="bg-[#123131]/70 px-3 py-2 rounded-full border border-[#66b9b9]/25">
          <Text className="text-[#66b9b9] text-xs font-black">
            ❤️ Support This Project
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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

  const renderTaskMiniCard = (task, tone = "accent") => (
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
        completedTaskList.map((task) => renderTaskMiniCard(task, "success"))
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

  // ✅ REPLACED: Cleaned of Type Annotations to stop VS Code errors
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
    const sectionTasks = sectionTasksMap[section] || [];
    const pendingCount = sectionPendingCounts[section] || 0;
    const isSectionExpanded = expandedSection === section;

    return (
      <View
        className="px-4"
        onLayout={(event) => {
          sectionPositions.current[section] = event.nativeEvent.layout.y;
        }}
      >
        <View className="mb-2">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => toggleSectionExpansion(section)}
            className="flex-row items-center justify-between mb-3"
          >
            <Text className="text-[#E8F4F4] text-xl font-black tracking-widest uppercase">
              {title}
            </Text>
            <View className="flex-row items-center">
              {pendingCount > 0 ? (
                <Text className="text-[#9FB5B5] text-[10px] font-bold mr-2">
                  {pendingCount}
                </Text>
              ) : null}
              <Text className="text-[#66b9b9] text-[10px] font-black">
                {isSectionExpanded ? "^" : "v"}
              </Text>
            </View>
          </TouchableOpacity>

          {isSectionExpanded && (
            <>
              <TouchableOpacity
                onPress={testNotification}
                className="bg-[#FF7B7B]/15 p-2.5 rounded-2xl mb-3 shadow-md shadow-[#FF7B7B]/10 border border-[#FF7B7B]/35 items-center"
              >
                <Text className="text-[#FF7B7B] font-black text-xs uppercase tracking-widest">
                  TEST NOTIFICATION
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setEditingSection(section);
                  openSchedulePicker({
                    target: "section-start",
                    section,
                    title: `${section} Start`,
                    value: sectionTimes[section]?.start,
                  });
                }}
                className="bg-[#0B1F1F] p-3.5 rounded-2xl mb-2 border border-[#337a7a]/35 shadow-sm shadow-[#66b9b9]/10"
              >
                <Text className="text-[#E8F4F4] font-bold text-xs">
                  Start: {sectionTimes[section]?.start ? formatDateTimeForDisplay(sectionTimes[section].start) : "Select Start Date & Time"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setEditingSection(section);
                  openSchedulePicker({
                    target: "section-end",
                    section,
                    title: `${section} End`,
                    value: sectionTimes[section]?.end,
                  });
                }}
                className="bg-[#0B1F1F] p-3.5 rounded-2xl mb-4 border border-[#337a7a]/35 shadow-sm shadow-[#66b9b9]/10"
              >
                <Text className="text-[#E8F4F4] font-bold text-xs">
                  End: {sectionTimes[section]?.end ? formatDateTimeForDisplay(sectionTimes[section].end) : "Select End Date & Time"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {isSectionExpanded &&
          sectionTasks.map((task) => {
            const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
            const taskDate = parseStoredDateTime(task.scheduledTime);
            const taskTimestamp = taskDate?.getTime() || 0;

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

            const totalSubtasks = subtasks.length;
            const completedSubtasks = subtasks.filter((s) => s.completed).length;
            const isTaskExpanded = expandedTaskId === task.id;
            const hasPendingNotification =
              Array.isArray(task.notificationId) && task.notificationId.length > 0;

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
                        {task.completed && (
                          <Text className="text-[#061414] text-sm font-bold">âœ“</Text>
                        )}
                      </TouchableOpacity>

                      <View className="flex-row items-center flex-1 pr-2">
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
                      </View>

                      <View className="flex-row items-center space-x-3">
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            setEditingTask(task);
                            setIsEditMode(true);
                            setTaskName(task.title);
                            setTaskDetails(task.details || "");
                            setScheduledDateTime(task.scheduledTime || "");
                            setSelectedSection(task.section);
                            setModalVisible(true);
                          }}
                          className="p-1.5 bg-[#66b9b9]/15 rounded-xl border border-[#66b9b9]/25"
                        >
                          <Text className="text-sm">âœï¸</Text>
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
                          <Text className="text-sm">ðŸ—‘ï¸</Text>
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
                      <Text className="text-[#7DFFB3] text-xs ml-2">ðŸ””</Text>
                    ) : null}
                  </View>
                </Pressable>

                {isTaskExpanded && (
                  <>
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
                              className="bg-[#061414]/70 px-2 py-1 rounded-full border border-[#337a7a]/35"
                            >
                              <Text className="text-[#7DFFB3] text-[9px] font-semibold tracking-wide">
                                ðŸ”” {time}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {!hasPendingNotification && (
                          <Text className="text-[#FF7B7B] text-[9px] mt-1.5 font-bold">
                            âš ï¸ Tap Edit & Save to re-arm alarms
                          </Text>
                        )}
                      </View>
                    ) : null}

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
                            {sub.completed && (
                              <Text className="text-[#061414] text-[8px] font-bold">âœ“</Text>
                            )}
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
                            <Text className="text-[#FF7B7B] ml-2 text-xs">âœ•</Text>
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

                    {lastCompletedTaskId === task.id && (
                      <Text className="text-[#7DFFB3] text-[10px] mt-1 font-bold uppercase tracking-widest">
                        âœ… Last completed
                      </Text>
                    )}

                    {activeTaskId === task.id && (
                      <Text className="text-[#5EEAD4] text-[10px] mt-1 font-bold uppercase tracking-widest">
                        ðŸŽ¯ In Focus
                      </Text>
                    )}

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
                          â± Custom
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>

                    {showDurationError === task.id && (
                      <Text className="text-[#FF7B7B] text-[10px] mt-1 font-bold">
                        â± Please select focus time
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
                        {taskDurations[task.id] ? "â–¶ Start Focus" : "â± Select Focus Time"}
                      </Text>
                    </TouchableOpacity>

                    {taskDurations[task.id] && (
                      <Text className="text-[#99bdbd] text-[10px] mt-1.5 font-semibold">
                        â± {formatDuration(taskDurations[task.id])} selected
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
                          ðŸ“Ž View Attachment
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
              </View>
            );
          })}
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
          paddingBottom: 200, // 👈 IMPORTANT - Kept exactly as original
        }}
      >
        <Text
          className="hidden"
        >
          ADHD Task Manager <Text className="text-[#66b9b9]">✨</Text>
        </Text>

        {/* ✅ Daily Progress Banner */}
        <View className="bg-[#0B1F1F] p-5 rounded-[28px] mx-4 mb-4 border border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/15">
          {/* Top Row */}
          <View className="flex-row justify-between mb-3 items-end">
            <Text className="text-[#E8F4F4] text-lg font-black uppercase tracking-widest">
              Daily Progress 🚀
            </Text>

            {/* RIGHT */}
            <View className="items-end">
              {totalTasks > 0 && (
                <Text className="text-[#9FB5B5] text-xs font-bold">
                  {dailyStats.completedTasks} today / {totalTasks}
                </Text>
              )}

              <Text className="text-[#66b9b9] text-[10px] font-bold mt-1 tracking-widest uppercase">
                {totalFocusText}
              </Text>
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
                ✅ {dailyStats.completedTasks} Tasks Completed
              </Text>
            </View>
          </View>

          {/* Empty State OR Progress */}
          {totalTasks === 0 ? (
            <Text className="text-[#9FB5B5] font-bold text-sm italic">
              Ready to start your flow? ✨
            </Text>
          ) : (
            <View className="h-3 bg-[#061414]/70 rounded-full overflow-hidden border border-[#337a7a]/25">
              <Animated.View
                style={{
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                }}
                className="h-full bg-[#66b9b9]"
              />
            </View>
          )}

          <Text className="text-[#9FB5B5] text-xs font-bold mt-3">
            {dailyStats.completedTasks > 0 || dailyStats.totalFocusTime > 0
              ? "Consistency grows quietly 🌱"
              : "Fresh start today 🌱"}
          </Text>
        </View>

        {activeTaskId && (
          <View className="bg-[#0B1F1F] mx-4 p-5 rounded-[32px] border border-[#5EEAD4]/35 shadow-2xl shadow-[#5EEAD4]/15 mb-4">
            <Text className="text-[#5EEAD4] font-black text-xs uppercase tracking-widest mb-4">
              Active Focus 🎯
            </Text>

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
                <TouchableOpacity onPress={toggleTimer} className="mt-5 bg-[#66b9b9]/15 px-6 py-3 rounded-full border border-[#66b9b9]/40 shadow-md shadow-[#66b9b9]/10">
                  <Text className="text-[#5EEAD4] font-black uppercase tracking-widest text-xs">
                    {isTimerRunning ? "⏸ Pause" : "▶ Resume"}
                  </Text>
                </TouchableOpacity>
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
          className="absolute bottom-38 right-6 bg-[#66b9b9] py-3 px-5 rounded-full shadow-2xl shadow-[#66b9b9]/40 border border-[#99bdbd]/70"
        >
          <Text className="text-[#061414] font-black uppercase tracking-widest text-xs">
            🎯 Focus
          </Text>
        </TouchableOpacity>
      ) : lastCompletedTaskId ? (
        <TouchableOpacity
          onPress={() => scrollToTask(lastCompletedTaskId)}
          className="absolute bottom-38 right-6 bg-[#7DFFB3] py-3 px-5 rounded-full shadow-2xl shadow-[#7DFFB3]/35 border border-[#7DFFB3]"
        >
          <Text className="text-[#061414] font-black uppercase tracking-widest text-xs">
            ✅ Last Completed
          </Text>
        </TouchableOpacity>
      ) : null}

      <Animated.View
        style={{
          transform: [{ scale: fabScale }],
        }}
        className="absolute bottom-20 right-5"
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

            <Text className="text-[#E8F4F4] mb-8 font-medium text-base">
              Are you sure you want to delete <Text className="text-[#FF7B7B] font-bold">{deleteTask?.title}</Text> task?
            </Text>

            <View className="flex-row justify-between space-x-3">
              <TouchableOpacity
                onPress={() => setDeleteModalVisible(false)}
                className="flex-1 p-4 rounded-2xl bg-[#123131]/80 border border-[#337a7a]/40"
              >
                <Text className="text-[#9FB5B5] text-center font-bold uppercase tracking-widest text-xs">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={confirmDeleteTask}
                className="flex-1 p-4 rounded-2xl bg-[#FF7B7B] shadow-md shadow-[#FF7B7B]/25"
              >
                <Text className="text-[#061414] text-center font-black uppercase tracking-widest text-xs">
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
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

