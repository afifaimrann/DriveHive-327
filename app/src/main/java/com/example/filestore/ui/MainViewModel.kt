package com.example.filestore.ui

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel

class MainViewModel : ViewModel() {

    private val _fileList = MutableLiveData<List<String>>()
    val fileList: LiveData<List<String>> = _fileList

    fun updateFileList(files: List<String>) {
        _fileList.value = files
    }

    fun searchFiles(query: String) {
        val currentList = _fileList.value ?: return
        val filteredList = currentList.filter { it.contains(query, ignoreCase = true) }
        _fileList.value = filteredList
    }
}