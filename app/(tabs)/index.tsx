import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from "react-native";
import { useState, useEffect } from "react";
import { db } from "../../database/db";

export default function Home() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Drink water 💧", section: "Morning", completed: false },
    { id: 2, title: "Complete coding task 💻", section: "Work", completed: false },
    { id: 3, title: "Walk 10 minutes 🚶", section: "Evening", completed: false },
  ]);

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

  const renderSection = (title: string, section: string) => {
    const sectionTasks = tasks.filter((t) => t.section === section);

    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: "#FFD700", fontSize: 16, marginBottom: 8 }}>
          {title}
        </Text>

        <TouchableOpacity
          onPress={openModal}
          style={{
            backgroundColor: "#FFD700",
            marginBottom: 10,
            padding: 12,
            borderRadius: 10,
          }}
        >
          <Text style={{ textAlign: "center", color: "black", fontWeight: "bold" }}>
            + Add Task
          </Text>
        </TouchableOpacity>

        {sectionTasks.map((task) => (
          <TouchableOpacity
            key={task.id}
            onPress={() => toggleTask(task.id)}
            style={{
              backgroundColor: "#1E1E1E",
              padding: 12,
              borderRadius: 10,
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                color: task.completed ? "#666" : "white",
                textDecorationLine: task.completed ? "line-through" : "none",
              }}
            >
              {task.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: "black" }}>
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
    </>
  );
}