import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAllUsers, AdminUser } from '../services/adminService';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
// import { useParams } from 'react-router-dom'; // Commented out or remove this line
import { Typography, Box, Paper, LinearProgress, Chip, Stack, Tooltip, Divider, Tabs, Tab, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import './AIAnalysisView.css'; // Import custom CSS for tables

// Define the updated AnalysisResult interface for the new API response
interface AnalysisResult {
  success: boolean;
  userId: string;
  report?: string; // Main overview message
  stage1Report?: string;
  stage2Report?: string;
  stage1Error?: string;
  stage2Error?: string;
  reportLength?: number;
  modelsUsed?: Array<{stage: string, model: string, fallback?: boolean}>;
  stage1ModelsUsed?: Array<{stage: string, model: string, fallback?: boolean}>; // For when stage 2 fails
  analysisTime?: string;
  stage1AnalysisTime?: string; // For when stage 2 fails
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
  sessionCount?: number;
}

const AIAnalysisView: React.FC = () => {
  // User state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Unified Full Analysis State
  const [isAnalyzingFull, setIsAnalyzingFull] = useState<boolean>(false);
  const [fullAnalysisProgress, setFullAnalysisProgress] = useState<number>(0);
  const [fullAnalysisProgressText, setFullAnalysisProgressText] = useState<string>('');
  const [fullAnalysisResult, setFullAnalysisResult] = useState<AnalysisResult | null>(null);
  const [stage1ReportContent, setStage1ReportContent] = useState<string | null>(null);
  const [stage2ReportContent, setStage2ReportContent] = useState<string | null>(null);
  const [fullAnalysisError, setFullAnalysisError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'stage1' | 'stage2' | 'none'>('none');

  // Get the analysis server URL from environment variables
  const ANALYSIS_API_URL = import.meta.env.VITE_ANALYSIS_API_URL || 'http://localhost:3100';

  // State for progress simulation
  let analysisProgressInterval: number | null = null;

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
      setFullAnalysisResult(null);
      setStage1ReportContent(null);
      setStage2ReportContent(null);
      setFullAnalysisError(null);
      setActiveTab('none');
    } else {
      setSelectedUser(clickedUser);
      setFullAnalysisResult(null);
      setStage1ReportContent(null);
      setStage2ReportContent(null);
      setFullAnalysisError(null);
      setActiveTab('none');
    }
  };

  useEffect(() => {
    if (isAnalyzingFull && !fullAnalysisResult) {
      setFullAnalysisProgress(0);
      let currentProgress = 0;
      analysisProgressInterval = window.setInterval(() => {
        currentProgress += Math.random() * 2.5; // Slower overall progress for two stages
        if (currentProgress >= 100) currentProgress = 99; // Don't hit 100 until result comes
        setFullAnalysisProgress(currentProgress);

        if (currentProgress < 40) {
          setFullAnalysisProgressText('Running Stage 1: Detailed Event Analysis...');
        } else if (currentProgress < 80) {
          setFullAnalysisProgressText('Running Stage 2: Non-Transitional Behavior...');
        } else {
          setFullAnalysisProgressText('Finalizing reports...');
        }
      }, 400); // Slower interval

      return () => {
        if (analysisProgressInterval) clearInterval(analysisProgressInterval);
      };
    } else if (fullAnalysisResult) {
      setFullAnalysisProgress(100);
      if (fullAnalysisResult.success) {
         setFullAnalysisProgressText('Full analysis complete.');
      } else {
         setFullAnalysisProgressText('Analysis finished with errors.');
      }
      if (analysisProgressInterval) clearInterval(analysisProgressInterval);
    }
  }, [isAnalyzingFull, fullAnalysisResult]);

  const handleFullAnalysisClick = async () => {
    if (!selectedUser) return;
    
    try {
      setIsAnalyzingFull(true);
      setFullAnalysisError(null);
      setFullAnalysisResult(null);
      setStage1ReportContent(null);
      setStage2ReportContent(null);
      setActiveTab('none');
      setFullAnalysisProgress(0);
      setFullAnalysisProgressText('Initiating full analysis...');
      
      const response = await axios.post(`${ANALYSIS_API_URL}/api/analysis/user/${selectedUser.userId}/full`);
      const resultData = response.data as AnalysisResult;
      setFullAnalysisResult(resultData);

      if (resultData.stage1Report) setStage1ReportContent(resultData.stage1Report);
      if (resultData.stage2Report) setStage2ReportContent(resultData.stage2Report);

      if (resultData.success) {
        setActiveTab(resultData.stage1Report ? 'stage1' : (resultData.stage2Report ? 'stage2' : 'none'));
      } else {
        setFullAnalysisError(resultData.message || resultData.error || "Full analysis completed with errors.");
        // If stage 1 has a report despite overall failure, show it.
        if (resultData.stage1Report && !resultData.stage2Error) setActiveTab('stage1');
        else if (resultData.stage2Report) setActiveTab('stage2'); // Or stage 2 if available
      }
    } catch (error) {
      let errorMessage = 'An unknown error occurred during Full Analysis.';
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (axios.isAxiosError(error) && error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      setFullAnalysisError(errorMessage);
      setFullAnalysisResult({ success: false, userId: selectedUser.userId, error: errorMessage }); // ensure result object is not null
    } finally {
      setIsAnalyzingFull(false);
      setFullAnalysisProgress(100); // Ensure progress bar completes
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: 'stage1' | 'stage2') => {
    setActiveTab(newValue);
  };

  const theme = useTheme();

  // Helper to render model chips
  const renderModelChips = (models: Array<{stage: string, model: string, fallback?: boolean}> | undefined) => {
    if (!models || models.length === 0) return null;
    return (
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {models.map((model, index) => (
          <Tooltip key={index} title={getModelDescription(model.model)} placement="top">
            <Chip label={`${model.stage}: ${getModelDisplayName(model.model)}`} color={getModelColor(model.model)} variant="outlined" size="small"
              sx={{ backgroundColor: `${theme.palette.primary.main}15`, fontWeight: 'medium' }}
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
            AI Analysis for {selectedUser.username} (ID: {selectedUser.userId})
          </h2>
          
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-lg font-medium mb-2">Full Analysis (Stage 1 & 2)</h3>
              <p className="text-sm text-gray-600 mb-4">
                Runs detailed event analysis followed by non-transitional behavior analysis.
              </p>
              <Button
                variant="contained"
                onClick={handleFullAnalysisClick}
                disabled={isAnalyzingFull}
                sx={{ 
                  backgroundColor: isAnalyzingFull ? '#9CA3AF' : '#10B981', // Tailwind green-500
                  '&:hover': { backgroundColor: isAnalyzingFull ? '#9CA3AF' : '#059669' } // Tailwind green-600
                }}
              >
                {isAnalyzingFull ? 'Running Full Analysis...' : 'Run Full Analysis (Stage 1 & 2)'}
              </Button>
            </div>
          </div>
          
          {isAnalyzingFull && (
            <div className="mb-8 p-4 border rounded-md bg-blue-50">
              <h3 className="text-lg font-medium mb-2">Full Analysis Progress</h3>
              <div className="mb-2 flex justify-between">
                <span className="text-sm font-medium text-gray-700">{fullAnalysisProgressText}</span>
                <span className="text-sm font-medium text-gray-700">{Math.round(fullAnalysisProgress)}%</span>
              </div>
              <LinearProgress variant="determinate" value={fullAnalysisProgress} sx={{ height: 8, borderRadius: 4, backgroundColor: `${theme.palette.primary.main}30`, '& .MuiLinearProgress-bar': { borderRadius: 4, backgroundColor: theme.palette.primary.main }}} />
            </div>
          )}
          
          {fullAnalysisError && (
            <div className="p-4 mb-6 text-red-700 bg-red-100 rounded-md">
              <h3 className="font-semibold">Analysis Error</h3>
              <p>{fullAnalysisError}</p>
            </div>
          )}

          {fullAnalysisResult && (
             <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                <Typography variant="h5" gutterBottom component="div" sx={{ color: theme.palette.primary.main, fontWeight: 'bold', mb: 0 }}>
                  Analysis Results
                </Typography>
                {fullAnalysisResult.analysisTime && (
                  <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                    Total generation time: {fullAnalysisResult.analysisTime} seconds
                  </Typography>)}
              </div>

              {renderModelChips(fullAnalysisResult.modelsUsed)}
              {fullAnalysisResult.analysisStagesCompleted && (
                  <div className="mb-4">
                    <Typography variant="subtitle2" component="div" sx={{ mb: 1, color: 'text.secondary' }}>Analysis Stages Run:</Typography>
                    <Stack direction="row" spacing={1}>{fullAnalysisResult.analysisStagesCompleted.map((stage, index) => (<Chip key={index} label={stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} variant="outlined" size="small" sx={{ backgroundColor: `${theme.palette.info.main}20`, borderColor: `${theme.palette.info.main}80`, color: theme.palette.info.dark, fontWeight: 'medium' }}/>))}</Stack>
                  </div>)}
              
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={activeTab === 'none' ? false : activeTab} onChange={handleTabChange} aria-label="analysis stages tabs">
                  <Tab label="Stage 1: Detailed Events" value="stage1" disabled={!stage1ReportContent && !fullAnalysisResult.stage1Error} />
                  <Tab label="Stage 2: Non-Transitional" value="stage2" disabled={!stage2ReportContent && !fullAnalysisResult.stage2Error} />
                </Tabs>
              </Box>
              
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
                  {activeTab === 'stage1' && (
                    fullAnalysisResult.stage1Error ? 
                    <div className="p-4 text-red-700 bg-red-100 rounded-md"><h3 className="font-semibold">Stage 1 Error:</h3><p>{fullAnalysisResult.stage1Error}</p>{stage1ReportContent && <><Divider sx={{my:2}}/> <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>{stage1ReportContent}</ReactMarkdown></>}</div> :
                    <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>{stage1ReportContent || "Stage 1 report not available or not selected."}</ReactMarkdown>
                  )}
                  {activeTab === 'stage2' && (
                    fullAnalysisResult.stage2Error ? 
                    <div className="p-4 text-red-700 bg-red-100 rounded-md"><h3 className="font-semibold">Stage 2 Error:</h3><p>{fullAnalysisResult.stage2Error}</p>{stage2ReportContent && <><Divider sx={{my:2}}/> <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>{stage2ReportContent}</ReactMarkdown></>}</div> :
                    <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>{stage2ReportContent || "Stage 2 report not available or not selected."}</ReactMarkdown>
                  )}
                  {activeTab === 'none' && <Typography>Select a stage tab to view its report.</Typography>}
                </div>
              </Box>
            </Paper>
          )}

          {fullAnalysisResult && !fullAnalysisResult.success && !fullAnalysisResult.stage1Report && !fullAnalysisResult.stage2Report && (
            <div className="p-4 mb-6 text-amber-700 bg-amber-100 rounded-md">
              <h3 className="font-semibold">Analysis Unavailable</h3>
              <p>{fullAnalysisResult.message || "No analysis could be performed. Please try again."}</p>
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