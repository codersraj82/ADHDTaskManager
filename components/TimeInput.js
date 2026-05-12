import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  applyTimePartsToDate,
  pad2,
  toTimeInputParts,
} from "../utils/formatDateTime";

const PERIODS = ["AM", "PM"];

const sanitizeHour = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";

  const numeric = Number(digits);
  if (digits.length === 2 && numeric === 0) return "01";
  if (numeric > 12) return "12";

  return digits;
};

const sanitizeMinute = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";

  const numeric = Number(digits);
  if (numeric > 59) return "59";

  return digits;
};

function TimeInput({
  value,
  onChange,
  label = "Time",
  disabled = false,
}) {
  const minuteRef = useRef(null);
  const [parts, setParts] = useState(() => toTimeInputParts(value));
  const [focusedField, setFocusedField] = useState(null);
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => {
    if (!focusedField) {
      setParts(toTimeInputParts(value));
    }
  }, [focusedField, value]);

  const emitChange = useCallback(
    (nextParts) => {
      const hour = Number(nextParts.hour);
      const minute = nextParts.minute === "" ? 0 : Number(nextParts.minute);

      if (!Number.isFinite(hour) || hour < 1 || hour > 12) return;
      if (!Number.isFinite(minute) || minute < 0 || minute > 59) return;

      onChange?.(
        applyTimePartsToDate(value || new Date(), {
          ...nextParts,
          minute,
        })
      );
    },
    [onChange, value]
  );

  const updateParts = useCallback(
    (nextPatch) => {
      const nextParts = { ...parts, ...nextPatch };
      setParts(nextParts);
      emitChange(nextParts);
    },
    [emitChange, parts]
  );

  const handleHourChange = useCallback(
    (text) => {
      const nextHour = sanitizeHour(text);
      updateParts({ hour: nextHour });

      if (nextHour.length === 2) {
        minuteRef.current?.focus();
      }
    },
    [updateParts]
  );

  const handleMinuteChange = useCallback(
    (text) => {
      updateParts({ minute: sanitizeMinute(text) });
    },
    [updateParts]
  );

  const finishEditing = useCallback(
    (field) => {
      setFocusedField(null);
      const hourValue = Number(parts.hour);
      const minuteValue = Number(parts.minute);
      const nextParts = {
        ...parts,
        hour: pad2(
          Number.isFinite(hourValue) && hourValue >= 1
            ? Math.min(hourValue, 12)
            : 12
        ),
        minute: pad2(
          Number.isFinite(minuteValue)
            ? Math.min(Math.max(minuteValue, 0), 59)
            : 0
        ),
      };

      setParts(nextParts);
      emitChange(nextParts);

      if (field === "minute") {
        setPeriodOpen(false);
      }
    },
    [emitChange, parts]
  );

  const selectPeriod = useCallback(
    (period) => {
      setPeriodOpen(false);
      updateParts({ period });
    },
    [updateParts]
  );

  const inputBase =
    "h-16 bg-[#101416] text-[#F7EEDC] rounded-xl border text-center text-2xl font-black";
  const inactiveBorder = "border-[#3A3426]";
  const activeBorder = "border-[#D9A441]";

  return (
    <View className="mb-5">
      <Text className="text-[#B9AA85] text-xs font-black uppercase tracking-widest mb-2">
        {label}
      </Text>

      <View className="flex-row items-center">
        <TextInput
          editable={!disabled}
          value={parts.hour}
          onChangeText={handleHourChange}
          onFocus={() => setFocusedField("hour")}
          onBlur={() => finishEditing("hour")}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          placeholder="HH"
          placeholderTextColor="#706954"
          className={`${inputBase} w-[82px] ${
            focusedField === "hour" ? activeBorder : inactiveBorder
          }`}
        />

        <Text className="text-[#D9A441] text-2xl font-black mx-3">:</Text>

        <TextInput
          ref={minuteRef}
          editable={!disabled}
          value={parts.minute}
          onChangeText={handleMinuteChange}
          onFocus={() => setFocusedField("minute")}
          onBlur={() => finishEditing("minute")}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          placeholder="MM"
          placeholderTextColor="#706954"
          className={`${inputBase} w-[82px] ${
            focusedField === "minute" ? activeBorder : inactiveBorder
          }`}
        />

        <View className="relative ml-3">
          <TouchableOpacity
            disabled={disabled}
            activeOpacity={0.82}
            onPress={() => setPeriodOpen((current) => !current)}
            className={`h-16 w-[86px] rounded-xl border ${
              periodOpen ? activeBorder : inactiveBorder
            } bg-[#101416] items-center justify-center`}
          >
            <Text className="text-[#F7EEDC] text-lg font-black">
              {parts.period} v
            </Text>
          </TouchableOpacity>

          {periodOpen && (
            <View className="absolute top-[70px] right-0 w-[86px] bg-[#171A1D] border border-[#D9A441]/80 rounded-xl overflow-hidden z-50 shadow-lg shadow-[#D9A441]/20">
              {PERIODS.map((period) => (
                <Pressable
                  key={period}
                  onPress={() => selectPeriod(period)}
                  className={`h-12 items-center justify-center ${
                    parts.period === period ? "bg-[#D9A441]" : "bg-[#171A1D]"
                  }`}
                >
                  <Text
                    className={`font-black ${
                      parts.period === period
                        ? "text-[#101416]"
                        : "text-[#F7EEDC]"
                    }`}
                  >
                    {period}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default memo(TimeInput);
