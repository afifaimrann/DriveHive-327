package com.example.filestore.data.remote

/**
 * Used for endpoints that only return { "message": "..." }
 * e.g. /generate-link-code
 */
data class GenericMessage(
    val message: String
)
