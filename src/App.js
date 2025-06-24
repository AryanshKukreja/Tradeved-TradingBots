import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import GRID from "./components/Pages/GRID";
import "./App.css";
import DCA from "./components/Pages/DCA";


function App() {
  const [darkMode, setDarkMode] = useState(true);

  const toggleTheme = () => setDarkMode((prev) => !prev);

  return (
    <div className={darkMode ? "app dark" : "app"}>
      <Router>
        <Navbar darkMode={darkMode} toggleTheme={toggleTheme} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<GRID />} />
            <Route path="/dca" element={<DCA />} />
          </Routes>
        </main>
      </Router>
    </div>
  );
}

export default App;
