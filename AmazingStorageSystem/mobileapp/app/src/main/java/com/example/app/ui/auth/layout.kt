import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

@Composable
fun Layout(children: @Composable () -> Unit) {
    Row(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .padding(10.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.padding(10.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Image(
                    painter = painterResource("/drawable/icons/logo-full.svg"),
                    contentDescription = "logo"
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text("Manage your files the best way")
                Text("This is a place where you can store all your documents.")
                Spacer(modifier = Modifier.height(12.dp))
                Image(
                    painter = painterResource("/drawable/images/files.png"),
                    contentDescription = "Files"
                )
            }
        }
        
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .padding(4.dp),
            contentAlignment = Alignment.Center
        ) {
            children()
        }
    }
}
