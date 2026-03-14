import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./page/Home";
import NotFound from "./page/NotFound";

const App = () => {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Navigate to="/aventus" replace />} />
        <Route path="/aventus" element={<Home/>}/>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default App;
