"use client"
import { useRef } from 'react';
import { FiUpload, FiFolderPlus } from 'react-icons/fi';

export default function FileUploader({ onFilesSelected, disabled }) {
  const fileInputRef = useRef();
  const folderInputRef = useRef();

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    e.target.value = '';
  };

  const handleFolderChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-center">
      <button
        type="button"
        onClick={() => fileInputRef.current.click()}
        disabled={disabled}
        className={`inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <FiUpload className="mr-2" />
        Upload Files
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.ppt,.pptx,.md,.xls,.xlsx"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => folderInputRef.current.click()}
        disabled={disabled}
        className={`inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <FiFolderPlus className="mr-2" />
        Upload Folder
      </button>
      <input
        ref={folderInputRef}
        type="file"
        multiple
        webkitdirectory="true"
        directory="true"
        style={{ display: 'none' }}
        onChange={handleFolderChange}
        disabled={disabled}
      />
    </div>
  );
}
