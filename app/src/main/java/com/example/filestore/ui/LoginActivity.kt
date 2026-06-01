package com.example.filestore.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.filestore.R
import com.example.filestore.data.remote.ApiService
import com.example.filestore.data.remote.AuthRequest
import com.example.filestore.utils.Preferences
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class LoginActivity : AppCompatActivity() {

    private val retrofit = Retrofit.Builder()
        .baseUrl("http://10.0.2.2:5000/")
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    private val api = retrofit.create(ApiService::class.java)

    private var lastToastTime = 0L
    private fun safeToast(message: String) {
        val now = System.currentTimeMillis()
        if (now - lastToastTime > 2000) {
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
            lastToastTime = now
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val usernameInput = findViewById<EditText>(R.id.username_input)
        val passwordInput = findViewById<EditText>(R.id.password_input)
        val login = findViewById<Button>(R.id.login)
        val registerBtn = findViewById<TextView>(R.id.register)

        login.setOnClickListener {
            val username = usernameInput.text.toString()
            val password = passwordInput.text.toString()

            lifecycleScope.launch {
                try {
                    val response = api.login(AuthRequest(username, password))
                    Preferences.saveToken(this@LoginActivity, response.token)
                    safeToast("Login Successful")
                    startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                    finish()
                } catch (e: Exception) {
                    safeToast("Login Failed: ${e.message}")
                }
            }
        }

        registerBtn.setOnClickListener {
            startActivity(Intent(this, RegisterActivity::class.java))
        }
    }
}
