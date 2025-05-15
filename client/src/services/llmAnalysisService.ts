import apiClient from './apiService';

export interface LLMAnalysisResult {
  userId: string;
  sessionId?: string;
  summary: string;
  keyInsights: string[];
  struggles: string[];
  behaviors: string[];
  suggestions: string[];
  timestamp: string;
}

// Analyze all sessions for a specific user
export const analyzeSessions = async (userId: string): Promise<LLMAnalysisResult> => {
  try {
    const response = await apiClient.get<LLMAnalysisResult>(`/admin/analysis/user/${userId}`);
    return response.data;
  } catch (error) {
    console.error(`Error analyzing sessions for user ${userId}:`, error);
    throw new Error(`Failed to analyze sessions for user ${userId}. Please try again later.`);
  }
};

// Analyze a specific session
export const analyzeSession = async (sessionId: string): Promise<LLMAnalysisResult> => {
  try {
    const response = await apiClient.get<LLMAnalysisResult>(`/admin/analysis/session/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error(`Error analyzing session ${sessionId}:`, error);
    throw new Error(`Failed to analyze session ${sessionId}. Please try again later.`);
  }
}; 