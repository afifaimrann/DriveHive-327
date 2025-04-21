plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.example.filestore"
    compileSdk = 35


    defaultConfig {
        applicationId = "com.example.filestore"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures {
        viewBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.browser)
    implementation(libs.play.services.basement)
    implementation(libs.play.services.auth)
    implementation(libs.androidx.espresso.core)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)

    dependencies {
        // Core Libraries
        implementation ("androidx.core:core-ktx:1.16.0")
        implementation ("androidx.appcompat:appcompat:1.6.1")
        implementation ("com.google.android.material:material:1.9.0")
        implementation ("androidx.recyclerview:recyclerview:1.3.2")
        implementation ("androidx.activity:activity-ktx:1.8.2")

        // Lifecycle
        implementation ("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
        implementation ("androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.1")
        implementation ("androidx.lifecycle:lifecycle-livedata-ktx:2.6.1")

        // Compose
        implementation ("androidx.activity:activity-compose:1.10.1")
        implementation ("androidx.compose:compose-bom:2023.04.00") // Adjusted from 2025.04.00
        implementation ("androidx.compose.ui:ui")
        implementation ("androidx.compose.material:material")
        implementation ("androidx.compose.ui:ui-tooling-preview")

        // Networking
        implementation ("com.squareup.retrofit2:retrofit:2.9.0")
        implementation ("com.squareup.retrofit2:converter-gson:2.9.0")
        implementation ("com.squareup.okhttp3:logging-interceptor:4.11.0")
        implementation ("com.google.code.gson:gson:2.10.1")

        // Coroutines
        implementation ("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

        // Testing
        testImplementation ("junit:junit:4.13.2")
        androidTestImplementation ("androidx.test.ext:junit:1.2.1")
        androidTestImplementation ("androidx.test.espresso:espresso-core:3.6.1")
        androidTestImplementation ("androidx.compose.ui:ui-test-junit4")
        // Google Sign-In
        implementation ("com.google.android.gms:play-services-auth:20.7.0")

        // Google Drive REST API helper
        implementation ("com.google.api.client:google-api-client:1.33.0")
        implementation ("com.google.api-client:google-api-client-gson:1.33.0")
        implementation ("com.google.apis:google-api-services-drive:v3-rev202-1.25.0")
        // For coroutine support (if needed for tasks)
         implementation ("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4")
         implementation ("com.dropbox.core:dropbox-core-sdk:5.4.6")

    }
}