import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

export const sendChatMessage = async (message, chatHistory = []) => {
  try {
    const response = await apiClient.post('/chat', {
      message,
      chat_history: chatHistory,
    });
    return response.data;
  } catch (error) {
    console.error('Chat error:', error);
    throw new Error(error.response?.data?.detail || 'Failed to get response');
  }
};

export const generateQuiz = async (topic, difficulty, numQuestions) => {
  try {
    const response = await apiClient.post('/generate-quiz', {
      topic,
      difficulty,
      num_questions: numQuestions,
    });
    return response.data;
  } catch (error) {
    console.error('Quiz generation error:', error);
    throw new Error(error.response?.data?.detail || 'Failed to generate quiz');
  }
};

export const summarizeContent = async (text, summaryType = 'detailed') => {
  try {
    const response = await apiClient.post('/summarize', {
      text,
      summary_type: summaryType,
    });
    return response.data;
  } catch (error) {
    console.error('Summarization error:', error);
    throw new Error(error.response?.data?.detail || 'Failed to summarize');
  }
};

export const uploadSyllabus = async (file, onProgress) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/upload-syllabus', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        if (onProgress) {
          onProgress(percentCompleted);
        }
      },
    });

    return response.data;
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error(error.response?.data?.detail || 'Failed to upload file');
  }
};

export default {
  sendChatMessage,
  generateQuiz,
  summarizeContent,
  uploadSyllabus,
};