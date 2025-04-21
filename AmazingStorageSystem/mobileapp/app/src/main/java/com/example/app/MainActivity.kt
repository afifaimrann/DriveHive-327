package com.example.storeit

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GravityCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.storeit.databinding.ActivityMainBinding
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import com.google.android.material.navigation.NavigationView
import com.google.api.services.drive.Drive
import com.google.api.services.drive.model.File
import com.google.auth.http.HttpCredentialsAdapter
import com.google.cloud.firestore.Firestore
import com.google.firebase.auth.FirebaseAuth
import com.dropbox.core.DbxRequestConfig
import com.dropbox.core.DbxWebAuth
import com.dropbox.core.v2.DbxClientV2
import java.util.*
import android.widget.Button
import androidx.appcompat.widget.SearchView
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.multipart.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.await
import java.io.OutputStream
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.jackson2.JacksonFactory
import com.google.api.client.http.AbstractInputStreamContent
import com.google.api.client.http.FileContent
import com.google.api.services.drive.model.FileList

class MainActivity : AppCompatActivity(), NavigationView.OnNavigationItemSelectedListener {

    private lateinit var binding: ActivityMainBinding
    private val filePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { handleFileSelection(it) }
    }
    private val RC_GOOGLE_SIGN_IN = 
    private val RC_DROPBOX_AUTH = 

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Authentication setup
        setupAuthButtons()

        // Navigation drawer setup
        val toggle = ActionBarDrawerToggle(
            this,
            binding.drawerLayout,
            binding.appBarLayout.getChildAt(0) as View,
            R.string.navigation_drawer_open,
            R.string.navigation_drawer_close
        )
        binding.drawerLayout.addDrawerListener(toggle)
        toggle.syncState()
        binding.navView.setNavigationItemSelectedListener(this)

        // File management setup
        setupFileList()
        binding.fabUpload.setOnClickListener { filePicker.launch("*/*") }
        setupSearchView()
        setupDownloadButton()
    }

    private fun setupAuthButtons() {
        findViewById<Button>(R.id.btn_google).setOnClickListener { signInWithGoogle() }
        findViewById<Button>(R.id.btn_dropbox).setOnClickListener { signInWithDropbox() }
        findViewById<Button>(R.id.btn_telegram).setOnClickListener { /* Telegram implementation */ }
    }

    private fun signInWithGoogle() {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestScopes(Scope("https://www.googleapis.com/auth/drive.file"))
            .build()
        GoogleSignIn.getClient(this, gso).signInIntent.also {
            startActivityForResult(it, RC_GOOGLE_SIGN_IN)
        }
    }

    private fun signInWithDropbox() {
        val dbxAuth = DbxWebAuth.newRequestBuilder()
            .withNoRedirect()
            .build(DbxRequestConfig("your_app_name"))
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(dbxAuth.authorize(DbxWebAuth.newRequestBuilder().build()))))
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            RC_GOOGLE_SIGN_IN -> handleGoogleSignInResult(data)
            RC_DROPBOX_AUTH -> handleDropboxSignInResult(data)
        }
    }

    private fun handleGoogleSignInResult(data: Intent?) {
        try {
            GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException::class.java)?.let {
                mergeGoogleStorage(it)
            }
        } catch (e: ApiException) {
            // Handle error
        }
    }

    private fun handleDropboxSignInResult(data: Intent?) {
        data?.getStringExtra("access_token")?.let {
            mergeDropboxStorage(it)
        }
    }

    private fun mergeGoogleStorage(account: GoogleSignInAccount) {
        // Implement Google Drive integration
    }

    private fun mergeDropboxStorage(accessToken: String) {
        DbxClientV2(DbxRequestConfig("your_app_name"), accessToken).let {
            // Implement Dropbox integration
        }
    }

    // Remaining file management functions
    private fun setupFileList() {
        binding.rvFiles.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = FileAdapter(listOf("Document1.pdf", "Image.jpg", "Report.docx"))
        }
    }

    /*private fun setupSearchView() {
        (binding.searchView as SearchView).setOnQueryTextListener(object : SearchView.OnQueryTextListener {
            override fun onQueryTextSubmit(query: String?) = true
            override fun onQueryTextChange(newText: String?) = false
        })
    }
*/
    private fun setupDownloadButton() {
        binding.btnDownload.setOnClickListener {
            binding.etDownloadFilename.text.toString().takeIf { it.isNotEmpty() }?.let { fileName ->
                downloadFile(fileName)
            }
        }
    }
 // Unable to integrate the server 'index.js' here, need help
    // Upload to Server
private fun handleFileSelection(uri: Uri) {
    val inputStream = contentResolver.openInputStream(uri)
    val file = inputStream?.readBytes()

    CoroutineScope(Dispatchers.IO).launch {
        try {
            val response = RetrofitClient.apiService.uploadFile(file!!)
            runOnUiThread { showToast("Upload successful!") }
        } catch (e: Exception) {
            runOnUiThread { showToast("Upload failed: ${e.message}") }
        }
    }
}
   // Download from Server
private fun downloadFile(fileName: String) {
    CoroutineScope(Dispatchers.IO).launch {
        try {
            val fileBytes = RetrofitClient.apiService.downloadFile(fileName)
            saveFileLocally(fileBytes)
            runOnUiThread { showToast("Download complete!") }
        } catch (e: Exception) {
            runOnUiThread { showToast("Download failed: ${e.message}") }
        }
    }
}

    override fun onNavigationItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.nav_google -> {}
            R.id.nav_dropbox -> {}
            R.id.nav_chatbot -> {}
            R.id.nav_logout -> {}
        }
        binding.drawerLayout.closeDrawer(GravityCompat.START)
        return true
    }

    override fun onBackPressed() {
        if (binding.drawerLayout.isDrawerOpen(GravityCompat.START)) {
            binding.drawerLayout.closeDrawer(GravityCompat.START)
        } else {
            super.onBackPressed()
        }
    }
}

// Server-side components (should be in separate module)
fun Application.configureRouting(db: Firestore, driveAccounts: List<DriveAccount>) {
    routing {
        post("/upload") { handleUpload(db, driveAccounts) }
        get("/files") { listFiles(db) }
        get("/download") { downloadFile(db, driveAccounts) }
    }
}
// Save to device storage
private fun saveFileLocally(bytes: ByteArray) {
    val file = File(getExternalFilesDir(null), "downloaded_file")
    FileOutputStream(file).use { it.write(bytes) }
}
// FileAdapter and data classes
class FileAdapter(private val files: List<String>) : androidx.recyclerview.widget.RecyclerView.Adapter<FileAdapter.ViewHolder>() {
    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int) = 
        ViewHolder(android.view.LayoutInflater.from(parent.context).inflate(R.layout.item_file, parent, false))
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(files[position])
    override fun getItemCount() = files.size

    inner class ViewHolder(view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view) {
        fun bind(fileName: String) {
            (itemView as android.widget.TextView).text = fileName
        }
    }
}

data class DriveAccount(val id: String, val auth: HttpCredentialsAdapter, val folderId: String)
data class FileData(val name: String, val mimeType: String, val size: Long, val isChunked: Boolean, 
                   val chunks: List<Chunk>?, val driveId: String?, val googleDrivefileId: String)
data class Chunk(val offset: Long, val sliceName: String, val driveId: String, val googleDrivefileId: String)
