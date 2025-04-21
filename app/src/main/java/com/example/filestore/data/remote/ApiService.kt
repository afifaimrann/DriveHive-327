package com.example.filestore.data.remote
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.DialogFragment
import com.example.filestore.databinding.FragmentTelegramSyncBinding
import com.example.filestore.data.remote.ApiModels
import com.example.filestore.network.GenericMessage
import com.example.filestore.data.remote.RetrofitClient
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

interface ApiService {

    @POST("/register")
    suspend fun register(@Body request: AuthRequest): AuthResponse

    @POST("/login")
    suspend fun login(@Body request: AuthRequest): AuthResponse

    @Multipart
    @POST("/upload")
    suspend fun uploadFile(
        @Header("Authorization") token: String,
        @Part file: MultipartBody.Part
    ): UploadResponse

    @GET("/files")
    suspend fun getFiles(
        @Header("Authorization") token: String
    ): FilesResponse

    @GET("/download")
    @Streaming
    suspend fun downloadFile(
        @Header("Authorization") token: String,
        @Query("fileName") fileName: String
    ): Response<ResponseBody>

    @FormUrlEncoded
    @POST("login")
    fun login(
    @Field("username") username: String,
    @Field("password") password: String,
    @Field("token") token: String? = null
    ): Call<AuthResponse>

    @POST("generate-link-code")
    fun generateLinkCode(
    @Header("Authorization") auth: String
    ): Call<GenericMessage>
}
