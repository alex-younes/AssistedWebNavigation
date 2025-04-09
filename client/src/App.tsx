import Layout from './components/layout/Layout';
import Session from './components/Session';
import Graph from './components/Graph';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Session />} />
          <Route path="/graph/:sessionId" element={<Graph />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
