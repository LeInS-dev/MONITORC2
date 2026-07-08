package com.argos.remotecontrol.enroll

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.appcompat.app.AppCompatActivity
import com.argos.remotecontrol.Prefs
import com.argos.remotecontrol.control.RemoteAccessibilityService
import com.argos.remotecontrol.databinding.ActivityStatusBinding

/** Estado del equipo administrado: conexión, permisos y accesos a Ajustes. */
class StatusActivity : AppCompatActivity() {

    private lateinit var b: ActivityStatusBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityStatusBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.accessibilityButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        b.filesPermButton.setOnClickListener { openAllFilesAccess() }
    }

    override fun onResume() {
        super.onResume()
        val acc = RemoteAccessibilityService.instance != null
        val allFiles = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.os.Environment.isExternalStorageManager()
        } else {
            true
        }
        b.statusText.text = buildString {
            append("Servidor: ").append(Prefs.serverUrl(this@StatusActivity)).append('\n')
            append("Equipo: ").append(Prefs.deviceId(this@StatusActivity)).append('\n')
            append("Control (Accesibilidad): ").append(if (acc) "ACTIVO ✓" else "PENDIENTE — actívalo abajo").append('\n')
            append("Acceso a archivos: ").append(if (allFiles) "completo ✓" else "limitado").append('\n')
            append("\nMientras la notificación fija esté visible, este equipo es administrable remotamente.")
        }
    }

    private fun openAllFilesAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        Uri.parse("package:$packageName"),
                    ),
                )
            } catch (_: Exception) {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        }
    }
}
