package com.argos.remotecontrol.capture

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import java.io.ByteArrayOutputStream

/**
 * Captura la pantalla vía MediaProjection y emite frames JPEG (Fase A).
 * Baja la resolución para ahorrar ancho de banda; las coordenadas de control
 * siguen usando la resolución completa reportada en el registro.
 */
class ScreenCapturer(
    private val projection: MediaProjection,
    private val fullWidth: Int,
    private val fullHeight: Int,
    private val densityDpi: Int,
    private val onJpeg: (ByteArray) -> Unit,
) {
    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var thread: HandlerThread? = null
    private var lastEmit = 0L
    private var capW = 0
    private var capH = 0

    fun startJpeg(fps: Int, quality: Int = 45, maxDim: Int = 720) {
        stop()
        val largest = maxOf(fullWidth, fullHeight)
        val scale = if (largest > maxDim) maxDim.toFloat() / largest else 1f
        capW = ((fullWidth * scale).toInt()).let { it - it % 2 }
        capH = ((fullHeight * scale).toInt()).let { it - it % 2 }
        if (capW <= 0 || capH <= 0) { capW = fullWidth; capH = fullHeight }
        val minIntervalMs = (1000 / fps.coerceIn(1, 30)).toLong()

        val t = HandlerThread("argos-cap").also { it.start() }
        thread = t
        val handler = Handler(t.looper)

        val reader = ImageReader.newInstance(capW, capH, PixelFormat.RGBA_8888, 2)
        imageReader = reader
        reader.setOnImageAvailableListener({ r ->
            val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val now = System.currentTimeMillis()
                if (now - lastEmit < minIntervalMs) return@setOnImageAvailableListener
                lastEmit = now
                val plane = image.planes[0]
                val buffer = plane.buffer
                val pixelStride = plane.pixelStride
                val rowStride = plane.rowStride
                val rowPadding = rowStride - pixelStride * capW
                val bmpW = capW + rowPadding / pixelStride
                val bmp = Bitmap.createBitmap(bmpW, capH, Bitmap.Config.ARGB_8888)
                bmp.copyPixelsFromBuffer(buffer)
                val cropped = if (bmpW != capW) Bitmap.createBitmap(bmp, 0, 0, capW, capH) else bmp
                val bos = ByteArrayOutputStream()
                cropped.compress(Bitmap.CompressFormat.JPEG, quality, bos)
                onJpeg(bos.toByteArray())
                if (cropped !== bmp) cropped.recycle()
                bmp.recycle()
            } catch (_: Exception) {
                // frame roto → ignorar
            } finally {
                image.close()
            }
        }, handler)

        virtualDisplay = projection.createVirtualDisplay(
            "argos-cap",
            capW,
            capH,
            densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface,
            null,
            handler,
        )
    }

    fun stop() {
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
        thread?.quitSafely()
        thread = null
    }
}
