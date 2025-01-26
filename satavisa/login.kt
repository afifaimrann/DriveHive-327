import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import android.widget.Button
import android.widget.Toast
import android.widget.LinearLayout
import android.widget.TextView
import android.view.Gravity
import android.widget.Space

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Root layout
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFFFFFFFF.toInt())
        }

        // Title
        val title = TextView(this).apply {
            text = "DROPIFY"
            textSize = 32f
            setTextColor(0xFF800000.toInt())
            gravity = Gravity.CENTER
        }

        rootLayout.addView(title)

        // Space
        val space1 = Space(this).apply {
            minimumHeight = 50
        }
        rootLayout.addView(space1)

        // login button
        val loginButton = Button(this).apply {
            text = "LOGIN"
            setBackgroundColor(0xFF800000.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 18f
            setPadding(20, 10, 20, 10)
            setOnClickListener {
                Toast.makeText(this@MainActivity, "Login clicked", Toast.LENGTH_SHORT).show()
            }
        }
        rootLayout.addView(loginButton)

        // line
        val line = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(200, 6).apply {
                topMargin = 20
                bottomMargin = 20
            }
            setBackgroundColor(0xFF800000.toInt())
        }
        rootLayout.addView(line)

        // signup button
        val signUpButton = Button(this).apply {
            text = "SIGN UP"
            setBackgroundColor(0xFF800000.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 18f
            setPadding(20, 10, 20, 10)
            setOnClickListener {
                Toast.makeText(this@MainActivity, "Sign Up clicked", Toast.LENGTH_SHORT).show()
            }
        }
        rootLayout.addView(signUpButton)

        // content view
        setContentView(rootLayout)
    }
}
