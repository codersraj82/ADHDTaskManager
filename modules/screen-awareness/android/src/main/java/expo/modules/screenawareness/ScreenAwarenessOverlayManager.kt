package expo.modules.screenawareness

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

internal object ScreenAwarenessOverlayManager {
  private var windowManager: WindowManager? = null
  private var overlayView: View? = null

  @Synchronized
  fun show(
    context: Context,
    thresholdMinutes: Int,
    followUp: Boolean
  ): Boolean {
    if (!ScreenAwarenessAccess.canDrawOverlays(context)) return false
    remove()

    val appContext = context.applicationContext
    val manager = appContext.getSystemService(WindowManager::class.java) ?: return false
    val copy = ScreenAwarenessCopy.forThreshold(thresholdMinutes, followUp)
    val root = FrameLayout(appContext).apply {
      setBackgroundColor(Color.parseColor("#B3061414"))
      isClickable = true
      contentDescription = "Screen Awareness reminder"
    }
    val card = LinearLayout(appContext).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(appContext, 22), dp(appContext, 20), dp(appContext, 22), dp(appContext, 18))
      background = roundedBackground("#F20B1F1F", "#5566B9B9", 28f, appContext)
      elevation = dp(appContext, 14).toFloat()
    }

    card.addView(TextView(appContext).apply {
      text = "◉  ATTENTION CHECK-IN"
      setTextColor(Color.parseColor("#66B9B9"))
      textSize = 11f
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.08f
    })
    card.addView(TextView(appContext).apply {
      text = copy.title
      setTextColor(Color.parseColor("#E8F4F4"))
      textSize = 21f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(0, dp(appContext, 10), 0, 0)
    })
    card.addView(TextView(appContext).apply {
      text = copy.body
      setTextColor(Color.parseColor("#CDE7E7"))
      textSize = 15f
      setLineSpacing(0f, 1.15f)
      setPadding(0, dp(appContext, 8), 0, dp(appContext, 14))
    })
    card.addView(actionButton(appContext, copy.primaryAction, primary = true) {
      ScreenAwarenessForegroundService.dispatchAction(
        appContext,
        ScreenAwarenessContract.ACTION_TAKE_BREAK,
        thresholdMinutes
      )
    })
    card.addView(actionButton(appContext, "Remind me in 10 min", primary = false) {
      ScreenAwarenessForegroundService.dispatchAction(
        appContext,
        ScreenAwarenessContract.ACTION_SNOOZE,
        thresholdMinutes
      )
    })
    card.addView(actionButton(appContext, "Continue intentionally", primary = false) {
      ScreenAwarenessForegroundService.dispatchAction(
        appContext,
        ScreenAwarenessContract.ACTION_CONTINUE,
        thresholdMinutes
      )
    })
    root.addView(card, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      gravity = Gravity.CENTER
      leftMargin = dp(appContext, 24)
      rightMargin = dp(appContext, 24)
    })

    val windowType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      windowType,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.CENTER
    }

    return try {
      manager.addView(root, params)
      windowManager = manager
      overlayView = root
      true
    } catch (_: Exception) {
      windowManager = null
      overlayView = null
      false
    }
  }

  @Synchronized
  fun remove() {
    val view = overlayView
    val manager = windowManager
    overlayView = null
    windowManager = null
    if (view != null && manager != null) {
      try {
        manager.removeViewImmediate(view)
      } catch (_: Exception) {
        // The OS may already have removed the overlay after a permission change.
      }
    }
  }

  private fun actionButton(
    context: Context,
    label: String,
    primary: Boolean,
    onClick: () -> Unit
  ): TextView = TextView(context).apply {
    text = label
    gravity = Gravity.CENTER
    setTextColor(Color.parseColor(if (primary) "#061414" else "#E8F4F4"))
    textSize = 14f
    typeface = Typeface.DEFAULT_BOLD
    isClickable = true
    isFocusable = true
    contentDescription = label
    background = roundedBackground(
      if (primary) "#66B9B9" else "#123131",
      if (primary) "#66B9B9" else "#337A7A",
      22f,
      context
    )
    setOnClickListener { onClick() }
    layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      dp(context, 46)
    ).apply {
      topMargin = dp(context, 8)
    }
  }

  private fun roundedBackground(
    fill: String,
    stroke: String,
    radiusDp: Float,
    context: Context
  ): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = dp(context, radiusDp.toInt()).toFloat()
    setColor(Color.parseColor(fill))
    setStroke(dp(context, 1), Color.parseColor(stroke))
  }

  private fun dp(context: Context, value: Int): Int =
    (value * context.resources.displayMetrics.density).toInt()
}
