import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAllUsers, AdminUser } from '../services/adminService';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
// import { useParams } from 'react-router-dom'; // Commented out or remove this line
import { Typography, Box, Paper, LinearProgress, Chip, Stack } from '@mui/material'; // Added LinearProgress and Chip
import { useTheme } from '@mui/material/styles';
import './AIAnalysisView.css'; // Import custom CSS for tables

// Define the ComparisonResult interface directly here since we deleted the service file
interface ComparisonResult {
  success: boolean;
  userId: string;
  sessionCount: number;
  report: string;
  sessionIds: string[];
  timestamp: string;
  model: string;
  message?: string;
  error?: string;
}

const AIAnalysisView: React.FC = () => {
  // User state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0); // Progress indicator
  const [analysisStage, setAnalysisStage] = useState<string>(''); // Current analysis stage
  const [analysisResult, setAnalysisResult] = useState<ComparisonResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Get the analysis server URL from environment variables
  const ANALYSIS_API_URL = import.meta.env.VITE_ANALYSIS_API_URL || 'http://localhost:3100';

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
    let interval: number | null = null;
    
    if (isAnalyzing) {
      setAnalysisProgress(0);
      setAnalysisStage('Fetching session data...');
      
      // Simulate progress updates
      interval = window.setInterval(() => {
        setAnalysisProgress(prev => {
          const newProgress = prev + (0.5 + Math.random() * 2); // Random progress increments
          
          // Update stage based on progress
          if (newProgress > 10 && newProgress < 25) {
            setAnalysisStage('Analyzing metrics & navigation patterns...');
          } else if (newProgress >= 25 && newProgress < 40) {
            setAnalysisStage('Analyzing behavioral patterns...');
          } else if (newProgress >= 40 && newProgress < 55) {
            setAnalysisStage('Analyzing form interactions...');
          } else if (newProgress >= 55 && newProgress < 70) {
            setAnalysisStage('Analyzing learning progression...');
          } else if (newProgress >= 70 && newProgress < 85) {
            setAnalysisStage('Generating comprehensive report...');
          } else if (newProgress >= 85) {
            setAnalysisStage('Finalizing analysis...');
          }
          
          return Math.min(newProgress, 95); // Cap at 95% until actual completion
        });
      }, 800);
    } else if (interval) {
      clearInterval(interval);
      setAnalysisProgress(100);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAnalyzing]);

  const handleAnalyzeClick = async () => {
    if (!selectedUser) return;
    
    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setAnalysisResult(null);
      
      // Make a direct request to the AI analysis server
      const response = await axios.post(`${ANALYSIS_API_URL}/api/analysis/user-sessions-comparison`, {
        userId: selectedUser.userId
      });
      
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
  const renderModelChips = (modelString: string) => {
    const models = modelString.split(',').map(m => m.trim());
    
    return (
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {models.map((model, index) => (
          <Chip 
            key={index} 
            label={model} 
            color="primary" 
            variant="outlined" 
            size="small"
            sx={{ 
              backgroundColor: `${theme.palette.primary.main}15`, 
              fontWeight: 'medium'
            }}
          />
        ))}
      </Stack>
    );
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
          
          <div className="mb-6">
            <button
              onClick={handleAnalyzeClick}
              disabled={isAnalyzing}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                isAnalyzing ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isAnalyzing ? 'Analyzing...' : 'Perform Multi-Model User Analysis'}
            </button>
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
                Analyzing user sessions with multiple AI models... This may take several minutes.
              </p>
            </div>
          )}
          
          {/* Analysis Results */}
          <div className="mt-4">
            {analysisError && (
              <div className="p-4 bg-red-50 border-l-4 border-red-600 text-red-700">
                <h3 className="font-bold">Analysis Error</h3>
                <p>{analysisError}</p>
              </div>
            )}
            
            {analysisResult && analysisResult.success && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg">Analysis Report</h3>
                  <div className="text-sm text-gray-500">
                    Generated: {new Date(analysisResult.timestamp).toLocaleString()}
                  </div>
                </div>
                
                <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                    <Typography variant="h5" gutterBottom component="div" sx={{ color: theme.palette.primary.main, fontWeight: 'bold', mb: 0 }}>
                      Multi-Model AI Analysis Report
                    </Typography>
                    
                    <div className="mt-2 md:mt-0">
                      <Typography variant="subtitle2" component="div" sx={{ mb: 1, color: 'text.secondary' }}>
                        Models used:
                      </Typography>
                      {renderModelChips(analysisResult.model)}
                    </div>
                  </div>
                  
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
                        {analysisResult.report}
                      </ReactMarkdown>
                    </div>
                  </Box>
                </Paper>
                
                <div className="mt-4 text-sm text-gray-500">
                  <p>Sessions analyzed: {analysisResult.sessionCount}</p>
                </div>
              </div>
            )}
          </div>
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