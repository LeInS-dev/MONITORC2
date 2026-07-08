package com.argos.remotecontrol.net

import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets

/**
 * Framing binario que espera el servidor (ver server/src/protocol.ts).
 * Dispositivo → Servidor: [type:u8][payload...]
 */
object Protocol {
    const val JPEG = 1
    const val H264_CONFIG = 2
    const val H264_KEY = 3
    const val H264_DELTA = 4
    const val BLOB = 10

    /** Antepone el byte de tipo a un payload de vídeo (JPEG/H264). */
    fun frame(type: Int, payload: ByteArray, offset: Int = 0, len: Int = payload.size): ByteArray {
        val out = ByteArray(len + 1)
        out[0] = type.toByte()
        System.arraycopy(payload, offset, out, 1, len)
        return out
    }

    /**
     * Trama BLOB (thumbnail/foto/chunk de archivo):
     * [BLOB][reqIdLen][reqId][chunkIndex u32 BE][last u8][bytes]
     */
    fun blob(reqId: String, chunkIndex: Int, last: Boolean, bytes: ByteArray, offset: Int = 0, len: Int = bytes.size): ByteArray {
        val id = reqId.toByteArray(StandardCharsets.UTF_8)
        val bos = ByteArrayOutputStream(len + id.size + 8)
        bos.write(BLOB)
        bos.write(id.size)
        bos.write(id)
        bos.write((chunkIndex ushr 24) and 0xFF)
        bos.write((chunkIndex ushr 16) and 0xFF)
        bos.write((chunkIndex ushr 8) and 0xFF)
        bos.write(chunkIndex and 0xFF)
        bos.write(if (last) 1 else 0)
        bos.write(bytes, offset, len)
        return bos.toByteArray()
    }
}
