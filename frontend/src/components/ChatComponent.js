import React, { useState, useRef, useEffect } from 'react';
import VoiceInput from './voiceinput';
import './ChatComponent.css';

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isProcessingYoutube, setIsProcessingYoutube] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // YouTube Processing
  const handleYoutubeSubmit = async () => {
    if (!youtubeUrl.trim()) return;

    setIsProcessingYoutube(true);
    setMessages([...messages, { 
      type: 'user', 
      content: `📺 Processing YouTube video: ${youtubeUrl}` 
    }]);

    try {
      const response = await fetch('http://localhost:8000/api/youtube/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { 
          type: 'assistant', 
          content: `✅ **Video Processed Successfully!**\n\n**Title:** ${data.title}\n**Duration:** ${data.duration}\n**Transcript Length:** ${data.transcript_length} characters\n\n${data.message}\n\nYou can now ask questions about this video!` 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          type: 'assistant', 
          content: `❌ **Error:** ${data.error}` 
        }]);
      }
    } catch (error) {
      console.error('Error processing YouTube:', error);
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: '❌ Failed to process YouTube video. Please check the URL and try again.' 
      }]);
    } finally {
      setIsProcessingYoutube(false);
      setYoutubeUrl('');
    }
  };

  // Chat Message Handling
  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { type: 'user', content: input };
    setMessages([...messages, userMessage]);
    const messageToSend = input;
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSend }),
      });

      const data = await response.json();
      
      if (data.type === 'youtube_results' && data.videos) {
        // Format YouTube results nicely
        let formattedResponse = `🎥 **Found ${data.videos.length} educational videos:**\n\n`;
        
        data.videos.forEach((video, index) => {
          formattedResponse += `**${index + 1}. ${video.title}**\n`;
          formattedResponse += `📺 Channel: ${video.channel}\n`;
          formattedResponse += `⏱️ Duration: ${video.duration}\n`;
          formattedResponse += `🔗 [Watch Video](${video.url})\n`;
          
          if (video.has_timestamps && video.relevant_timestamps) {
            formattedResponse += `\n**🎯 Relevant Timestamps:**\n`;
            video.relevant_timestamps.forEach(ts => {
              formattedResponse += `• **${ts.timestamp_formatted}** - ${ts.explanation}\n`;
              formattedResponse += `  [Jump to ${ts.timestamp_formatted}](${ts.url_with_timestamp}) (Relevance: ${ts.relevance_score}%)\n`;
            });
          }
          formattedResponse += '\n---\n\n';
        });
        
        setMessages(prev => [...prev, { 
          type: 'assistant', 
          content: formattedResponse
        }]);
      } else {
        setMessages(prev => [...prev, { 
          type: 'assistant', 
          content: data.response || 'Sorry, I could not process your request.' 
        }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        content: '❌ Error: Could not connect to the server. Please make sure the backend is running.' 
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Voice Input Handlers
  const handleVoiceTranscript = (transcript) => {
    setInput(transcript);
    setShowVoiceInput(false);
  };

  const handleVoiceSend = (transcript) => {
    setInput(transcript);
    setShowVoiceInput(false);
    // Send immediately
    setTimeout(() => {
      handleSendMessage();
    }, 100);
  };

  return (
    <div className="chat-container">
      {/* YouTube Input Section */}
      <div className="youtube-input-section">
        <input
          type="text"
          placeholder="Paste YouTube URL here to analyze video content..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          className="youtube-input"
          disabled={isProcessingYoutube}
        />
        <button
          onClick={handleYoutubeSubmit}
          disabled={isProcessingYoutube || !youtubeUrl.trim()}
          className="youtube-button"
        >
          {isProcessingYoutube ? '⏳ Processing...' : '📺 Process Video'}
        </button>
      </div>

      {/* Messages Display */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>👋 Welcome to AI Teaching Assistant!</p>
            <ul>
              <li>💬 Type or speak your questions</li>
              <li>🎥 Paste a YouTube URL to analyze video content</li>
              <li>🎤 Use voice input for hands-free interaction</li>
              <li>📚 Upload your syllabus in the "Upload Files" tab</li>
            </ul>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message ${msg.type}`}>
              <div className="message-content">
                {msg.content.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line.includes('[Watch') || line.includes('[Jump') ? (
                      <div dangerouslySetInnerHTML={{ 
                        __html: line.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>') 
                      }} />
                    ) : line.startsWith('**') ? (
                      <strong>{line.replace(/\*\*/g, '')}</strong>
                    ) : (
                      line
                    )}
                    {i < msg.content.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Voice Input Panel */}
      {showVoiceInput && (
        <div className="voice-input-panel">
          <VoiceInput 
            onTranscript={handleVoiceTranscript}
            onSend={handleVoiceSend}
          />
        </div>
      )}

      {/* Input Section */}
      <div className="input-section">
        <button
          className="voice-button"
          onClick={() => setShowVoiceInput(!showVoiceInput)}
          title="Voice input"
        >
          {showVoiceInput ? '⌨️' : '🎤'}
        </button>
        
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message or click the mic button to speak..."
          className="chat-input"
          rows="1"
          disabled={isSending}
        />
        
        <button
          onClick={handleSendMessage}
          disabled={!input.trim() || isSending}
          className="send-button"
        >
          {isSending ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  );
};

export default ChatComponent;