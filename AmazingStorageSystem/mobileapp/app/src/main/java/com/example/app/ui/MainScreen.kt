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
