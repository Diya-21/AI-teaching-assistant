import React, { useState, useRef } from 'react';
import { Upload, File, CheckCircle, XCircle, Loader } from 'lucide-react';
import { uploadSyllabus } from '../services/api';

const FileUploadComponent = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (files) => {
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
      
      if (!validTypes.includes(file.type)) {
        alert(`Invalid file type: ${file.name}. Please upload PDF, DOCX, or TXT files.`);
        continue;
      }

      const fileObj = {
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0,
      };

      setUploadedFiles((prev) => [...prev, fileObj]);

      try {
        await uploadSyllabus(file, (progress) => {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === fileObj.id ? { ...f, progress } : f
            )
          );
        });

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'success', progress: 100 } : f
          )
        );
      } catch (error) {
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'error', error: error.message } : f
          )
        );
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        Upload Syllabus Documents
      </h2>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragging
            ? 'border-indigo-600 bg-indigo-50'
            : 'border-gray-300 bg-gray-50'
        }`}
      >
        <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-lg text-gray-600 mb-2">
          Drag and drop your files here
        </p>
        <p className="text-sm text-gray-400 mb-4">or</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Choose Files
        </button>
        <p className="text-xs text-gray-400 mt-4">
          Supports PDF, DOCX, TXT (Max 10MB per file)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="font-semibold text-gray-700">Files</h3>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <File className="w-8 h-8 text-gray-400 flex-shrink-0" />
              
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {file.name}
                </p>
                <p className="text-sm text-gray-500">
                  {formatFileSize(file.size)}
                </p>
                
                {file.status === 'uploading' && (
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
                
                {file.status === 'error' && (
                  <p className="text-sm text-red-600 mt-1">{file.error}</p>
                )}
                
                {file.status === 'success' && (
                  <p className="text-sm text-green-600 mt-1">Upload successful!</p>
                )}
              </div>

              <div className="flex-shrink-0">
                {file.status === 'uploading' && (
                  <Loader className="w-5 h-5 text-indigo-600 animate-spin" />
                )}
                {file.status === 'success' && (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                {file.status === 'error' && (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">How it works:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✓ Upload your syllabus PDF, DOCX, or TXT files</li>
          <li>✓ Documents are processed and split into chunks</li>
          <li>✓ Each chunk is converted into vector embeddings</li>
          <li>✓ Stored in database for intelligent retrieval</li>
          <li>✓ Used as context for all AI responses</li>
        </ul>
      </div>
    </div>
  );
};

export default FileUploadComponent;