package com.example.filestore.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.util.Log
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.dropbox.core.android.Auth
import com.example.filestore.R
import com.example.filestore.data.remote.ApiModels
import com.example.filestore.data.remote.GenericMessage
import com.example.filestore.data.remote.ApiService
import com.example.filestore.data.remote.RetrofitClient
import com.example.filestore.databinding.ActivityMainBinding
import com.example.filestore.utils.Preferences
import com.google.android.gms.auth.api.signin.*
import com.google.android.gms.common.api.Scope
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.tasks.Task
import com.google.api.client.extensions.android.http.AndroidHttp
import com.google.api.client.googleapis.extensions.android.gms.auth.GoogleAccountCredential
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.drive.Drive
import com.google.api.services.drive.DriveScopes
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: MainViewModel
    private lateinit var fileAdapter: FileAdapter
    private lateinit var googleSignInClient: GoogleSignInClient
    private var driveService: Drive? = null

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl("http://10.0.2.2:5000/")
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    private val api: ApiService = retrofit.create(ApiService::class.java)

    private val selectFileLauncher =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
            uri?.let { uploadFile(it) }
        }

    companion object {
        private const val RC_SIGN_IN_GOOGLE = 1001
        private const val DROPBOX_APP_KEY = "DROPBOX_API_KEY"
        private const val SERVER_BASE_URL = "https://server.address:3000/"
    }

    private val signInLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        handleSignInResult(task)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        viewModel = ViewModelProvider(this)[MainViewModel::class.java]
        fileAdapter = FileAdapter { fileName -> downloadFile(fileName) }
        binding.fileList.layoutManager = LinearLayoutManager(this)
        binding.fileList.adapter = fileAdapter

        viewModel.fileList.observe(this) { files ->
            fileAdapter.setFiles(files)
        }

        binding.btnGoogle.setOnClickListener {
            signInWithGoogle()
        }

        binding.btnDropbox.setOnClickListener {
            signInWithDropbox()
        }

        binding.btnChatbot.setOnClickListener {
            TelegramSyncDialogFragment().show(supportFragmentManager, "TelegramSyncDialog")
        }

        binding.uploadFab.setOnClickListener {
            selectFileLauncher.launch("*/*")
        }

        binding.searchButton.setOnClickListener {
            val query = binding.searchInput.text.toString()
            viewModel.searchFiles(query)
        }

        setupGoogleSignIn()
        fetchFiles()
    }

    private fun setupGoogleSignIn() {
        val signInOptions = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestScopes(Scope(DriveScopes.DRIVE_FILE))
            .requestServerAuthCode(getString(R.string.google_server_client_id), true)
            .requestIdToken(getString(R.string.google_server_client_id))
            .build()

        googleSignInClient = GoogleSignIn.getClient(this, signInOptions)
    }

    private fun signInWithGoogle() {
        signInLauncher.launch(googleSignInClient.signInIntent)
    }

    private fun handleSignInResult(completedTask: Task<GoogleSignInAccount>) {
        try {
            val account = completedTask.getResult(ApiException::class.java)

            val credential = GoogleAccountCredential.usingOAuth2(
                this, listOf(DriveScopes.DRIVE_FILE)
            ).apply {
                selectedAccount = account.account
            }

            driveService = Drive.Builder(
                AndroidHttp.newCompatibleTransport(),
                GsonFactory.getDefaultInstance(),
                credential
            ).setApplicationName("FileStore").build()

            account.serverAuthCode?.let { authCode ->
                val callbackUrl = "$SERVER_BASE_URL/oauth/callback/google?code=$authCode&state=android"
                CustomTabsIntent.Builder().build().launchUrl(this, Uri.parse(callbackUrl))
            }

            Toast.makeText(this, "Signed in as: ${account.email}", Toast.LENGTH_SHORT).show()
        } catch (e: ApiException) {
            Toast.makeText(this, "Google sign-in failed: ${e.statusCode}", Toast.LENGTH_SHORT).show()
            Log.e("MainActivity", "Sign-in failed", e)
        }
    }

    private fun signInWithDropbox() {
        Auth.startOAuth2Authentication(this, DROPBOX_APP_KEY)
    }

    override fun onResume() {
        super.onResume()

        // Get Dropbox access token after returning from OAuth
        val accessToken = Auth.getOAuth2Token()

        accessToken?.let {
            // Send the token to your backend using a callback URL
            val callbackUrl = "$SERVER_BASE_URL/oauth/callback/dropbox?code=$it&state=android"
            CustomTabsIntent.Builder().build().launchUrl(this, Uri.parse(callbackUrl))

            // Clear the stored token to avoid reusing it
            Auth.clearOAuth2Token()
        }
    }

    private fun fetchFiles() {
        lifecycleScope.launch {
            try {
                val token = "Bearer ${Preferences.getToken(this@MainActivity)}"
                val response = RetrofitClient.api.getFiles(token)
                viewModel.updateFileList(response.files)
            } catch (e: Exception) {
                handleHttpException(e)
            }
        }
    }

    @SuppressLint("UnsanitizedFilenameFromContentProvider")
    private fun uploadFile(uri: Uri) {
        lifecycleScope.launch {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                cursor.moveToFirst()
                val fileName = cursor.getString(nameIndex)
                val inputStream = contentResolver.openInputStream(uri)!!
                val tempFile = File(cacheDir, fileName)
                val outputStream = FileOutputStream(tempFile)
                inputStream.copyTo(outputStream)

                val requestBody =
                    tempFile.asRequestBody(contentResolver.getType(uri)?.toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("file", fileName, requestBody)

                try {
                    val token = "Bearer ${Preferences.getToken(this@MainActivity)}"
                    RetrofitClient.api.uploadFile(token, part)
                    Toast.makeText(this@MainActivity, "Upload Successful", Toast.LENGTH_SHORT).show()
                    fetchFiles()
                } catch (e: Exception) {
                    handleHttpException(e)
                }
            }
        }
    }

//changes
    private fun downloadFile(fileName: String) {
        lifecycleScope.launch {
            try {
                val token = "Bearer ${Preferences.getToken(this@MainActivity)}"
                val responseBody = api.downloadFile(token, fileName).body()

                if (responseBody != null) {
                    val fileBytes = responseBody.bytes()
                    val downloadsFolder = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                    val outputFile = File(downloadsFolder, fileName)
                    outputFile.writeBytes(fileBytes)

                    Toast.makeText(this@MainActivity, "File downloaded to ${outputFile.path}", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this@MainActivity, "File download failed: Response is empty", Toast.LENGTH_LONG).show()
                }
            } catch (e: HttpException) {
                handleHttpException(e)
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun handleHttpException(e: Exception) {
        if (e is HttpException && e.code() == 403) {
            Toast.makeText(this, "Session Expired. Please login again.", Toast.LENGTH_LONG).show()
            Preferences.clearToken(this)
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        } else {
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}