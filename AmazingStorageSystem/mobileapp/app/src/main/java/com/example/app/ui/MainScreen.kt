package com.yourpackage.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.yourpackage.R
import com.yourpackage.ui.theme.AppTypography

@Composable
fun MainScreen(
    onUploadClick: () -> Unit,
    onBrowseClick: () -> Unit,
    onSearchClick: () -> Unit
) {
    Scaffold(
        topBar = {
            SmallTopAppBar(
                title = { Text("StoreIt", fontWeight = FontWeight.Bold, fontSize = 22.sp) },
                colors = TopAppBarDefaults.smallTopAppBarColors(
                    containerColor = Color(0xFF6200EE),
                    titleContentColor = Color.White
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Welcome to StoreIt!",
                style = AppTypography.titleLarge,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            Text(
                text = "Manage your storage effortlessly.",
                fontSize = 16.sp,
                color = Color.Gray
            )

            Spacer(modifier = Modifier.height(20.dp))

            // FeatureButton
            FeatureButton(icon = R.drawable.ic_upload, text = "Upload File", onClick = onUploadClick)
            FeatureButton(icon = R.drawable.ic_browse, text = "Browse Files", onClick = onBrowseClick)
            FeatureButton(icon = R.drawable.ic_search, text = "Search Files", onClick = onSearchClick)
        }
    }
}

@Composable
fun FeatureButton(icon: Int, text: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .height(56.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(
                painter = painterResource(id = icon),
                contentDescription = text,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = text, fontSize = 18.sp)
        }
    }
}
@Composable
fun AuthForm(navController: NavController, formType: FormType) {
    var fullName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var isLoading by rememberSaveable { mutableStateOf(false) }
    var errorMessage by rememberSaveable { mutableStateOf("") }

    val isSignUp = formType == FormType.SignUp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = if (isSignUp) "Sign-Up" else "Sign-In",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )

        if (isSignUp) {
            OutlinedTextField(
                value = fullName,
                onValueChange = { fullName = it },
                label = { Text("Full Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                isLoading = true
                if (isSignUp && fullName.length < 2) {
                    errorMessage = "Full name must be at least 2 characters"
                    isLoading = false
                    return@Button
                }
                if (!isValidEmail(email)) {
                    errorMessage = "Invalid email format"
                    isLoading = false
                    return@Button
                }
                //authentication logic
                isLoading = false
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            Text(if (isSignUp) "Sign-Up" else "Sign-In")
            if (isLoading) {
                Spacer(modifier = Modifier.width(8.dp))
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            }
        }

        if (errorMessage.isNotEmpty()) {
            Text(text = "*$errorMessage", color = Color.Red, fontSize = 14.sp)
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row {
            Text(text = if (isSignUp) "Already have an account?" else "Don't have an account?")
            TextButton(onClick = {
                navController.navigate(if (isSignUp) "sign-in" else "sign-up")
            }) {
                Text(
                    text = if (isSignUp) "Sign-In" else "Sign-Up",
                    fontWeight = FontWeight.Bold,
                    color = Color.Blue
                )
            }
        }
    }
}

fun isValidEmail(email: String): Boolean {
    return android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()
}

enum class FormType {
    SignIn, SignUp
}

@Composable
fun Sidebar(
    fullName: String,
    avatar: Int,
    email: String,
    navController: NavController
) {
    Column(
        modifier = Modifier
            .fillMaxHeight()
            .width(260.dp)
            .background(Color(0xFF1E1E1E)) 
            .padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // App Logo
        Image(
            painter = painterResource(id = R.drawable.logo_full),
            contentDescription = "StoreIt Logo",
            modifier = Modifier
                .width(160.dp)
                .height(50.dp)
        )

        // Navigation Items
        Column {
            navItems.forEach { item ->
                SidebarNavItem(
                    name = item.name,
                    icon = item.icon,
                    isSelected = navController.currentBackStackEntry?.destination?.route == item.url,
                    onClick = { navController.navigate(item.url) }
                )
            }
        }

        // User Info
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(id = avatar),
                contentDescription = "User Avatar",
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .border(2.dp, Color.White, CircleShape)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = fullName, color = Color.White, fontWeight = FontWeight.Bold)
            Text(text = email, color = Color.Gray, fontSize = 12.sp)
        }
    }
}

// Navigation Item
@Composable
fun SidebarNavItem(name: String, icon: Int, isSelected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .clickable { onClick() }
            .background(if (isSelected) Color(0xFF252525) else Color.Transparent),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(id = icon),
            contentDescription = name,
            tint = if (isSelected) Color.White else Color.Gray,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = name,
            color = if (isSelected) Color.White else Color.Gray,
            fontSize = 16.sp
        )
    }
}
@Composable
fun Thumbnail(
    type: String,
    extension: String,
    url: String? = null,
    imageModifier: Modifier = Modifier.size(32.dp),
    modifier: Modifier = Modifier
) {
    val isImage = type == "image" && extension != "svg"
    val imageSource = if (isImage && !url.isNullOrEmpty()) {
        url
    } else {
        getFileIcon(extension, type) // funtion is yet to write
    }

    Box(modifier = modifier) {
        if (isImage && !url.isNullOrEmpty()) {
            AsyncImage(
                model = imageSource,
                contentDescription = "Thumbnail",
                modifier = imageModifier.clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop
            )
        } else {
            Image(
                painter = painterResource(id = getFileIconResource(extension, type)),
                contentDescription = "File Thumbnail",
                modifier = imageModifier
            )
        }
    }
}
