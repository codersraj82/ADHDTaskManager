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
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

internal object ScreenAwarenessUsageRepository {
  private const val MAX_REPORT_APPS = 30

  fun getRecentForegroundPackage(context: Context, lookbackMs: Long = 45_000L): String? {
    if (!ScreenAwarenessAccess.hasUsageAccess(context)) return null
    val manager = context.getSystemService(UsageStatsManager::class.java) ?: return null
    val end = System.currentTimeMillis()
    val events = try {
      manager.queryEvents(end - lookbackMs.coerceAtLeast(10_000L), end)
    } catch (_: Exception) {
      return null
    }
    val event = UsageEvents.Event()
    var latestPackage: String? = null
    var latestTimestamp = Long.MIN_VALUE
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val isForeground = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        event.eventType == UsageEvents.Event.ACTIVITY_RESUMED
      } else {
        @Suppress("DEPRECATION")
        event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
      }
      if (isForeground && event.timeStamp >= latestTimestamp) {
        latestPackage = event.packageName
        latestTimestamp = event.timeStamp
      }
    }
    return latestPackage
  }

  fun getCurrentSessionReport(context: Context): Map<String, Any?>? {
    val state = ScreenAwarenessStore.getSession(context)
      ?.takeIf { it.active && it.startedAtWallMs > 0L }
      ?: return null
    val raw = state.toMap(SystemClock.elapsedRealtime())
    val appUsage = enrichAppUsage(context, raw["appUsageBreakdown"] as? List<*>)
    val currentPackage = raw["currentForegroundPackage"] as? String
    return raw.toMutableMap().apply {
      put("startTime", raw["startedAt"])
      put("endTime", null)
      put("appUsageBreakdown", appUsage)
      put("topApp", appUsage.firstOrNull())
      put("currentForegroundApp", currentPackage?.let { resolveSessionApp(context, it) })
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
    val aggregate = queryPackageUsage(context, startMs, endMs, excludedPackages)
    val sorted = aggregate.entries
      .asSequence()
      .filter { it.value > 0L }
      .sortedByDescending { it.value }
      .take(MAX_REPORT_APPS)
      .toList()
    val totalMs = aggregate.values.sum().coerceAtLeast(0L)
    val dailyByPackage = buildDailyUsage(
      context = context,
      startCalendar = startCalendar,
      dayCount = dayCount,
      endMs = endMs,
      excludedPackages = excludedPackages,
      includedPackages = sorted.map { it.key }.toSet()
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
      "dailySummaries" to dailySummaries
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
      .sortedByDescending { it.second }
      .map { (packageName, durationMs) ->
        resolveSessionApp(context, packageName).toMutableMap().apply {
          put("durationMs", durationMs)
        }
      }
  }

  private fun resolveSessionApp(context: Context, packageName: String): Map<String, Any?> {
    if (packageName == ScreenAwarenessContract.UNKNOWN_APP_PACKAGE) {
      return mapOf("packageName" to packageName, "appName" to "Other")
    }
    if (packageName in getLauncherPackages(context)) {
      return mapOf("packageName" to packageName, "appName" to "Home screen")
    }
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

  private fun queryPackageUsage(
    context: Context,
    startMs: Long,
    endMs: Long,
    excludedPackages: Set<String>
  ): Map<String, Long> {
    val manager = context.getSystemService(UsageStatsManager::class.java) ?: return emptyMap()
    val stats = try {
      manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startMs, endMs)
    } catch (_: Exception) {
      emptyList()
    }
    val result = mutableMapOf<String, Long>()
    stats.orEmpty().forEach { item ->
      val packageName = item.packageName?.trim().orEmpty()
      val duration = item.totalTimeInForeground.coerceAtLeast(0L)
      if (packageName.isNotEmpty() && packageName !in excludedPackages && duration > 0L) {
        result[packageName] = (result[packageName] ?: 0L) + duration
      }
    }
    return result
  }

  private fun buildDailyUsage(
    context: Context,
    startCalendar: Calendar,
    dayCount: Int,
    endMs: Long,
    excludedPackages: Set<String>,
    includedPackages: Set<String>
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
      val usage = queryPackageUsage(context, from, to, excludedPackages)
      val dateKey = dateFormat.format(Date(from))
      includedPackages.forEach { packageName ->
        result.getOrPut(packageName) { mutableListOf() }.add(
          mapOf("date" to dateKey, "durationMs" to (usage[packageName] ?: 0L))
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

  private fun getExcludedPackages(context: Context): Set<String> =
    mutableSetOf("android", "com.android.systemui").apply {
      addAll(getLauncherPackages(context))
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
