package expo.modules.androidclockalarm

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.util.Log

internal object FocusSoundPlayer {
  private const val TAG = "FocusSoundPlayer"
  private const val SESSION_VOLUME = 0.22f
  private const val REMINDER_VOLUME = 0.17f

  private val audioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
    .build()

  private var activePlayer: MediaPlayer? = null

  @Synchronized
  fun playReminder(context: Context) {
    play(context, R.raw.focus_reminder_beep, REMINDER_VOLUME, "reminder")
  }

  @Synchronized
  fun playSessionEnd(context: Context) {
    play(context, R.raw.focus_session_beep, SESSION_VOLUME, "completion")
  }

  @Synchronized
  fun stopAll() {
    releasePlayer(activePlayer)
    activePlayer = null
  }

  private fun play(
    context: Context,
    soundResource: Int,
    volume: Float,
    soundKind: String
  ) {
    releasePlayer(activePlayer)
    activePlayer = null

    try {
      val player = MediaPlayer.create(
        context.applicationContext,
        soundResource,
        audioAttributes,
        AudioManager.AUDIO_SESSION_ID_GENERATE
      ) ?: run {
        Log.w(TAG, "Android could not create the native focus $soundKind player.")
        return
      }

      activePlayer = player
      player.setVolume(volume, volume)
      player.setOnCompletionListener { completedPlayer ->
        synchronized(this) {
          if (activePlayer === completedPlayer) {
            activePlayer = null
          }
          releasePlayer(completedPlayer)
        }
      }
      player.setOnErrorListener { failedPlayer, _, _ ->
        synchronized(this) {
          if (activePlayer === failedPlayer) {
            activePlayer = null
          }
          releasePlayer(failedPlayer)
        }
        true
      }
      player.start()
      Log.d(TAG, "Playing native focus $soundKind sound.")
    } catch (error: Exception) {
      Log.w(TAG, "Unable to play native focus $soundKind sound.", error)
      releasePlayer(activePlayer)
      activePlayer = null
    }
  }

  private fun releasePlayer(player: MediaPlayer?) {
    if (player == null) return
    try {
      if (player.isPlaying) {
        player.stop()
      }
    } catch (_: Exception) {
      // The player may already be stopped or released.
    }
    try {
      player.release()
    } catch (_: Exception) {
      // Sound cleanup must not affect focus session state.
    }
  }
}
