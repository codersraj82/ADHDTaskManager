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
} from "react-native";
import { useState, useEffect, useRef} from "react";
import { db } from "../../database/db";
import Svg, { Circle } from "react-native-svg";

export default function Home() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Drink water 💧", section: "Morning", completed: false },
    { id: 2, title: "Complete coding task 💻", section: "Work", completed: false },
    { id: 3, title: "Walk 10 minutes 🚶", section: "Evening", completed: false },
  ]);
  const [totalFocusTime, setTotalFocusTime] = useState(0); // seconds

  const [focusTime, setFocusTime] = useState(0); // in seconds
const [isTimerRunning, setIsTimerRunning] = useState(false);

  const [activeTaskId, setActiveTaskId] = useState(null);
  
  const [taskDurations, setTaskDurations] = useState({});
  const [currentDuration, setCurrentDuration] = useState(1500);

  const [timeModalVisible, setTimeModalVisible] = useState(false);
const [customHour, setCustomHour] = useState("0");
const [customMinute, setCustomMinute] = useState("0");
  const [currentTaskForTime, setCurrentTaskForTime] = useState(null);
  const [lastCompletedTaskId, setLastCompletedTaskId] = useState(null);

  //******Vriables */

  // ✅ Daily Progress Calculations
const totalTasks = tasks.length;

const completedTasks = tasks.filter(t => t.completed).length;

const percentage =
  totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

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

  //******useRef********** */

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const activeFocusY = useRef(0);
  const fabScale = useRef(new Animated.Value(1)).current;
  const taskPositions = useRef({});
  const sectionPositions = useRef({});

  //**************useEffect */

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
          alert("🎉 Focus session complete!");

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
  useEffect(() => {
    try {
      const result = db.getAllSync("SELECT * FROM tasks");

      const loadedTasks = result.map((t: any) => ({
        ...t,
        completed: t.completed === 1,
      }));

      if (loadedTasks.length > 0) {
        setTasks(loadedTasks);
      }
    } catch (error) {
      console.log("DB Load Error:", error);
    }
  }, []);

  // ✅ TOGGLE TASK
  const toggleTask = (id: any) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === id) {
          const updated = !task.completed;
          // 🧠 STOP TIMER IF ACTIVE TASK COMPLETED
          if (updated === true) {
  setLastCompletedTaskId(task.id);
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

  // ✅ CREATE TASK
  const createTask = () => {
    if (!taskName.trim()) return;

    try {
      db.runSync(
        "INSERT INTO tasks (title, section, completed) VALUES (?, ?, ?)",
        [taskName, selectedSection, 0]
      );
    } catch (error) {
      console.log("Insert error:", error);
    }

    const newTask = {
      id: Date.now(),
      title: taskName,
      section: selectedSection,
      completed: false,
    };

    setTasks((prev) => [...prev, newTask]);

    setTaskName("");
    setSelectedSection("Morning");
    setModalVisible(false);
  };

  const openModal = () => {
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
  
  
  //*********Component Start UI*** */

  const renderSection = (title: string, section: string) => {
    const sectionTasks = tasks.filter((t) => t.section === section);

    return (
      <View style={{ padding: 16 }}
       onLayout={(event) => {
    sectionPositions.current[section] = event.nativeEvent.layout.y;
  }}
      >
        <Text style={{ color: "#FFD700", fontSize: 16, marginBottom: 8 }}>
          {title}
        </Text>


        {sectionTasks.map((task) => (
          <TouchableOpacity
            key={task.id}
              onLayout={(event) => {
    taskPositions.current[task.id] = event.nativeEvent.layout.y;
  }}
            
          style={{
  backgroundColor:
    activeTaskId === task.id
      ? "#0F1F0F" // dark green base
      : lastCompletedTaskId === task.id
      ? "#2A2A1A" // golden highlight
      : "#1E1E1E",

  padding: 12,
  borderRadius: 10,
  marginBottom: 8,

  // Border logic
  borderWidth:
    activeTaskId === task.id
      ? 2
      : lastCompletedTaskId === task.id
      ? 1
      : 0,

  borderColor:
    activeTaskId === task.id
      ? "#39FF14" // fluorescent green
      : lastCompletedTaskId === task.id
      ? "#FFD700"
      : "transparent",

  // Glow (only for active task)
  shadowColor: activeTaskId === task.id ? "#39FF14" : "#000",
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: activeTaskId === task.id ? 0.9 : 0,
  shadowRadius: activeTaskId === task.id ? 10 : 0,

  elevation: activeTaskId === task.id ? 8 : 0, // Android
}}
          >
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

  {/* Task Text */}
  <Text
    style={{
      color: task.completed ? "#666" : "white",
      textDecorationLine: task.completed ? "line-through" : "none",
      flex: 1,
    }}
  >
    {task.title}
              </Text>
              {lastCompletedTaskId === task.id && (
  <Text
    style={{
      color: "#FFD700",
      fontSize: 11,
      marginTop: 4,
    }}
  >
    ✅ Last completed
  </Text>
              )}
              {activeTaskId === task.id && (
  <Text style={{ color: "#39FF14", fontSize: 11 }}>
    🎯 In Focus
  </Text>
)}
</View>
<View style={{ flexDirection: "row", marginTop: 8, gap: 8 }}>
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
        backgroundColor:
          taskDurations[task.id] === min * 60 ? "#FFD700" : "#333",
      }}
    >
      <Text
        style={{
          color:
            taskDurations[task.id] === min * 60 ? "black" : "white",
          fontSize: 12,
        }}
      >
        {min}m
      </Text>
    </TouchableOpacity>
  ))}

  {/* Custom */}
  <TouchableOpacity
    onPress={() => {
  setCurrentTaskForTime(task.id);
  setTimeModalVisible(true);
}}
    style={{
      padding: 6,
      borderRadius: 6,
      backgroundColor: "#444",
    }}
  >
    <Text style={{ color: "#fff", fontSize: 12 }}>⏱ Custom</Text>
  </TouchableOpacity>
</View>

       <Text
  onPress={() => {
    if (task.completed) return;
    startFocus(task.id);
  }}
  style={{
    color: "#FFD700",
    marginTop: 8,
    fontWeight: "600",
  }}
>
  ▶ Start
            </Text>
            {taskDurations[task.id] && (
  <Text
    style={{
      color: "#00FFFF",
      fontSize: 12,
      marginTop: 6,
    }}
  >
    ⏱ {formatDuration(taskDurations[task.id])} selected
  </Text>
)}
          </TouchableOpacity>
        ))}
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
    stroke={
      focusTime < 600
        ? "#FFD700"   // Gold
        : focusTime < 1200
        ? "#00FFFF"   // Fluorescent Blue
        : "#39FF14"   // Fluorescent Green
    }
    strokeWidth="10"
    fill="none"
    strokeDasharray={circumference}
    strokeDashoffset={strokeDashoffset}
    strokeLinecap="round"
    rotation="90"        // 🔥 start from top
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

      {/* ✅ MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
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
              New Task ✨
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
              onPress={createTask}
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
                Save Task
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
        </View>
      </Modal>

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
      {activeTaskId && (
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
      )}
      
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
    >
      +
    </Text>

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
    </>
  );
}