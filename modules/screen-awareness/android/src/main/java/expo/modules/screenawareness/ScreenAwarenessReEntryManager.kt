package expo.modules.screenawareness

import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

internal data class ScreenReEntryTaskContext(
  val taskId: Long,
  val title: String
)

internal data class ScreenReEntryOffer(
  val thresholdMinutes: Int,
  val task: ScreenReEntryTaskContext?,
  val showTaskTitle: Boolean
)

internal object ScreenAwarenessReEntryManager {
  private const val PREF_NAME = "screen_awareness_reentry_v3"
  private const val KEY_TASK_ID = "current_task_id"
  private const val KEY_TASK_TITLE = "current_task_title"
  private const val KEY_COOLDOWN_UNTIL = "cooldown_until"
  private const val KEY_LAST_THRESHOLD = "last_threshold"
  private const val KEY_PENDING_ACTION = "pending_action"
  private const val KEY_ACTION_HISTORY = "action_history"
  private const val REENTRY_COOLDOWN_MS = 20 * 60_000L
  private const val PENDING_EXPIRY_MS = 5 * 60_000L
  private const val MAX_ACTION_RECORDS = 500

  @Synchronized
  fun updateTaskContext(context: Context, taskId: Long?, title: String?) {
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    if (taskId == null || taskId <= 0L) {
      prefs.edit().remove(KEY_TASK_ID).remove(KEY_TASK_TITLE).apply()
      return
    }
    prefs.edit()
      .putLong(KEY_TASK_ID, taskId)
      .putString(KEY_TASK_TITLE, sanitizeTitle(title))
      .apply()
  }

  @Synchronized
  fun buildOffer(
    context: Context,
    thresholdMinutes: Int,
    followUp: Boolean
  ): ScreenReEntryOffer? {
    val settings = ScreenAwarenessStore.getSettings(context)
    if (!settings.reEntryEnabled || followUp) return null
    if (thresholdMinutes < settings.reEntryThresholdMinutes) return null

    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val cooldownUntil = prefs.getLong(KEY_COOLDOWN_UNTIL, 0L)
    val lastThreshold = prefs.getInt(KEY_LAST_THRESHOLD, 0)
    if (cooldownUntil > now && thresholdMinutes <= lastThreshold) return null

    return ScreenReEntryOffer(
      thresholdMinutes = thresholdMinutes,
      task = getTaskContext(context),
      showTaskTitle = settings.showCurrentTaskInReminder
    )
  }

  @Synchronized
  fun selectAction(
    context: Context,
    requestedAction: String,
    thresholdMinutes: Int
  ): Boolean {
    if (requestedAction !in reEntryActions()) return false
    val task = getTaskContext(context)
    val action = if (
      requestedAction in taskRequiredActions() && task == null
    ) {
      ScreenAwarenessContract.ACTION_QUICK_WIN
    } else {
      requestedAction
    }
    val now = System.currentTimeMillis()
    val eventId = "reentry-${now}-${UUID.randomUUID().toString().take(8)}"
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    prefs.edit()
      .putLong(KEY_COOLDOWN_UNTIL, now + REENTRY_COOLDOWN_MS)
      .putInt(KEY_LAST_THRESHOLD, thresholdMinutes)
      .apply()

    if (action == ScreenAwarenessContract.ACTION_REENTRY_CONTINUE) {
      appendActionEvent(context, eventId, action, thresholdMinutes, task?.taskId, now, handled = true)
      return true
    }

    val pending = JSONObject().apply {
      put("eventId", eventId)
      put("action", actionToPublicName(action))
      put("taskId", task?.taskId ?: JSONObject.NULL)
      put("taskTitle", task?.title ?: "")
      put("thresholdMinutes", thresholdMinutes)
      put("createdAt", now)
    }
    prefs.edit().putString(KEY_PENDING_ACTION, pending.toString()).apply()
    appendActionEvent(context, eventId, action, thresholdMinutes, task?.taskId, now, handled = false)

    val uri = buildLaunchUri(context, action, eventId, thresholdMinutes, task)
    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      setPackage(context.packageName)
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
      )
    }
    return try {
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  @Synchronized
  fun consumePendingAction(context: Context): Map<String, Any?>? {
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_PENDING_ACTION, null) ?: return null
    prefs.edit().remove(KEY_PENDING_ACTION).apply()
    return try {
      val json = JSONObject(raw)
      val createdAt = json.optLong("createdAt", 0L)
      if (createdAt <= 0L || System.currentTimeMillis() - createdAt > PENDING_EXPIRY_MS) {
        null
      } else {
        mapOf(
          "eventId" to json.optString("eventId", ""),
          "action" to json.optString("action", ""),
          "taskId" to json.optLong("taskId", -1L).takeIf { it > 0L },
          "taskTitle" to json.optString("taskTitle", ""),
          "thresholdMinutes" to json.optInt("thresholdMinutes", 0),
          "createdAt" to createdAt
        )
      }
    } catch (_: Exception) {
      null
    }
  }

  @Synchronized
  fun acknowledgeAction(context: Context, eventId: String): Boolean {
    if (eventId.isBlank()) return false
    val history = readHistory(context)
    var found = false
    for (index in 0 until history.length()) {
      val item = history.optJSONObject(index) ?: continue
      if (item.optString("eventId") == eventId) {
        item.put("handled", true)
        item.put("handledAt", System.currentTimeMillis())
        found = true
        break
      }
    }
    if (found) writeHistory(context, history)
    clearMatchingPending(context, eventId)
    return found
  }

  @Synchronized
  fun getHandledEvents(context: Context, startMs: Long, endMs: Long): List<JSONObject> {
    purgeOldEvents(context, System.currentTimeMillis())
    return readHistory(context).toObjectList().filter { item ->
      item.optBoolean("handled", false) && item.optLong("timestamp", 0L) in startMs..endMs
    }
  }

  @Synchronized
  fun clearHistory(context: Context) {
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_ACTION_HISTORY)
      .remove(KEY_PENDING_ACTION)
      .remove(KEY_COOLDOWN_UNTIL)
      .remove(KEY_LAST_THRESHOLD)
      .apply()
  }

  private fun getTaskContext(context: Context): ScreenReEntryTaskContext? {
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    val taskId = prefs.getLong(KEY_TASK_ID, -1L)
    if (taskId <= 0L) return null
    return ScreenReEntryTaskContext(
      taskId = taskId,
      title = sanitizeTitle(prefs.getString(KEY_TASK_TITLE, ""))
    )
  }

  private fun appendActionEvent(
    context: Context,
    eventId: String,
    action: String,
    thresholdMinutes: Int,
    taskId: Long?,
    timestamp: Long,
    handled: Boolean
  ) {
    val history = readHistory(context)
    history.put(JSONObject().apply {
      put("eventId", eventId)
      put("action", actionToPublicName(action))
      put("thresholdMinutes", thresholdMinutes)
      put("taskId", taskId ?: JSONObject.NULL)
      put("timestamp", timestamp)
      put("handled", handled)
      if (handled) put("handledAt", timestamp)
    })
    writeHistory(context, history)
    purgeOldEvents(context, timestamp)
  }

  private fun purgeOldEvents(context: Context, now: Long) {
    val cutoff = now - ScreenAwarenessContract.SESSION_RETENTION_DAYS * 24L * 60L * 60_000L
    val retained = JSONArray().apply {
      readHistory(context).toObjectList().forEach { item ->
        if (item.optLong("timestamp", 0L) >= cutoff) put(item)
      }
    }
    writeHistory(context, retained)
  }

  private fun readHistory(context: Context): JSONArray {
    val raw = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .getString(KEY_ACTION_HISTORY, null)
      ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun writeHistory(context: Context, source: JSONArray) {
    val trimmed = JSONArray()
    val first = (source.length() - MAX_ACTION_RECORDS).coerceAtLeast(0)
    for (index in first until source.length()) {
      source.optJSONObject(index)?.let(trimmed::put)
    }
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_ACTION_HISTORY, trimmed.toString())
      .apply()
  }

  private fun clearMatchingPending(context: Context, eventId: String) {
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_PENDING_ACTION, null) ?: return
    val matches = try {
      JSONObject(raw).optString("eventId") == eventId
    } catch (_: Exception) {
      true
    }
    if (matches) prefs.edit().remove(KEY_PENDING_ACTION).apply()
  }

  private fun buildLaunchUri(
    context: Context,
    action: String,
    eventId: String,
    thresholdMinutes: Int,
    task: ScreenReEntryTaskContext?
  ): Uri {
    val taskAction = action in taskRequiredActions() && task != null
    val base = Uri.parse(if (taskAction) "adhdtaskmanager:///task" else "adhdtaskmanager:///")
    return base.buildUpon()
      .appendQueryParameter("source", "screen_awareness")
      .appendQueryParameter("screenReEntryAction", actionToPublicName(action))
      .appendQueryParameter("eventId", eventId)
      .appendQueryParameter("thresholdMinutes", thresholdMinutes.toString())
      .apply {
        if (taskAction) {
          val targetTask = requireNotNull(task)
          appendQueryParameter("taskId", targetTask.taskId.toString())
          if (ScreenAwarenessStore.getSettings(context).showCurrentTaskInReminder) {
            appendQueryParameter("taskTitle", targetTask.title)
          }
        }
      }
      .build()
  }

  private fun sanitizeTitle(value: String?): String {
    val normalized = value.orEmpty().replace(Regex("\\s+"), " ").trim()
    return if (normalized.length <= 80) normalized else normalized.take(77).trimEnd() + "..."
  }

  private fun actionToPublicName(action: String): String = when (action) {
    ScreenAwarenessContract.ACTION_RETURN_CURRENT_TASK -> "return_current_task"
    ScreenAwarenessContract.ACTION_HELP_ME_START -> "help_me_start"
    ScreenAwarenessContract.ACTION_QUICK_WIN -> "quick_win"
    ScreenAwarenessContract.ACTION_ENERGY_MATCH -> "energy_match"
    else -> "continue_intentionally"
  }

  private fun reEntryActions(): Set<String> = setOf(
    ScreenAwarenessContract.ACTION_REENTRY_CONTINUE,
    ScreenAwarenessContract.ACTION_RETURN_CURRENT_TASK,
    ScreenAwarenessContract.ACTION_HELP_ME_START,
    ScreenAwarenessContract.ACTION_QUICK_WIN,
    ScreenAwarenessContract.ACTION_ENERGY_MATCH
  )

  private fun taskRequiredActions(): Set<String> = setOf(
    ScreenAwarenessContract.ACTION_RETURN_CURRENT_TASK,
    ScreenAwarenessContract.ACTION_HELP_ME_START
  )

  private fun JSONArray.toObjectList(): List<JSONObject> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
  }
}
