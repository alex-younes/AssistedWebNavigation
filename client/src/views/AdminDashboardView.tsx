import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getAllUsers, AdminUser, getUserSessions, UserSession } from '../services/adminService'; // Import service and types
import { useNavigate } from 'react-router-dom'; // Import useNavigate

const AdminDashboardView: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate(); // Initialize useNavigate
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

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

    if (user?.isAdmin) {
      fetchUsers();
    }
  }, [user?.isAdmin]);

  const handleUserClick = async (clickedUser: AdminUser) => {
    if (selectedUser?.userId === clickedUser.userId) {
      setSelectedUser(null); // Toggle off if already selected
      setUserSessions([]);
      return;
    }
    setSelectedUser(clickedUser);
    setSessionsError(null);
    setIsLoadingSessions(true);
    try {
      // For now, this uses mock data from the service
      const sessions = await getUserSessions(clickedUser.userId);
      setUserSessions(sessions);
    } catch (error) {
      if (error instanceof Error) {
        setSessionsError(error.message);
      } else {
        setSessionsError('An unknown error occurred while fetching sessions.');
      }
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleSessionClick = (sessionId: string) => {
    navigate(`/graph/${sessionId}`);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-gray-300">
        <h1 className="text-2xl lg:text-3xl font-semibold text-gray-800 mb-2 sm:mb-0">Admin Dashboard</h1>
        {user && (
          <button 
            onClick={logout}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-150 ease-in-out"
          >
            Logout ({user.username})
          </button>
        )}
      </div>
      
      <p className="mb-6 text-gray-700">Welcome, {user?.username}! Manage users and their recorded sessions.</p>
      
      <div className="bg-white shadow-xl rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Users</h2>
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
                    <tr key={u.userId} onClick={() => handleUserClick(u)} className={`hover:bg-gray-100 cursor-pointer ${selectedUser?.userId === u.userId ? 'bg-blue-100' : ''}`}>
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

      {selectedUser && (
        <div className="mt-8 bg-white shadow-xl rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Sessions for {selectedUser.username}</h2>
          {isLoadingSessions && <p className="text-blue-500">Loading sessions...</p>}
          {sessionsError && <p className="text-red-600">Error: {sessionsError}</p>}
          {!isLoadingSessions && !sessionsError && (
            userSessions.length === 0 ? (
              <p className="text-gray-500">No sessions found for this user.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {userSessions.map(session => (
                  <li 
                    key={session.id} 
                    className="py-3 px-2 hover:bg-blue-50 cursor-pointer rounded transition duration-150 ease-in-out"
                    onClick={() => handleSessionClick(session.id)} // Call handleSessionClick with session.id
                  >
                    <p className="text-sm font-medium text-gray-900">Session ID: {session.id}</p>
                    <p className="text-sm text-gray-500">Start: {new Date(session.startTime).toLocaleString()}</p>
                    {session.endTime && <p className="text-sm text-gray-500">End: {new Date(session.endTime).toLocaleString()}</p>}
                    <p className="text-sm text-gray-500">Status: <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${session.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{session.status}</span></p>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboardView; 