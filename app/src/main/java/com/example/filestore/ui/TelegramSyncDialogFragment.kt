package com.example.filestore.ui


import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.DialogFragment
import com.example.filestore.databinding.FragmentTelegramSyncBinding

class TelegramSyncDialogFragment : DialogFragment() {

    private var _binding: FragmentTelegramSyncBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentTelegramSyncBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.submitButton.setOnClickListener {
            val telegramId = binding.telegramIdInput.text.toString().trim()
            val password   = binding.passwordInput.text.toString().trim()

            if (telegramId.isEmpty() || password.isEmpty()) {
                Toast.makeText(context, "Please enter both fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            binding.submitButton.isEnabled = false
            Toast.makeText(context, "Syncing with Telegram: $telegramId", Toast.LENGTH_SHORT).show()

            // 1) Login to get JWT :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}
            RetrofitClient.apiService.login(telegramId, password)
                .enqueue(object : Callback<AuthResponse> {
                    override fun onResponse(
                        call: Call<AuthResponse>,
                        response: Response<AuthResponse>
                    ) {
                        if (!response.isSuccessful || response.body() == null) {
                            Toast.makeText(context,
                                "Login failed: ${response.message()}",
                                Toast.LENGTH_SHORT
                            ).show()
                            binding.submitButton.isEnabled = true
                            return
                        }
                        val jwtToken = response.body()!!.token

                        // 2) Generate link code :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3}
                        RetrofitClient.apiService.generateLinkCode("Bearer $jwtToken")
                            .enqueue(object : Callback<GenericMessage> {
                                override fun onResponse(
                                    call: Call<GenericMessage>,
                                    genResp: Response<GenericMessage>
                                ) {
                                    binding.submitButton.isEnabled = true
                                    if (!genResp.isSuccessful || genResp.body() == null) {
                                        Toast.makeText(context,
                                            "Error generating code",
                                            Toast.LENGTH_SHORT
                                        ).show()
                                    } else {
                                        // Send this code to the bot to link account:
                                        Toast.makeText(context,
                                            genResp.body()!!.message,
                                            Toast.LENGTH_LONG
                                        ).show()
                                        dismiss()
                                    }
                                }
                                override fun onFailure(call: Call<GenericMessage>, t: Throwable) {
                                    binding.submitButton.isEnabled = true
                                    Toast.makeText(context,
                                        "Network error: ${t.message}",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                            })
                    }

                    override fun onFailure(call: Call<AuthResponse>, t: Throwable) {
                        binding.submitButton.isEnabled = true
                        Toast.makeText(context,
                            "Network error: ${t.message}",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                })
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}