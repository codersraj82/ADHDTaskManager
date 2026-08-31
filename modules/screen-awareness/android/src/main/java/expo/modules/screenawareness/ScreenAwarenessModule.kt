package expo.modules.screenawareness

import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenAwarenessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenAwareness")

    AsyncFunction("getScreenAwarenessStatus") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      if (
        ScreenAwarenessStore.getSettings(context).enabled &&
        ScreenAwarenessAccess.hasUsageAccess(context)
      ) {
        ScreenAwarenessController.ensureRunning(context)
      }
      statusResult(context)
    }

    AsyncFunction("setScreenAwarenessEnabled") { enabled: Boolean ->
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      if (enabled) {
        ScreenAwarenessStore.setEnabled(context, true)
        ScreenAwarenessController.ensureRunning(context)
      } else {
        ScreenAwarenessController.disable(context)
      }
      statusResult(context)
    }

    AsyncFunction("updateScreenAwarenessSettings") { values: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      ScreenAwarenessStore.updateSettings(context, values)
      if (ScreenAwarenessStore.getSettings(context).enabled) {
        ScreenAwarenessController.ensureRunning(context)
      }
      statusResult(context)
    }

    AsyncFunction("openUsageAccessSettings") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      mapOf("success" to ScreenAwarenessAccess.openUsageAccessSettings(context))
    }

    AsyncFunction("openOverlaySettings") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      mapOf("success" to ScreenAwarenessAccess.openOverlaySettings(context))
    }

    AsyncFunction("openNotificationSettings") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      mapOf("success" to ScreenAwarenessAccess.openNotificationSettings(context))
    }

    AsyncFunction("getCurrentContinuousSession") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      mapOf(
        "success" to true,
        "session" to ScreenAwarenessUsageRepository.getCurrentSessionReport(context)
      )
    }

    AsyncFunction("clearContinuousSessionHistory") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      ScreenAwarenessStore.clearContinuousSessionHistory(context)
      mapOf(
        "success" to true,
        "retentionDays" to ScreenAwarenessContract.SESSION_RETENTION_DAYS
      )
    }

    AsyncFunction("updateScreenReEntryContext") { values: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      val taskId = when (val value = values["taskId"]) {
        is Number -> value.toLong().takeIf { it > 0L }
        is String -> value.toLongOrNull()?.takeIf { it > 0L }
        else -> null
      }
      val title = values["taskTitle"] as? String
      ScreenAwarenessReEntryManager.updateTaskContext(context, taskId, title)
      mapOf("success" to true)
    }

    AsyncFunction("consumePendingScreenReEntryAction") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      mapOf(
        "success" to true,
        "action" to ScreenAwarenessReEntryManager.consumePendingAction(context)
      )
    }

    AsyncFunction("acknowledgeScreenReEntryAction") { eventId: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      mapOf(
        "success" to ScreenAwarenessReEntryManager.acknowledgeAction(context, eventId)
      )
    }

    AsyncFunction("getUsageReport") { range: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableResult()
      ScreenAwarenessUsageRepository.getReport(context, range)
    }
  }

  private fun statusResult(context: android.content.Context): Map<String, Any?> {
    val settings = ScreenAwarenessStore.getSettings(context)
    val usageAccess = ScreenAwarenessAccess.hasUsageAccess(context)
    val overlayAccess = ScreenAwarenessAccess.canDrawOverlays(context)
    val notificationsAllowed = ScreenAwarenessAccess.notificationsAllowed(context)
    val monitoring = settings.enabled && usageAccess && ScreenAwarenessForegroundService.isRunning()
    val status = when {
      !settings.enabled -> "stopped"
      !usageAccess -> "usage_access_required"
      !monitoring -> "waiting_to_start"
      !overlayAccess && !notificationsAllowed -> "active_without_reminder_access"
      !overlayAccess -> "active_without_popup_access"
      !notificationsAllowed -> "active_without_notification_access"
      else -> "active"
    }
    return mapOf(
      "success" to true,
      "settings" to settings.toMap(),
      "permissions" to mapOf(
        "usageAccessGranted" to usageAccess,
        "overlayGranted" to overlayAccess,
        "notificationsAllowed" to notificationsAllowed
      ),
      "monitoringActive" to monitoring,
      "status" to status,
      "screenInteractive" to (
        context.getSystemService(PowerManager::class.java)?.isInteractive == true
      ),
      "currentSession" to ScreenAwarenessStore.getSession(context)
        ?.toMap(android.os.SystemClock.elapsedRealtime())
    )
  }

  private fun unavailableResult(): Map<String, Any?> = mapOf(
    "success" to false,
    "errorCode" to "NATIVE_MODULE_UNAVAILABLE",
    "message" to "Android Screen Awareness is unavailable in this build."
  )
}
