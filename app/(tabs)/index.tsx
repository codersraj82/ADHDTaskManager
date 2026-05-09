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
  Platform,
  StatusBar,
} from "react-native";
import { useState, useEffect, useRef } from "react";
import { db, initDB } from "../../database/db";
import Svg, { Circle } from "react-native-svg";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";

import { WebView } from "react-native-webview"; // For PDF viewing
import * as Notifications from "expo-notifications";

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
  const [tempDate, setTempDate] = useState(new Date());

  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState(null); 
  const [sectionTimeModalVisible, setSectionTimeModalVisible] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskAttachment, setTaskAttachment] = useState("");
  const [detailsHeight, setDetailsHeight] = useState(80);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [timeError, setTimeError] = useState(false);
  const [sectionTimes, setSectionTimes] = useState({
    Morning: { start: "", end: "" },
    Work: { start: "", end: "" },
    Evening: { start: "", end: "" },
  });

  const [sectionTempDate, setSectionTempDate] = useState(new Date());
  const [taskTempDate, setTaskTempDate] = useState(new Date());
  const [timeAdjusted, setTimeAdjusted] = useState(false);

  const [attachmentUri, setAttachmentUri] = useState(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [viewerVisible, setViewerVisible] = useState(false);
  const [currentFile, setCurrentFile] = useState({ uri: null, type: null });

  //******Vriables */

  // ✅ Daily Progress Calculations
  const totalTasks = tasks.length;

  const completedTasks = tasks.filter((t) => t.completed).length;

  const percentage =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const modalScale = useRef(new Animated.Value(0.8)).current;

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

            // add to total focus time
            setTotalFocusTime((total) => total + currentDuration);

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
  const [modalVisible, setModalVisible] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [selectedSection, setSelectedSection] = useState("Morning");

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
              setTotalFocusTime((total) => total + focusTime);
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

    setEditingTask(null);
    setIsEditMode(false);

    setModalVisible(false);
  };

  const openModal = () => {
    // ✅ RESET EDIT STATE
    setEditingTask(null);
    setIsEditMode(false);

    // ✅ RESET ONLY IF EMPTY (IMPORTANT FIX)
    setTaskName("");
    setTaskDetails("");
    setSelectedSection("Morning");

    // ❌ DO NOT FORCE RESET EVERY TIME
    // Only reset if no value already
    // setScheduledDateTime((prev) => prev || "");

    setDetailsHeight(80);

    setModalVisible(true);
  };

  const startFocus = (taskId) => {
    const duration = taskDurations[taskId] || 1500; // default 25 min

    if (activeTaskId !== taskId && focusTime > 0) {
      setTotalFocusTime((total) => total + focusTime);
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
        setTotalFocusTime((total) => total + focusTime);
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
        const selectedDate = new Date(scheduledDateTime);

        const corrected = restrictToSection(selectedSection, selectedDate);

        // ✅ SAVE ISO FORMAT
        finalTime = corrected.toISOString();
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
        const taskDate = new Date(finalTime);

        console.log("📅 TASK DATE:", taskDate);

        // Reminder intervals
        const intervals = [20, 10, 5, 0];

        for (let mins of intervals) {
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

  const formatDateTime = (date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      console.log("INVALID DATE PASSED:", date);
      return "";
    }

    const day = String(date.getDate()).padStart(2, "0");

    const months = [
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

    const month = months[date.getMonth()];
    const year = date.getFullYear();

    let hours = date.getHours();
    let minutes = date.getMinutes();

    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12 || 12;

    const minStr = String(minutes).padStart(2, "0");

    return `${day}-${month}-${year} ${hours}:${minStr} ${ampm}`;
  };

  const parseDateTime = (str) => {
    if (!str) return null;

    try {
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

  const saveSectionConfig = (section, start, end) => {
    try {
      db.runSync(
        `INSERT OR REPLACE INTO section_settings (section_name, start_time, end_time) 
       VALUES (?, ?, ?)`,
        [section, start, end]
      );
    } catch (e) {
      console.log("Save Error:", e);
    }
  };

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
    const taskDate = new Date(task.scheduledTime);
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

  // ✅ REPLACED: Cleaned of Type Annotations to stop VS Code errors
  const renderSection = (title, section) => {
    const sectionTasks = tasks
      .filter((t) => t.section === section)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (
          new Date(a.scheduledTime || 0).getTime() -
          new Date(b.scheduledTime || 0).getTime()
        );
      });

    return (
      <View
        className="px-4"
        onLayout={(event) => {
          sectionPositions.current[section] = event.nativeEvent.layout.y;
        }}
      >
        <View className="mb-2">
          {/* Title + Edit */}
          <View className="flex-row items-center mb-3">
            <Text className="text-[#E8F4F4] text-xl font-black tracking-widest uppercase">
              {title}
            </Text>
          </View>

          <TouchableOpacity
            onPress={testNotification}
            className="bg-[#FF7B7B]/15 p-2.5 rounded-2xl mb-3 shadow-md shadow-[#FF7B7B]/10 border border-[#FF7B7B]/35 items-center"
          >
            <Text className="text-[#FF7B7B] font-black text-xs uppercase tracking-widest">
              🚨 TEST NOTIFICATION 🚨
            </Text>
          </TouchableOpacity>

          {/* Time BELOW title */}
          <TouchableOpacity
            onPress={() => {
              setEditingSection(section); // ✅ ADD THIS LINE
              setPickerMode("start-date");
              setShowPicker(true);
            }}
            className="bg-[#0B1F1F] p-3.5 rounded-2xl mb-2 border border-[#337a7a]/35 shadow-sm shadow-[#66b9b9]/10"
          >
            <Text className="text-[#E8F4F4] font-bold text-xs">
              Start: {sectionTimes[section]?.start || "Select Start Date & Time"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setEditingSection(section); // ✅ ADD THIS LINE
              setPickerMode("end-date");
              setShowPicker(true);
            }}
            className="bg-[#0B1F1F] p-3.5 rounded-2xl mb-4 border border-[#337a7a]/35 shadow-sm shadow-[#66b9b9]/10"
          >
            <Text className="text-[#E8F4F4] font-bold text-xs">
              End: {sectionTimes[section]?.end || "Select End Date & Time"}
            </Text>
          </TouchableOpacity>
        </View>

        {sectionTasks.map((task) => {
          const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
          // 🔔 Calculate Upcoming Reminders
          // 🔔 UPDATED Calculation inside renderSection
          const taskTimestamp = new Date(task.scheduledTime).getTime();
          const isFutureTask =
            taskTimestamp && taskTimestamp + 60000 > Date.now();

          const upcomingReminders = [];
          if (task.scheduledTime) {
            const intervals = [20, 10, 5, 0];
            intervals.forEach((mins) => {
              const triggerTime = taskTimestamp - mins * 60000;
              // Show if the specific reminder time hasn't passed yet
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

          //********SubTask********/

          const totalSubtasks = subtasks.length;
          const completedSubtasks = subtasks.filter((s) => s.completed).length;

          // 🔥 Card styling logic optimized for NativeWind
          const cardBgClass = activeTaskId === task.id ? "bg-[#123131]" : task.completed ? "bg-[#0B1F1F]/90 opacity-90" : "bg-[#0B1F1F]";
          const cardBorderClass = activeTaskId === task.id ? "border-[#5EEAD4] border" : task.completed ? "border-[#7DFFB3]/60 border-l-4" : "border-[#337a7a]/35 border";
          const cardShadowClass = activeTaskId === task.id ? "shadow-2xl shadow-[#5EEAD4]/20" : task.completed ? "shadow-lg shadow-[#7DFFB3]/10" : "shadow-md shadow-[#66b9b9]/10";

          return (
            <TouchableOpacity
              key={task.id}
              onLayout={(event) => {
                taskPositions.current[task.id] = event.nativeEvent.layout.y;
              }}
              className={`p-4 rounded-[24px] mb-3 ${cardBgClass} ${cardBorderClass} ${cardShadowClass}`}
            >
              {/* 🔹 ROW 1: MAIN */}
              <View className="flex-row items-center justify-between pb-3 mb-2 border-b border-[#337a7a]/25">
                <View className="flex-row items-center flex-1">
                  {/* Checkbox */}
                  <TouchableOpacity
                    onPress={() => toggleTask(task.id)}
                    className={`w-7 h-7 rounded-[10px] border-2 mr-3 items-center justify-center ${
                      task.completed
                        ? "bg-[#7DFFB3] border-[#7DFFB3]"
                        : "bg-[#061414]/40 border-[#337a7a]"
                    }`}
                  >
                    {task.completed && (
                      <Text className="text-[#061414] text-sm font-bold">✓</Text>
                    )}
                  </TouchableOpacity>

                  {/* ─── DISTINGUISHED HEADER ─── */}

                  {/* Left Side: Title Group */}
                  <View className="flex-row items-center flex-1 pr-2">
                    {/* Optional: If you keep your Checkbox here, place it before the Text */}
                    <Text
                      numberOfLines={2} // Prevents title from breaking the layout
                      className={`text-base font-bold flex-1 tracking-wide ${
                        task.completed
                          ? "text-[#9FB5B5] line-through"
                          : "text-[#E8F4F4]"
                      }`}
                    >
                      {task.title}
                    </Text>
                  </View>

                  {/* Right Side: Action Group */}
                  <View className="flex-row items-center space-x-3">
                    {/* Edit Button */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
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
                      <Text className="text-sm">✏️</Text>
                    </TouchableOpacity>

                    {/* Delete Button */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        setDeleteTask(task);
                        setDeleteModalVisible(true);
                      }}
                      className="p-1.5 bg-[#FF7B7B]/15 rounded-xl border border-[#FF7B7B]/25"
                    >
                      <Text className="text-sm">🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 🔹 DATE & TIME */}
              {task.scheduledTime ? (
                <Text className="text-[#9FB5B5] text-xs mt-1 font-semibold">
                  {new Date(task.scheduledTime).toLocaleString()}
                </Text>
              ) : null}

              {/* 🔹 DETAILS BUTTON */}
              {task.details ? (
                <Pressable
                  onPress={() =>
                    setExpandedTaskId(
                      expandedTaskId === task.id ? null : task.id
                    )
                  }
                  className="mt-2"
                >
                  <Text className="text-[#66b9b9] text-xs font-bold">
                    {expandedTaskId === task.id
                      ? "Hide Details ▲"
                      : "Show Details ▼"}
                  </Text>
                </Pressable>
              ) : null}

              {/* 🔔 REMINDER DISPLAY COMPONENT */}
              {upcomingReminders.length > 0 ? (
                <View className="mt-3 p-3 rounded-2xl bg-[#123131]/80 border border-[#66b9b9]/25 shadow-sm shadow-[#66b9b9]/10">
                  <View className="flex-row items-center mb-1.5">
                    <View
                      className={`w-2 h-2 rounded-full mr-2 ${
                        Array.isArray(task.notificationId) &&
                        task.notificationId.length > 0
                          ? "bg-[#7DFFB3]"
                          : upcomingReminders.length > 0
                          ? "bg-[#FF7B7B]"
                          : "bg-[#9FB5B5]"
                      }`}
                    />
                    <Text className="text-[#66b9b9] text-[10px] font-bold tracking-widest uppercase">
                      {Array.isArray(task.notificationId) &&
                      task.notificationId.length > 0
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
                          🔔 {time}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* 💡 HELPER: Show a warning if the dot is red */}
                  {(!Array.isArray(task.notificationId) ||
                    task.notificationId.length === 0) && (
                    <Text className="text-[#FF7B7B] text-[9px] mt-1.5 font-bold">
                      ⚠️ Tap Edit & Save to re-arm alarms
                    </Text>
                  )}
                </View>
              ) : null}

              {/* 🔹 EXPANDED DETAILS */}
              {expandedTaskId === task.id && task.details ? (
                <View className="mt-2 p-3 bg-[#061414]/45 rounded-2xl border border-[#337a7a]/25">
                  <Text className="text-[#E8F4F4] text-xs leading-5">
                    {task.details}
                  </Text>
                </View>
              ) : null}

              <>
                {/* 2. SUBTASKS (Separate from details) */}
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
                          <Text className="text-[#061414] text-[8px] font-bold">✓</Text>
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
                        <Text className="text-[#FF7B7B] ml-2 text-xs">✕</Text>
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
              </>

              {/* 🔹 STATUS LABELS */}
              {lastCompletedTaskId === task.id && (
                <Text className="text-[#7DFFB3] text-[10px] mt-1 font-bold uppercase tracking-widest">
                  ✅ Last completed
                </Text>
              )}

              {activeTaskId === task.id && (
                <Text className="text-[#5EEAD4] text-[10px] mt-1 font-bold uppercase tracking-widest">
                  🎯 In Focus
                </Text>
              )}

              {/* 🔹 DURATION BUTTONS */}
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
                    ⏱ Custom
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              {/* 🔹 ERROR */}
              {showDurationError === task.id && (
                <Text className="text-[#FF7B7B] text-[10px] mt-1 font-bold">
                  ⏱ Please select focus time
                </Text>
              )}

              {/* 🔹 START BUTTON */}
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
                  {taskDurations[task.id] ? "▶ Start Focus" : "⏱ Select Focus Time"}
                </Text>
              </TouchableOpacity>

              {taskDurations[task.id] && (
                <Text className="text-[#99bdbd] text-[10px] mt-1.5 font-semibold">
                  ⏱ {formatDuration(taskDurations[task.id])} selected
                </Text>
              )}

              {/* Inside task.map... check if attachment exists */}
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
                    📎 View Attachment
                  </Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-[#061414]"
        contentContainerStyle={{
          paddingBottom: 160, // 👈 IMPORTANT - Kept exactly as original
        }}
      >
        <Text
          className="text-[#E8F4F4] text-[28px] font-black text-center mt-14 tracking-tight"
        >
          ADHD Task Manager <Text className="text-[#66b9b9]">✨</Text>
        </Text>

        {/* ✅ Daily Progress Banner */}
        <View className="bg-[#0B1F1F] p-5 rounded-[28px] mx-4 mt-6 mb-4 border border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/15">
          {/* Top Row */}
          <View className="flex-row justify-between mb-3 items-end">
            <Text className="text-[#E8F4F4] text-lg font-black uppercase tracking-widest">
              Daily Progress
            </Text>

            {/* RIGHT */}
            <View className="items-end">
              {totalTasks > 0 && (
                <Text className="text-[#9FB5B5] text-xs font-bold">
                  {completedTasks} / {totalTasks}
                </Text>
              )}

              <Text className="text-[#66b9b9] text-[10px] font-bold mt-1 tracking-widest uppercase">
                {totalFocusText}
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
                setPickerMode("task-date");
                setShowPicker(true);
              }}
              className="bg-[#061414]/45 p-4 rounded-2xl mb-3 border border-[#66b9b9]/25"
            >
              <Text className="text-[#E8F4F4] font-semibold text-sm">
                {scheduledDateTime
                  ? new Date(scheduledDateTime).toLocaleString()
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
      {activeTaskId ? (
        <TouchableOpacity
          onPress={() => {
            scrollRef.current?.scrollTo({
              y: activeFocusY.current,
              animated: true,
            });
          }}
          className="absolute bottom-32 right-6 bg-[#66b9b9] py-3 px-5 rounded-full shadow-2xl shadow-[#66b9b9]/40 border border-[#99bdbd]/70"
        >
          <Text className="text-[#061414] font-black uppercase tracking-widest text-xs">
            🎯 Focus
          </Text>
        </TouchableOpacity>
      ) : lastCompletedTaskId ? (
        <TouchableOpacity
          onPress={() => scrollToTask(lastCompletedTaskId)}
          className="absolute bottom-32 right-6 bg-[#7DFFB3] py-3 px-5 rounded-full shadow-2xl shadow-[#7DFFB3]/35 border border-[#7DFFB3]"
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
        className="absolute bottom-10 right-5"
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
        <View className="absolute bottom-6 left-5 right-5 bg-[#123131] p-4 rounded-2xl flex-row items-center border border-[#66b9b9]/30 shadow-2xl shadow-[#66b9b9]/15">
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

      {showPicker && (
        <DateTimePicker
          value={
            pickerMode?.includes("task")
              ? taskTempDate instanceof Date && !isNaN(taskTempDate.getTime())
                ? taskTempDate
                : new Date()
              : sectionTempDate instanceof Date &&
                !isNaN(sectionTempDate.getTime())
              ? sectionTempDate
              : new Date()
          }
          mode={pickerMode?.includes("date") ? "date" : "time"}
          display="default"
          onChange={(event, selectedDate) => {
            // Handle User Cancel
            if (event.type === "dismissed" || !selectedDate) {
              setShowPicker(false);
              setPickerMode(null);
              return;
            }

            // =====================
            // 🔹 SECTION START LOGIC
            // =====================
            if (pickerMode === "start-date") {
              setSectionTempDate(new Date(selectedDate));
              setPickerMode("start-time");
            } else if (pickerMode === "start-time") {
              const updated = new Date(sectionTempDate);
              updated.setHours(selectedDate.getHours());
              updated.setMinutes(selectedDate.getMinutes());
              const formatted = formatDateTime(updated);

              // Update State
              setSectionTimes((prev) => ({
                ...prev,
                [editingSection]: {
                  ...prev[editingSection],
                  start: formatted,
                },
              }));

              // Persist to DB independently of tasks
              const currentEnd = sectionTimes[editingSection]?.end || "";
              saveSectionConfig(editingSection, formatted, currentEnd);

              setShowPicker(false);
              setPickerMode(null);
            }

            // =====================
            // 🔹 SECTION END LOGIC
            // =====================
            else if (pickerMode === "end-date") {
              setSectionTempDate(new Date(selectedDate));
              setPickerMode("end-time");
            } else if (pickerMode === "end-time") {
              const updated = new Date(sectionTempDate);
              updated.setHours(selectedDate.getHours());
              updated.setMinutes(selectedDate.getMinutes());
              const formatted = formatDateTime(updated);

              // Update State
              setSectionTimes((prev) => ({
                ...prev,
                [editingSection]: { ...prev[editingSection], end: formatted },
              }));

              // Persist to DB independently of tasks
              const currentStart = sectionTimes[editingSection]?.start || "";
              saveSectionConfig(editingSection, currentStart, formatted);

              setShowPicker(false);
              setPickerMode(null);
            }

            // =====================
            // 🔹 TASK LOGIC
            // =====================
            else if (pickerMode === "task-date") {
              setTaskTempDate(new Date(selectedDate));
              setPickerMode("task-time");
            } else if (pickerMode === "task-time") {
              const updated = new Date(taskTempDate);
              updated.setHours(selectedDate.getHours());
              updated.setMinutes(selectedDate.getMinutes());

              // Apply time restrictions based on section boundaries
              const restricted = restrictToSection(selectedSection, updated);
              setScheduledDateTime(restricted.toISOString());
              setTimeAdjusted(updated.getTime() !== restricted.getTime());

              setShowPicker(false);
              setPickerMode(null);
            }
          }}
        />
      )}

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
