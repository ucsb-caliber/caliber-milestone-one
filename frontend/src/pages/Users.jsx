import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { updateUserRoles } from "../api";

// Make sure API_BASE matches your backend URL
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function Users({ currentUser }) {
    // Use 'admin' as per your backend main.py
    const userIsAdmin = currentUser?.admin || false;
  
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updating, setUpdating] = useState({});
    const [sortConfig, setSortConfig] = useState({ key: "id", direction: "asc" });
  
    useEffect(() => {
      async function getData() {
        try {
          setLoading(true);
          // Direct fetch from Supabase table 'user'
          const { data, error: sbError } = await supabase.from('user').select('*');
          if (sbError) throw sbError;
          setUsers(data || []);
        } catch (err) {
          console.error("Supabase error:", err);
          setError("Database error: " + err.message);
        } finally {
          setLoading(false);
        }
      }
      getData();
    }, []);
  
    const cellStyle = {
      padding: "12px 15px",
      fontSize: "1.1rem",
      borderRight: "1px solid #dee2e6",
      borderBottom: "1px solid #dee2e6"
    };
  
    // Render a colored box for True/False
    function RoleBox({ value, disabled, onClick, label }) {
      const base = {
        display: "inline-block",
        width: 80, // Fixed width for all buttons
        minWidth: 60,
        padding: "6px 0", // Remove horizontal padding to keep width fixed
        borderRadius: 8,
        color: "white",
        fontWeight: 600,
        textAlign: "center",
        background: value ? "#007bff" : "#003366", // True: blue, False: darker blue
        opacity: disabled ? 0.5 : 1,
        cursor: disabled || !onClick ? "not-allowed" : "pointer",
        userSelect: "none",
        border: "none",
        outline: "none",
        fontSize: "1rem",
        transition: "background 0.2s, opacity 0.2s, box-shadow 0.2s",
        boxShadow: "none"
      };
      const [hover, setHover] = React.useState(false);
      const hoverStyle = !disabled && onClick && hover ? {
        background: value ? "#0056b3" : "#002244",
        boxShadow: "0 0 0 2px #007bff33"
      } : {};
      return (
        <span
          style={{ ...base, ...hoverStyle }}
          onClick={disabled || !onClick ? undefined : onClick}
          aria-label={label}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {value ? "True" : "False"}
        </span>
      );
    }
  
    // Toggle admin or teacher role for a user
    async function handleToggleRole(userId, role, value) {
      setUpdating((prev) => ({ ...prev, [userId]: true }));
      try {
        await updateUserRoles(userId, { [role]: value });
        setUsers((prev) => prev.map(u => u.user_id === userId ? { ...u, [role]: value } : u));
      } catch (err) {
        alert("Failed to update user: " + err.message);
      } finally {
        setUpdating((prev) => ({ ...prev, [userId]: false }));
      }
    }

    function handleSort(key) {
      setSortConfig((prev) => {
        if (prev.key === key) {
          return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
        }
        return { key, direction: "asc" };
      });
    }

    function getSortedUsers(users) {
      const sorted = [...users];
      sorted.sort((a, b) => {
        let aVal = a[sortConfig.key] ?? "";
        let bVal = b[sortConfig.key] ?? "";
        if (typeof aVal === "string" && typeof bVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
      return sorted;
    }

    const arrow = (col) => sortConfig.key === col ? (sortConfig.direction === "asc" ? "▲" : "▼") : "▼";

    return (
      <div style={{ padding: "2rem", background: "white", minHeight: "100vh" }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "1.5rem" }}>User Management</h1>
        
        {loading && <p>Searching database...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
  
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #dee2e6" }}>
          <thead style={{ backgroundColor: "#f8f9fa" }}>
            <tr style={{ textAlign: "left" }}>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("id")}>id <span style={{ fontSize: 12 }}>{arrow("id")}</span></span>
              </th>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("first_name")}>First Name <span style={{ fontSize: 12 }}>{arrow("first_name")}</span></span>
              </th>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("last_name")}>Last Name <span style={{ fontSize: 12 }}>{arrow("last_name")}</span></span>
              </th>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("email")}>Email <span style={{ fontSize: 12 }}>{arrow("email")}</span></span>
              </th>
              <th style={cellStyle}>Admin</th>
              <th style={cellStyle}>Instructor</th>
            </tr>
          </thead>
          <tbody>
            {users.length > 0 ? getSortedUsers(users).map((u, i) => (
              <tr key={u.user_id || i}>
                <td style={cellStyle}>{u.id}</td>
                <td style={cellStyle}>{u.first_name || "—"}</td>
                <td style={cellStyle}>{u.last_name || "—"}</td>
                <td style={cellStyle}>{u.email}</td>
                <td style={cellStyle}>
                  {userIsAdmin ? (
                    currentUser.user_id === u.user_id ? (
                      <RoleBox value={!!u.admin} disabled label="Admin (self)" />
                    ) : (
                      <RoleBox
                        value={!!u.admin}
                        disabled={!!updating[u.user_id]}
                        onClick={() => handleToggleRole(u.user_id, "admin", !u.admin)}
                        label="Admin toggle"
                      />
                    )
                  ) : (
                    <RoleBox value={!!u.admin} disabled label="Admin" />
                  )}
                </td>
                <td style={cellStyle}>
                  {userIsAdmin || currentUser.user_id === u.user_id ? (
                    <RoleBox
                      value={!!u.teacher}
                      disabled={!!updating[u.user_id]}
                      onClick={() => handleToggleRole(u.user_id, "teacher", !u.teacher)}
                      label={currentUser.user_id === u.user_id ? "Instructor (self toggle)" : "Instructor toggle"}
                    />
                  ) : (
                    <RoleBox value={!!u.teacher} disabled label="Instructor" />
                  )}
                </td>
              </tr>
            )) : (
              <tr><td colSpan="6" style={{padding: "20px"}}>No users found. Check Supabase connection.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }