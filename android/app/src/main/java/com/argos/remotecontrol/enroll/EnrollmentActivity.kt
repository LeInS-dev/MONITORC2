package com.argos.remotecontrol.enroll

import android.Manifest
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.argos.remotecontrol.Prefs
import com.argos.remotecontrol.databinding.ActivityEnrollBinding
import com.argos.remotecontrol.service.ManagerForegroundService

/**
 * Pantalla de enrolamiento consentido: divulgación clara → "Acepto" → permisos
 * (captura de pantalla, fotos, notificaciones) → arranque del servicio.
 */
class EnrollmentActivity : AppCompatActivity() {

    private lateinit var b: ActivityEnrollBinding
    private lateinit var projectionManager: MediaProjectionManager

    private val permsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            requestProjection()
        }

    private val projectionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
            if (res.resultCode == RESULT_OK && res.data != null) {
                ManagerForegroundService.start(this, res.resultCode, res.data)
            } else {
                // Sin captura de pantalla: el resto (control/galería/archivos) igual funciona.
                ManagerForegroundService.start(this)
            }
            goStatus()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityEnrollBinding.inflate(layoutInflater)
        setContentView(b.root)
        projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        b.serverUrl.setText(Prefs.serverUrl(this))
        b.enrollToken.setText(Prefs.enrollToken(this))
        b.acceptButton.setOnClickListener { onAccept() }

        if (Prefs.isEnrolled(this)) {
            b.statusText.text = "Este equipo ya está enrolado. Volver a aceptar re-activará la administración."
        }
    }

    private fun onAccept() {
        val url = b.serverUrl.text.toString().trim()
        val token = b.enrollToken.text.toString().trim()
        if (url.isEmpty()) {
            b.statusText.text = "Ingresa la URL del servidor (wss://host:puerto)."
            return
        }
        Prefs.save(this, url, token)

        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
            perms.add(Manifest.permission.READ_MEDIA_IMAGES)
        } else {
            perms.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        permsLauncher.launch(perms.toTypedArray())
    }

    private fun requestProjection() {
        projectionLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    private fun goStatus() {
        startActivity(Intent(this, StatusActivity::class.java))
        finish()
    }
}
