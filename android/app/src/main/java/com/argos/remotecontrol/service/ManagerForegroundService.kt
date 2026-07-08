package com.argos.remotecontrol.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Rect
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.argos.remotecontrol.Prefs
import com.argos.remotecontrol.R
import com.argos.remotecontrol.capture.ScreenCapturer
import com.argos.remotecontrol.control.RemoteAccessibilityService
import com.argos.remotecontrol.content.DeviceFileProvider
import com.argos.remotecontrol.content.GalleryProvider
import com.argos.remotecontrol.enroll.StatusActivity
import com.argos.remotecontrol.net.Protocol
import com.argos.remotecontrol.net.RelayClient
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Servicio en primer plano que mantiene la conexión con el relay, transmite la
 * pantalla bajo demanda y ejecuta comandos. Muestra siempre una notificación fija
 * (transparencia del enfoque consentido).
 */
class ManagerForegroundService : android.app.Service(), RelayClient.Listener {

    private lateinit var relay: RelayClient
    private val mainHandler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private var projection: MediaProjection? = null
    private var capturer: ScreenCapturer? = null
    private var reconnectDelay = 1000L

    override fun onCreate() {
        super.onCreate()
        startForegroundNotification()
        relay = RelayClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Datos de MediaProjection entregados desde el enrolamiento (opcional).
        if (intent != null && intent.hasExtra(EXTRA_RESULT_CODE)) {
            val code = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
            val data = if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
            } else {
                @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_DATA)
            }
            if (code != 0 && data != null) setupProjection(code, data)
        }
        connect()
        return START_STICKY
    }

    override fun onDestroy() {
        capturer?.stop()
        projection?.stop()
        relay.close()
        io.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /* ---------------- Conexión ---------------- */

    private fun connect() {
        val url = Prefs.serverUrl(this)
        if (url.isBlank()) return
        // Añade el path del WS de dispositivo si no viene incluido.
        val full = if (url.contains("/ws/")) url else url.trimEnd('/') + "/ws/device"
        relay.connect(full)
    }

    override fun onOpen() {
        reconnectDelay = 1000L
        sendRegister()
        sendStatus()
    }

    override fun onClosed() {
        capturer?.stop()
        mainHandler.postDelayed({ connect() }, reconnectDelay)
        reconnectDelay = (reconnectDelay * 2).coerceAtMost(30_000L)
    }

    override fun onCommand(msg: JSONObject) {
        when (msg.optString("type")) {
            "subscribe" -> mainHandler.post { startStreaming() }
            "unsubscribe" -> mainHandler.post { capturer?.stop() }
            "tap" -> onMain { it.doTap(msg.optDouble("x").toFloat(), msg.optDouble("y").toFloat()) }
            "swipe" -> onMain {
                it.doSwipe(
                    msg.optDouble("x1").toFloat(),
                    msg.optDouble("y1").toFloat(),
                    msg.optDouble("x2").toFloat(),
                    msg.optDouble("y2").toFloat(),
                    msg.optLong("durationMs", 200),
                )
            }
            "text" -> onMain { it.doText(msg.optString("text")) }
            "key" -> onMain { it.doKey(msg.optString("key")) }
            "gallery:req" -> io.execute { handleGalleryReq(msg) }
            "photo:req" -> io.execute { handlePhotoReq(msg) }
            "file:req" -> io.execute { handleFileReq(msg) }
            "file:download" -> io.execute { handleFileDownload(msg) }
        }
    }

    private inline fun onMain(crossinline block: (RemoteAccessibilityService) -> Unit) {
        mainHandler.post { RemoteAccessibilityService.instance?.let { block(it) } }
    }

    /* ---------------- Registro / estado ---------------- */

    private fun sendRegister() {
        val (w, h) = realScreenSize()
        relay.sendJson(JSONObject().apply {
            put("type", "register")
            put("token", Prefs.enrollToken(this@ManagerForegroundService))
            put("deviceId", Prefs.deviceId(this@ManagerForegroundService))
            put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("androidVersion", Build.VERSION.RELEASE ?: "?")
            put("width", w)
            put("height", h)
        })
    }

    private fun sendStatus() {
        relay.sendJson(JSONObject().apply {
            put("type", "status")
            put("battery", batteryPercent())
        })
    }

    /* ---------------- Streaming ---------------- */

    private fun startStreaming() {
        val proj = projection ?: return // sin consentimiento de captura aún
        val (w, h) = realScreenSize()
        capturer?.stop()
        capturer = ScreenCapturer(proj, w, h, resources.displayMetrics.densityDpi) { jpeg ->
            relay.sendBinary(Protocol.frame(Protocol.JPEG, jpeg))
        }.also { it.startJpeg(fps = 4) }
    }

    private fun setupProjection(resultCode: Int, data: Intent) {
        val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = mgr.getMediaProjection(resultCode, data).apply {
            registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    capturer?.stop()
                    projection = null
                }
            }, mainHandler)
        }
    }

    /* ---------------- Galería / archivos ---------------- */

    private fun handleGalleryReq(msg: JSONObject) {
        val reqId = msg.optString("requestId")
        val (total, items) = GalleryProvider.listJson(this, msg.optInt("offset", 0), msg.optInt("limit", 200))
        relay.sendJson(JSONObject().apply {
            put("type", "gallery:list")
            put("requestId", reqId)
            put("total", total)
            put("items", items)
        })
        for (i in 0 until items.length()) {
            val id = items.getJSONObject(i).getString("id")
            GalleryProvider.thumbnail(this, id)?.let { sendBlob("thumb:$id", it) }
        }
    }

    private fun handlePhotoReq(msg: JSONObject) {
        val id = msg.optString("id")
        GalleryProvider.full(this, id)?.let { sendBlob("photo:$id", it) }
    }

    private fun handleFileReq(msg: JSONObject) {
        val reqId = msg.optString("requestId")
        val (path, entries) = DeviceFileProvider.listJson(msg.optString("path"))
        relay.sendJson(JSONObject().apply {
            put("type", "file:list")
            put("requestId", reqId)
            put("path", path)
            put("entries", entries)
        })
    }

    private fun handleFileDownload(msg: JSONObject) {
        val path = msg.optString("path")
        DeviceFileProvider.read(path)?.let { sendBlob("file:$path", it) }
    }

    /** Envía un blob en chunks de 60 KB. */
    private fun sendBlob(reqId: String, bytes: ByteArray) {
        val chunk = 60 * 1024
        var off = 0
        var index = 0
        if (bytes.isEmpty()) {
            relay.sendBinary(Protocol.blob(reqId, 0, true, bytes, 0, 0))
            return
        }
        while (off < bytes.size) {
            val len = minOf(chunk, bytes.size - off)
            val last = off + len >= bytes.size
            relay.sendBinary(Protocol.blob(reqId, index, last, bytes, off, len))
            off += len
            index++
        }
    }

    /* ---------------- Utilidades ---------------- */

    private fun realScreenSize(): Pair<Int, Int> {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val b: Rect = wm.currentWindowMetrics.bounds
            b.width() to b.height()
        } else {
            val dm = DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(dm)
            dm.widthPixels to dm.heightPixels
        }
    }

    private fun batteryPercent(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
        return bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun startForegroundNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW)
            nm.createNotificationChannel(ch)
        }
        val pi = PendingIntent.getActivity(
            this,
            0,
            Intent(this, StatusActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setOngoing(true)
            .setContentIntent(pi)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_DATA = "result_data"
        private const val CHANNEL = "argos_rc"
        private const val NOTIF_ID = 42

        fun start(ctx: Context, resultCode: Int = 0, data: Intent? = null) {
            val i = Intent(ctx, ManagerForegroundService::class.java)
            if (resultCode != 0 && data != null) {
                i.putExtra(EXTRA_RESULT_CODE, resultCode)
                i.putExtra(EXTRA_DATA, data)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
        }
    }
}
