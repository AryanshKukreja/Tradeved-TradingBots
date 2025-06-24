import React from "react";
import { NavLink } from "react-router-dom";
import "./Navbar.css";

function Navbar({ darkMode, toggleTheme }) {
  return (
    <nav className="navbar">
      <div className="nav-left">
        <h1 className="brand">TRADEVED</h1>
        <div className="nav-links">
          <NavLink exact to="/" activeClassName="active">
            Spot Grid
          </NavLink>
          <NavLink to="/dca" activeClassName="active">
            DCA Bot
          </NavLink>
          <NavLink to="/arbitrage" activeClassName="active">
            Price Level Averaging
          </NavLink>
        </div>
      </div>
      <div className="nav-right">
        <div className="user-badge">U</div>
        <span>User</span>
      </div>
    </nav>
  );
}

export default Navbar;
