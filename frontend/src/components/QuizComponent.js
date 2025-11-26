
// QuizComponent.js - FIXED VERSION
import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

const QuizComponent = () => {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);

  const handleGenerateQuiz = async () => {
    // Validation
    if (!topic || topic.trim() === '') {
      setError('Please enter a topic');
      return;
    }

    setLoading(true);
    setError('');
    setQuestions([]);
    setSelectedAnswers({});
    setShowResults(false);

    try {
      console.log('Generating quiz...', { topic, difficulty, numQuestions });

      const response = await axios.post(`${API_URL}/api/generate-quiz`, {
        topic: topic.trim(),
        difficulty: difficulty,
        num_questions: parseInt(numQuestions)
      });

      console.log('Quiz response:', response.data);

      // Check if we got questions
      if (response.data && response.data.questions && Array.isArray(response.data.questions)) {
        if (response.data.questions.length > 0) {
          setQuestions(response.data.questions);
          setError('');
        } else {
          setError('No questions were generated. Please try again.');
        }
      } else {
        setError('Invalid response format from server');
        console.error('Invalid response:', response.data);
      }

    } catch (err) {
      console.error('Quiz generation error:', err);
      
      if (err.response) {
        // Server responded with error
        setError(`Error: ${err.response.data.detail || err.response.statusText}`);
      } else if (err.request) {
        // No response received
        setError('No response from server. Is the backend running?');
      } else {
        // Request setup error
        setError(`Error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionIndex, answer) => {
    setSelectedAnswers({
      ...selectedAnswers,
      [questionIndex]: answer
    });
  };

  const handleSubmitQuiz = () => {
    setShowResults(true);
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q, index) => {
      if (selectedAnswers[index] === q.correct_answer) {
        correct++;
      }
    });
    return correct;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '20px' }}>🧠 Quiz Generator</h2>

      {/* Quiz Form */}
      <div style={{ 
        background: '#f9fafb', 
        padding: '20px', 
        borderRadius: '12px',
        marginBottom: '20px'
      }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Machine Learning Basics"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '15px'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Difficulty
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '15px'
            }}
          >
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Number of Questions
          </label>
          <input
            type="number"
            value={numQuestions}
            onChange={(e) => setNumQuestions(e.target.value)}
            min="1"
            max="10"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '15px'
            }}
          />
        </div>

        <button
          onClick={handleGenerateQuiz}
          disabled={loading || !topic.trim()}
          style={{
            width: '100%',
            padding: '12px',
            background: loading || !topic.trim() ? '#9ca3af' : '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: loading || !topic.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s'
          }}
        >
          {loading ? '⏳ Generating Quiz...' : '📝 Generate Quiz'}
        </button>

        {error && (
          <div style={{
            marginTop: '15px',
            padding: '12px',
            background: '#fee',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            color: '#991b1b'
          }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Quiz Questions */}
      {questions && questions.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '15px' }}>
            Quiz: {topic} ({questions.length} questions)
          </h3>

          {questions.map((question, qIndex) => {
            // Safely check if question and its properties exist
            if (!question || !question.question) {
              return null;
            }

            const isAnswered = selectedAnswers.hasOwnProperty(qIndex);
            const isCorrect = showResults && selectedAnswers[qIndex] === question.correct_answer;
            const isWrong = showResults && isAnswered && !isCorrect;

            return (
              <div
                key={qIndex}
                style={{
                  background: 'white',
                  padding: '20px',
                  borderRadius: '12px',
                  marginBottom: '15px',
                  border: showResults 
                    ? isCorrect ? '2px solid #10b981' : isWrong ? '2px solid #ef4444' : '1px solid #e5e7eb'
                    : '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ 
                  fontWeight: '600', 
                  marginBottom: '15px',
                  fontSize: '16px',
                  color: '#1f2937'
                }}>
                  Q{qIndex + 1}. {question.question}
                </div>

                {/* Options */}
                {question.options && Array.isArray(question.options) && question.options.length > 0 ? (
                  <div style={{ marginBottom: '15px' }}>
                    {question.options.map((option, oIndex) => {
                      // Safely extract option letter
                      const optionLetter = option && option.length > 0 ? option[0].toUpperCase() : '';
                      const isSelected = selectedAnswers[qIndex] === optionLetter;
                      const isCorrectAnswer = showResults && optionLetter === question.correct_answer;

                      return (
                        <div
                          key={oIndex}
                          onClick={() => !showResults && handleAnswerSelect(qIndex, optionLetter)}
                          style={{
                            padding: '12px',
                            margin: '8px 0',
                            background: showResults
                              ? isCorrectAnswer ? '#d1fae5' : isSelected ? '#fee' : '#f9fafb'
                              : isSelected ? '#dbeafe' : '#f9fafb',
                            border: '1px solid ' + (
                              showResults
                                ? isCorrectAnswer ? '#10b981' : isSelected ? '#ef4444' : '#e5e7eb'
                                : isSelected ? '#3b82f6' : '#e5e7eb'
                            ),
                            borderRadius: '8px',
                            cursor: showResults ? 'default' : 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {option}
                          {showResults && isCorrectAnswer && ' ✅'}
                          {showResults && isSelected && !isCorrectAnswer && ' ❌'}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: '#ef4444', fontSize: '14px' }}>
                    No options available for this question
                  </div>
                )}

                {/* Show explanation after submission */}
                {showResults && question.explanation && (
                  <div style={{
                    padding: '12px',
                    background: '#f0f9ff',
                    borderRadius: '8px',
                    marginTop: '10px',
                    fontSize: '14px',
                    borderLeft: '4px solid #3b82f6'
                  }}>
                    <strong>Explanation:</strong> {question.explanation}
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit/Results Button */}
          {!showResults ? (
            <button
              onClick={handleSubmitQuiz}
              disabled={Object.keys(selectedAnswers).length !== questions.length}
              style={{
                width: '100%',
                padding: '12px',
                background: Object.keys(selectedAnswers).length !== questions.length ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: Object.keys(selectedAnswers).length !== questions.length ? 'not-allowed' : 'pointer',
                marginTop: '10px'
              }}
            >
              Submit Quiz ({Object.keys(selectedAnswers).length}/{questions.length} answered)
            </button>
          ) : (
            <div style={{
              padding: '20px',
              background: calculateScore() / questions.length >= 0.7 ? '#d1fae5' : '#fee',
              borderRadius: '12px',
              textAlign: 'center',
              marginTop: '10px'
            }}>
              <h3 style={{ margin: '0 0 10px 0' }}>
                Your Score: {calculateScore()} / {questions.length}
              </h3>
              <p style={{ margin: '0 0 15px 0', fontSize: '18px' }}>
                {((calculateScore() / questions.length) * 100).toFixed(0)}%
              </p>
              <button
                onClick={() => {
                  setQuestions([]);
                  setSelectedAnswers({});
                  setShowResults(false);
                  setTopic('');
                }}
                style={{
                  padding: '10px 20px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Generate New Quiz
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div style={{
        marginTop: '20px',
        padding: '15px',
        background: '#e0f2fe',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#075985'
      }}>
        💡 Tip: Quiz questions will be generated based on your uploaded syllabus content if available, 
        otherwise using general knowledge.
      </div>
    </div>
  );
};

export default QuizComponent;