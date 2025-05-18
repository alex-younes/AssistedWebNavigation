import React from 'react';
import { Link } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full bg-gray-100 text-gray-900">
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-xl font-semibold text-indigo-600 hover:text-indigo-800">
                User Journey Visualization
              </Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <Link
                  to="/"
                  className="text-gray-700 hover:bg-indigo-500 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  to="/ai-analysis"
                  className="text-gray-700 hover:bg-indigo-500 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                >
                  AI Analysis
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="py-8">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="mb-8 text-center">
            {/* <h1 className="text-3xl font-bold text-gray-800">User Journey Visualization</h1> */}
            {/* <p className="text-gray-600">Track and visualize user sessions across web applications</p> */}
          </header>
          
          <main>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout; 