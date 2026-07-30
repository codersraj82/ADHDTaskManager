package expo.modules.androidclockalarm

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer

internal object FocusSoundPlayer {
  private val audioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  private var activePlayer: MediaPlayer? = null

  @Synchronized
  fun playReminder(context: Context) {
    play(context, R.raw.focus_reminder_beep)
  }

  @Synchronized
  fun playSessionEnd(context: Context) {
    play(context, R.raw.focus_session_beep)
  }

  @Synchronized
  fun stopAll() {
    releasePlayer(activePlayer)
    activePlayer = null
  }

  private fun play(context: Context, soundResource: Int) {
    releasePlayer(activePlayer)
    activePlayer = null

    try {
      val player = MediaPlayer.create(
        context.applicationContext,
        soundResource,
        audioAttributes,
        AudioManager.AUDIO_SESSION_ID_GENERATE
      ) ?: return

      activePlayer = player
      player.setVolume(1.0f, 1.0f)
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
    } catch (_: Exception) {
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
