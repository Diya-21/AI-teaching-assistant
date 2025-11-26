// VoiceInput.js - Voice Recording Component
import React, { useState, useRef, useEffect } from 'react';
import './VoiceInput.css';

const VoiceInput = ({ onTranscript, onSend }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US'; // Change to support multiple languages
      
      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcriptPart + ' ';
          } else {
            interim += transcriptPart;
          }
        }
        
        if (final) {
          setTranscript(prev => prev + final);
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          // User stopped talking, continue listening
          return;
        }
        stopRecording();
      };
      
      recognition.onend = () => {
        if (isRecording && !isPaused) {
          recognition.start(); // Restart if still recording
        }
      };
      
      recognitionRef.current = recognition;
    } else {
      console.error('Speech recognition not supported');
      alert('Voice input is not supported in your browser. Please use Chrome or Edge.');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isRecording, isPaused]);

  // Audio Level Monitoring
  const startAudioMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateLevel = () => {
        if (!isRecording || isPaused) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        setAudioLevel(Math.min(100, (average / 255) * 150));
        
        requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please grant permission.');
    }
  };

  const startRecording = async () => {
    if (!recognitionRef.current) {
      alert('Speech recognition not available');
      return;
    }
    
    setIsRecording(true);
    setIsPaused(false);
    setTranscript('');
    setInterimTranscript('');
    setRecordingTime(0);
    
    // Start speech recognition
    recognitionRef.current.start();
    
    // Start audio monitoring
    await startAudioMonitoring();
    
    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const pauseRecording = () => {
    setIsPaused(true);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const resumeRecording = () => {
    setIsPaused(false);
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setAudioLevel(0);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    // Send transcript to parent component
    if (transcript.trim()) {
      onTranscript(transcript.trim());
      if (onSend) {
        onSend(transcript.trim());
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
  };

  return (
    <div className="voice-input-container">
      {!isRecording ? (
        <button className="voice-button start-button" onClick={startRecording}>
          <span className="mic-icon">🎤</span>
          <span>Start Voice Input</span>
        </button>
      ) : (
        <div className="recording-panel">
          {/* Recording Indicator */}
          <div className="recording-header">
            <div className="recording-indicator">
              <span className={`rec-dot ${isPaused ? 'paused' : 'active'}`}></span>
              <span className="rec-text">
                {isPaused ? 'Paused' : 'Recording'}
              </span>
              <span className="rec-time">{formatTime(recordingTime)}</span>
            </div>
          </div>

          {/* Audio Visualizer */}
          <div className="audio-visualizer">
            <div 
              className="audio-level-bar" 
              style={{ width: `${audioLevel}%` }}
            ></div>
            <div className="audio-waveform">
              {[...Array(20)].map((_, i) => (
                <div 
                  key={i} 
                  className="wave-bar"
                  style={{ 
                    height: `${isPaused ? 20 : Math.random() * audioLevel + 20}%`,
                    animationDelay: `${i * 0.05}s`
                  }}
                ></div>
              ))}
            </div>
          </div>

          {/* Transcript Display */}
          <div className="transcript-display">
            <div className="transcript-content">
              {transcript && (
                <span className="final-transcript">{transcript}</span>
              )}
              {interimTranscript && (
                <span className="interim-transcript">{interimTranscript}</span>
              )}
              {!transcript && !interimTranscript && (
                <span className="placeholder">Start speaking...</span>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="control-buttons">
            {!isPaused ? (
              <button className="control-btn pause-btn" onClick={pauseRecording}>
                <span>⏸️</span>
                <span>Pause</span>
              </button>
            ) : (
              <button className="control-btn resume-btn" onClick={resumeRecording}>
                <span>▶️</span>
                <span>Resume</span>
              </button>
            )}
            
            <button className="control-btn clear-btn" onClick={clearTranscript}>
              <span>🗑️</span>
              <span>Clear</span>
            </button>
            
            <button className="control-btn stop-btn" onClick={stopRecording}>
              <span>⏹️</span>
              <span>Stop & Send</span>
            </button>
          </div>

          {/* Tips */}
          <div className="voice-tips">
            <p>💡 Tip: Speak clearly and at a normal pace for best results</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceInput;