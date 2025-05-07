import axios from 'axios';

// Access Vite environment variables using import.meta.env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Optional: Add a request interceptor to include the auth token if you have one
// apiClient.interceptors.request.use((config) => {
//   const token = localStorage.getItem('authToken'); // Or however you store it
//   if (token) {
//     config.headers.Authorization = `Bearer ${token}`;
//   }
//   return config;
// });

export default apiClient; 