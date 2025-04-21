package com.example.storeit.network

import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @Multipart
    @POST("upload")
    suspend fun uploadFile(
        @Part file: MultipartBody.Part
    ): Response<UploadResponse>

    @GET("download/{filename}")
    suspend fun downloadFile(
        @Path("filename") filename: String
    ): Response<ResponseBody>
}

data class UploadResponse(
    val message: String,
    val filePath: String? = null
)
