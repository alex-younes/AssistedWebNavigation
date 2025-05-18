import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAllUsers, AdminUser } from '../services/adminService';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
// import { useParams } from 'react-router-dom'; // Commented out or remove this line
import { Typography, Box, Paper, LinearProgress, Chip, Stack, Tooltip, Tabs, Tab, Divider } from '@mui/material'; // Added LinearProgress, Chip, Tabs, Tab, and Divider
import { useTheme } from '@mui/material/styles';
import './AIAnalysisView.css'; // Import custom CSS for tables

// Define the updated AnalysisResult interface for the new API response
interface AnalysisResult {
  success: boolean;
  userId: string;
  report: string;
  reportLength?: number;
  modelsUsed?: Array<{stage: string, model: string, fallback?: boolean}>;
  analysisTime?: string;
  _meta?: {
    rateLimitStatus?: {
      [provider: string]: {
        tokensRemaining: number;
        requestsRemaining: number;
        adaptiveDelay: number;
        consecutiveErrors: number;
        queueLength: number;
      }
    };
    stageResultSizes?: {
      stage1?: number;
      stage2?: number;
      stage3?: number;
      stage4?: number;
      final?: number;
    }
  };
  message?: string;
  error?: string;
  stageResults?: {
    metrics?: string;
    behavioral?: string;
    progression?: string;
    temporal?: string;
  };
}

const AIAnalysisView: React.FC = () => {
  // User state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisStage, setAnalysisStage] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Tab state
  const [selectedTab, setSelectedTab] = useState<string>('synthesis');

  // Get the analysis server URL from environment variables
  const ANALYSIS_API_URL = import.meta.env.VITE_ANALYSIS_API_URL || 'http://localhost:3100';

  // State for progress simulation
  let interval: number | null = null;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoadingUsers(true);
        const fetchedUsers = await getAllUsers();
        setUsers(fetchedUsers);
        setUsersError(null);
      } catch (error) {
        if (error instanceof Error) {
          setUsersError(error.message);
        } else {
          setUsersError('An unknown error occurred while fetching users.');
        }
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  const handleUserClick = (clickedUser: AdminUser) => {
    if (selectedUser?.userId === clickedUser.userId) {
      setSelectedUser(null); 
      setAnalysisResult(null);
      setAnalysisError(null);
    } else {
      setSelectedUser(clickedUser);
      setAnalysisResult(null);
      setAnalysisError(null);
    }
  };

  // Simulation of progress updates during analysis
  useEffect(() => {
    if (isAnalyzing && !analysisResult) {
      setAnalysisProgress(0);
      // Use window.setInterval for browser environment
      interval = window.setInterval(() => {
        setAnalysisProgress(prev => {
          // Define stages based on progress percentage
          const newProgress = Math.min(prev + (Math.random() * 2), 99);
          
          if (newProgress < 25) {
            setAnalysisStage('Gathering session data...');
          } else if (newProgress < 45) {
            setAnalysisStage('Analyzing metrics and navigation patterns...');
          } else if (newProgress < 65) {
            setAnalysisStage('Performing behavioral analysis...');
          } else if (newProgress < 85) {
            setAnalysisStage('Analyzing temporal patterns...');
          } else {
            setAnalysisStage('Synthesizing comprehensive report...');
          }
          
          return newProgress;
        });
      }, 800);
      
      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    } else if (analysisResult) {
      setAnalysisProgress(100);
      setAnalysisStage('Analysis complete');
      if (interval) {
        clearInterval(interval);
      }
    }
  }, [isAnalyzing, analysisResult]);

  const handleAnalyzeClick = async () => {
    if (!selectedUser) return;
    
    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setAnalysisResult(null);
      
      // Updated to use the correct API endpoint
      const response = await axios.post(`${ANALYSIS_API_URL}/api/analysis/user/${selectedUser.userId}`);
      
      setAnalysisResult(response.data);
      setAnalysisProgress(100);
    } catch (error) {
      let errorMessage = 'An unknown error occurred during analysis.';
      
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setAnalysisError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const theme = useTheme();

  // Helper to render model chips
  const renderModelChips = (models: Array<{stage: string, model: string, fallback?: boolean}>) => {
    if (!models || models.length === 0) return null;
    
    return (
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {models.map((model, index) => (
          <Tooltip 
            key={index} 
            title={getModelDescription(model.model)}
            placement="top"
          >
            <Chip 
              label={getModelDisplayName(model.model)} 
              color={getModelColor(model.model)}
              variant="outlined" 
              size="small"
              sx={{ 
                backgroundColor: `${theme.palette.primary.main}15`, 
                fontWeight: 'medium'
              }}
            />
          </Tooltip>
        ))}
      </Stack>
    );
  };
  
  // Helper functions for model display
  const getModelDisplayName = (model: string | undefined): string => {
    if (!model) return 'Unknown Model';
    
    // Extract friendly names from model identifiers
    if (model.includes('claude-3-opus')) return 'Claude 3 Opus';
    if (model.includes('claude-3-sonnet')) return 'Claude 3 Sonnet';
    if (model.includes('claude-3-haiku')) return 'Claude 3 Haiku';
    if (model.includes('gpt-4')) return 'GPT-4';
    if (model.includes('llama-3.1-8b')) return 'Llama 3.1 8B';
    if (model.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
    if (model.includes('llama-3')) return 'Llama 3';
    if (model.includes('mistral-saba')) return 'Mistral Saba';
    if (model.includes('deepseek')) return 'DeepSeek';
    if (model.includes('gemma')) return 'Gemma 2';
    return model.split('/').pop()?.split('-')[0] || model;
  };
  
  const getModelColor = (model: string | undefined): "primary" | "secondary" | "default" | "error" | "info" | "success" | "warning" => {
    if (!model) return 'default';
    
    if (model.includes('claude-3-opus')) return 'primary';
    if (model.includes('gpt-4')) return 'secondary';
    if (model.includes('deepseek')) return 'info';
    if (model.includes('llama')) return 'success';
    if (model.includes('mistral')) return 'warning';
    return 'default';
  };
  
  const getModelDescription = (model: string | undefined): string => {
    if (!model) return 'AI model for analysis';
    
    if (model.includes('claude-3-opus')) return 'Anthropic\'s most powerful model for comprehensive analysis';
    if (model.includes('claude-3-sonnet')) return 'Balanced power and speed for detailed analysis';
    if (model.includes('claude-3-haiku')) return 'Fast analysis for specific metrics';
    if (model.includes('deepseek')) return 'Specialized for deep behavioral analysis';
    if (model.includes('llama-3.1-8b')) return 'Fast, efficient model for metrics analysis';
    if (model.includes('llama-3.3-70b')) return 'Powerful model for comprehensive synthesis';
    if (model.includes('llama-3')) return 'Meta\'s efficient model for metrics and patterns';
    if (model.includes('mistral-saba')) return 'Powerful model for behavioral analysis';
    if (model.includes('gemma')) return 'Google\'s Gemma model for temporal analysis';
    return 'AI model for specialized analysis tasks';
  };

  return (
    <div className="space-y-8">
      {/* User Selection Section */}
      <div className="bg-white shadow-xl rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Select User for Analysis</h2>
        {isLoadingUsers && <p className="text-blue-500">Loading users...</p>}
        {usersError && <p className="text-red-600">Error: {usersError}</p>}
        
        {!isLoadingUsers && !usersError && (
          <div className="overflow-x-auto">
            {users.length === 0 ? (
              <p className="text-gray-500">No users found.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr 
                      key={u.userId} 
                      onClick={() => handleUserClick(u)} 
                      className={`hover:bg-indigo-100 cursor-pointer ${selectedUser?.userId === u.userId ? 'bg-indigo-200 ring-2 ring-indigo-500' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.username}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.userId}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Analysis Area */}
      {selectedUser && (
        <div className="bg-white shadow-xl rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            Multi-Model AI Analysis for {selectedUser.username} (ID: {selectedUser.userId})
          </h2>
          
          <div className="mb-6">
            <button
              onClick={handleAnalyzeClick}
              disabled={isAnalyzing}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                isAnalyzing ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isAnalyzing ? 'Analyzing...' : 'Run Multi-Stage User Analysis'}
            </button>
            
            <p className="mt-2 text-sm text-gray-600">
              Uses specialized AI models for each stage of analysis, optimized for different aspects of user behavior.
            </p>
          </div>
          
          {/* Analysis Progress */}
          {isAnalyzing && (
            <div className="mb-8">
              <div className="mb-2 flex justify-between">
                <span className="text-sm font-medium text-gray-700">{analysisStage}</span>
                <span className="text-sm font-medium text-gray-700">{Math.round(analysisProgress)}%</span>
              </div>
              <LinearProgress 
                variant="determinate" 
                value={analysisProgress} 
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  backgroundColor: `${theme.palette.primary.main}30`,
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 4,
                    backgroundColor: theme.palette.primary.main
                  }
                }}
              />
              <p className="mt-4 text-gray-600 text-center">
                {analysisProgress < 30 ? 'Each analysis stage uses a specialized AI model for optimal results' : 
                 analysisProgress < 60 ? 'Deep behavioral analysis uses advanced reasoning capabilities' : 
                 'Generating comprehensive synthesis of all analysis stages'}
              </p>
            </div>
          )}
          
          {/* Analysis Error */}
          {analysisError && (
            <div className="p-4 mb-6 text-red-700 bg-red-100 rounded-md">
              <h3 className="font-semibold">Analysis Error</h3>
              <p>{analysisError}</p>
            </div>
          )}
          
          {/* Analysis Results */}
          {analysisResult && analysisResult.success && (
            <div className="mt-8 mb-4">
              <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                  <Typography variant="h5" gutterBottom component="div" sx={{ color: theme.palette.primary.main, fontWeight: 'bold', mb: 0 }}>
                    Multi-Model Analysis Report
                  </Typography>
                  
                  {analysisResult.analysisTime && (
                    <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                      Generated in {analysisResult.analysisTime} seconds
                    </Typography>
                  )}
                </div>
                
                {/* Display models used for analysis */}
                {analysisResult.modelsUsed && analysisResult.modelsUsed.length > 0 && (
                  <div className="mb-4">
                    <Typography variant="subtitle2" component="div" sx={{ mb: 1, color: 'text.secondary' }}>
                      Models used in this analysis:
                    </Typography>
                    {renderModelChips(analysisResult.modelsUsed)}
                  </div>
                )}
                
                {/* Tabs for different stages */}
                <Tabs
                  value={selectedTab}
                  onChange={(e, newValue) => setSelectedTab(newValue)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
                >
                  <Tab label="Complete Analysis" value="synthesis" />
                  {analysisResult.stageResults?.metrics && (
                    <Tab label="Metrics & Navigation" value="metrics" />
                  )}
                  {analysisResult.stageResults?.behavioral && (
                    <Tab label="Behavioral Analysis" value="behavioral" />
                  )}
                  {analysisResult.stageResults?.progression && (
                    <Tab label="Progression Analysis" value="progression" />
                  )}
                  {analysisResult.stageResults?.temporal && (
                    <Tab label="Temporal Analysis" value="temporal" />
                  )}
                </Tabs>
                
                <Divider sx={{ mb: 3 }} />
                
                {/* Content for selected tab */}
                <Box sx={{ mt: 2, typography: 'body1', 
                  '& h1': { fontSize: '2.2rem', fontWeight: 'bold', color: theme.palette.secondary.main, borderBottom: `2px solid ${theme.palette.primary.light}`, pb: 1, mb: 2 },
                  '& h2': { fontSize: '1.8rem', fontWeight: 'bold', color: theme.palette.secondary.dark, mt: 3, mb: 1.5, borderBottom: `1px solid ${theme.palette.grey[400]}`, pb: 0.5 },
                  '& h3': { fontSize: '1.5rem', fontWeight: 'bold', color: theme.palette.text.primary, mt: 2.5, mb: 1 },
                  '& p': { lineHeight: 1.7, mb: 1.5 },
                  '& ul, & ol': { pl: 2.5, mb: 1.5 },
                  '& li': { mb: 0.5 },
                  '& table': { width: '100%', borderCollapse: 'collapse', mb: 2, border: `1px solid ${theme.palette.grey[300]}` },
                  '& th, & td': {
                    border: `1px solid ${theme.palette.grey[300]}`,
                    padding: '10px 12px',
                    textAlign: 'left',
                    wordBreak: 'break-word',
                    whiteSpace: 'normal'
                  },
                  '& th': { backgroundColor: theme.palette.grey[100], fontWeight: 'bold' },
                  '& tr:nth-of-type(even)': { backgroundColor: theme.palette.grey[50] },
                  '& code': { backgroundColor: theme.palette.grey[200], padding: '2px 5px', borderRadius: '4px', fontSize: '0.9em' },
                  '& pre > code': { display: 'block', padding: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
                  '& blockquote': { borderLeft: `4px solid ${theme.palette.primary.light}`, pl: 2, ml: 0, fontStyle: 'italic', color: theme.palette.text.secondary },
                  '& hr': { border: 'none', borderTop: `2px dashed ${theme.palette.grey[300]}`, my: 3 }
                }} className="markdown-body">
                  <div className="ai-report-markdown">
                    <ReactMarkdown 
                      rehypePlugins={[rehypeRaw]}
                      remarkPlugins={[remarkGfm]}
                    >
                      {selectedTab === 'synthesis' ? analysisResult.report : 
                       selectedTab === 'metrics' && analysisResult.stageResults?.metrics ? analysisResult.stageResults.metrics :
                       selectedTab === 'behavioral' && analysisResult.stageResults?.behavioral ? analysisResult.stageResults.behavioral :
                       selectedTab === 'progression' && analysisResult.stageResults?.progression ? analysisResult.stageResults.progression :
                       selectedTab === 'temporal' && analysisResult.stageResults?.temporal ? analysisResult.stageResults.temporal :
                       "No data available for this analysis stage."}
                    </ReactMarkdown>
                  </div>
                </Box>
              </Paper>
              
              {/* Display metadata if available */}
              {analysisResult._meta?.stageResultSizes && (
                <div className="mt-4 text-xs text-gray-500">
                  <details>
                    <summary className="cursor-pointer font-medium">Analysis Stage Details</summary>
                    <div className="mt-2 pl-4">
                      <p>Stage 1 (Metrics): {analysisResult._meta.stageResultSizes.stage1 || 0} characters</p>
                      <p>Stage 2 (Behavioral): {analysisResult._meta.stageResultSizes.stage2 || 0} characters</p>
                      {analysisResult._meta.stageResultSizes.stage3 && analysisResult._meta.stageResultSizes.stage3 > 0 && 
                        <p>Stage 3 (Form): {analysisResult._meta.stageResultSizes.stage3} characters</p>}
                      {analysisResult._meta.stageResultSizes.stage4 && analysisResult._meta.stageResultSizes.stage4 > 0 && 
                        <p>Stage 4 (Temporal): {analysisResult._meta.stageResultSizes.stage4} characters</p>}
                      <p>Final Report: {analysisResult._meta.stageResultSizes.final || 0} characters</p>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
          
          {/* No Analysis Results */}
          {analysisResult && !analysisResult.success && (
            <div className="p-4 mb-6 text-amber-700 bg-amber-100 rounded-md">
              <h3 className="font-semibold">Analysis Unavailable</h3>
              <p>{analysisResult.message || "No analysis could be performed. Please try again."}</p>
            </div>
          )}
        </div>
      )}

      {!selectedUser && (
         <div className="bg-white shadow-xl rounded-lg p-6 text-center text-gray-500">
            <p>Please select a user from the table above to proceed with AI analysis.</p>
        </div>
      )}
    </div>
  );
};

export default AIAnalysisView;