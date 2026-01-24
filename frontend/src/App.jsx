import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Chat from './pages/Chat';
import LandingPage from './pages/LandingPage';
import Canvas from './components/tools/Canvas';
import MyProjects from './pages/MyProjects';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/my-projects" element={<MyProjects />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/canvas" element={<Canvas />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
