package expo.modules.screenawareness

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import android.view.inputmethod.InputMethodManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

internal data class ScreenForegroundAppObservation(
  val changed: Boolean,
  val packageName: String?
)

internal object ScreenAwarenessUsageRepository {
  private const val MAX_REPORT_APPS = 30
  private const val REPORT_LOOKBACK_MS = 24 * 60 * 60_000L

  private val excludedInfrastructurePackages = setOf(
    "android",
    "com.android.systemui",
    "com.android.settings",
    "com.android.permissioncontroller",
    "com.google.android.permissioncontroller",
    "com.android.packageinstaller",
    "com.google.android.packageinstaller",
    "com.android.shell",
    "com.android.keychain",
    "com.android.documentsui",
    "com.android.localtransport",
    "com.google.android.backuptransport",
    "com.google.android.gms",
    "com.google.android.gsf",
    "com.google.android.modulemetadata",
    "com.google.android.as",
    "com.google.android.as.oss"
  )
  private val excludedInfrastructurePrefixes = listOf(
    "com.android.internal.",
    "com.android.overlay.",
    "com.android.providers.",
    "com.google.android.overlay.",
    "com.google.android.providers."
  )
  private val reportablePackageCache = ConcurrentHashMap<String, Boolean>()
  @Volatile private var cachedExcludedPackages: Set<String>? = null

  private data class VisibleAppUsage(
    val totalByPackage: Map<String, Long>,
    val dailyByPackage: Map<String, Map<String, Long>>
  )

  fun getRecentForegroundAppObservation(
    context: Context,
    lookbackMs: Long = 60_000L
  ): ScreenForegroundAppObservation {
    if (!ScreenAwarenessAccess.hasUsageAccess(context)) {
      return ScreenForegroundAppObservation(changed = false, packageName = null)
    }
    val manager = context.getSystemService(UsageStatsManager::class.java)
      ?: return ScreenForegroundAppObservation(changed = false, packageName = null)
    val end = System.currentTimeMillis()
    val events = try {
      manager.queryEvents(end - lookbackMs.coerceAtLeast(10_000L), end)
    } catch (_: Exception) {
      return ScreenForegroundAppObservation(changed = false, packageName = null)
    }
    val event = UsageEvents.Event()
    val excludedPackages = getExcludedPackages(context)
    var changed = false
    var visiblePackage: String? = null
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      when {
        isScreenHiddenEvent(event.eventType) -> {
          changed = true
          visiblePackage = null
        }
        isScreenShownEvent(event.eventType) -> {
          changed = true
          visiblePackage = null
        }
        isForegroundEvent(event.eventType) -> {
          changed = true
          val packageName = event.packageName?.trim().orEmpty()
          visiblePackage = packageName.takeIf {
            isReportableVisiblePackage(context, it, excludedPackages)
          }
        }
        isBackgroundEvent(event.eventType) -> {
          changed = true
          if (visiblePackage == null || event.packageName == visiblePackage) {
            visiblePackage = null
          }
        }
      }
    }
    return ScreenForegroundAppObservation(changed = changed, packageName = visiblePackage)
  }

  fun getCurrentSessionReport(context: Context): Map<String, Any?>? {
    val state = ScreenAwarenessStore.getSession(context)
      ?.takeIf { it.active && it.startedAtWallMs > 0L }
      ?: return null
    val raw = state.toMap(SystemClock.elapsedRealtime())
    val appUsage = enrichAppUsage(context, raw["appUsageBreakdown"] as? List<*>)
    val currentPackage = raw["currentForegroundPackage"] as? String
    val reportableCurrentPackage = currentPackage?.takeIf {
      isReportableVisiblePackage(context, it, getExcludedPackages(context))
    }
    return raw.toMutableMap().apply {
      put("startTime", raw["startedAt"])
      put("endTime", null)
      put("appUsageBreakdown", appUsage)
      put("topApp", appUsage.firstOrNull())
      put(
        "currentForegroundApp",
        reportableCurrentPackage?.let { resolveSessionApp(context, it) }
      )
      put("sessionDateLocal", localDateKey(state.startedAtWallMs))
    }
  }

  fun getReport(context: Context, requestedRange: String): Map<String, Any?> {
    if (!ScreenAwarenessAccess.hasUsageAccess(context)) {
      return mapOf(
        "success" to false,
        "errorCode" to "USAGE_ACCESS_REQUIRED",
        "message" to "Android Usage Access is required to build this report."
      )
    }

    val range = when (requestedRange.lowercase(Locale.US)) {
      "7days", "7_days", "7" -> "7days"
      "30days", "30_days", "30" -> "30days"
      else -> "today"
    }
    val dayCount = when (range) {
      "7days" -> 7
      "30days" -> 30
      else -> 1
    }
    val endMs = System.currentTimeMillis()
    ScreenAwarenessStore.purgeOldHistory(context, endMs)
    val startCalendar = Calendar.getInstance().apply {
      timeInMillis = endMs
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      add(Calendar.DAY_OF_YEAR, -(dayCount - 1))
    }
    val startMs = startCalendar.timeInMillis
    val excludedPackages = getExcludedPackages(context)
    val visibleUsage = queryVisibleAppUsage(context, startMs, endMs, excludedPackages)
    val aggregate = visibleUsage.totalByPackage
    val sorted = aggregate.entries
      .asSequence()
      .filter { it.value > 0L }
      .sortedByDescending { it.value }
      .take(MAX_REPORT_APPS)
      .toList()
    val totalMs = aggregate.values.sum().coerceAtLeast(0L)
    val dailyByPackage = buildDailyUsage(
      startCalendar = startCalendar,
      dayCount = dayCount,
      endMs = endMs,
      includedPackages = sorted.map { it.key }.toSet(),
      source = visibleUsage.dailyByPackage
    )

    val apps = sorted.map { (packageName, durationMs) ->
      val identity = resolveAppIdentity(context, packageName)
      mapOf(
        "packageName" to packageName,
        "appName" to identity.first,
        "iconDataUrl" to identity.second,
        "durationMs" to durationMs,
        "percentage" to if (totalMs > 0L) durationMs.toDouble() / totalMs.toDouble() * 100.0 else 0.0,
        "dailyUsage" to (dailyByPackage[packageName] ?: emptyList<Map<String, Any>>())
      )
    }

    val continuousSessions = buildContinuousSessionReport(context, startMs, endMs)
    val continuousSummary = continuousSessions["summary"] as? Map<*, *>
    val warningCount = ScreenAwarenessStore.getWarnings(context).count {
      it.optLong("timestamp", 0L) in startMs..endMs
    }
    val activeSession = continuousSessions["activeSession"] as? Map<*, *>
    val completedCount = (continuousSummary?.get("totalSessions") as? Number)?.toInt() ?: 0
    val longestCompleted = (continuousSummary?.get("longestDurationMs") as? Number)?.toLong() ?: 0L
    val activeDuration = (activeSession?.get("activeDurationMs") as? Number)?.toLong() ?: 0L

    return mapOf(
      "success" to true,
      "range" to range,
      "startTime" to startMs,
      "endTime" to endMs,
      "summary" to mapOf(
        "totalScreenMs" to totalMs,
        "longestContinuousSessionMs" to maxOf(longestCompleted, activeDuration),
        "sessionCount" to (completedCount + if (activeSession != null) 1 else 0),
        "warningCount" to warningCount
      ),
      "apps" to apps,
      "continuousSessions" to continuousSessions
    )
  }

  private fun buildContinuousSessionReport(
    context: Context,
    startMs: Long,
    endMs: Long
  ): Map<String, Any?> {
    // Group by the device-local date on which a session began. A session crossing
    // midnight appears once and is never split or double-counted.
    val completed = ScreenAwarenessStore.getVersion2FinishedSessions(context)
      .filter { it.optLong("startTime", 0L) in startMs..endMs }
      .sortedByDescending { it.optLong("startTime", 0L) }
      .map { enrichFinishedSession(context, it) }
    val durations = completed.mapNotNull { (it["activeDurationMs"] as? Number)?.toLong() }
    val dailySummaries = completed
      .groupBy { it["sessionDateLocal"] as? String ?: "" }
      .filterKeys { it.isNotBlank() }
      .map { (date, sessions) ->
        val dayDurations = sessions.mapNotNull {
          (it["activeDurationMs"] as? Number)?.toLong()
        }
        mapOf(
          "date" to date,
          "sessionCount" to sessions.size,
          "totalDurationMs" to dayDurations.sum(),
          "averageDurationMs" to dayDurations.averageOrZero(),
          "longestDurationMs" to (dayDurations.maxOrNull() ?: 0L),
          "over30Count" to dayDurations.count { it >= 30 * 60_000L },
          "over45Count" to dayDurations.count { it >= 45 * 60_000L },
          "over60Count" to dayDurations.count { it >= 60 * 60_000L }
        )
      }
      .sortedByDescending { it["date"] as String }

    val settings = ScreenAwarenessStore.getSettings(context)
    val reEntryEvents = ScreenAwarenessReEntryManager.getHandledEvents(context, startMs, endMs)
      .sortedByDescending { it.optLong("timestamp", 0L) }
      .map { item ->
        mapOf(
          "eventId" to item.optString("eventId", ""),
          "action" to item.optString("action", ""),
          "thresholdMinutes" to item.optInt("thresholdMinutes", 0),
          "taskId" to item.optLong("taskId", -1L).takeIf { it > 0L },
          "timestamp" to item.optLong("timestamp", 0L)
        )
      }
    val reEntryCounts = reEntryEvents.groupingBy { it["action"] as? String ?: "" }.eachCount()

    return mapOf(
      "schemaVersion" to ScreenAwarenessContract.SESSION_SCHEMA_VERSION,
      "retentionDays" to ScreenAwarenessContract.SESSION_RETENTION_DAYS,
      "migrationMessage" to "Continuous session history starts from this version.",
      "summary" to mapOf(
        "totalSessions" to completed.size,
        "totalDurationMs" to durations.sum(),
        "averageDurationMs" to durations.averageOrZero(),
        "longestDurationMs" to (durations.maxOrNull() ?: 0L),
        "over30Count" to durations.count { it >= 30 * 60_000L },
        "over45Count" to durations.count { it >= 45 * 60_000L },
        "over60Count" to durations.count { it >= 60 * 60_000L }
      ),
      "activeSession" to getCurrentSessionReport(context),
      "sessions" to completed,
      "dailySummaries" to dailySummaries,
      "insightsSettings" to mapOf(
        "patternInsightsEnabled" to settings.patternInsightsEnabled,
        "reEntryEnabled" to settings.reEntryEnabled,
        "showCurrentTaskInReminder" to settings.showCurrentTaskInReminder,
        "reEntryThresholdMinutes" to settings.reEntryThresholdMinutes
      ),
      "reEntrySupport" to mapOf(
        "returnedToCurrentTask" to (reEntryCounts["return_current_task"] ?: 0),
        "usedHelpMeStart" to (reEntryCounts["help_me_start"] ?: 0),
        "usedQuickWin" to (reEntryCounts["quick_win"] ?: 0),
        "usedEnergyMatch" to (reEntryCounts["energy_match"] ?: 0),
        "continuedIntentionally" to (reEntryCounts["continue_intentionally"] ?: 0),
        "events" to reEntryEvents
      )
    )
  }

  private fun enrichFinishedSession(context: Context, item: JSONObject): Map<String, Any?> {
    val appUsage = enrichAppUsage(context, item.optJSONArray("appUsageBreakdown"))
    return mapOf(
      "schemaVersion" to item.optInt("schemaVersion", 2),
      "active" to false,
      "sessionId" to item.optString("sessionId"),
      "startTime" to item.optLong("startTime", 0L),
      "endTime" to item.optLong("endTime", 0L),
      "activeDurationMs" to item.optLong("activeDurationMs", 0L),
      "elapsedSpanMs" to item.optLong("elapsedSpanMs", 0L),
      "pauseDurationMs" to item.optLong("pauseDurationMs", 0L),
      "thresholdsTriggered" to item.optJSONArray("thresholdsTriggered").toIntList(),
      "warningCount" to item.optInt("warningCount", 0),
      "warningEvents" to item.optJSONArray("warningEvents").toWarningList(),
      "appUsageBreakdown" to appUsage,
      "topApp" to appUsage.firstOrNull(),
      "sessionDateLocal" to item.optString(
        "sessionDateLocal",
        localDateKey(item.optLong("startTime", 0L))
      ),
      "completedNormally" to item.optBoolean("completedNormally", false),
      "endReason" to item.optString("endReason", ScreenSessionEndReason.MEANINGFUL_BREAK),
      "meaningfulBreakMinutes" to item.optInt("meaningfulBreakMinutes", 5)
    )
  }

  private fun enrichAppUsage(context: Context, raw: Any?): List<Map<String, Any?>> {
    val items: List<Pair<String, Long>> = when (raw) {
      is JSONArray -> buildList {
        for (index in 0 until raw.length()) {
          val item = raw.optJSONObject(index) ?: continue
          val packageName = item.optString("packageName", "")
          val duration = item.optLong("durationMs", 0L)
          if (packageName.isNotBlank() && duration > 0L) add(packageName to duration)
        }
      }
      is List<*> -> raw.mapNotNull { entry ->
        val map = entry as? Map<*, *> ?: return@mapNotNull null
        val packageName = map["packageName"] as? String ?: return@mapNotNull null
        val duration = (map["durationMs"] as? Number)?.toLong() ?: return@mapNotNull null
        (packageName to duration).takeIf { duration > 0L }
      }
      else -> emptyList()
    }
    return items
      .filter { (packageName, _) ->
        packageName != ScreenAwarenessContract.UNKNOWN_APP_PACKAGE &&
          isReportableVisiblePackage(context, packageName, getExcludedPackages(context))
      }
      .sortedByDescending { it.second }
      .map { (packageName, durationMs) ->
        resolveSessionApp(context, packageName).toMutableMap().apply {
          put("durationMs", durationMs)
        }
      }
  }

  private fun resolveSessionApp(context: Context, packageName: String): Map<String, Any?> {
    return mapOf(
      "packageName" to packageName,
      "appName" to resolveAppLabel(context, packageName)
    )
  }

  private fun resolveAppLabel(context: Context, packageName: String): String {
    return try {
      val packageManager = context.packageManager
      @Suppress("DEPRECATION")
      val info = packageManager.getApplicationInfo(packageName, 0)
      packageManager.getApplicationLabel(info).toString().trim().ifEmpty { packageName }
    } catch (_: Exception) {
      packageName
    }
  }

  private fun queryVisibleAppUsage(
    context: Context,
    startMs: Long,
    endMs: Long,
    excludedPackages: Set<String>
  ): VisibleAppUsage {
    val empty = VisibleAppUsage(emptyMap(), emptyMap())
    if (endMs <= startMs) return empty
    val manager = context.getSystemService(UsageStatsManager::class.java) ?: return empty
    val scanStartMs = (startMs - REPORT_LOOKBACK_MS).coerceAtLeast(0L)
    val events = try {
      manager.queryEvents(scanStartMs, endMs)
    } catch (_: Exception) {
      return empty
    }

    val totals = mutableMapOf<String, Long>()
    val daily = mutableMapOf<String, MutableMap<String, Long>>()
    val event = UsageEvents.Event()
    var screenVisible = true
    var currentPackage: String? = null
    var currentStartedAt = scanStartMs

    fun closeCurrent(atMs: Long) {
      val packageName = currentPackage
      if (packageName != null && screenVisible) {
        addVisibleInterval(
          packageName = packageName,
          fromMs = currentStartedAt,
          toMs = atMs,
          reportStartMs = startMs,
          reportEndMs = endMs,
          totals = totals,
          daily = daily
        )
      }
      currentStartedAt = atMs
    }

    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val timestamp = event.timeStamp.coerceIn(scanStartMs, endMs)
      when {
        isScreenHiddenEvent(event.eventType) -> {
          closeCurrent(timestamp)
          screenVisible = false
          currentPackage = null
        }
        isScreenShownEvent(event.eventType) -> {
          closeCurrent(timestamp)
          screenVisible = true
          currentPackage = null
        }
        isForegroundEvent(event.eventType) -> {
          closeCurrent(timestamp)
          val packageName = event.packageName?.trim().orEmpty()
          currentPackage = packageName.takeIf {
            screenVisible && isReportableVisiblePackage(context, it, excludedPackages)
          }
          currentStartedAt = timestamp
        }
        isBackgroundEvent(event.eventType) && event.packageName == currentPackage -> {
          closeCurrent(timestamp)
          currentPackage = null
        }
      }
    }
    closeCurrent(endMs)
    return VisibleAppUsage(totals, daily)
  }

  private fun buildDailyUsage(
    startCalendar: Calendar,
    dayCount: Int,
    endMs: Long,
    includedPackages: Set<String>,
    source: Map<String, Map<String, Long>>
  ): Map<String, List<Map<String, Any>>> {
    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val result = includedPackages.associateWith { mutableListOf<Map<String, Any>>() }
      .toMutableMap()
    for (offset in 0 until dayCount) {
      val dayStart = (startCalendar.clone() as Calendar).apply {
        add(Calendar.DAY_OF_YEAR, offset)
      }
      val dayEnd = (dayStart.clone() as Calendar).apply {
        add(Calendar.DAY_OF_YEAR, 1)
      }
      val from = dayStart.timeInMillis
      val to = minOf(dayEnd.timeInMillis, endMs)
      if (to <= from) continue
      val dateKey = dateFormat.format(Date(from))
      includedPackages.forEach { packageName ->
        result.getOrPut(packageName) { mutableListOf() }.add(
          mapOf(
            "date" to dateKey,
            "durationMs" to (source[packageName]?.get(dateKey) ?: 0L)
          )
        )
      }
    }
    return result
  }

  private fun getLauncherPackages(context: Context): Set<String> {
    val packages = mutableSetOf<String>()
    val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    try {
      context.packageManager.queryIntentActivities(homeIntent, 0).forEach { info ->
        info.activityInfo?.packageName?.let(packages::add)
      }
    } catch (_: Exception) {
      // Package visibility can limit launcher discovery; the package label is a safe fallback.
    }
    return packages
  }

  private fun addVisibleInterval(
    packageName: String,
    fromMs: Long,
    toMs: Long,
    reportStartMs: Long,
    reportEndMs: Long,
    totals: MutableMap<String, Long>,
    daily: MutableMap<String, MutableMap<String, Long>>
  ) {
    var cursor = maxOf(fromMs, reportStartMs)
    val intervalEnd = minOf(toMs, reportEndMs)
    if (intervalEnd <= cursor) return
    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    while (cursor < intervalEnd) {
      val currentDay = Calendar.getInstance().apply {
        timeInMillis = cursor
      }
      val nextDay = (currentDay.clone() as Calendar).apply {
        add(Calendar.DAY_OF_YEAR, 1)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      val segmentEnd = minOf(intervalEnd, nextDay.timeInMillis)
      val duration = (segmentEnd - cursor).coerceAtLeast(0L)
      if (duration > 0L) {
        totals[packageName] = (totals[packageName] ?: 0L) + duration
        val dateKey = dateFormat.format(Date(cursor))
        val byDate = daily.getOrPut(packageName) { mutableMapOf() }
        byDate[dateKey] = (byDate[dateKey] ?: 0L) + duration
      }
      cursor = segmentEnd
    }
  }

  private fun isReportableVisiblePackage(
    context: Context,
    packageName: String,
    excludedPackages: Set<String>
  ): Boolean {
    if (
      packageName.isBlank() ||
      packageName == ScreenAwarenessContract.UNKNOWN_APP_PACKAGE ||
      packageName in excludedPackages ||
      excludedInfrastructurePrefixes.any(packageName::startsWith)
    ) return false

    return reportablePackageCache.getOrPut(packageName) {
      try {
        val packageManager = context.packageManager
        @Suppress("DEPRECATION")
        val info = packageManager.getApplicationInfo(packageName, 0)
        val systemFlags = android.content.pm.ApplicationInfo.FLAG_SYSTEM or
          android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP
        val isSystemComponent = info.flags and systemFlags != 0
        !isSystemComponent || packageManager.getLaunchIntentForPackage(packageName) != null
      } catch (_: Exception) {
        // UsageEvents can expose a visible package even when package visibility blocks metadata.
        true
      }
    }
  }

  private fun isForegroundEvent(eventType: Int): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      eventType == UsageEvents.Event.ACTIVITY_RESUMED
    } else {
      @Suppress("DEPRECATION")
      eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
    }

  private fun isBackgroundEvent(eventType: Int): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      eventType == UsageEvents.Event.ACTIVITY_PAUSED ||
        eventType == UsageEvents.Event.ACTIVITY_STOPPED
    } else {
      @Suppress("DEPRECATION")
      eventType == UsageEvents.Event.MOVE_TO_BACKGROUND
    }

  private fun isScreenHiddenEvent(eventType: Int): Boolean =
    (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      eventType == UsageEvents.Event.SCREEN_NON_INTERACTIVE) ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        eventType == UsageEvents.Event.KEYGUARD_SHOWN)

  private fun isScreenShownEvent(eventType: Int): Boolean =
    (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      eventType == UsageEvents.Event.SCREEN_INTERACTIVE) ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        eventType == UsageEvents.Event.KEYGUARD_HIDDEN)

  @Synchronized
  private fun getExcludedPackages(context: Context): Set<String> {
    cachedExcludedPackages?.let { return it }
    val packages = excludedInfrastructurePackages.toMutableSet().apply {
      addAll(getLauncherPackages(context))
      try {
        context.getSystemService(InputMethodManager::class.java)
          ?.inputMethodList
          ?.map { it.packageName.trim() }
          ?.filter(String::isNotEmpty)
          ?.let(::addAll)
      } catch (_: Exception) {
        // Input-method discovery is best effort; infrastructure filters still apply.
      }
    }
    return packages.toSet().also { cachedExcludedPackages = it }
  }

  private fun resolveAppIdentity(context: Context, packageName: String): Pair<String, String?> {
    return try {
      val packageManager = context.packageManager
      @Suppress("DEPRECATION")
      val info = packageManager.getApplicationInfo(packageName, 0)
      val label = packageManager.getApplicationLabel(info).toString().trim()
        .ifEmpty { packageName }
      val icon = try {
        drawableToDataUrl(packageManager.getApplicationIcon(info))
      } catch (_: Exception) {
        null
      }
      label to icon
    } catch (_: Exception) {
      packageName to null
    }
  }

  private fun drawableToDataUrl(drawable: Drawable): String? {
    val bitmap = Bitmap.createBitmap(72, 72, Bitmap.Config.ARGB_8888).also { target ->
      val canvas = Canvas(target)
      drawable.setBounds(0, 0, canvas.width, canvas.height)
      drawable.draw(canvas)
    }
    return try {
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 90, stream)
      "data:image/png;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    } finally {
      bitmap.recycle()
    }
  }

  private fun JSONArray?.toIntList(): List<Int> = buildList {
    val source = this@toIntList ?: return@buildList
    for (index in 0 until source.length()) add(source.optInt(index))
  }

  private fun JSONArray?.toWarningList(): List<Map<String, Any>> = buildList {
    val source = this@toWarningList ?: return@buildList
    for (index in 0 until source.length()) {
      val event = source.optJSONObject(index) ?: continue
      add(
        mapOf(
          "thresholdMinutes" to event.optInt("thresholdMinutes", 0),
          "timestamp" to event.optLong("timestamp", 0L),
          "followUp" to event.optBoolean("followUp", false)
        )
      )
    }
  }

  private fun List<Long>.averageOrZero(): Long =
    if (isEmpty()) 0L else (sum().toDouble() / size.toDouble()).toLong()

  private fun localDateKey(wallMs: Long): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(wallMs))
}
