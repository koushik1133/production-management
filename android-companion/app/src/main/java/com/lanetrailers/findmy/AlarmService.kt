package com.lanetrailers.findmy

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.URI
import java.net.http.HttpClient
import java.net.http.WebSocket
import java.nio.ByteBuffer
import java.util.concurrent.CompletionStage
import java.util.concurrent.Executors

class AlarmService : Service() {

    companion object {
        const val CHANNEL_ID = "lane_find_my_foreground_service"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP_ALARM = "com.lanetrailers.findmy.ACTION_STOP_ALARM"
        const val ACTION_START_SERVICE = "com.lanetrailers.findmy.ACTION_START_SERVICE"
        const val PREFS_NAME = "lane_find_my_prefs"
        const val KEY_SLOT = "assigned_slot"

        var isServiceRunning = false
        var isRinging = false
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var webSocket: WebSocket? = null
    private val executor = Executors.newSingleThreadScheduledExecutor()

    override fun onCreate() {
        super.onCreate()
        isServiceRunning = true
        acquireWakeLock()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildForegroundNotification())
        connectToSupabaseRealtime()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_ALARM) {
            stopAlarm()
        }
        return START_STICKY
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LaneFindMy::ServiceWakeLock").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Find My Tablet Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps connection open 24/7 to receive remote alarm triggers"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val slot = prefs.getString(KEY_SLOT, "T1") ?: "T1"

        val openIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Find My Tablet Active: $slot")
            .setContentText("Listening 24/7 for manager alarm sounds")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun connectToSupabaseRealtime() {
        executor.execute {
            try {
                val supabaseUrl = "wss://fzwaxvlvfgkmvemfdjbk.supabase.co/realtime/v1/websocket?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d2F4dmx2ZmdrbXZlbWZkamJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzM3MTEsImV4cCI6MjA5NzEwOTcxMX0.K6SxhFdAGL1uNNEvtRjMrsQP4aZohqse_SBotrFNJXU&vsn=1.0.0"
                
                val client = HttpClient.newHttpClient()
                webSocket = client.newWebSocketBuilder()
                    .buildAsync(URI.create(supabaseUrl), object : WebSocket.Listener {
                        override fun onOpen(ws: WebSocket) {
                            // Join the broadcast channel: tablet_alarm_global_v8
                            val joinMessage = JSONObject().apply {
                                put("topic", "realtime:tablet_alarm_global_v8")
                                put("event", "phx_join")
                                put("payload", JSONObject())
                                put("ref", "1")
                            }
                            ws.sendText(joinMessage.toString(), true)
                            // Start heartbeat every 25 seconds
                            startHeartbeat(ws)
                            WebSocket.Listener.super.onOpen(ws)
                        }

                        override fun onText(ws: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*>? {
                            try {
                                val json = JSONObject(data.toString())
                                val event = json.optString("event")
                                if (event == "remote_command") {
                                    val payload = json.optJSONObject("payload")
                                    val targetSlot = payload?.optString("target_slot")
                                    val command = payload?.optString("command")

                                    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                                    val mySlot = prefs.getString(KEY_SLOT, "T1") ?: "T1"

                                    if (targetSlot == mySlot) {
                                        if (command == "PLAY_SOUND") {
                                            startAlarm()
                                        } else if (command == "STOP_SOUND") {
                                            stopAlarm()
                                        }
                                    }
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                            return WebSocket.Listener.super.onText(ws, data, last)
                        }

                        override fun onClose(ws: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? {
                            // Auto-reconnect after 3 seconds
                            Handler(Looper.getMainLooper()).postDelayed({
                                connectToSupabaseRealtime()
                            }, 3000)
                            return WebSocket.Listener.super.onClose(ws, statusCode, reason)
                        }

                        override fun onError(ws: WebSocket, error: Throwable) {
                            Handler(Looper.getMainLooper()).postDelayed({
                                connectToSupabaseRealtime()
                            }, 5000)
                        }
                    }).join()
            } catch (e: Exception) {
                Handler(Looper.getMainLooper()).postDelayed({
                    connectToSupabaseRealtime()
                }, 5000)
            }
        }
    }

    private fun startHeartbeat(ws: WebSocket) {
        executor.scheduleWithFixedDelay({
            try {
                val heartbeat = JSONObject().apply {
                    put("topic", "phoenix")
                    put("event", "heartbeat")
                    put("payload", JSONObject())
                    put("ref", System.currentTimeMillis().toString())
                }
                ws.sendText(heartbeat.toString(), true)
            } catch (e: Exception) {
                // ignore
            }
        }, 25, 25, java.util.concurrent.TimeUnit.SECONDS)
    }

    fun startAlarm() {
        if (isRinging) return
        isRinging = true

        // Wake screen
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val screenWakeLock = powerManager.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "LaneFindMy::AlarmWakeScreen"
        )
        screenWakeLock.acquire(30000)

        // Launch full screen ringing overlay
        val overlayIntent = Intent(this, AlarmRingingActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        startActivity(overlayIntent)

        // Maximize volume on ALARM stream
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)

        // Play alarm sound
        try {
            val alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            mediaPlayer = MediaPlayer().apply {
                setDataSource(applicationContext, alertUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Start vibration
        vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 500, 200, 500, 200, 1000), 0))
        } else {
            vibrator?.vibrate(longArrayOf(0, 500, 200, 500, 200, 1000), 0)
        }
    }

    fun stopAlarm() {
        isRinging = false
        mediaPlayer?.stop()
        mediaPlayer?.release()
        mediaPlayer = null
        vibrator?.cancel()
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        stopAlarm()
        wakeLock?.release()
        webSocket?.abort()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
