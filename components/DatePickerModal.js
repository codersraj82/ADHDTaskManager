import React, { memo, useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import TimeInput from "./TimeInput";
import {
  formatDateForPickerLabel,
  formatSqliteDateTime,
  parseStoredDateTime,
} from "../utils/formatDateTime";

function DatePickerModal({
  visible,
  value,
  title = "Schedule",
  confirmLabel = "Confirm",
  onCancel,
  onConfirm,
}) {
  const [draftDate, setDraftDate] = useState(() =>
    parseStoredDateTime(value) || new Date()
  );

  const openAndroidPicker = useCallback((baseDate) => {
    const currentDate = parseStoredDateTime(baseDate) || new Date();

    DateTimePickerAndroid.open({
      value: currentDate,
      mode: "date",
      display: "calendar",
      onChange: (event, selectedDate) => {
        if (event.type !== "set" || !selectedDate) return;

        setDraftDate((current) => {
          const source = parseStoredDateTime(current) || currentDate;
          const nextDate = new Date(selectedDate);
          nextDate.setHours(source.getHours(), source.getMinutes(), 0, 0);
          return nextDate;
        });
      },
    });
  }, []);

  useEffect(() => {
    if (!visible) return undefined;

    const initialDate = parseStoredDateTime(value) || new Date();
    setDraftDate(initialDate);

    if (Platform.OS !== "android") return undefined;

    const timer = setTimeout(() => {
      openAndroidPicker(initialDate);
    }, 160);

    return () => clearTimeout(timer);
  }, [openAndroidPicker, value, visible]);

  const handleInlineDateChange = useCallback((event, selectedDate) => {
    if (!selectedDate) return;

    setDraftDate((current) => {
      const source = parseStoredDateTime(current) || new Date();
      const nextDate = new Date(selectedDate);
      nextDate.setHours(source.getHours(), source.getMinutes(), 0, 0);
      return nextDate;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    Keyboard.dismiss();
    onConfirm?.(draftDate, formatSqliteDateTime(draftDate));
  }, [draftDate, onConfirm]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    onCancel?.();
  }, [onCancel]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View className="flex-1 bg-[#050607]/90 justify-center px-5">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View className="bg-[#171A1D] rounded-[28px] border border-[#D9A441]/30 p-5 shadow-2xl shadow-[#D9A441]/15">
              <Text className="text-[#F7EEDC] text-xl font-black uppercase tracking-widest mb-4">
                {title}
              </Text>

              <View className="bg-[#101416] rounded-2xl border border-[#3A3426] p-4 mb-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-[#B9AA85] text-xs font-black uppercase tracking-widest mb-1">
                      Date
                    </Text>
                    <Text className="text-[#F7EEDC] text-base font-black">
                      {formatDateForPickerLabel(draftDate)}
                    </Text>
                  </View>

                  {Platform.OS === "android" && (
                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => openAndroidPicker(draftDate)}
                      className="bg-[#D9A441]/15 border border-[#D9A441]/50 rounded-xl px-4 py-3"
                    >
                      <Text className="text-[#D9A441] font-black text-xs uppercase tracking-widest">
                        Change
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {Platform.OS !== "android" && (
                  <View className="mt-3 overflow-hidden rounded-2xl">
                    <DateTimePicker
                      value={draftDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "inline" : "default"}
                      themeVariant="dark"
                      onChange={handleInlineDateChange}
                    />
                  </View>
                )}
              </View>

              <TimeInput
                value={draftDate}
                onChange={setDraftDate}
                label="Time"
              />

              <View className="flex-row mt-2">
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={handleCancel}
                  className="flex-1 h-14 rounded-2xl border border-[#3A3426] bg-[#101416] items-center justify-center mr-3"
                >
                  <Text className="text-[#B9AA85] font-black uppercase tracking-widest text-xs">
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={handleConfirm}
                  className="flex-1 h-14 rounded-2xl bg-[#D9A441] items-center justify-center shadow-lg shadow-[#D9A441]/25"
                >
                  <Text className="text-[#101416] font-black uppercase tracking-widest text-xs">
                    {confirmLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default memo(DatePickerModal);

