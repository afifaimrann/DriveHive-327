package com.example.filestore.utils

import android.content.Context
import android.content.SharedPreferences

object Preferences {
    private const val PREFS_NAME = "prefs"
    private const val JWT_TOKEN = "jwt_token"

    fun saveToken(context: Context, token: String) {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(JWT_TOKEN, token).apply()
    }

    fun getToken(context: Context): String? {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(JWT_TOKEN, null)
    }

    fun clearToken(context: Context) {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(JWT_TOKEN).apply()
    }
}