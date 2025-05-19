import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAllUsers, AdminUser } from '../services/adminService';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
// import { useParams } from 'react-router-dom'; // Commented out or remove this line
import { Typography, Box, Paper, LinearProgress, Chip, Stack, Tooltip, Divider } from '@mui/material';
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
  analysisStagesCompleted?: string[];
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

  // Stage 1 analysis state
  const [isAnalyzingStage1, setIsAnalyzingStage1] = useState<boolean>(false);
  const [stage1Progress, setStage1Progress] = useState<number>(0);
  const [stage1ProgressText, setStage1ProgressText] = useState<string>('');
  const [stage1Result, setStage1Result] = useState<AnalysisResult | null>(null);
  const [stage1Error, setStage1Error] = useState<string | null>(null);

  // Stage 2 analysis state
  const [isAnalyzingStage2, setIsAnalyzingStage2] = useState<boolean>(false);
  const [stage2Progress, setStage2Progress] = useState<number>(0);
  const [stage2ProgressText, setStage2ProgressText] = useState<string>('');
  const [stage2Result, setStage2Result] = useState<AnalysisResult | null>(null);
  const [stage2Error, setStage2Error] = useState<string | null>(null);
  
  // View state
  const [activeReport, setActiveReport] = useState<'none' | 'stage1' | 'stage2'>('none');

  // Get the analysis server URL from environment variables
  const ANALYSIS_API_URL = import.meta.env.VITE_ANALYSIS_API_URL || 'http://localhost:3100';

  // State for progress simulation
  let stage1Interval: number | null = null;
  let stage2Interval: number | null = null;

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
      setStage1Result(null);
      setStage2Result(null);
      setStage1Error(null);
      setStage2Error(null);
      setActiveReport('none');
    } else {
      setSelectedUser(clickedUser);
      setStage1Result(null);
      setStage2Result(null);
      setStage1Error(null);
      setStage2Error(null);
      setActiveReport('none');
    }
  };

  // Simulation of Stage 1 progress updates
  useEffect(() => {
    if (isAnalyzingStage1 && !stage1Result) {
      setStage1Progress(0);
      // Use window.setInterval for browser environment
      stage1Interval = window.setInterval(() => {
        setStage1Progress(prev => {
          const newProgress = Math.min(prev + (Math.random() * 5), 95);
          
          if (newProgress < 30) {
            setStage1ProgressText('Gathering raw session data...');
          } else if (newProgress < 60) {
            setStage1ProgressText('Processing detailed events...');
          } else {
            setStage1ProgressText('Generating Stage 1 analysis report...');
          }
          
          return newProgress;
        });
      }, 600);
      
      return () => {
        if (stage1Interval) {
          clearInterval(stage1Interval);
        }
      };
    } else if (stage1Result) {
      setStage1Progress(100);
      setStage1ProgressText('Stage 1 analysis complete');
      if (stage1Interval) {
        clearInterval(stage1Interval);
      }
    }
  }, [isAnalyzingStage1, stage1Result]);

  // Simulation of Stage 2 progress updates
  useEffect(() => {
    if (isAnalyzingStage2 && !stage2Result) {
      setStage2Progress(0);
      // Use window.setInterval for browser environment
      stage2Interval = window.setInterval(() => {
        setStage2Progress(prev => {
          const newProgress = Math.min(prev + (Math.random() * 5), 95);
          
          if (newProgress < 30) {
            setStage2ProgressText('Preparing for non-transitional analysis...');
          } else if (newProgress < 60) {
            setStage2ProgressText('Processing mouse, keyboard, idle events...');
          } else {
            setStage2ProgressText('Generating Stage 2 behavior report...');
          }
          
          return newProgress;
        });
      }, 600);
      
      return () => {
        if (stage2Interval) {
          clearInterval(stage2Interval);
        }
      };
    } else if (stage2Result) {
      setStage2Progress(100);
      setStage2ProgressText('Stage 2 analysis complete');
      if (stage2Interval) {
        clearInterval(stage2Interval);
      }
    }
  }, [isAnalyzingStage2, stage2Result]);

  const handleStage1AnalyzeClick = async () => {
    if (!selectedUser) return;
    
    try {
      setIsAnalyzingStage1(true);
      setStage1Error(null);
      setStage1Result(null);
      setActiveReport('none');
      
      // Stage 1 API endpoint
      const response = await axios.post(`${ANALYSIS_API_URL}/api/analysis/user/${selectedUser.userId}`);
      
      setStage1Result(response.data);
      setStage1Progress(100);
    } catch (error) {
      let errorMessage = 'An unknown error occurred during Stage 1 analysis.';
      
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setStage1Error(errorMessage);
    } finally {
      setIsAnalyzingStage1(false);
    }
  };

  const handleStage2AnalyzeClick = async () => {
    if (!selectedUser) return;
    
    try {
      setIsAnalyzingStage2(true);
      setStage2Error(null);
      setStage2Result(null);
      setActiveReport('none');
      
      // Stage 2 API endpoint - note the different endpoint for Stage 2
      const response = await axios.post(`${ANALYSIS_API_URL}/api/analysis/user/${selectedUser.userId}/stage2`);
      
      setStage2Result(response.data);
      setStage2Progress(100);
    } catch (error) {
      let errorMessage = 'An unknown error occurred during Stage 2 analysis.';
      
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setStage2Error(errorMessage);
    } finally {
      setIsAnalyzingStage2(false);
    }
  };

  const handleViewStage1 = () => {
    setActiveReport('stage1');
  };

  const handleViewStage2 = () => {
    setActiveReport('stage2');
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

  // Determine which report to show
  const currentResult = activeReport === 'stage1' ? stage1Result : 
                         activeReport === 'stage2' ? stage2Result : null;

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
            AI Analysis for {selectedUser.username} (ID: {selectedUser.userId})
          </h2>
          
          {/* Analysis Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Stage 1 Button */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-lg font-medium mb-2">Stage 1: Detailed Event Analysis</h3>
              <p className="text-sm text-gray-600 mb-4">
                Analyzes page transitions, form interactions, DOM changes, and navigation patterns.
              </p>
              <div className="flex flex-col md:flex-row gap-2">
                <button
                  onClick={handleStage1AnalyzeClick}
                  disabled={isAnalyzingStage1}
                  className={`px-4 py-2 rounded-md text-white font-medium ${
                    isAnalyzingStage1 ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isAnalyzingStage1 ? 'Running...' : 'Run Stage 1 Analysis'}
                </button>
                {stage1Result && (
                  <button
                    onClick={handleViewStage1}
                    className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium"
                  >
                    View Results
                  </button>
                )}
              </div>
            </div>
            
            {/* Stage 2 Button */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-lg font-medium mb-2">Stage 2: Non-Transitional Behavior</h3>
              <p className="text-sm text-gray-600 mb-4">
                Analyzes mouse movements, keyboard patterns, idle times, clicks, and scrolling.
              </p>
              <div className="flex flex-col md:flex-row gap-2">
                <button
                  onClick={handleStage2AnalyzeClick}
                  disabled={isAnalyzingStage2}
                  className={`px-4 py-2 rounded-md text-white font-medium ${
                    isAnalyzingStage2 ? 'bg-purple-300' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {isAnalyzingStage2 ? 'Running...' : 'Run Stage 2 Analysis'}
                </button>
                {stage2Result && (
                  <button
                    onClick={handleViewStage2}
                    className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium"
                  >
                    View Results
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* Stage 1 Progress */}
          {isAnalyzingStage1 && (
            <div className="mb-8 p-4 border rounded-md bg-blue-50">
              <h3 className="text-lg font-medium mb-2">Stage 1: Detailed Event Analysis</h3>
              <div className="mb-2 flex justify-between">
                <span className="text-sm font-medium text-gray-700">{stage1ProgressText}</span>
                <span className="text-sm font-medium text-gray-700">{Math.round(stage1Progress)}%</span>
              </div>
              <LinearProgress 
                variant="determinate" 
                value={stage1Progress} 
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
            </div>
          )}
          
          {/* Stage 1 Error */}
          {stage1Error && (
            <div className="p-4 mb-6 text-red-700 bg-red-100 rounded-md">
              <h3 className="font-semibold">Stage 1 Analysis Error</h3>
              <p>{stage1Error}</p>
            </div>
          )}
          
          {/* Stage 2 Progress */}
          {isAnalyzingStage2 && (
            <div className="mb-8 p-4 border rounded-md bg-purple-50">
              <h3 className="text-lg font-medium mb-2">Stage 2: Non-Transitional Behavior Analysis</h3>
              <div className="mb-2 flex justify-between">
                <span className="text-sm font-medium text-gray-700">{stage2ProgressText}</span>
                <span className="text-sm font-medium text-gray-700">{Math.round(stage2Progress)}%</span>
              </div>
              <LinearProgress 
                variant="determinate" 
                value={stage2Progress} 
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  backgroundColor: `${theme.palette.secondary.main}30`,
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 4,
                    backgroundColor: theme.palette.secondary.main
                  }
                }}
              />
            </div>
          )}
          
          {/* Stage 2 Error */}
          {stage2Error && (
            <div className="p-4 mb-6 text-red-700 bg-red-100 rounded-md">
              <h3 className="font-semibold">Stage 2 Analysis Error</h3>
              <p>{stage2Error}</p>
            </div>
          )}
          
          {/* Analysis Results */}
          {currentResult && currentResult.success && (
            <div className="mt-8 mb-4">
              <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                  <Typography variant="h5" gutterBottom component="div" sx={{ color: theme.palette.primary.main, fontWeight: 'bold', mb: 0 }}>
                    {activeReport === 'stage1' ? 'Stage 1: Detailed Event Analysis' : 'Stage 2: Non-Transitional Behavior Analysis'}
                  </Typography>
                  
                  {currentResult.analysisTime && (
                    <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                      Generated in {currentResult.analysisTime} seconds
                    </Typography>
                  )}
                </div>
                
                {/* Display models used for analysis */}
                {currentResult.modelsUsed && currentResult.modelsUsed.length > 0 && (
                  <div className="mb-4">
                    <Typography variant="subtitle2" component="div" sx={{ mb: 1, color: 'text.secondary' }}>
                      Models used in this analysis:
                    </Typography>
                    {renderModelChips(currentResult.modelsUsed)}
                  </div>
                )}

                {/* Display analysis stages completed */}
                {currentResult.analysisStagesCompleted && currentResult.analysisStagesCompleted.length > 0 && (
                  <div className="mb-4">
                    <Typography variant="subtitle2" component="div" sx={{ mb: 1, color: 'text.secondary' }}>
                      Analysis Stages Run:
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                      {currentResult.analysisStagesCompleted.map((stage, index) => (
                        <Chip 
                          key={index} 
                          label={stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} // Format stage name
                          variant="outlined" 
                          size="small"
                          sx={{ 
                            backgroundColor: `${theme.palette.info.main}20`, // Using info color palette
                            borderColor: `${theme.palette.info.main}80`,
                            color: theme.palette.info.dark,
                            fontWeight: 'medium'
                          }}
                        />
                      ))}
                    </Stack>
                  </div>
                )}
                
                <Divider sx={{ mb: 3 }} />
                
                {/* Content for the report */}
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
                      {currentResult.report || "No analysis data available."}
                    </ReactMarkdown>
                  </div>
                </Box>
              </Paper>
            </div>
          )}
          
          {/* No Analysis Results */}
          {currentResult && !currentResult.success && (
            <div className="p-4 mb-6 text-amber-700 bg-amber-100 rounded-md">
              <h3 className="font-semibold">Analysis Unavailable</h3>
              <p>{currentResult.message || "No analysis could be performed. Please try again."}</p>
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