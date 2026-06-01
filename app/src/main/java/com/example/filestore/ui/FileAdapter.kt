package com.example.filestore.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.filestore.R

class FileAdapter(
    private var files: List<String>,
    private val onDownloadClick: (String) -> Unit
) : RecyclerView.Adapter<FileAdapter.FileViewHolder>() {

    class FileViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val fileName: TextView = view.findViewById(R.id.fileName)
        val downloadBtn: Button = view.findViewById(R.id.download_button)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FileViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_file, parent, false)
        return FileViewHolder(view)
    }

    override fun getItemCount() = files.size

    override fun onBindViewHolder(holder: FileViewHolder, position: Int) {
        val file = files[position]
        holder.fileName.text = file

        holder.downloadBtn.setOnClickListener {
            onDownloadClick(file)
        }
    }

    fun updateFiles(newFiles: List<String>) {
        files = newFiles
        notifyDataSetChanged()
    }

    fun setFiles(files: List<String>?) {
        this.files = files ?: emptyList()
        notifyDataSetChanged()
    }
}