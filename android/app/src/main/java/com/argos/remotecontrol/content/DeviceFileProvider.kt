package com.argos.remotecontrol.content

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Explorador de archivos. Acceso amplio requiere MANAGE_EXTERNAL_STORAGE
 * (grant explícito del usuario); si no, queda acotado al almacenamiento accesible.
 */
object DeviceFileProvider {

    fun listJson(path: String): Pair<String, JSONArray> {
        val dir = File(path)
        val entries = JSONArray()
        val resolved = if (dir.exists() && dir.isDirectory) dir else File("/sdcard")
        resolved.listFiles()?.sortedWith(compareByDescending<File> { it.isDirectory }.thenBy { it.name.lowercase() })
            ?.forEach { f ->
                entries.put(JSONObject().apply {
                    put("name", f.name)
                    put("path", f.absolutePath)
                    put("isDir", f.isDirectory)
                    put("sizeBytes", if (f.isFile) f.length() else 0L)
                    put("modified", f.lastModified())
                })
            }
        return resolved.absolutePath to entries
    }

    fun read(path: String): ByteArray? {
        val f = File(path)
        return if (f.exists() && f.isFile) {
            try {
                f.readBytes()
            } catch (_: Exception) {
                null
            }
        } else {
            null
        }
    }
}
