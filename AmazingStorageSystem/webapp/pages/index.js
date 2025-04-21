import { useState } from 'react';
import { ArrowUpTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';
import SearchBar from '../components/SearchBar';
import FileItem from '../components/FileItem';

export default function Home() {
  const [files, setFiles] = useState([...]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container">
      <div className="header">
        <h1>UPLOAD</h1>
        <SearchBar onSearch={setSearchQuery} />
      </div>

      <div className="file-list">
        {filteredFiles.map(file => (
          <FileItem
            key={file.id}
            name={file.name}
            date={file.date}
            icon={<DocumentIcon className="file-icon" />}
          />
        ))}
      </div>

      <button className="upload-btn">
        <ArrowUpTrayIcon className="upload-icon" />
        Upload File
      </button>
    </div>
  )
}
