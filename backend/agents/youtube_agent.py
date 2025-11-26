# backend/agents/youtube_agent.py
"""
YouTube Agent - Finds relevant videos and exact timestamps for doubts
This is the MOST IMPORTANT feature for your multi-agent system
"""

import google.generativeai as genai
from youtube_search import YoutubeSearch
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import re
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

load_dotenv()

class YouTubeAgent:
    def __init__(self):
        """Initialize YouTube Agent with Gemini"""
        GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=GEMINI_API_KEY)
        
        # Find available model
        available_models = []
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                available_models.append(m.name.replace('models/', ''))
        
        model_name = available_models[0] if available_models else 'gemini-1.5-flash'
        self.model = genai.GenerativeModel(model_name)
        print(f"✅ YouTube Agent initialized with {model_name}")
    
    def search_educational_videos(self, query: str, max_results: int = 5) -> List[Dict]:
        """
        Search for educational videos on YouTube
        Prioritizes: tutorials, explanations, lectures
        """
        # Enhance query for educational content
        enhanced_query = f"{query} tutorial explanation"
        
        try:
            results = YoutubeSearch(enhanced_query, max_results=max_results).to_dict()
            
            videos = []
            for result in results:
                video_data = {
                    'video_id': result['id'],
                    'title': result['title'],
                    'channel': result['channel'],
                    'duration': result['duration'],
                    'views': result['views'],
                    'url': f"https://www.youtube.com/watch?v={result['id']}",
                    'thumbnail': result['thumbnails'][0] if result.get('thumbnails') else None
                }
                videos.append(video_data)
            
            return videos
        
        except Exception as e:
            print(f"❌ Video search error: {e}")
            return []
    
    def get_video_transcript(self, video_id: str) -> Optional[List[Dict]]:
        """
        Get transcript for a video
        Returns list of {text, start, duration}
        """
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            return transcript
        except TranscriptsDisabled:
            print(f"⚠️ Transcripts disabled for video {video_id}")
            return None
        except NoTranscriptFound:
            print(f"⚠️ No transcript found for video {video_id}")
            return None
        except Exception as e:
            print(f"❌ Transcript error: {e}")
            return None
    
    def chunk_transcript(self, transcript: List[Dict], chunk_size: int = 60) -> List[Dict]:
        """
        Chunk transcript into logical segments (default 60 seconds)
        Each chunk has: text, start_time, end_time
        """
        chunks = []
        current_chunk = {
            'text': '',
            'start': 0,
            'end': 0,
            'entries': []
        }
        
        for entry in transcript:
            # If adding this entry exceeds chunk_size, save current chunk
            if entry['start'] - current_chunk['start'] >= chunk_size and current_chunk['text']:
                chunks.append(current_chunk)
                current_chunk = {
                    'text': '',
                    'start': entry['start'],
                    'end': entry['start'],
                    'entries': []
                }
            
            current_chunk['text'] += ' ' + entry['text']
            current_chunk['end'] = entry['start'] + entry['duration']
            current_chunk['entries'].append(entry)
        
        # Add last chunk
        if current_chunk['text']:
            chunks.append(current_chunk)
        
        return chunks
    
    def analyze_chunk_relevance(self, chunk_text: str, doubt_query: str) -> Dict:
        """
        Use Gemini to analyze if a video chunk explains the doubt
        Returns: relevance score, confidence, summary
        """
        prompt = f"""Analyze if this video transcript segment explains the following concept/doubt:

DOUBT: {doubt_query}

VIDEO SEGMENT:
{chunk_text}

Analyze and respond in this EXACT format:
RELEVANT: [YES/NO]
SCORE: [0-100]
EXPLANATION: [One sentence explaining why it's relevant or not]
KEY_POINTS: [List 2-3 key points covered in this segment]

Be strict - only mark as relevant if it DIRECTLY addresses the doubt."""

        try:
            response = self.model.generate_content(prompt)
            analysis_text = response.text
            
            # Parse response
            is_relevant = 'YES' in analysis_text.split('\n')[0]
            
            # Extract score
            score_match = re.search(r'SCORE:\s*(\d+)', analysis_text)
            score = int(score_match.group(1)) if score_match else 0
            
            # Extract explanation
            explanation_match = re.search(r'EXPLANATION:\s*(.+?)(?:\n|$)', analysis_text)
            explanation = explanation_match.group(1).strip() if explanation_match else ""
            
            # Extract key points
            key_points_match = re.search(r'KEY_POINTS:\s*(.+)', analysis_text, re.DOTALL)
            key_points = key_points_match.group(1).strip() if key_points_match else ""
            
            return {
                'relevant': is_relevant,
                'score': score,
                'explanation': explanation,
                'key_points': key_points
            }
        
        except Exception as e:
            print(f"❌ Analysis error: {e}")
            return {
                'relevant': False,
                'score': 0,
                'explanation': 'Analysis failed',
                'key_points': ''
            }
    
    def find_relevant_timestamps(self, video_id: str, doubt_query: str, top_k: int = 3) -> List[Dict]:
        """
        THE MAGIC FUNCTION!
        Finds exact timestamps in a video that explain the doubt
        
        Returns top_k most relevant segments with timestamps
        """
        print(f"🔍 Analyzing video {video_id} for: {doubt_query}")
        
        # Get transcript
        transcript = self.get_video_transcript(video_id)
        if not transcript:
            return []
        
        # Chunk transcript
        chunks = self.chunk_transcript(transcript, chunk_size=60)
        print(f"📊 Created {len(chunks)} chunks to analyze")
        
        # Analyze each chunk
        relevant_segments = []
        
        for i, chunk in enumerate(chunks):
            print(f"🔎 Analyzing chunk {i+1}/{len(chunks)}...")
            
            analysis = self.analyze_chunk_relevance(chunk['text'], doubt_query)
            
            if analysis['relevant'] and analysis['score'] >= 60:  # Threshold: 60%
                segment = {
                    'start_time': chunk['start'],
                    'end_time': chunk['end'],
                    'timestamp_formatted': self.format_timestamp(chunk['start']),
                    'url_with_timestamp': f"https://www.youtube.com/watch?v={video_id}&t={int(chunk['start'])}s",
                    'text_preview': chunk['text'][:200] + '...',
                    'relevance_score': analysis['score'],
                    'explanation': analysis['explanation'],
                    'key_points': analysis['key_points']
                }
                relevant_segments.append(segment)
        
        # Sort by relevance and return top_k
        relevant_segments.sort(key=lambda x: x['relevance_score'], reverse=True)
        
        print(f"✅ Found {len(relevant_segments)} relevant segments")
        return relevant_segments[:top_k]
    
    def format_timestamp(self, seconds: float) -> str:
        """Convert seconds to MM:SS or HH:MM:SS format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        
        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        else:
            return f"{minutes}:{secs:02d}"
    
    def process_doubt(self, doubt_query: str, max_videos: int = 3) -> Dict:
        """
        MAIN FUNCTION - Process a doubt and return videos with timestamps
        
        This is what gets called when user asks a doubt
        """
        print(f"\n🎥 Processing doubt: {doubt_query}")
        
        # Step 1: Search for videos
        videos = self.search_educational_videos(doubt_query, max_results=max_videos)
        
        if not videos:
            return {
                'success': False,
                'message': 'No videos found',
                'videos': []
            }
        
        print(f"📹 Found {len(videos)} videos")
        
        # Step 2: Analyze each video for relevant timestamps
        results = []
        
        for video in videos:
            print(f"\n🎬 Analyzing: {video['title']}")
            
            timestamps = self.find_relevant_timestamps(
                video['video_id'],
                doubt_query,
                top_k=3
            )
            
            if timestamps:
                video['relevant_timestamps'] = timestamps
                video['has_timestamps'] = True
                results.append(video)
                print(f"✅ Found {len(timestamps)} relevant timestamps")
            else:
                # Still include video but mark as no timestamps
                video['relevant_timestamps'] = []
                video['has_timestamps'] = False
                video['note'] = 'Video is relevant but no transcript available or no specific timestamps found'
                results.append(video)
                print(f"⚠️ No timestamps found")
        
        return {
            'success': True,
            'doubt': doubt_query,
            'videos': results,
            'total_videos': len(results),
            'total_timestamps': sum(len(v.get('relevant_timestamps', [])) for v in results)
        }
    
    def generate_summary(self, doubt_query: str, results: Dict) -> str:
        """
        Generate a nice summary of the results for the user
        """
        if not results['success']:
            return "❌ Sorry, I couldn't find relevant videos for your doubt."
        
        summary = f"🎥 **Found {results['total_videos']} educational videos for:** {doubt_query}\n\n"
        
        for i, video in enumerate(results['videos'], 1):
            summary += f"**{i}. {video['title']}**\n"
            summary += f"   📺 Channel: {video['channel']}\n"
            summary += f"   ⏱️ Duration: {video['duration']}\n"
            summary += f"   👁️ Views: {video['views']}\n\n"
            
            if video.get('has_timestamps') and video.get('relevant_timestamps'):
                summary += f"   **🎯 Relevant Timestamps:**\n"
                for ts in video['relevant_timestamps']:
                    summary += f"   • **{ts['timestamp_formatted']}** - {ts['explanation']}\n"
                    summary += f"     🔗 [Watch at {ts['timestamp_formatted']}]({ts['url_with_timestamp']})\n"
                    summary += f"     📊 Relevance: {ts['relevance_score']}%\n\n"
            else:
                summary += f"   ℹ️ {video.get('note', 'Full video recommended')}\n"
                summary += f"   🔗 [Watch full video]({video['url']})\n\n"
            
            summary += "---\n\n"
        
        return summary


# Example usage and testing
if __name__ == "__main__":
    print("🚀 Testing YouTube Agent...\n")
    
    agent = YouTubeAgent()
    
    # Test with a doubt
    doubt = "gradient descent in machine learning"
    
    results = agent.process_doubt(doubt, max_videos=2)
    
    # Print results
    if results['success']:
        print("\n" + "="*60)
        print(agent.generate_summary(doubt, results))
        print("="*60)
    else:
        print(f"❌ Failed: {results.get('message')}")