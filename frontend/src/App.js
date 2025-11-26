import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('upload');
  
  return (
    <div className="App">
      <div className="container">
        <div className="header">
          <div className="header-content">
            <div className="header-title">
              <span className="icon">✨</span>
              <div>
                <h1>AI Teaching Assistant</h1>
                <p>Multimodal AI System with RAG </p>
              </div>
            </div>
            <div className="badges">
              <span className="badge badge-blue">RAG Enabled</span>
              <span className="badge badge-green">Gemini API</span>
              <span className="badge badge-purple">Multi-Agent</span>
            </div>
          </div>
        </div>

        <div className="tabs">
          <div className="tab-buttons">
            <button
              className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <span>📤</span>
              Upload Files
            </button>
            <button
              className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <span>💬</span>
              Chat Assistant
            </button>
            <button
              className={`tab-button ${activeTab === 'quiz' ? 'active' : ''}`}
              onClick={() => setActiveTab('quiz')}
            >
              <span>🧠</span>
              Quiz Generator
            </button>
          </div>
        </div>

        <div className="content">
          {activeTab === 'upload' && <FileUploadComponent />}
          {activeTab === 'chat' && <ChatComponent />}
          {activeTab === 'quiz' && <QuizComponent />}
        </div>

        <div className="footer">
          <p>BE Project - AI Teaching Assistant © 2025</p>
          <p>Powered by Gemini API & In-Memory RAG</p>
        </div>
      </div>
    </div>
  );
};

const FileUploadComponent = () => {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (selectedFiles) => {
    const fileArray = Array.from(selectedFiles);
    
    for (const file of fileArray) {
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      
      if (!validTypes.includes(file.type)) {
        alert(`Invalid file type: ${file.name}`);
        continue;
      }

      const fileObj = {
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0,
      };

      setFiles(prev => [...prev, fileObj]);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://localhost:8000/api/upload-syllabus', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          setFiles(prev => prev.map(f => 
            f.id === fileObj.id ? { ...f, status: 'success', progress: 100 } : f
          ));
        } else {
          throw new Error('Upload failed');
        }
      } catch (error) {
        setFiles(prev => prev.map(f =>
          f.id === fileObj.id ? { ...f, status: 'error', error: error.message } : f
        ));
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="card">
      <h2>Upload Syllabus Documents</h2>
      
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="upload-icon">📁</span>
        <p className="upload-title">Drag and drop your files here</p>
        <p className="upload-subtitle">or</p>
        <button className="button">Choose Files</button>
        <p className="upload-info">Supports PDF, DOCX, TXT (Max 10MB per file)</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <h3>Uploaded Files</h3>
          {files.map(file => (
            <div key={file.id} className="file-item">
              <span className="file-icon">📄</span>
              <div className="file-info">
                <p className="file-name">{file.name}</p>
                <p className="file-size">{formatFileSize(file.size)}</p>
                {file.status === 'uploading' && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${file.progress}%` }} />
                  </div>
                )}
                {file.status === 'success' && <p className="file-success">✅ Uploaded successfully!</p>}
                {file.status === 'error' && <p className="file-error">❌ {file.error}</p>}
              </div>
              <span className="file-status">
                {file.status === 'uploading' && '⏳'}
                {file.status === 'success' && '✅'}
                {file.status === 'error' && '❌'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="info-box">
        <h4>How it works:</h4>
        <ul>
          <li>✓ Upload your syllabus PDF, DOCX, or TXT files</li>
          <li>✓ Documents are processed and split into chunks</li>
          <li>✓ Stored in memory for intelligent retrieval</li>
          <li>✓ Used as context for all AI responses</li>
        </ul>
      </div>
    </div>
  );
};

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, chat_history: [] }),
      });

      const data = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        sources: data.sources_used
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'error',
        content: 'Sorry, I encountered an error: ' + error.message
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>🤖 AI Teaching Assistant</h2>
        <p>Ask anything about your syllabus</p>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span className="chat-empty-icon">💬</span>
            <p>Start a conversation!</p>
            <p className="chat-empty-subtitle">Upload your syllabus first, then ask me questions.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-content">
              <p>{msg.content}</p>
              {msg.sources > 0 && (
                <p className="message-sources">📚 Used {msg.sources} sources from syllabus</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="loading">
                <div className="spinner"></div>
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question..."
          disabled={isLoading}
          className="input"
        />
        <button onClick={handleSend} disabled={isLoading || !input.trim()} className="button">
          Send
        </button>
      </div>
    </div>
  );
};

const QuizComponent = () => {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      alert('Please enter a topic');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, difficulty, num_questions: numQuestions }),
      });

      const data = await response.json();
      setQuiz(data);
      setCurrent(0);
      setAnswers({});
      setShowResults(false);
    } catch (error) {
      alert('Failed to generate quiz: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateScore = () => {
    let correct = 0;
    quiz.questions.forEach((q, idx) => {
      if (answers[idx] === q.correct_answer) correct++;
    });
    return correct;
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="loading-center">
          <div className="spinner-large"></div>
          <p>Generating quiz questions...</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="card">
        <h2>🧠 Quiz Generator</h2>
        
        <div className="form-group">
          <label className="form-label">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Machine Learning Basics"
            className="input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="select">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Number of Questions</label>
          <input
            type="number"
            value={numQuestions}
            onChange={(e) => setNumQuestions(parseInt(e.target.value))}
            min="1"
            max="10"
            className="input"
          />
        </div>

        <button onClick={handleGenerate} disabled={!topic.trim()} className="button button-full">
          Generate Quiz
        </button>

        <div className="info-box">
          <p>Quiz questions will be generated based on your uploaded syllabus content using AI</p>
        </div>
      </div>
    );
  }

  if (showResults) {
    const score = calculateScore();
    const percentage = (score / quiz.questions.length) * 100;

    return (
      <div className="card">
        <h2>Quiz Results</h2>
        
        <div className="results-header">
          <div className="results-score">{percentage.toFixed(0)}%</div>
          <p>You got {score} out of {quiz.questions.length} questions correct</p>
        </div>

        <div className="results-list">
          {quiz.questions.map((q, idx) => {
            const userAnswer = answers[idx];
            const isCorrect = userAnswer === q.correct_answer;

            return (
              <div key={idx} className={`result-item ${isCorrect ? 'correct' : 'incorrect'}`}>
                <div className="result-icon">{isCorrect ? '✅' : '❌'}</div>
                <div className="result-content">
                  <p className="result-question">Q{idx + 1}: {q.question}</p>
                  <p className="result-answer">Your answer: <strong>{userAnswer || 'Not answered'}</strong></p>
                  {!isCorrect && (
                    <p className="result-correct">Correct answer: <strong>{q.correct_answer}</strong></p>
                  )}
                  {q.explanation && (
                    <p className="result-explanation">💡 {q.explanation}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={() => setQuiz(null)} className="button button-full">
          Generate New Quiz
        </button>
      </div>
    );
  }

  const question = quiz.questions[current];

  return (
    <div className="card">
      <div className="quiz-progress">
        <span>Question {current + 1} of {quiz.questions.length}</span>
        <span className="quiz-topic">{quiz.topic}</span>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} />
      </div>

      <div className="quiz-question">
        <h3>{question.question}</h3>

        <div className="quiz-options">
          {question.options && question.options.map((option, idx) => {
            const letter = option.charAt(0);
            const isSelected = answers[current] === letter;

            return (
              <button
                key={idx}
                onClick={() => setAnswers({ ...answers, [current]: letter })}
                className={`quiz-option ${isSelected ? 'selected' : ''}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="quiz-navigation">
        {current > 0 && (
          <button onClick={() => setCurrent(current - 1)} className="button button-secondary">
            Previous
          </button>
        )}

        {current < quiz.questions.length - 1 ? (
          <button
            onClick={() => setCurrent(current + 1)}
            disabled={!answers[current]}
            className="button"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => setShowResults(true)}
            disabled={Object.keys(answers).length !== quiz.questions.length}
            className="button button-success"
          >
            Submit Quiz
          </button>
        )}
      </div>
    </div>
  );
};

export default App;