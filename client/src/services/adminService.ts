import apiClient from './apiService';

// Define the User type based on what the backend sends (excluding password)
export interface AdminUser {
  _id: string;
  userId: string;
  username: string;
  createdAt: string; // Assuming it comes as an ISO string
  // Add any other fields your User model has, excluding password
}

export const getAllUsers = async (): Promise<AdminUser[]> => {
  try {
    const response = await apiClient.get<AdminUser[]>('/admin/users');
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    // Handle or throw error as appropriate for your app
    if (axios.isAxiosError(error) && error.response?.status === 403) {
        throw new Error('Forbidden: You do not have access to this resource.');
    }
    throw new Error('Failed to fetch users. Please try again later.');
  }
};

// Placeholder for fetching sessions for a specific user
export interface UserSession {
    _id: string; // MongoDB ObjectId
    id: string; // Custom Session ID (e.g., session_timestamp)
    userId: string;
    startTime: string;
    endTime?: string;
    status: string;
    metadata?: Record<string, unknown>; // More specific than any
    createdAt: string;
    updatedAt: string;
    // any other relevant session metadata from your schema
}

export const getUserSessions = async (userId: string): Promise<UserSession[]> => {
    try {
        const response = await apiClient.get<UserSession[]>(`/admin/users/${userId}/sessions`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching sessions for user ${userId}:`, error);
        if (axios.isAxiosError(error) && error.response?.status === 403) {
            throw new Error('Forbidden: You do not have access to this resource to fetch sessions.');
        }
        throw new Error(`Failed to fetch sessions for user ${userId}.`);
    }
};

// Helper to check for AxiosError if not already globally handled
// You might want a more robust error handling strategy in a larger app
import axios from 'axios'; 