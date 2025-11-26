# backend/agents/orchestrator.py
"""
Agent Orchestrator - The Brain of the Multi-Agent System
Routes user queries to the appropriate specialized agents
"""

from base_agent import BaseAgent
from typing import Dict, List, Optional
import time
import re

class AgentOrchestrator(BaseAgent):
    def __init__(self, youtube_agent, qa_agent, quiz_agent):
        """
        Initialize orchestrator with all specialized agents
        """
        # Initialize base agent with model
        super().__init__("Orchestrator")
        
        # Register agents
        self.youtube_agent = youtube_agent
        self.qa_agent = qa_agent
        self.quiz_agent = quiz_agent
        
        if not self.is_ready():
            print("⚠️ Orchestrator model not ready, will use fallback")
        else:
            print("✅ Agent Orchestrator initialized")
    
    def classify_intent(self, query: str) -> Dict:
        """
        Classify user intent using Gemini
        Determines which agent(s) should handle the query
        """
        if not self.is_ready():
            # Fallback: simple keyword-based classification
            return self._fallback_intent_classification(query)
        
        prompt = f"""Analyze this user query and classify its intent:

USER QUERY: "{query}"

Classify into ONE of these intents:
1. VIDEO_SEARCH - User wants video explanations
2. QUESTION_ANSWER - User wants text explanation
3. QUIZ_GENERATE - User wants practice questions
4. CONCEPT_EXPLAIN - User wants simple explanation

Respond in this format:
PRIMARY_INTENT: [intent]
CONFIDENCE: [0-100]

Keywords:
- "video", "watch", "show me" → VIDEO_SEARCH
- "test me", "quiz", "practice" → QUIZ_GENERATE"""

        try:
            response_text = self.generate_content(prompt)
            
            # Parse response
            primary_match = re.search(r'PRIMARY_INTENT:\s*(\w+)', response_text)
            primary_intent = primary_match.group(1) if primary_match else 'QUESTION_ANSWER'
            
            confidence_match = re.search(r'CONFIDENCE:\s*(\d+)', response_text)
            confidence = int(confidence_match.group(1)) if confidence_match else 80
            
            return {
                'primary_intent': primary_intent,
                'secondary_intents': [],
                'confidence': confidence,
                'reasoning': 'AI classified',
                'all_intents': [primary_intent]
            }
        
        except Exception as e:
            print(f"❌ Intent classification error: {e}")
            return self._fallback_intent_classification(query)
    
    def _fallback_intent_classification(self, query: str) -> Dict:
        """Simple keyword-based classification as fallback"""
        query_lower = query.lower()
        
        # Check for video keywords
        if any(word in query_lower for word in ['video', 'watch', 'show', 'visual', 'tutorial']):
            intent = 'VIDEO_SEARCH'
        # Check for quiz keywords
        elif any(word in query_lower for word in ['quiz', 'test', 'practice', 'questions']):
            intent = 'QUIZ_GENERATE'
        # Default to Q&A
        else:
            intent = 'QUESTION_ANSWER'
        
        return {
            'primary_intent': intent,
            'secondary_intents': [],
            'confidence': 70,
            'reasoning': 'Keyword-based fallback',
            'all_intents': [intent]
        }
    
    def should_include_videos(self, query: str, intent_data: Dict) -> bool:
        """
        Determine if YouTube videos should be included
        """
        # Always include if primary intent is video search
        if intent_data['primary_intent'] == 'VIDEO_SEARCH':
            return True
        
        # Include if secondary intent includes video
        if 'VIDEO_SEARCH' in intent_data['secondary_intents']:
            return True
        
        # Include for concept explanations (visual learning helps)
        if intent_data['primary_intent'] == 'CONCEPT_EXPLAIN':
            return True
        
        # Check for video-related keywords
        video_keywords = ['video', 'watch', 'visual', 'show', 'tutorial', 'demonstration']
        if any(keyword in query.lower() for keyword in video_keywords):
            return True
        
        return False
    
    def process_query(self, query: str, context: Dict = None) -> Dict:
        """
        MAIN ORCHESTRATION FUNCTION
        Process user query and coordinate agents
        """
        print(f"\n🎯 Orchestrator processing: {query}")
        
        # Step 1: Classify intent
        intent_data = self.classify_intent(query)
        print(f"📊 Intent: {intent_data['primary_intent']} (confidence: {intent_data['confidence']}%)")
        print(f"🔍 Reasoning: {intent_data['reasoning']}")
        
        # Step 2: Prepare response structure
        response = {
            'query': query,
            'intent': intent_data,
            'text_answer': None,
            'videos': None,
            'quiz': None,
            'study_plan': None,
            'code_help': None,
            'metadata': {
                'agents_used': [],
                'processing_time': 0
            }
        }
        
        start_time = time.time()
        
        # Step 3: Route to appropriate agents based on intent
        
        # TEXT ANSWER (Q&A Agent)
        if intent_data['primary_intent'] in ['QUESTION_ANSWER', 'CONCEPT_EXPLAIN', 'CODE_HELP']:
            print("🤖 Calling Q&A Agent...")
            try:
                text_response = self.qa_agent.answer_question(query, context)
                response['text_answer'] = text_response
                response['metadata']['agents_used'].append('QA_Agent')
            except Exception as e:
                print(f"❌ Q&A Agent error: {e}")
                response['text_answer'] = {
                    'answer': 'I encountered an error answering this question. Please try rephrasing.',
                    'sources_used': 0
                }
        
        # VIDEO RECOMMENDATIONS (YouTube Agent)
        if self.should_include_videos(query, intent_data):
            print("🎥 Calling YouTube Agent...")
            try:
                video_results = self.youtube_agent.process_doubt(query, max_videos=3)
                if video_results['success']:
                    response['videos'] = video_results
                    response['metadata']['agents_used'].append('YouTube_Agent')
            except Exception as e:
                print(f"❌ YouTube Agent error: {e}")
        
        # QUIZ GENERATION (Quiz Agent)
        if intent_data['primary_intent'] == 'QUIZ_GENERATE':
            print("📝 Calling Quiz Agent...")
            try:
                quiz_response = self.quiz_agent.generate_quiz(query, difficulty='Medium', num_questions=5)
                response['quiz'] = quiz_response
                response['metadata']['agents_used'].append('Quiz_Agent')
            except Exception as e:
                print(f"❌ Quiz Agent error: {e}")
        
        # STUDY PLAN (Study Planner Agent) - Future implementation
        if intent_data['primary_intent'] == 'STUDY_PLAN':
            print("📅 Study Planner Agent not yet implemented")
            response['study_plan'] = {
                'message': 'Study planning feature coming soon!',
                'suggestion': 'For now, I can help you with specific topics you want to learn.'
            }
        
        # Step 4: Calculate processing time
        response['metadata']['processing_time'] = round(time.time() - start_time, 2)
        
        print(f"✅ Processing complete ({response['metadata']['processing_time']}s)")
        print(f"🤖 Agents used: {', '.join(response['metadata']['agents_used'])}")
        
        return response
    
    def format_unified_response(self, orchestrated_response: Dict) -> str:
        """
        Format the multi-agent response into a unified, beautiful response
        """
        query = orchestrated_response['query']
        intent = orchestrated_response['intent']['primary_intent']
        
        # Start building response
        formatted = ""
        
        # Header
        formatted += f"# 🎓 Response to: {query}\n\n"
        formatted += f"*Intent: {intent.replace('_', ' ').title()}*\n\n"
        formatted += "---\n\n"
        
        # TEXT ANSWER
        if orchestrated_response.get('text_answer'):
            answer = orchestrated_response['text_answer']
            formatted += "## 📚 Explanation\n\n"
            formatted += f"{answer.get('answer', '')}\n\n"
            
            if answer.get('sources_used', 0) > 0:
                formatted += f"*📖 Based on {answer['sources_used']} source(s) from your syllabus*\n\n"
        
        # VIDEO RECOMMENDATIONS
        if orchestrated_response.get('videos'):
            videos = orchestrated_response['videos']
            formatted += "## 🎥 Video Resources\n\n"
            formatted += f"*Found {videos['total_videos']} relevant videos with {videos['total_timestamps']} specific timestamps*\n\n"
            
            for i, video in enumerate(videos['videos'], 1):
                formatted += f"### {i}. {video['title']}\n"
                formatted += f"**Channel:** {video['channel']} | "
                formatted += f"**Duration:** {video['duration']} | "
                formatted += f"**Views:** {video['views']}\n\n"
                
                if video.get('relevant_timestamps'):
                    formatted += "**🎯 Jump to relevant sections:**\n\n"
                    for ts in video['relevant_timestamps']:
                        formatted += f"- **[{ts['timestamp_formatted']}]({ts['url_with_timestamp']})** "
                        formatted += f"({ts['relevance_score']}% relevant)\n"
                        formatted += f"  *{ts['explanation']}*\n\n"
                else:
                    formatted += f"[🔗 Watch full video]({video['url']})\n\n"
        
        # QUIZ
        if orchestrated_response.get('quiz'):
            quiz = orchestrated_response['quiz']
            formatted += "## 📝 Practice Quiz\n\n"
            formatted += f"*Test your understanding with {len(quiz.get('questions', []))} questions*\n\n"
        
        # FOOTER
        formatted += "\n---\n\n"
        formatted += f"*🤖 Processed by: {', '.join(orchestrated_response['metadata']['agents_used'])}*\n"
        formatted += f"*⏱️ Response time: {orchestrated_response['metadata']['processing_time']}s*\n"
        
        return formatted


# Example usage
if __name__ == "__main__":
    print("🚀 Testing Agent Orchestrator...\n")
    
    # Mock agents for testing
    class MockQAAgent:
        def answer_question(self, query, context):
            return {
                'answer': f"This is a detailed explanation about {query}...",
                'sources_used': 2
            }
    
    class MockYouTubeAgent:
        def process_doubt(self, query, max_videos):
            return {
                'success': True,
                'videos': [{
                    'title': 'Example Video',
                    'channel': 'Test Channel',
                    'duration': '10:30',
                    'views': '100K',
                    'url': 'https://youtube.com/watch?v=test',
                    'relevant_timestamps': []
                }],
                'total_videos': 1,
                'total_timestamps': 0
            }
    
    class MockQuizAgent:
        def generate_quiz(self, query, difficulty, num_questions):
            return {'questions': []}
    
    # Initialize orchestrator
    orchestrator = AgentOrchestrator(
        youtube_agent=MockYouTubeAgent(),
        qa_agent=MockQAAgent(),
        quiz_agent=MockQuizAgent()
    )
    
    # Test queries
    test_queries = [
        "What is gradient descent? Show me videos",
        "Test my knowledge on neural networks",
        "Explain backpropagation with examples"
    ]
    
    for query in test_queries:
        print("\n" + "="*70)
        result = orchestrator.process_query(query)
        print("\n📄 FORMATTED RESPONSE:")
        print(orchestrator.format_unified_response(result))
        print("="*70)