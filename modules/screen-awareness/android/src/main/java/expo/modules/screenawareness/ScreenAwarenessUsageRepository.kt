package expo.modules.screenawareness

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.Base64
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

    val sessionSummary = buildSessionSummary(context, startMs, endMs)
    return mapOf(
      "success" to true,
      "range" to range,
      "startTime" to startMs,
      "endTime" to endMs,
      "summary" to mapOf(
        "totalScreenMs" to totalMs,
        "longestContinuousSessionMs" to sessionSummary.longestMs,
        "sessionCount" to sessionSummary.sessionCount,
        "warningCount" to sessionSummary.warningCount
      ),
      "apps" to apps
    )
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
          mapOf(
            "date" to dateKey,
            "durationMs" to (usage[packageName] ?: 0L)
          )
        )
      }
    }
    return result
  }

  private fun getExcludedPackages(context: Context): Set<String> {
    val packages = mutableSetOf("android", "com.android.systemui")
    val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    try {
      context.packageManager.queryIntentActivities(homeIntent, 0).forEach { info ->
        info.activityInfo?.packageName?.let(packages::add)
      }
    } catch (_: Exception) {
      // Package visibility may limit launcher discovery. Core System UI remains excluded.
    }
    return packages
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

  private data class SessionSummary(
    val longestMs: Long,
    val sessionCount: Int,
    val warningCount: Int
  )

  private fun buildSessionSummary(context: Context, startMs: Long, endMs: Long): SessionSummary {
    val sessions = ScreenAwarenessStore.getFinishedSessions(context)
      .filter { overlaps(it, startMs, endMs) }
    var longest = sessions.maxOfOrNull {
      it.optLong("longestContinuousDurationMs", it.optLong("activeDurationMs", 0L))
    } ?: 0L
    var count = sessions.size

    val current = ScreenAwarenessStore.getSession(context)
    if (current?.active == true && current.startedAtWallMs <= endMs) {
      val currentDuration = current.toMap(android.os.SystemClock.elapsedRealtime())["activeDurationMs"] as? Long ?: 0L
      longest = maxOf(longest, currentDuration)
      count += 1
    }
    val warnings = ScreenAwarenessStore.getWarnings(context).count {
      it.optLong("timestamp", 0L) in startMs..endMs
    }
    return SessionSummary(longest, count, warnings)
  }

  private fun overlaps(record: org.json.JSONObject, startMs: Long, endMs: Long): Boolean {
    val start = record.optLong("startTime", 0L)
    val end = record.optLong("endTime", start)
    return start <= endMs && end >= startMs
  }
}
