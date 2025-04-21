package com.example.filestore.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.filestore.R
import com.example.filestore.data.remote.ApiService
import com.example.filestore.data.remote.AuthRequest
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class RegisterActivity : AppCompatActivity() {

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
        setContentView(R.layout.activity_sign_up)

        val emailInput = findViewById<EditText>(R.id.email_input)
        val passwordInput = findViewById<EditText>(R.id.password_input)
        val confirmPasswordInput = findViewById<EditText>(R.id.confirm_password_input)
        val signupBtn = findViewById<MaterialButton>(R.id.signup_button)
        val loginLink = findViewById<TextView>(R.id.login_link)

        signupBtn.setOnClickListener {
            val email = emailInput.text.toString()
            val password = passwordInput.text.toString()
            val confirmPassword = confirmPasswordInput.text.toString()

            if (email.isEmpty() || password.isEmpty() || confirmPassword.isEmpty()) {
                safeToast("Please fill all fields")
                return@setOnClickListener
            }

            if (password != confirmPassword) {
                safeToast("Passwords do not match")
                return@setOnClickListener
            }

            lifecycleScope.launch {
                try {
                    val response = api.register(AuthRequest(email, password))
                    Preferences.saveToken(this@RegisterActivity, response.token)
                    safeToast("Registered Successfully, please login.")
                    startActivity(Intent(this@RegisterActivity, LoginActivity::class.java))
                    finish()
                } catch (e: HttpException) {
                    val errorBody = e.response()?.errorBody()?.string()
                    safeToast("HTTP Error: ${e.code()} ${errorBody ?: "Unknown error"}")
                } catch (e: Exception) {
                    safeToast("Error: ${e.message}")
                }
            }
        }

        loginLink.setOnClickListener {
            startActivity(Intent(this, LoginActivity::class.java))
        }
    }
}

object Preferences {
    fun saveToken(context: Context, token: String) {
        val sharedPreferences = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)
        sharedPreferences.edit().putString("token", token).apply()
    }
}