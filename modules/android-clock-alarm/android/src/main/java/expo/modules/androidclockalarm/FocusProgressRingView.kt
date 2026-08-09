package expo.modules.androidclockalarm

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import java.util.Locale
import kotlin.math.min

class FocusProgressRingView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null
) : View(context, attrs) {
  private val containerFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#73061414")
    style = Paint.Style.FILL
  }

  private val containerBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#33337A7A")
    style = Paint.Style.STROKE
    strokeWidth = dp(1f)
  }

  private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#123131")
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeWidth = dp(10f)
  }

  private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#66B9B9")
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeWidth = dp(14f)
  }

  private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#5EEAD4")
    textAlign = Paint.Align.CENTER
    textSize = sp(40f)
    typeface = android.graphics.Typeface.create(
      android.graphics.Typeface.DEFAULT,
      android.graphics.Typeface.BOLD
    )
  }

  private val oval = RectF()
  private val textBounds = Rect()
  private var progress = 0f
  private var elapsedText = "00:00:00"

  fun setProgress(progressValue: Float, elapsedMillis: Long) {
    progress = progressValue.coerceIn(0f, 1f)
    elapsedText = formatElapsedText(elapsedMillis)
    progressPaint.color = when {
      progress >= 0.5f -> Color.parseColor("#7DFFB3")
      progress >= 0.25f -> Color.parseColor("#5EEAD4")
      else -> Color.parseColor("#66B9B9")
    }
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)

    val size = min(width, height).toFloat()
    val centerX = width / 2f
    val centerY = height / 2f
    val containerRadius = (size / 2f - dp(1f)).coerceAtLeast(0f)
    canvas.drawCircle(centerX, centerY, containerRadius, containerFillPaint)
    canvas.drawCircle(centerX, centerY, containerRadius, containerBorderPaint)

    val ringRadius = min(
      dp(100f),
      (size / 2f - dp(19f)).coerceAtLeast(0f)
    )
    val left = centerX - ringRadius
    val top = centerY - ringRadius
    val right = centerX + ringRadius
    val bottom = centerY + ringRadius

    oval.set(left, top, right, bottom)
    canvas.drawArc(oval, 0f, 360f, false, backgroundPaint)
    canvas.drawArc(oval, 90f, progress * 360f, false, progressPaint)

    textPaint.getTextBounds(elapsedText, 0, elapsedText.length, textBounds)
    val textY = height / 2f - textBounds.exactCenterY()
    canvas.drawText(elapsedText, width / 2f, textY, textPaint)
  }

  private fun formatElapsedText(elapsedMillis: Long): String {
    val totalSeconds = (elapsedMillis.coerceAtLeast(0L) / 1_000L).toInt()
    val hours = totalSeconds / 3_600
    val minutes = (totalSeconds % 3_600) / 60
    val seconds = totalSeconds % 60
    return String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)
  }

  private fun dp(value: Float): Float {
    return value * resources.displayMetrics.density
  }

  private fun sp(value: Float): Float {
    return value * resources.displayMetrics.scaledDensity
  }
}
