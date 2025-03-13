package com.example.storeit

import android.content.Intent
import android.net.Uri
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.core.view.GravityCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.bumptech.glide.Glide
import com.example.storeit.databinding.ActivityMainBinding
import com.google.android.material.navigation.NavigationView

class MainActivity : AppCompatActivity(), NavigationView.OnNavigationItemSelectedListener {

    private lateinit var binding: ActivityMainBinding
    private val filePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { handleFileSelection(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Setup action bar toggle
        val toggle = ActionBarDrawerToggle(
            this,
            binding.drawerLayout,
            binding.appBarLayout.getChildAt(0) as View,
            R.string.navigation_drawer_open,
            R.string.navigation_drawer_close
        )
        binding.drawerLayout.addDrawerListener(toggle)
        toggle.syncState()

        // Setup navigation view
        binding.navView.setNavigationItemSelectedListener(this)

        // Setup file list
        setupFileList()

        // Setup FAB click listener
        binding.fabUpload.setOnClickListener {
            filePicker.launch("*/*")
        }

        // Setup search view
        binding.searchView.setOnQueryTextListener(object : androidx.appcompat.widget.SearchView.OnQueryTextListener {
            override fun onQueryTextSubmit(query: String?): Boolean {
                query?.let { performSearch(it) }
                return true
            }

            override fun onQueryTextChange(newText: String?): Boolean {
                return false
            }
        })

        // Setup download button
        binding.btnDownload.setOnClickListener {
            val fileName = binding.etDownloadFilename.text.toString()
            if (fileName.isNotEmpty()) {
                downloadFile(fileName)
            }
        }
    }

    private fun setupFileList() {
        val files = listOf(
            "Document1.pdf",
            "Image.jpg",
            "Report.docx",
            "Presentation.pptx",
            "Data.xlsx"
        )

        binding.rvFiles.layoutManager = LinearLayoutManager(this)
        binding.rvFiles.adapter = FileAdapter(files)
    }

    private fun handleFileSelection(uri: Uri) {
        // Here you would implement the actual upload logic
        // For now, just show a toast
        // Toast.makeText(this, "File selected: $uri", Toast.LENGTH_SHORT).show()
    }

    private fun performSearch(query: String) {
        // Implement search functionality
    }

    private fun downloadFile(fileName: String) {
        // Implement download functionality
    }

    override fun onNavigationItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.nav_google -> {
                // Handle Google account selection
            }
            R.id.nav_dropbox -> {
                // Handle Dropbox account selection
            }
            R.id.nav_chatbot -> {
                // Handle chatbot navigation
            }
            R.id.nav_logout -> {
                // Handle logout
            }
        }
        binding.drawerLayout.closeDrawer(GravityCompat.START)
        return true
    }

    override fun onBackPressed() {
        if (binding.drawerLayout.isDrawerOpen(GravityCompat.START)) {
            binding.drawerLayout.closeDrawer(GravityCompat.START)
        } else {
            super.onBackPressed()
        }
    }
}

class FileAdapter(private val files: List<String>) : androidx.recyclerview.widget.RecyclerView.Adapter<FileAdapter.ViewHolder>() {

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
        val view = android.view.LayoutInflater.from(parent.context)
            .inflate(R.layout.item_file, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(files[position])
    }

    override fun getItemCount() = files.size

    inner class ViewHolder(view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view) {
        fun bind(fileName: String) {
            itemView.tv_file_name.text = fileName
        }
    }
}