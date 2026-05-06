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
} from "react-native";
import { useState, useEffect, useRef} from "react";
import { db, initDB } from "../../database/db";
import Svg, { Circle } from "react-native-svg";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from 'expo-document-picker';

import { WebView } from 'react-native-webview'; // For PDF viewing

//*************main component function********* */

export default function Home() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Drink water 💧", section: "Morning", completed: false },
    { id: 2, title: "Goto office 💼", section: "Work", completed: false },
    { id: 3, title: "Walk 10 minutes 🚶", section: "Evening", completed: false },
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

const completedTasks = tasks.filter(t => t.completed).length;

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
  
  let ringColor = "#FFB84D"; // reddish gold

if (progress >= 0.5) {
  ringColor = "#39FF14"; // green
} else if (progress >= 0.25) {
  ringColor = "#00FFFF"; // blue
}

  //******useRef********** */

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const activeFocusY = useRef(0);
  const fabScale = useRef(new Animated.Value(1)).current;
  const taskPositions = useRef({});
  const sectionPositions = useRef({});
  const shakeAnim = useRef(new Animated.Value(0)).current;

  //**************useEffect */
// 🟢 Add this at the very top of your app or in your DB setup file
useEffect(() => {
  try {
    // 1. Create the table if it doesn't exist
    db.execSync(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        section TEXT,
        completed INTEGER,
        scheduledTime TEXT,
        details TEXT,
        attachment TEXT,
        subtasks TEXT DEFAULT '[]'
      );
    `);

    // 2. ❗ CRITICAL FOR APK: Check if 'subtasks' column exists (migration)
    // This prevents the app from crashing on phones that had an older version
    const tableInfo = db.getAllSync("PRAGMA table_info(tasks)");
    const hasSubtasks = tableInfo.some(column => column.name === 'subtasks');

    if (!hasSubtasks) {
      db.execSync("ALTER TABLE tasks ADD COLUMN subtasks TEXT DEFAULT '[]';");
      console.log("Migration: Added subtasks column");
    }
  } catch (e) {
    console.log("DB Initialization Error:", e);
  }
}, []);


  useEffect(() => {
  if (scheduledDateTime) {
    setTimeError(false);
  }
}, [scheduledDateTime]);

useEffect(() => {
  if (lastDeletedTask) {
    setUndoTimer(10); // reset to 10

    const interval = setInterval(() => {
      setUndoTimer(prev => {
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
    setTaskName(editingTask.title)
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
      setFocusTime(prev => {
        const next = prev + 1;

        // ✅ STOP when duration reached
        if (next >= currentDuration) {
          clearInterval(interval);
          setIsTimerRunning(false);
          showCelebration("🔥 Amazing focus! You stayed consistent 💪", "⏱");

          // add to total focus time
          setTotalFocusTime(total => total + currentDuration);

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

  // ✅ LOAD FROM DB
  // ✅ Update the useEffect in Home.js
useEffect(() => {
  try {
    const result = db.getAllSync("SELECT * FROM tasks");

    const loadedTasks = result.map((t) => ({
      ...t,
      completed: t.completed === 1,
    }));

    if (loadedTasks.length > 0) {
      setTasks(loadedTasks);

      // 🆕 Extract section times from the tasks themselves
      const newSectionTimes = { ...sectionTimes };
      loadedTasks.forEach(task => {
        if (task.sectionStart || task.sectionEnd) {
          newSectionTimes[task.section] = {
            start: task.sectionStart || "",
            end: task.sectionEnd || ""
          };
        }
      });
      setSectionTimes(newSectionTimes);
    }
  } catch (error) {
    console.log("DB Load Error:", error);
  }
}, []);

  // ✅ Load everything on start
useEffect(() => {
  try {
    // Load Tasks
    const taskResult = db.getAllSync("SELECT * FROM tasks");
    setTasks(taskResult.map(t => ({ ...t, completed: t.completed === 1 })));

    // Load Section Settings
    const settingsResult = db.getAllSync("SELECT * FROM section_settings");
    if (settingsResult.length > 0) {
      const savedTimes = { ...sectionTimes };
      settingsResult.forEach(row => {
        savedTimes[row.section_name] = {
          start: row.start_time || "",
          end: row.end_time || ""
        };
      });
      setSectionTimes(savedTimes);
    }
  } catch (error) {
    console.log("Load Error:", error);
  }
}, []);
  
  //*****handler functions*********** */
  // ✅ TOGGLE TASK
  const toggleTask = (id: any) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === id) {
          const updated = !task.completed;
          // 🧠 STOP TIMER IF ACTIVE TASK COMPLETED
          if (updated === true) {
            setLastCompletedTaskId(task.id);
              showCelebration("🎉 Task completed! Keep going 🚀", "✅");
}
if (task.id === activeTaskId && updated === true) {
  setIsTimerRunning(false);

  // save current session into total
  if (focusTime > 0) {
    setTotalFocusTime((total) => total + focusTime);
  }

  setFocusTime(0);
  setActiveTaskId(null);
}

          try {
            db.runSync(
              "UPDATE tasks SET completed = ? WHERE id = ?",
              [updated ? 1 : 0, id]
            );
          } catch (e) {
            console.log("Update error:", e);
          }

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
    setTotalFocusTime(total => total + focusTime);
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
  setIsTimerRunning(prev => {
    const newState = !prev;

    // If stopping timer → add session to total
    if (prev === true && newState === false) {
      setTotalFocusTime(total => total + focusTime);
    }

    return newState;
  });
};

const pauseFocus = () => {
  setIsTimerRunning(false);
};
  
  const activeTask = tasks.find(t => t.id === activeTaskId);


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
  const task = tasks.find(t => t.id === taskId);
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
    Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
    Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
  ]).start();
};
  
  const showCelebration = (message, emoji = "🎉") => {
  setCelebration({ visible: true, message, emoji });

  // auto close after 2.5 sec
  setTimeout(() => {
    setCelebration((prev) => ({ ...prev, visible: false }));
  }, 5500);
};
  
  
  const handleSaveTask = () => {
  if (!taskName.trim()) return;

  // 1. Time Logic (Your original logic)
  let finalTime = scheduledDateTime;
  if (scheduledDateTime) {
    const parsed = parseDateTime(scheduledDateTime);
    if (parsed) {
      const dateObj = new Date(parsed);
      const corrected = restrictToSection(selectedSection, dateObj);
      finalTime = formatDateTime(corrected);
    }
  }

  // 2. Subtasks Logic (Preserve existing or start new)
  const subtasksToSave = (isEditMode && editingTask?.subtasks) ? editingTask.subtasks : [];
  const subtasksJSON = JSON.stringify(subtasksToSave);

  if (isEditMode && editingTask) {
    // 🔁 UPDATE TASK
    try {
      db.runSync(
        `UPDATE tasks 
         SET title = ?, section = ?, scheduledTime = ?, details = ?, attachment = ?, subtasks = ? 
         WHERE id = ?`,
        [
          taskName,
          selectedSection,
          finalTime, 
          taskDetails,
          attachmentUri || "",
          subtasksJSON, 
          editingTask.id,
        ]
      );

      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id
            ? { ...t, title: taskName, section: selectedSection, scheduledTime: finalTime, details: taskDetails, attachment: attachmentUri, subtasks: subtasksToSave }
            : t
        )
      );
    } catch (error) {
      console.log("APK Update Error:", error);
    }
  } else {
    // ➕ CREATE TASK
    const newId = Date.now();
    try {
      db.runSync(
        `INSERT INTO tasks 
         (title, section, completed, scheduledTime, details, attachment, subtasks) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          taskName,
          selectedSection,
          0, // completed = false
          finalTime,
          taskDetails,
          attachmentUri || "",
          subtasksJSON, 
        ]
      );

      const newTask = {
        id: newId,
        title: taskName,
        section: selectedSection,
        completed: false,
        scheduledTime: finalTime,
        details: taskDetails,
        attachment: attachmentUri,
        subtasks: subtasksToSave, // This is the array for React state
      };

      setTasks((prev) => [...prev, newTask]);
    } catch (error) {
      console.log("APK Insert Error:", error);
      // This is usually where the 'Empty List' bug hides!
    }
  }

  // 🧹 Cleanup
  setAttachmentUri(null);
  setAttachmentName("");
  resetTaskForm();
};
  
  
  const confirmDeleteTask = () => {
  if (!deleteTask) return;

  // save for undo
  setLastDeletedTask(deleteTask);

  // delete from DB
  db.runSync("DELETE FROM tasks WHERE id = ?", [deleteTask.id]);

  // update UI
  setTasks(prev => prev.filter(t => t.id !== deleteTask.id));

  // close modal
  setDeleteModalVisible(false);
  setDeleteTask(null);
};
  
  const handleUndoDelete = () => {
  if (!lastDeletedTask) return;

  db.runSync(
    "INSERT INTO tasks (id, title, section) VALUES (?, ?, ?)",
    [
      lastDeletedTask.id,
      lastDeletedTask.title,
      lastDeletedTask.section,
    ]
  );

  setTasks(prev => [...prev, lastDeletedTask]);
  setLastDeletedTask(null);
};
  
  // ✅ Update handleSaveSectionTime in Home.js
const handleSaveSectionTime = () => {
  if (!editingSection) return;

  // 1. Update the UI State
  setSectionTimes(prev => ({
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
    "JAN","FEB","MAR","APR","MAY","JUN",
    "JUL","AUG","SEP","OCT","NOV","DEC"
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
  if (!str) return Infinity;

  try {
    const [datePart, timePart, ampm] = str.split(" ");

    const [day, monthStr, year] = datePart.split("-");
    const months = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };

    let [hours, minutes] = timePart.split(":").map(Number);

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    const date = new Date(year, months[monthStr], day, hours, minutes);

    return date.getTime();
  } catch {
    return Infinity;
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

  const selectedMin =
    dateObj.getHours() * 60 + dateObj.getMinutes();

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
    db.runSync(
      "UPDATE tasks SET subtasks = ? WHERE id = ?",
      [JSON.stringify(updatedSubtasks), taskId]
    );
  } catch (e) {
    console.log("Error saving subtasks:", e);
  }
};

const addSubtask = (taskId, title) => {
  if (!title.trim()) return;
  setTasks(prev => prev.map(task => {
    if (task.id === taskId) {
      const newSubtask = { id: Date.now(), title, completed: false };
      const updatedSubtasks = [...(task.subtasks || []), newSubtask];
      updateSubtasksInDB(taskId, updatedSubtasks);
      return { ...task, subtasks: updatedSubtasks };
    }
    return task;
  }));
};

const toggleSubtask = (taskId, subtaskId) => {
  setTasks(prev => prev.map(task => {
    if (task.id === taskId) {
      const updatedSubtasks = task.subtasks.map(st => 
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      );
      updateSubtasksInDB(taskId, updatedSubtasks);
      return { ...task, subtasks: updatedSubtasks };
    }
    return task;
  }));
};

const deleteSubtask = (taskId, subtaskId) => {
  setTasks(prev => prev.map(task => {
    if (task.id === taskId) {
      const updatedSubtasks = task.subtasks.filter(st => st.id !== subtaskId);
      updateSubtasksInDB(taskId, updatedSubtasks);
      return { ...task, subtasks: updatedSubtasks };
    }
    return task;
  }));
};

// Update your useEffect (Load from DB) to parse the JSON string
useEffect(() => {
  try {
    const result = db.getAllSync("SELECT * FROM tasks");

    const loadedTasks = result.map((t) => ({
      ...t,
      completed: t.completed === 1,
      // 🟢 SAFE PARSE: If subtasks is null or invalid, default to []
      subtasks: (() => {
        try {
          return t.subtasks ? JSON.parse(t.subtasks) : [];
        } catch (e) {
          return [];
        }
      })(),
    }));

    setTasks(loadedTasks);
    // ... rest of your sectionTimes logic
  } catch (error) {
    console.log("Load Error:", error);
  }
}, []);
  

  
  
  //*********Component Start UI*** */

  const renderSection = (title: string, section: string) => {
    const sectionTasks = tasks
  .filter((t) => t.section === section)
  .sort((a, b) => {
    // ✅ 1. Completed tasks go last
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    // ✅ 2. Sort by time
    return parseDateTime(a.scheduledTime) - parseDateTime(b.scheduledTime);
  });

    return (
      <View style={{ padding: 16 }}
       onLayout={(event) => {
    sectionPositions.current[section] = event.nativeEvent.layout.y;
  }}
      >
       <View style={{ marginBottom: 8 }}>

  {/* Title + Edit */}
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    <Text style={{ color: "#FFD700", fontSize: 16 }}>
      {title}
    </Text>

    
  </View>

  {/* Time BELOW title */}
 <TouchableOpacity
  onPress={() => {
    setEditingSection(section); // ✅ ADD THIS LINE
    setPickerMode("start-date");
    setShowPicker(true);
  }}
  style={{
    backgroundColor: "#2A2A2A",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  }}
>
  <Text style={{ color: "white" }}>
    Start: {sectionTimes[section]?.start || "Select Start Date & Time"}
  </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
   onPress={() => {
    setEditingSection(section); // ✅ ADD THIS LINE
    setPickerMode("end-date");
    setShowPicker(true);
  }}
  style={{
    backgroundColor: "#2A2A2A",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  }}
>
  <Text style={{ color: "white" }}>
   End: {sectionTimes[section]?.end || "Select End Date & Time"}
  </Text>
</TouchableOpacity>

</View>

        {sectionTasks.map((task) => {
          const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter(s => s.completed).length;
          return (
            <TouchableOpacity
              key={task.id}
              onLayout={(event) => {
                taskPositions.current[task.id] = event.nativeEvent.layout.y;
              }}
              style={{
    backgroundColor: 
      activeTaskId === task.id 
        ? "#0F1F0F" 
        : task.completed // 🟢 Change here: highlight all completed tasks
        ? "#1A1A10" // Subtle dark gold background
        : "#1E1E1E",

    padding: 16,
    borderRadius: 12,
    marginBottom: 10,

    // ─── BORDER LOGIC ───
    borderWidth: 
      activeTaskId === task.id 
        ? 2 
        : task.completed // 🟢 Add golden border if completed
        ? 2 
        : 0,

    borderColor: 
      activeTaskId === task.id 
        ? "#39FF14" // Active = Neon Green
        : task.completed 
        ? "#FFD700" // Completed = Gold
        : "transparent",

    // ─── GLOW EFFECT (Optional) ───
    shadowColor: task.completed ? "#FFD700" : "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: task.completed ? 0.5 : 0,
    shadowRadius: task.completed ? 5 : 0,
    elevation: task.completed ? 5 : 0,
  }}
            >
              {/* 🔹 ROW 1: MAIN */}
              <View style={{ 
  flexDirection: "row", 
  alignItems: "center", 
                justifyContent: "space-between",
  padding:0,
                  marginBottom: 0,// Tiny gap before the golden line
                backgroundColor: "#043f23",
                borderColor: "#fa7d17",
                borderBottomWidth: 2
  
}}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {/* Checkbox */}
                <TouchableOpacity
                  onPress={() => toggleTask(task.id)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: "#FFD700",
                    marginRight: 10,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: task.completed ? "#FFD700" : "transparent",
                  }}
                >
                  {task.completed && (
                    <Text style={{ color: "black", fontSize: 12 }}>✓</Text>
                  )}
                </TouchableOpacity>

               {/* ─── DISTINGUISHED HEADER ─── */}

  
  {/* Left Side: Title Group */}
  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 }}>
    {/* Optional: If you keep your Checkbox here, place it before the Text */}
    <Text
      numberOfLines={2} // Prevents title from breaking the layout
      style={{
        color: task.completed ? "#9ff797" : "white",
        textDecorationLine: task.completed ? "line-through" : "none",
        fontSize: 17,        // Slightly larger for distinction
        fontWeight: "700",   // Bold weight
        flex: 1,
        letterSpacing: 0.5,
      }}
    >
      {task.title}
    </Text>
  </View>

  {/* Right Side: Action Group */}
  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
    
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
      style={{
        padding: 6,
        backgroundColor: "rgba(255, 215, 0, 0.1)", // Subtle golden glow
        borderRadius: 8,
      }}
    >
      <Text style={{ fontSize: 18 }}>✏️</Text>
    </TouchableOpacity>

    {/* Delete Button */}
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        setDeleteTask(task);
        setDeleteModalVisible(true);
      }}
      style={{
        padding: 6,
        backgroundColor: "rgba(255, 68, 68, 0.1)", // Subtle red glow
        borderRadius: 8,
      }}
    >
      <Text style={{ fontSize: 18 }}>🗑️</Text>
    </TouchableOpacity>
    
  </View>
</View>

{/* GOLDEN LINE (Placed immediately after Header) */}
<View style={{ height: 1.5, backgroundColor: "#FFD700", marginVertical: 8, opacity: 0.5 }} />
              </View>

              {/* 🔹 DATE & TIME */}
              {task.scheduledTime ? (
                <Text style={{ color: "#888", fontSize: 12, marginTop: 6 }}>
                  {task.scheduledTime}
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
                  style={{ marginTop: 6 }}
                >
                  <Text style={{ color: "#FFD700", fontSize: 12 }}>
                    {expandedTaskId === task.id
                      ? "Hide Details ▲"
                      : "Show Details ▼"}
                  </Text>
                </Pressable>
              ) : null}

              {/* 🔹 EXPANDED DETAILS */}
              {expandedTaskId === task.id && task.details ? (
                <View
                  style={{
                    marginTop: 8,
                    padding: 10,
                    backgroundColor: "#1E1E1E",
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: "#ccc", fontSize: 13 }}>
                    {task.details}
                  </Text>
                </View>
              ) : null}

              <>{/* 2. SUBTASKS (Separate from details) */}
        <View style={{ paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#FFD700', marginVertical: 5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: '#1688e6', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>Small Tasks</Text>
            {totalSubtasks > 0 && (
              <Text style={{ color: '#888', fontSize: 10 }}>{completedSubtasks}/{totalSubtasks}</Text>
            )}
          </View>

          {subtasks.map((sub) => (
            <View key={sub.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <TouchableOpacity 
                onPress={() => toggleSubtask(task.id, sub.id)}
                style={{
                  width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#FFD700',
                  marginRight: 10, backgroundColor: sub.completed ? '#FFD700' : 'transparent',
                  justifyContent: 'center', alignItems: 'center'
                }}
              >
                {sub.completed && <Text style={{ color: 'black', fontSize: 9 }}>✓</Text>}
              </TouchableOpacity>
              <Text style={{ color: sub.completed ? '#666' : 'white', flex: 1, fontSize: 13 }}>{sub.title}</Text>
              <TouchableOpacity onPress={() => deleteSubtask(task.id, sub.id)}>
                <Text style={{ color: '#ff4444', marginLeft: 10 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TextInput
            placeholder="+ Add step..."
            placeholderTextColor="#555"
            onSubmitEditing={(e) => { addSubtask(task.id, e.nativeEvent.text); e.currentTarget.clear(); }}
            style={{ color: 'white', fontSize: 13, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#333' }}
          />
        </View></>

              {/* 🔹 STATUS LABELS */}
              {lastCompletedTaskId === task.id && (
                <Text style={{ color: "#FFD700", fontSize: 11, marginTop: 4 }}>
                  ✅ Last completed
                </Text>
              )}

              {activeTaskId === task.id && (
                <Text style={{ color: "#39FF14", fontSize: 11 }}>
                  🎯 In Focus
                </Text>
              )}

              <>

                {/* 🔹 SUBTASKS SECTION */}
                {expandedTaskId === task.id && (
                  <View style={{ marginTop: 10, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: '#444' }}>
                    <Text style={{ color: '#FFD700', fontSize: 12, marginBottom: 5 }}>Subtasks</Text>
    
                    {/* List Subtasks */}
                    {(task.subtasks || []).map((sub) => (
                      <View key={sub.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TouchableOpacity
                          onPress={() => toggleSubtask(task.id, sub.id)}
                          style={{
                            width: 20, height: 20, borderRadius: 3, borderWidth: 1,
                            borderColor: '#FFD700', marginRight: 10,
                            backgroundColor: sub.completed ? '#FFD700' : 'transparent',
                            justifyContent: 'center', alignItems: 'center'
                          }}
                        >
                          {sub.completed && <Text style={{ color: 'black', fontSize: 10 }}>✓</Text>}
                        </TouchableOpacity>
        
                        <Text style={{ color: sub.completed ? '#666' : 'white', flex: 1, fontSize: 13, textDecorationLine: sub.completed ? 'line-through' : 'none' }}>
                          {sub.title}
                        </Text>

                        <TouchableOpacity onPress={() => deleteSubtask(task.id, sub.id)}>
                          <Text style={{ color: '#ff4444', fontSize: 12 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* Add Subtask Input */}
                    <TextInput
                      placeholder="+ Add subtask..."
                      placeholderTextColor="#666"
                      onSubmitEditing={(e) => {
                        addSubtask(task.id, e.nativeEvent.text);
                        e.currentTarget.clear();
                      }}
                      style={{
                        color: 'white',
                        fontSize: 13,
                        backgroundColor: '#2A2A2A',
                        padding: 5,
                        borderRadius: 5,
                        marginTop: 5
                      }}
                    />
                  </View>
                )}</>
              {/* 🔹 DURATION BUTTONS */}
              <Animated.View
                style={{
                  flexDirection: "row",
                  marginTop: 8,
                  transform: [{ translateX: shakeAnim }],
                }}
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
                    style={{
                      padding: 6,
                      borderRadius: 6,
                      marginRight: 6,
                      backgroundColor:
                        showDurationError === task.id
                          ? "#552222"
                          : taskDurations[task.id] === min * 60
                            ? "#FFD700"
                            : "#333",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          taskDurations[task.id] === min * 60
                            ? "black"
                            : "white",
                        fontSize: 12,
                      }}
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
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    backgroundColor:
                      showDurationError === task.id ? "#552222" : "#444",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 12 }}>
                    ⏱ Custom
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              {/* 🔹 ERROR */}
              {showDurationError === task.id && (
                <Text style={{ color: "#FF6B6B", fontSize: 12, marginTop: 4 }}>
                  ⏱ Please select focus time
                </Text>
              )}
            
              {/* 🔹 START BUTTON */}
              <Text
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
                style={{
                  color: taskDurations[task.id] ? "#FFD700" : "#f7a0a0",
                  marginTop: 8,
                  fontWeight: "600",
                }}
              >
                {taskDurations[task.id] ? "▶ Start" : "⏱ Select Focus Time"}
              </Text>

              {taskDurations[task.id] && (
                <Text style={{ color: "#fa57e4", fontSize: 12, marginTop: 6 }}>
                  ⏱ {formatDuration(taskDurations[task.id])} selected
                </Text>
              )}
            
              {/* Inside task.map... check if attachment exists */}
              {task.attachment ? (
                <TouchableOpacity
                  onPress={() => {
                    const isPdf = task.attachment.toLowerCase().endsWith('.pdf');
                    setCurrentFile({ uri: task.attachment, type: isPdf ? 'pdf' : 'image' });
                    setViewerVisible(true);
                  }}
                  style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text style={{ color: "#00FFFF", fontSize: 13, textDecorationLine: 'underline' }}>
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
        style={{ flex: 1, backgroundColor: "black" }}
        contentContainerStyle={{
    paddingBottom: 160, // 👈 IMPORTANT
  }}
      >
        <Text
          style={{
            color: "yellow",
            fontSize: 20,
            textAlign: "center",
            marginTop: 40,
          }}
        >
          ADHD Task Manager 🚀
        </Text>
        
        


        {/* ✅ Daily Progress Banner */}
<View
  style={{
    backgroundColor: "#1E1E1E",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  }}
>
  {/* Top Row */}
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    }}
  >
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
      Daily Progress 🚀
    </Text>

     {/* RIGHT */}
  <View style={{ alignItems: "flex-end" }}>
    {totalTasks > 0 && (
      <Text style={{ color: "#aaa", fontSize: 14 }}>
        {completedTasks} / {totalTasks}
      </Text>
    )}

    <Text style={{ color: "#FFD700", fontSize: 12, marginTop: 2 }}>
      {totalFocusText}
    </Text>
  </View>
         
  </View>

  {/* Empty State OR Progress */}
  {totalTasks === 0 ? (
    <Text style={{ color: "#888" }}>
      Ready to start? ✨
    </Text>
  ) : (
    <View
      style={{
        height: 8,
        backgroundColor: "#333",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <Animated.View
  style={{
    width: progressAnim.interpolate({
      inputRange: [0, 100],
      outputRange: ["0%", "100%"],
    }),
    height: "100%",
    backgroundColor: "#FFD700",
  }}
/>
    </View>
  )}
</View>

        
        {activeTaskId && (
  <View style={{
    backgroundColor: "#1E1E1E",
    margin: 16,
    padding: 12,
    borderRadius: 12,
  }}>
    <Text style={{ color: "#FFD700" }}>
      Active Focus 🎯
    </Text>

   {activeTaskId && (
              <View
        
                style={{ alignItems: "center", marginTop: 20 }}>

    {/* SECTION NAME */}
    <Text
  style={{
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
  }}
>
      {
        tasks.find(t => t.id === activeTaskId)?.section
      }
    </Text>

    {/* RING */}
    <View style={{ justifyContent: "center", alignItems: "center" }}>
      <Svg width={240} height={240}>
  {/* Background */}
  <Circle
    cx="110"
    cy="110"
    r="100"
    stroke="#333"
    strokeWidth="10"
    fill="none"
  />

  {/* Progress Ring */}
 <Circle
  cx="110"
  cy="110"
  r="100"
  stroke={ringColor}
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
      <View style={{
        position: "absolute",
        alignItems: "center"
      }}>
       <Text
  style={{
    color: "#FFB84D", // reddish gold 🔥
    fontSize: 26,
    fontWeight: "bold",
  }}
>
          {focusTimeText}
        </Text>
      </View>
    </View>

                {/* TASK NAME */}
                
       <Text
  onPress={() => scrollToTask(activeTaskId)}
  style={{
    color: "#FFD700",
    textAlign: "center",
    textDecorationLine: "underline",
  }}
>
  {tasks.find(t => t.id === activeTaskId)?.title}
                </Text>
                
                {/* Task assigned durration */}

                {activeTaskDuration && (
  <Text
    style={{
      color: "#00FFFF",
      fontSize: 13,
      marginTop: 4,
      textAlign: "center",
    }}
  >
    ⏱ {formatDuration(activeTaskDuration)} session
  </Text>
)}
                

    {/* CONTROL */}
    <Text
      onPress={toggleTimer}
      style={{ color: "#FFD700", marginTop: 10 }}
    >
      {isTimerRunning ? "⏸ Pause" : "▶ Resume"}
    </Text>

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
        <ScrollView
  style={{ backgroundColor: "#1E1E1E", borderRadius: 15 }}
  contentContainerStyle={{ padding: 20 }}
>
          <View
            style={{
              backgroundColor: "#1E1E1E",
              padding: 20,
              borderRadius: 15,
            }}
          >
            <Text style={{ color: "#FFD700", fontSize: 18, marginBottom: 10 }}>
              {isEditMode ? "Edit Task ✏️" : "New Task ✨"}
            </Text>

            <TextInput
              placeholder="Enter task..."
              placeholderTextColor="#888"
              value={taskName}
              onChangeText={setTaskName}
              style={{
                backgroundColor: "#2A2A2A",
                color: "white",
                padding: 10,
                borderRadius: 8,
                marginBottom: 15,
              }}
            />
<TextInput
  placeholder="Add details (optional)"
  placeholderTextColor="#888"
  value={taskDetails}
  onChangeText={setTaskDetails}
  multiline
  textAlignVertical="top"
  onContentSizeChange={(e) => {
    setDetailsHeight(e.nativeEvent.contentSize.height);
  }}
  style={{
    backgroundColor: "#2A2A2A",
    color: "white",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    minHeight: 80,
    height: Math.max(80, detailsHeight), // 👈 dynamic
  }}
            />
  
           

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 15,
              }}
            >
              {["Morning", "Work", "Evening"].map((sec) => (
                <TouchableOpacity
                  key={sec}
                  onPress={() => setSelectedSection(sec)}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor:
                      selectedSection === sec ? "#FFD700" : "#333",
                  }}
                >
                  <Text
                    style={{
                      color: selectedSection === sec ? "black" : "white",
                    }}
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
  style={{
    backgroundColor: "#2A2A2A",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  }}
>
  <Text style={{ color: "white" }}>
    {scheduledDateTime || "Select Date & Time"}
  </Text>
            </TouchableOpacity>

            {timeAdjusted && (
  <Text style={{ color: "#888", marginBottom: 10 }}>
    ⏱ Adjusted to section time
  </Text>
)}
            {scheduledDateTime ? (
  <Text style={{ color: "#888", fontSize: 12, marginBottom: 10 }}>
    {scheduledDateTime}
  </Text>
) : null}

            <TouchableOpacity
              onPress={handleSaveTask} 
              style={{
                backgroundColor: "#FFD700",
                padding: 12,
                borderRadius: 10,
              }}
            >

              
              <Text
                style={{
                  textAlign: "center",
                  color: "black",
                  fontWeight: "bold",
                }}
              >
                {isEditMode ? "Update Task" : "Save Task"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text
                style={{
                  color: "#888",
                  textAlign: "center",
                  marginTop: 10,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
          {timeError && (
  <Text style={{ color: "#FF6B6B", marginBottom: 10 }}>
    ⚠️ Task time must be within section time
  </Text>
          )}
          
          {/* Inside Task Modal ScrollView */}
<TouchableOpacity 
  onPress={pickDocument}
  style={{
    backgroundColor: "#333",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: attachmentUri ? "#39FF14" : "#444",
    flexDirection: 'row',
    alignItems: 'center'
  }}
>
  <Text style={{ color: "white", flex: 1 }}>
    {attachmentUri ? `📎 ${attachmentName || "File Selected"}` : "📁 Upload Image or PDF"}
  </Text>
  {attachmentUri && (
    <TouchableOpacity onPress={() => setAttachmentUri(null)}>
      <Text style={{ color: "#FF6B6B", fontWeight: 'bold' }}>Remove</Text>
    </TouchableOpacity>
  )}
</TouchableOpacity>
        </ScrollView>
      </Modal>


      {/* Section Date Time Modal */}

      <Modal visible={timeModalVisible} transparent animationType="fade">
  <View
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      padding: 20,
    }}
  >
    <View
      style={{
        backgroundColor: "#1E1E1E",
        padding: 20,
        borderRadius: 15,
      }}
    >
      <Text style={{ color: "#FFD700", fontSize: 18, marginBottom: 10 }}>
        Set Focus Time ⏱
      </Text>

      {/* Inputs */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TextInput
          keyboardType="numeric"
          value={customHour}
          onChangeText={setCustomHour}
          placeholder="HH"
          placeholderTextColor="#888"
          style={{
            flex: 1,
            backgroundColor: "#2A2A2A",
            color: "white",
            padding: 10,
            borderRadius: 8,
            textAlign: "center",
          }}
        />

        <TextInput
          keyboardType="numeric"
          value={customMinute}
          onChangeText={setCustomMinute}
          placeholder="MM"
          placeholderTextColor="#888"
          style={{
            flex: 1,
            backgroundColor: "#2A2A2A",
            color: "white",
            padding: 10,
            borderRadius: 8,
            textAlign: "center",
          }}
        />
      </View>

      {/* Save */}
      <TouchableOpacity
        onPress={saveCustomTime}
        style={{
          backgroundColor: "#FFD700",
          padding: 12,
          borderRadius: 10,
          marginTop: 15,
        }}
      >
        <Text style={{ textAlign: "center", color: "black", fontWeight: "bold" }}>
          Save Time
        </Text>
      </TouchableOpacity>

      {/* Cancel */}
      <TouchableOpacity onPress={() => setTimeModalVisible(false)}>
        <Text
          style={{
            color: "#888",
            textAlign: "center",
            marginTop: 10,
          }}
        >
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
    style={{
      position: "absolute",
      bottom: 30,
      right: 20,
      backgroundColor: "#FFD700",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 30,
      elevation: 5,
    }}
  >
    <Text style={{ color: "black", fontWeight: "bold" }}>
      🎯 Focus
    </Text>
  </TouchableOpacity>
) : lastCompletedTaskId ? (
  <TouchableOpacity
    onPress={() => scrollToTask(lastCompletedTaskId)}
    style={{
      position: "absolute",
      bottom: 30,
      right: 20,
      backgroundColor: "#39FF14",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 30,
      elevation: 5,
    }}
  >
    <Text style={{ color: "black", fontWeight: "bold" }}>
      ✅ Last Completed
    </Text>
  </TouchableOpacity>
) : null}
      
      <Animated.View
  style={{
    position: "absolute",
    bottom: 100,
    right: 20,
    transform: [{ scale: fabScale }],
  }}
>
  <Pressable
    onPress={openModal}
    onPressIn={handlePressIn}
    onPressOut={handlePressOut}
    android_ripple={{ color: "#d4af37", borderless: false }}
    style={{
      backgroundColor: "#FFD700",
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 30,
      overflow: "hidden", // needed for ripple
    }}
  >
   
     <Text
      style={{
        color: "black",
        fontSize: 20,
        marginRight: 6,
        fontWeight: "bold",
      }}
    >+</Text> 
    

    <Text
      style={{
        color: "black",
        fontSize: 14,
        fontWeight: "600",
      }}
    >
       Add Task
    </Text>
  </Pressable>
      </Animated.View>
      
      <Modal visible={celebration.visible} transparent animationType="fade">
  <View
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Animated.View
      style={{
        transform: [{ scale: modalScale }],
        backgroundColor: "#1E1E1E",
        padding: 25,
        borderRadius: 20,
        alignItems: "center",
        width: "80%",
        borderWidth: 1,
        borderColor: "#FFD700",
      }}
    >
      {/* Emoji */}
      <Text style={{ fontSize: 40 }}>
        {celebration.emoji}
      </Text>

      {/* Message */}
      <Text
        style={{
          color: "#FFD700",
          fontSize: 18,
          textAlign: "center",
          marginTop: 10,
          fontWeight: "600",
        }}
      >
        {celebration.message}
      </Text>

      {/* Button */}
      <TouchableOpacity
        onPress={() =>
          setCelebration((prev) => ({ ...prev, visible: false }))
        }
        style={{
          marginTop: 20,
          backgroundColor: "#FFD700",
          paddingVertical: 10,
          paddingHorizontal: 20,
          borderRadius: 10,
        }}
      >
        <Text style={{ color: "black", fontWeight: "bold" }}>
          Continue
        </Text>
      </TouchableOpacity>
    </Animated.View>
  </View>
      </Modal>
      
      <Modal visible={deleteModalVisible} transparent animationType="fade">
  <View
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      padding: 20,
    }}
  >
    <View
      style={{
        backgroundColor: "#1E1E1E",
        padding: 20,
        borderRadius: 15,
      }}
    >
      <Text style={{ color: "#FFD700", fontSize: 18, marginBottom: 10 }}>
        Delete Task
      </Text>

      <Text style={{ color: "white", marginBottom: 20 }}>
        Are you sure you want to delete "{deleteTask?.title}" task?
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <TouchableOpacity
          onPress={() => setDeleteModalVisible(false)}
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: "#333",
          }}
        >
          <Text style={{ color: "white" }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={confirmDeleteTask}
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: "#FFD700",
          }}
        >
          <Text style={{ color: "black", fontWeight: "bold" }}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
      </Modal>
      {lastDeletedTask && (
  <View
    style={{
      position: "absolute",
      bottom: 20,
      left: 20,
      right: 20,
      backgroundColor: "#2A2A2A",
      padding: 12,
      borderRadius: 10,
      flexDirection: "row",
      
      alignItems: "center",
    }}
  >
   <Text
  style={{
    color: "white",
    flex: 1,           // 🔥 important
    flexWrap: "wrap",  // 🔥 allows multiline
    marginRight: 10,
  }}
>
  Task <Text style={{ color: "#FFD700" }}>
    {lastDeletedTask?.title}
  </Text>{" "}
  deleted ({undoTimer}s)
</Text>

    <TouchableOpacity onPress={handleUndoDelete}>
      <Text style={{ color: "#FFD700", fontWeight: "bold" }}>
        UNDO
      </Text>
    </TouchableOpacity>
  </View>
      )}
      

      <Modal visible={sectionTimeModalVisible} transparent animationType="slide">
  <View
  style={{
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center", // ✅ ADD THIS
  }}
>
   <View
  style={{
    backgroundColor: "#1E1E1E",
    padding: 20,
    borderRadius: 15,
    width: "90%", // ✅ ADD THIS
  }}
>
      <Text style={{ color: "#FFD700", fontSize: 18, marginBottom: 10 }}>
        Edit {editingSection} Time
      </Text>

      <TextInput
        value={sectionStartTime}
        onChangeText={setSectionStartTime}
        placeholder="Start time"
        placeholderTextColor="#888"
        style={{
          backgroundColor: "#2A2A2A",
          color: "white",
          padding: 10,
          borderRadius: 8,
          marginBottom: 10,
        }}
      />

      <TextInput
        value={sectionEndTime}
        onChangeText={setSectionEndTime}
        placeholder="End time"
        placeholderTextColor="#888"
        style={{
          backgroundColor: "#2A2A2A",
          color: "white",
          padding: 10,
          borderRadius: 8,
          marginBottom: 15,
        }}
      />

      <TouchableOpacity
  onPress={() => {
    console.log("🔥 SAVE BUTTON CLICKED");
    handleSaveSectionTime();
  }}
  style={{
    backgroundColor: "#FFD700",
    padding: 12,
    borderRadius: 10,
  }}
>
        <Text style={{ textAlign: "center", color: "black" }}>
          Save
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setSectionTimeModalVisible(false)}>
        <Text style={{ color: "#888", textAlign: "center", marginTop: 10 }}>
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
        ? (taskTempDate instanceof Date && !isNaN(taskTempDate.getTime()) ? taskTempDate : new Date())
        : (sectionTempDate instanceof Date && !isNaN(sectionTempDate.getTime()) ? sectionTempDate : new Date())
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
      } 
      else if (pickerMode === "start-time") {
        const updated = new Date(sectionTempDate);
        updated.setHours(selectedDate.getHours());
        updated.setMinutes(selectedDate.getMinutes());
        const formatted = formatDateTime(updated);

        // Update State
        setSectionTimes(prev => ({
          ...prev,
          [editingSection]: { ...prev[editingSection], start: formatted },
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
      } 
      else if (pickerMode === "end-time") {
        const updated = new Date(sectionTempDate);
        updated.setHours(selectedDate.getHours());
        updated.setMinutes(selectedDate.getMinutes());
        const formatted = formatDateTime(updated);

        // Update State
        setSectionTimes(prev => ({
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
      } 
      else if (pickerMode === "task-time") {
        const updated = new Date(taskTempDate);
        updated.setHours(selectedDate.getHours());
        updated.setMinutes(selectedDate.getMinutes());

        // Apply time restrictions based on section boundaries
        const restricted = restrictToSection(selectedSection, updated);
        setScheduledDateTime(formatDateTime(restricted));
        setTimeAdjusted(updated.getTime() !== restricted.getTime());
        
        setShowPicker(false);
        setPickerMode(null);
      }
    }}
  />
      )}
      
      <Modal visible={viewerVisible} animationType="fade" transparent={false}>
  <View style={{ flex: 1, backgroundColor: 'black' }}>
    {/* Header */}
    <View style={{ 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      padding: 20, 
      paddingTop: 50,
      backgroundColor: '#1E1E1E' 
    }}>
      <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>Attachment Viewer</Text>
      <TouchableOpacity onPress={() => setViewerVisible(false)}>
        <Text style={{ color: '#FFD700', fontWeight: 'bold' }}>Close</Text>
      </TouchableOpacity>
    </View>

    {/* Content */}
    <View style={{ flex: 1 }}>
      {currentFile.type === 'image' ? (
        <Image 
          source={{ uri: currentFile.uri }} 
          style={{ flex: 1, resizeMode: 'contain' }} 
        />
      ) : (
        <WebView 
          source={{ uri: currentFile.uri }} 
          style={{ flex: 1 }}
          originWhitelist={['*']}
        />
      )}
    </View>
  </View>
</Modal>

    </>
  );
}