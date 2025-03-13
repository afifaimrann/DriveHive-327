class LoginActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        loginButton.setOnClickListener {
            val email = emailEditText.text.toString()
            val password = passwordEditText.text.toString()

            if (validateCredentials(email, password)) {
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            } else {
                showErrorMessage()
            }
        }

        signupButton.setOnClickListener {
            // Handle signup logic
        }
    }

    private fun validateCredentials(email: String, password: String): Boolean {
        // Simple validation for demonstration
        return email.isNotEmpty() && password.isNotEmpty()
    }

    private fun showErrorMessage() {
        Toast.makeText(this, "Invalid credentials", Toast.LENGTH_SHORT).show()
    }
}