import React, { useState } from 'react';
import { LLMAnalysisResult, analyzeSessions, analyzeSession } from '../services/llmAnalysisService';

interface LLMAnalysisPanelProps {
  userId?: string;
  sessionId?: string;
}

const LLMAnalysisPanel: React.FC<LLMAnalysisPanelProps> = ({ userId, sessionId }) => {
  const [analysis, setAnalysis] = useState<LLMAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const fetchAnalysis = async () => {
    if (!userId && !sessionId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      let result;
      if (userId) {
        result = await analyzeSessions(userId);
      } else if (sessionId) {
        result = await analyzeSession(sessionId);
      }
      
      setAnalysis(result || null);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch analysis');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartAnalysis = () => {
    setIsAnalyzing(true);
    fetchAnalysis();
  };

  return (
    <div className="bg-white shadow-xl rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-700">LLM Analysis Panel</h2>
        {!isAnalyzing && (
          <button
            onClick={handleStartAnalysis}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
            disabled={isLoading || (!userId && !sessionId)}
          >
            {userId ? 'Analyze User Sessions' : 'Analyze Session'}
          </button>
        )}
      </div>

      {!isAnalyzing && !analysis && (
        <div className="text-center py-8 text-gray-500">
          Click the button to analyze {userId ? 'user sessions' : 'this session'} with our LLM
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-gray-700">Analyzing data, please wait...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-6 bg-red-50 text-red-700 rounded-md">
          <p className="font-medium">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {analysis && !isLoading && (
        <div className="space-y-6">
          {/* Analysis Timestamp */}
          <div className="text-xs text-gray-500 mb-4">
            Analysis generated on: {new Date(analysis.timestamp).toLocaleString()}
          </div>

          {/* Summary */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Summary</h3>
            <div className="bg-gray-50 p-4 rounded-md text-gray-700">
              {analysis.summary}
            </div>
          </div>

          {/* Key Insights */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Key Insights</h3>
            <ul className="list-disc pl-5 space-y-2">
              {analysis.keyInsights.map((insight, index) => (
                <li key={index} className="text-gray-700">{insight}</li>
              ))}
            </ul>
          </div>

          {/* Struggles */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">User Struggles</h3>
            <div className="bg-red-50 p-4 rounded-md">
              <ul className="list-disc pl-5 space-y-2">
                {analysis.struggles.map((struggle, index) => (
                  <li key={index} className="text-red-700">{struggle}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Behaviors */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Observed Behaviors</h3>
            <div className="bg-blue-50 p-4 rounded-md">
              <ul className="list-disc pl-5 space-y-2">
                {analysis.behaviors.map((behavior, index) => (
                  <li key={index} className="text-blue-700">{behavior}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Suggestions */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Suggestions</h3>
            <div className="bg-green-50 p-4 rounded-md">
              <ul className="list-disc pl-5 space-y-2">
                {analysis.suggestions.map((suggestion, index) => (
                  <li key={index} className="text-green-700">{suggestion}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LLMAnalysisPanel; 