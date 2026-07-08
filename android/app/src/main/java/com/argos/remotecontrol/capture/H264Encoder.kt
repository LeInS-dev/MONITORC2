package com.argos.remotecontrol.capture

import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import com.argos.remotecontrol.net.Protocol

/**
 * Codifica la pantalla a H.264 de baja latencia (Fase B). Emite paquetes NAL
 * (config / keyframe / delta) que el navegador decodifica con WebCodecs.
 */
class H264Encoder(
    private val projection: MediaProjection,
    private val width: Int,
    private val height: Int,
    private val densityDpi: Int,
    private val onPacket: (type: Int, data: ByteArray) -> Unit,
) {
    private var codec: MediaCodec? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var thread: HandlerThread? = null
    @Volatile private var running = false

    fun start(bitrate: Int = 4_000_000, fps: Int = 30) {
        stop()
        val w = width - width % 2
        val h = height - height % 2
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
        }
        val enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        enc.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val surface = enc.createInputSurface()
        enc.start()
        codec = enc
        virtualDisplay = projection.createVirtualDisplay(
            "argos-h264",
            w,
            h,
            densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            surface,
            null,
            null,
        )
        running = true
        val t = HandlerThread("argos-h264").also { it.start() }
        thread = t
        Handler(t.looper).post { drainLoop() }
    }

    private fun drainLoop() {
        val info = MediaCodec.BufferInfo()
        while (running) {
            val enc = codec ?: break
            val idx = try {
                enc.dequeueOutputBuffer(info, 10_000)
            } catch (_: Exception) {
                break
            }
            if (idx >= 0) {
                val buf = enc.getOutputBuffer(idx)
                if (buf != null && info.size > 0) {
                    buf.position(info.offset)
                    buf.limit(info.offset + info.size)
                    val data = ByteArray(info.size)
                    buf.get(data)
                    val type = when {
                        info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0 -> Protocol.H264_CONFIG
                        info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0 -> Protocol.H264_KEY
                        else -> Protocol.H264_DELTA
                    }
                    onPacket(type, data)
                }
                enc.releaseOutputBuffer(idx, false)
            }
        }
    }

    fun stop() {
        running = false
        try { virtualDisplay?.release() } catch (_: Exception) {}
        virtualDisplay = null
        try { codec?.stop(); codec?.release() } catch (_: Exception) {}
        codec = null
        thread?.quitSafely()
        thread = null
    }
}
