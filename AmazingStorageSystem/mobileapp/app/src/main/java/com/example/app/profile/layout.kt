import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun Layout(children: @Composable () -> Unit) {
    Row(modifier = Modifier.fillMaxSize()) {
        Sidebar()
        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
            MobileNavigation()
            Header()
            Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                children()
            }
        }
        Toaster()
    }
}
