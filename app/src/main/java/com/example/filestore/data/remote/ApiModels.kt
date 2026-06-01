package com.example.filestore.data.remote

// For login and registration request
data class AuthRequest(
    val username: String,
    val password: String
)

// Response after successful login/register
data class AuthResponse(
    val message: String,
    val token: String
)

// Response after successful upload
data class UploadResponse(
    val message: String,
    val metadata: FileMetadata
)

// Detailed info about uploaded file
data class FileMetadata(
    val name: String,
    val size: Long,
    val uploadedAt: String,
    val mimeType: String,
    val isChunked: Boolean,
    val chunks: List<FileChunk>
)

// Each file chunk information
data class FileChunk(
    val id: String,
    val type: String,
    val size: Long,
    val offset: Long
)

// Response for files listing
data class FilesResponse(
    val files: List<String>
)
