# backend/agents/base_agent.py
"""
Base Agent Class - Foundation for all specialized agents
"""

import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

class BaseAgent:
    """Base class for all AI agents"""
    
    def __init__(self, name: str):
        """Initialize base agent with Gemini model"""
        self.name = name
        self.model = None
        
        # Configure Gemini API
        GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
        if not GEMINI_API_KEY:
            print(f"❌ {name}: GEMINI_API_KEY not found")
            return
        
        try:
            genai.configure(api_key=GEMINI_API_KEY)
            
            # Find working model
            available_models = []
            try:
                for m in genai.list_models():
                    if 'generateContent' in m.supported_generation_methods:
                        model_name = m.name.replace('models/', '')
                        available_models.append(model_name)
            except:
                pass
            
            # Try models in order
            model_names = available_models if available_models else [
                'gemini-1.5-flash',
                'gemini-1.5-pro', 
                'gemini-pro'
            ]
            
            for model_name in model_names:
                try:
                    test_model = genai.GenerativeModel(model_name)
                    # Test it works
                    test_response = test_model.generate_content("Say OK")
                    if test_response and test_response.text:
                        self.model = test_model
                        print(f"✅ {name} initialized with {model_name}")
                        break
                except Exception as e:
                    continue
            
            if not self.model:
                print(f"❌ {name}: Could not initialize any model")
                
        except Exception as e:
            print(f"❌ {name} initialization error: {e}")
    
    def generate_content(self, prompt: str) -> str:
        """
        Generate content using Gemini
        Safe wrapper with error handling
        """
        if not self.model:
            raise Exception(f"{self.name}: Model not initialized")
        
        try:
            response = self.model.generate_content(prompt)
            
            if response and hasattr(response, 'text') and response.text:
                return response.text
            else:
                raise Exception("Empty response from API")
                
        except Exception as e:
            raise Exception(f"{self.name} generation error: {str(e)}")
    
    def is_ready(self) -> bool:
        """Check if agent is ready to process requests"""
        return self.model is not None