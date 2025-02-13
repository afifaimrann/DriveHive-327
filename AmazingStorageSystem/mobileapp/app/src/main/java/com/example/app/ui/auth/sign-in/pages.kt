import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview

@Composable
fun SignInScreen() {
    AuthForm(type = "sign-in")
}

@Preview
@Composable
fun PreviewSignInScreen() {
    SignInScreen()
}
