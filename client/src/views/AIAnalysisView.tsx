import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAllUsers, AdminUser } from '../services/adminService';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

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
              {isAnalyzing ? 'Analyzing...' : 'Perform User Sessions Comparison'}
            </button>
          </div>
          
          {/* Analysis Results */}
          <div className="mt-4">
            {isAnalyzing && (
              <div className="flex flex-col items-center justify-center p-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="mt-4 text-gray-600">
                  Analyzing user sessions... This may take a minute or two.
                </p>
              </div>
            )}
            
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
                
                <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 prose prose-lg max-w-none">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>{analysisResult.report}</ReactMarkdown>
                </div>
                
                <div className="mt-4 text-sm text-gray-500">
                  <p>Model: {analysisResult.model}</p>
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