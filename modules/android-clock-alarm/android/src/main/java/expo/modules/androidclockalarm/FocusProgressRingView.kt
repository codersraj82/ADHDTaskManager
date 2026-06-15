package expo.modules.androidclockalarm

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import kotlin.math.min

class FocusProgressRingView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null
) : View(context, attrs) {
  private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#123131")
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeWidth = dp(10f)
  }

  private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#5EEAD4")
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeWidth = dp(14f)
  }

  private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#E8F4F4")
    textAlign = Paint.Align.CENTER
    textSize = sp(30f)
    typeface = android.graphics.Typeface.create(
      android.graphics.Typeface.DEFAULT,
      android.graphics.Typeface.BOLD
    )
  }

  private val oval = RectF()
  private val textBounds = Rect()
  private var progress = 0f
  private var remainingText = "0:00"

  fun setProgress(progressValue: Float, remainingMillis: Long) {
    progress = progressValue.coerceIn(0f, 1f)
    remainingText = formatRemainingText(remainingMillis).removeSuffix(" remaining")
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)

    val size = min(width, height).toFloat()
    val strokePadding = dp(18f)
    val left = (width - size) / 2f + strokePadding
    val top = (height - size) / 2f + strokePadding
    val right = left + size - strokePadding * 2f
    val bottom = top + size - strokePadding * 2f

    oval.set(left, top, right, bottom)
    canvas.drawArc(oval, 0f, 360f, false, backgroundPaint)
    canvas.drawArc(oval, -90f, progress * 360f, false, progressPaint)

    textPaint.getTextBounds(remainingText, 0, remainingText.length, textBounds)
    val textY = height / 2f - textBounds.exactCenterY()
    canvas.drawText(remainingText, width / 2f, textY, textPaint)
  }

  private fun dp(value: Float): Float {
    return value * resources.displayMetrics.density
  }

  private fun sp(value: Float): Float {
    return value * resources.displayMetrics.scaledDensity
  }
}
