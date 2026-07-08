package com.argos.remotecontrol.net

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Cliente WebSocket hacia el servidor relay. La reconexión la orquesta el servicio. */
class RelayClient(private val listener: Listener) {

    interface Listener {
        fun onOpen()
        fun onCommand(msg: JSONObject)
        fun onClosed()
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private var ws: WebSocket? = null

    fun connect(url: String) {
        val req = Request.Builder().url(url).build()
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                listener.onOpen()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    listener.onCommand(JSONObject(text))
                } catch (_: Exception) {
                    // JSON inválido → ignorar
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                listener.onClosed()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                listener.onClosed()
            }
        })
    }

    fun sendJson(obj: JSONObject) {
        ws?.send(obj.toString())
    }

    fun sendBinary(bytes: ByteArray) {
        ws?.send(bytes.toByteString(0, bytes.size))
    }

    fun close() {
        ws?.close(1000, "bye")
        ws = null
    }
}
