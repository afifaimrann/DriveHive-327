package com.example.storeit

import android.content.Intent
import android.net.Uri
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.core.view.GravityCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.bumptech.glide.Glide
import com.example.storeit.databinding.ActivityMainBinding
import com.google.android.material.navigation.NavigationView
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.plugins.multipart.*
import io.ktor.utils.io.*
import com.google.cloud.firestore.*
import com.google.api.services.drive.*
import com.google.api.services.drive.model.*
import com.google.auth.http.HttpCredentialsAdapter
import com.google.auth.oauth2.GoogleCredentials
import java.io.*
import java.util.*
import kotlinx.coroutines.*
import java.nio.file.*

class MainActivity : AppCompatActivity(), NavigationView.OnNavigationItemSelectedListener {

    private lateinit var binding: ActivityMainBinding
    private val filePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { handleFileSelection(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Setup action bar toggle
        val toggle = ActionBarDrawerToggle(
            this,
            binding.drawerLayout,
            binding.appBarLayout.getChildAt(0) as View,
            R.string.navigation_drawer_open,
            R.string.navigation_drawer_close
        )
        binding.drawerLayout.addDrawerListener(toggle)
        toggle.syncState()

        // Setup navigation view
        binding.navView.setNavigationItemSelectedListener(this)

        // Setup file list
        setupFileList()

        // Setup FAB click listener
        binding.fabUpload.setOnClickListener {
            filePicker.launch("*/*")
        }

        // Setup search view
        /*binding.searchView.setOnQueryTextListener(object : androidx.appcompat.widget.SearchView.OnQueryTextListener {
            override fun onQueryTextSubmit(query: String?): Boolean {
                query?.let { performSearch(it) }
                return true
            }

            override fun onQueryTextChange(newText: String?): Boolean {
                return false
            }
        })*/

        // Setup download button
        binding.btnDownload.setOnClickListener {
            val fileName = binding.etDownloadFilename.text.toString()
            if (fileName.isNotEmpty()) {
                downloadFile(fileName)
            }
        }
    }

    private fun setupFileList() {
        val files = listOf(
            "Document1.pdf",
            "Image.jpg",
            "Report.docx",
            "Presentation.pptx",
            "Data.xlsx"
        )

        binding.rvFiles.layoutManager = LinearLayoutManager(this)
        binding.rvFiles.adapter = FileAdapter(files)
    }

       private fun Application.configureRouting(
    db: Firestore,
    driveAccounts: List<DriveAccount>,
    chunkLimit: Long = 600 * 1024 * 1024 // 600MB in bytes
) {
    routing {
        post("/upload") {
            val multipartData = call.receiveMultipart()
            var file: PartData.FileItem? = null
            
            multipartData.forEachPart { part ->
                if (part is PartData.FileItem) {
                    file = part
                }
            }
            
            file?.let { uploadedFile ->
                val fileName = uploadedFile.originalFileName!!
                val fileSize = uploadedFile.content.available().toLong()
                
                if (fileSize > chunkLimit) {
                    call.chunkedUpload(uploadedFile, fileName, fileSize, db, driveAccounts)
                } else {
                    call.simpleUpload(uploadedFile, fileName, fileSize, db, driveAccounts)
                }
            } ?: run {
                call.respond(HttpStatusCode.BadRequest, "No file uploaded")
            }
        }
        
        get("/files") {
            call.listFiles(db)
        }
    }
}

private suspend fun ApplicationCall.chunkedUpload(
    uploadedFile: PartData.FileItem,
    fileName: String,
    fileSize: Long,
    db: Firestore,
    driveAccounts: List<DriveAccount>
) {
    try {
        val chunkUploads = sliceDriveFunction(uploadedFile)
        
        val fileMetaData = mapOf(
            "name" to fileName,
            "size" to fileSize,
            "uploadedAt" to Date().time,
            "isChunked" to true,
            "chunks" to chunkUploads,
            "mimeType" to uploadedFile.contentType?.toString() ?: "application/octet-stream"
        )
        
        db.collection("files").add(fileMetaData).await()
        uploadedFile.dispose()
        
        respond(mapOf(
            "message" to "File upload success in chunks.",
            "chunks" to chunkUploads
        ))
    } catch (e: Exception) {
        println("Error during chunked upload: $e")
        respond(HttpStatusCode.InternalServerError, "Error uploading file in chunks")
    }
}

private suspend fun ApplicationCall.simpleUpload(
    uploadedFile: PartData.FileItem,
    fileName: String,
    fileSize: Long,
    db: Firestore,
    driveAccounts: List<DriveAccount>
) {
    val driveAccount = getDriveWithSpace(fileSize, driveAccounts)
    
    if (driveAccount != null) {
        val drive = Drive.Builder(
            NetHttpTransport(),
            JacksonFactory.getDefaultInstance(),
            HttpCredentialsAdapter(driveAccount.auth)
        ).setApplicationName("Your Application Name").build()
        
        try {
            val mediaContent = FileContent(uploadedFile.contentType?.toString(), uploadedFile.contentChannel)
            val createRequest = drive.files().create(
                File().apply {
                    this.name = fileName
                    mimeType = uploadedFile.contentType?.toString()
                    parents = listOf(driveAccount.folderId)
                },
                mediaContent
            ).setSupportsAllDrives(true)
            
            val response = createRequest.execute()
            
            val fileMetaData = mapOf(
                "name" to fileName,
                "size" to fileSize,
                "uploadedAt" to Date().time,
                "isChunked" to false,
                "driveId" to driveAccount.id,
                "googleDrivefileId" to response.id,
                "mimeType" to uploadedFile.contentType?.toString() ?: "application/octet-stream",
                "downloadUrl" to "https://drive.google.com/file/d/${response.id}/view"
            )
            
            db.collection("files").add(fileMetaData).await()
            uploadedFile.dispose()
            
            respond(response)
        } catch (e: Exception) {
            println("Error during simple upload: $e")
            respond(HttpStatusCode.InternalServerError, "Error uploading file")
        }
    } else {
        // Edge case handler
        try {
            val chunkUploads = sliceDriveFunction(uploadedFile)
            
            val fileMetaData = mapOf(
                "name" to fileName,
                "size" to fileSize,
                "uploadedAt" to Date().time,
                "isChunked" to true,
                "chunks" to chunkUploads,
                "mimeType" to uploadedFile.contentType?.toString() ?: "application/octet-stream"
            )
            
            db.collection("files").add(fileMetaData).await()
            uploadedFile.dispose()
            
            respond(mapOf("chunks" to chunkUploads))
        } catch (e: Exception) {
            println("Error during edge case upload: $e")
            respond(HttpStatusCode.InternalServerError, "Error edge case trigger")
        }
    }
}

private suspend fun ApplicationCall.listFiles(db: Firestore) {
    try {
        val snapshot = db.collection("files").get().await()
        val fileNames = snapshot.documents.mapNotNull { it.get("name") as? String }
        
        respond(mapOf("files" to fileNames))
    } catch (e: Exception) {
        println("Error retrieving files: $e")
        respond(HttpStatusCode.InternalServerError, "Error retrieving files")
    }
}

// Helper functions would need to be implemented based on specific requirements
suspend fun sliceDriveFunction(file: PartData.FileItem): List<Any> {
    // Implement chunking logic here
    TODO("Implement chunking logic")
}

fun getDriveWithSpace(fileSize: Long, driveAccounts: List<DriveAccount>): DriveAccount? {
    
    TODO("Implement drive account selection logic")
}

data class DriveAccount(
    val id: String,
    val auth: GoogleCredentials,
    val folderId: String
)
    }

    private fun performSearch(query: String) {
        // Implement search functionality
    }

   fun Route.downloadRoute(db: Firestore, driveAccounts: List<DriveAccount>) {
    get("/download") {
        val fileName = call.request.queryParameters["fileName"]
        if (fileName == null) {
            call.respond(HttpStatusCode.BadRequest, "fileName query parameter is required")
            return@get
        }

        try {
            val snapshot = db.collection("files")
                .whereEqualTo("name", fileName)
                .get()
                .await()

            if (snapshot.isEmpty) {
                call.respond(HttpStatusCode.NotFound, "File not found")
                return@get
            }

            val fileDoc = snapshot.documents.first()
            val fileData = fileDoc.toObject(FileData::class.java)!!

            call.response.header("Content-Disposition", "attachment; filename=\"${fileData.name}\"")
            call.response.header("Content-Type", fileData.mimeType)
            call.response.header("Content-Length", fileData.size.toString())

            if (fileData.isChunked) {
                val sortedChunks = fileData.chunks.sortedWith(compareBy { it.offset })
                
                val outputStream = call.response.outputStreamWriter().outputStream
                val chunksStream = object : OutputStream() {
                    override fun write(b: Int) = outputStream.write(b)
                }

                for (chunk in sortedChunks) {
                    val driveAccount = driveAccounts.find { it.id == chunk.driveId }
                    if (driveAccount == null) {
                        call.respond(HttpStatusCode.InternalServerError, "Associated Drive account not found for a chunk")
                        return@get
                    }

                    val drive = Drive.Builder(
                        NetHttpTransport(),
                        JacksonFactory.getDefaultInstance(),
                        driveAccount.auth
                    ).setApplicationName("Your App Name").build()

                    val request = drive.files().get(chunk.googleDrivefileId)
                        .setAlt("media")
                    
                    val mediaHttpDownloader = request.mediaHttpDownloader
                    mediaHttpDownloader.progressListener = object : AbstractInputStreamContent.MediaProgressListener {
                        override fun progressChanged(progress: MediaHttpDownloader.Progress) {
                            if (progress.state == MediaHttpDownloader.Progress.State.DONE) {
                                println("Finished downloading chunk \"${chunk.sliceName}\"")
                            }
                        }
                    }

                    val inputStream = request.executeMediaAsInputStream()
                    inputStream.copyTo(chunksStream)
                    inputStream.close()
                }
                chunksStream.close()
            } else {
                val driveAccount = driveAccounts.find { it.id == fileData.driveId }
                if (driveAccount == null) {
                    call.respond(HttpStatusCode.InternalServerError, "Associated Drive account not found")
                    return@get
                }

                val drive = Drive.Builder(
                    NetHttpTransport(),
                    JacksonFactory.getDefaultInstance(),
                    driveAccount.auth
                ).setApplicationName("Your App Name").build()

                val request = drive.files().get(fileData.googleDrivefileId)
                    .setAlt("media")
                
                val mediaHttpDownloader = request.mediaHttpDownloader
                mediaHttpDownloader.progressListener = object : AbstractInputStreamContent.MediaProgressListener {
                    override fun progressChanged(progress: MediaHttpDownloader.Progress) {
                        if (progress.state == MediaHttpDownloader.Progress.State.EXCEPTION) {
                            println("Error streaming file: ${progress.exception}")
                        }
                    }
                }

                val inputStream = request.executeMediaAsInputStream()
                call.respondOutputStream {
                    inputStream.copyTo(this)
                }
            }
        } catch (e: Exception) {
            println("Download error: $e")
            call.respond(HttpStatusCode.InternalServerError, "Internal server error")
        }
    }
}

data class DriveAccount(
    val id: String,
    val auth: HttpRequestInitializer
)

data class FileData(
    val name: String,
    val mimeType: String,
    val size: Long,
    val isChunked: Boolean,
    val chunks: List<Chunk>?,
    val driveId: String?,
    val googleDrivefileId: String
)

data class Chunk(
    val offset: Long,
    val sliceName: String,
    val driveId: String,
    val googleDrivefileId: String
)
    override fun onNavigationItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.nav_google -> {
                // Handle Google account selection
            }
            R.id.nav_dropbox -> {
                // Handle Dropbox account selection
            }
            R.id.nav_chatbot -> {
                // Handle chatbot navigation
            }
            R.id.nav_logout -> {
                // Handle logout
            }
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

class FileAdapter(private val files: List<String>) : androidx.recyclerview.widget.RecyclerView.Adapter<FileAdapter.ViewHolder>() {

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
        val view = android.view.LayoutInflater.from(parent.context)
            .inflate(R.layout.item_file, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(files[position])
    }

    override fun getItemCount() = files.size

    inner class ViewHolder(view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view) {
        fun bind(fileName: String) {
            itemView.tv_file_name.text = fileName
        }
    }
}
