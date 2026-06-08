import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import ClientMode from './pages/ClientMode';
import DesignerMode from './pages/DesignerMode';

function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<DesignerMode />} />
        <Route path="/client" element={<ClientMode />} />
        <Route path="/designer" element={<DesignerMode />} />
      </Routes>
    </div>
  );
}

export default App;
