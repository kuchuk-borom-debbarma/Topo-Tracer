import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TraceDashboard } from './components/TraceDashboard';
import { TraceGraph } from './components/TraceGraph';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TraceDashboard />} />
        <Route path="/trace/:traceId" element={<TraceGraph />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
