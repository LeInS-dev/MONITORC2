package com.argos.remotecontrol.content

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/** Lee la galería de fotos del dispositivo vía MediaStore (permiso READ_MEDIA_IMAGES). */
object GalleryProvider {

    fun listJson(ctx: Context, offset: Int, limit: Int): Pair<Int, JSONArray> {
        val items = JSONArray()
        val proj = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_TAKEN,
        )
        val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        var total = 0
        ctx.contentResolver.query(uri, proj, null, null, "${MediaStore.Images.Media.DATE_TAKEN} DESC")?.use { c ->
            total = c.count
            val idI = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameI = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val wI = c.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
            val hI = c.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
            val sI = c.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
            val dI = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN)
            if (c.moveToPosition(offset)) {
                do {
                    if (items.length() >= limit) break
                    items.put(JSONObject().apply {
                        put("id", c.getLong(idI).toString())
                        put("name", c.getString(nameI) ?: "")
                        put("width", c.getInt(wI))
                        put("height", c.getInt(hI))
                        put("sizeBytes", c.getLong(sI))
                        put("dateTaken", c.getLong(dI))
                    })
                } while (c.moveToNext())
            }
        }
        return total to items
    }

    /** Miniatura JPEG (~256px). */
    fun thumbnail(ctx: Context, idStr: String): ByteArray? {
        val id = idStr.toLongOrNull() ?: return null
        val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        return try {
            val bmp: Bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ctx.contentResolver.loadThumbnail(uri, Size(256, 256), null)
            } else {
                ctx.contentResolver.openInputStream(uri)?.use { input ->
                    val opts = BitmapFactory.Options().apply { inSampleSize = 8 }
                    BitmapFactory.decodeStream(input, null, opts)
                } ?: return null
            }
            val bos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 60, bos)
            bmp.recycle()
            bos.toByteArray()
        } catch (_: Exception) {
            null
        }
    }

    /** Foto original completa. */
    fun full(ctx: Context, idStr: String): ByteArray? {
        val id = idStr.toLongOrNull() ?: return null
        val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        return try {
            ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (_: Exception) {
            null
        }
    }
}
