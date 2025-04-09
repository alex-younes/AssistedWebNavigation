import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full bg-gray-100 py-8 text-gray-900">
      <div className="w-full max-w-7xl mx-auto px-4">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800">User Journey Visualization</h1>
          <p className="text-gray-600">Track and visualize user sessions across web applications</p>
        </header>
        
        <main>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout; 