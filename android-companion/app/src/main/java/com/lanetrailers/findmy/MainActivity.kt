package com.lanetrailers.findmy

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var spinnerSlot: Spinner
    private lateinit var btnSaveSlot: Button
    private lateinit var btnTestAlarm: Button
    private lateinit var btnIgnoreBattery: Button
    private lateinit var txtStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        spinnerSlot = findViewById(R.id.spinnerSlot)
        btnSaveSlot = findViewById(R.id.btnSaveSlot)
        btnTestAlarm = findViewById(R.id.btnTestAlarm)
        btnIgnoreBattery = findViewById(R.id.btnIgnoreBattery)
        txtStatus = findViewById(R.id.txtStatus)

        val slots = arrayOf("T1 (Bay 1 - Assembly)", "T2 (Bay 2 - Welding)", "T3 (Bay 3 - Finishing)", "manager (Office)")
        val slotKeys = arrayOf("T1", "T2", "T3", "manager")

        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, slots)
        spinnerSlot.adapter = adapter

        val prefs = getSharedPreferences(AlarmService.PREFS_NAME, Context.MODE_PRIVATE)
        val currentSlot = prefs.getString(AlarmService.KEY_SLOT, "T1") ?: "T1"
        val selectedIndex = slotKeys.indexOf(currentSlot).coerceAtLeast(0)
        spinnerSlot.setSelection(selectedIndex)

        btnSaveSlot.setOnClickListener {
            val selectedKey = slotKeys[spinnerSlot.selectedItemPosition]
            prefs.edit().putString(AlarmService.KEY_SLOT, selectedKey).apply()
            Toast.makeText(this, "✅ Assigned this Tablet to: $selectedKey", Toast.LENGTH_SHORT).show()
            updateStatus()
            restartService()
        }

        btnTestAlarm.setOnClickListener {
            val serviceIntent = Intent(this, AlarmService::class.java)
            startService(serviceIntent)
            Toast.makeText(this, "🔊 Testing Alarm Sound...", Toast.LENGTH_SHORT).show()
        }

        btnIgnoreBattery.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } else {
                    Toast.makeText(this, "✅ Battery optimization already disabled for 24/7 background operation", Toast.LENGTH_SHORT).show()
                }
            }
        }

        startServiceForeground()
        updateStatus()
    }

    private fun startServiceForeground() {
        val intent = Intent(this, AlarmService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun restartService() {
        stopService(Intent(this, AlarmService::class.java))
        startServiceForeground()
    }

    private fun updateStatus() {
        val prefs = getSharedPreferences(AlarmService.PREFS_NAME, Context.MODE_PRIVATE)
        val slot = prefs.getString(AlarmService.KEY_SLOT, "T1") ?: "T1"
        txtStatus.text = "🟢 Active 24/7 Background Standby: $slot\nConnected to Supabase Realtime WebSocket"
    }
}
