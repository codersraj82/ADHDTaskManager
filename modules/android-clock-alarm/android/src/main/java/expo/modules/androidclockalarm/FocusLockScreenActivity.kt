package expo.modules.androidclockalarm

import android.app.Activity
import android.app.AlertDialog
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

class FocusLockScreenActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var session: FocusLockScreenSession? = null
  private var ringView: FocusProgressRingView? = null
  private var taskTitleView: TextView? = null
  private var remainingView: TextView? = null
  private var closeReceiver: BroadcastReceiver? = null

  private val tickRunnable = object : Runnable {
    override fun run() {
      val currentSession = session ?: return
      updateProgress(currentSession)
      val remainingMillis = currentSession.expectedEndAtMillis - System.currentTimeMillis()
      if (remainingMillis > 0L) {
        handler.postDelayed(this, 1_000L)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureLockScreenWindow()
    registerCloseReceiver()

    val incomingSession = FocusLockScreenSession.fromIntent(intent)
      ?: FocusLockScreenStore.get(applicationContext)
    if (incomingSession == null || incomingSession.status != FocusLockScreenContract.STATUS_ACTIVE) {
      finish()
      return
    }

    session = incomingSession
    render(incomingSession)
    startTicker()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    val incomingSession = FocusLockScreenSession.fromIntent(intent)
      ?: FocusLockScreenStore.get(applicationContext)
      ?: return
    session = incomingSession
    taskTitleView?.text = incomingSession.taskTitle
    startTicker()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    unregisterCloseReceiver()
    super.onDestroy()
  }

  private fun configureLockScreenWindow() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    window.statusBarColor = Color.parseColor("#061414")
    window.navigationBarColor = Color.parseColor("#061414")
  }

  private fun render(currentSession: FocusLockScreenSession) {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(32), dp(24), dp(32))
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(Color.parseColor("#061414"), Color.parseColor("#0B1F1F"))
      )
    }

    val title = TextView(this).apply {
      text = "Focus session"
      setTextColor(Color.parseColor("#5EEAD4"))
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.08f
      gravity = Gravity.CENTER
      isAllCaps = true
    }
    root.addView(title, layoutParams(match = false, width = -1, height = -2).apply {
      bottomMargin = dp(18)
    })

    taskTitleView = TextView(this).apply {
      text = currentSession.taskTitle
      setTextColor(Color.parseColor("#E8F4F4"))
      textSize = 21f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      maxLines = 3
    }
    root.addView(taskTitleView, layoutParams(match = false, width = -1, height = -2).apply {
      bottomMargin = dp(24)
    })

    ringView = FocusProgressRingView(this)
    root.addView(ringView, layoutParams(match = false, width = dp(236), height = dp(236)).apply {
      bottomMargin = dp(18)
    })

    remainingView = TextView(this).apply {
      setTextColor(Color.parseColor("#99BDBD"))
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    root.addView(remainingView, layoutParams(match = false, width = -1, height = -2).apply {
      bottomMargin = dp(12)
    })

    val supportText = TextView(this).apply {
      text = "One small step."
      setTextColor(Color.parseColor("#CDE7E7"))
      textSize = 14f
      gravity = Gravity.CENTER
    }
    root.addView(supportText, layoutParams(match = false, width = -1, height = -2).apply {
      bottomMargin = dp(28)
    })

    val buttonRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }

    val openButton = actionButton("Open app", primary = true).apply {
      setOnClickListener {
        openAppAfterUnlock()
      }
    }

    val closeButton = actionButton("Close", primary = false).apply {
      setOnClickListener { closeLockScreenView() }
    }

    val stopButton = actionButton("Stop", primary = false).apply {
      setOnClickListener { confirmStop() }
    }

    buttonRow.addView(openButton, layoutParams(match = false, width = 0, height = dp(48), weight = 1f).apply {
      rightMargin = dp(6)
    })
    buttonRow.addView(closeButton, layoutParams(match = false, width = 0, height = dp(48), weight = 1f).apply {
      leftMargin = dp(6)
      rightMargin = dp(6)
    })
    buttonRow.addView(stopButton, layoutParams(match = false, width = 0, height = dp(48), weight = 1f).apply {
      leftMargin = dp(6)
    })
    root.addView(buttonRow, layoutParams(match = false, width = -1, height = -2))

    setContentView(root)
    updateProgress(currentSession)
  }

  private fun confirmStop() {
    val currentSession = session ?: return
    AlertDialog.Builder(this)
      .setTitle("Stop focus session?")
      .setMessage("This will stop the active focus session.")
      .setNegativeButton("Keep focusing", null)
      .setPositiveButton("Stop") { _, _ ->
        FocusLockScreenController.requestStopFromNative(applicationContext, currentSession.sessionId)
        finish()
      }
      .show()
  }

  private fun closeLockScreenView() {
    FocusLockScreenLaunchGate.suppressTemporarily(
      applicationContext,
      CLOSE_SUPPRESSION_MS
    )
    finish()
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    closeLockScreenView()
  }

  private fun openAppAfterUnlock() {
    val currentSession = session ?: return
    val openIntent = FocusNotificationHelper.buildOpenAppIntent(this, currentSession)

    FocusLockScreenLaunchGate.suppressTemporarily(applicationContext)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val keyguardManager = getSystemService(KeyguardManager::class.java)
      if (keyguardManager?.isKeyguardLocked == true) {
        keyguardManager.requestDismissKeyguard(
          this,
          object : KeyguardManager.KeyguardDismissCallback() {
            override fun onDismissSucceeded() {
              launchAppAndFinish(openIntent)
            }

            override fun onDismissCancelled() {
              finish()
            }

            override fun onDismissError() {
              finish()
            }
          }
        )
        return
      }
    }

    launchAppAndFinish(openIntent)
  }

  private fun launchAppAndFinish(openIntent: Intent) {
    try {
      startActivity(openIntent)
    } catch (_: Exception) {
      // If Android refuses the launch, closing this activity still reveals the keyguard.
    } finally {
      finish()
    }
  }

  private fun startTicker() {
    handler.removeCallbacks(tickRunnable)
    tickRunnable.run()
  }

  private fun updateProgress(currentSession: FocusLockScreenSession) {
    val now = System.currentTimeMillis()
    val remainingMillis = (currentSession.expectedEndAtMillis - now).coerceAtLeast(0L)
    val progress = 1f - (remainingMillis.toFloat() / currentSession.totalMillis.toFloat())

    ringView?.setProgress(progress, remainingMillis)
    remainingView?.text = formatRemainingText(remainingMillis)

    if (remainingMillis <= 0L) {
      FocusLockScreenController.complete(
        context = applicationContext,
        sessionId = currentSession.sessionId,
        notify = true,
        readAloud = true
      )
      finish()
    }
  }

  private fun registerCloseReceiver() {
    if (closeReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        val incomingSessionId = intent?.getStringExtra(FocusLockScreenContract.EXTRA_SESSION_ID)
        val currentSessionId = session?.sessionId
        if (incomingSessionId == null || currentSessionId == null || incomingSessionId == currentSessionId) {
          finish()
        }
      }
    }
    closeReceiver = receiver

    val filter = IntentFilter(FocusLockScreenContract.ACTION_CLOSE_FOCUS_ACTIVITY)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        registerReceiver(receiver, filter)
      }
    } catch (_: Exception) {
      closeReceiver = null
    }
  }

  private fun unregisterCloseReceiver() {
    val receiver = closeReceiver ?: return
    try {
      unregisterReceiver(receiver)
    } catch (_: Exception) {
      // Receiver may already be gone.
    } finally {
      closeReceiver = null
    }
  }

  private fun actionButton(label: String, primary: Boolean): TextView {
    val fillColor = if (primary) "#66B9B9" else "#123131"
    val textColor = if (primary) "#061414" else "#E8F4F4"
    val strokeColor = if (primary) "#66B9B9" else "#337A7A"

    return TextView(this).apply {
      text = label
      gravity = Gravity.CENTER
      setTextColor(Color.parseColor(textColor))
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      isClickable = true
      isFocusable = true
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(24).toFloat()
        setColor(Color.parseColor(fillColor))
        setStroke(dp(1), Color.parseColor(strokeColor))
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        foreground = obtainStyledAttributes(intArrayOf(android.R.attr.selectableItemBackground))
          .let { typedArray ->
            val drawable = typedArray.getDrawable(0)
            typedArray.recycle()
            drawable
          }
      }
    }
  }

  private fun layoutParams(
    match: Boolean,
    width: Int,
    height: Int,
    weight: Float = 0f
  ): LinearLayout.LayoutParams {
    return LinearLayout.LayoutParams(
      if (match) LinearLayout.LayoutParams.MATCH_PARENT else width,
      height,
      weight
    )
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  companion object {
    private const val CLOSE_SUPPRESSION_MS = 300_000L
  }
}
