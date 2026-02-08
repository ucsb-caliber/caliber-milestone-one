import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Make sure API_BASE matches your backend URL
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function Users({ currentUser }) {
    // Use 'admin' as per your backend main.py
    const userIsAdmin = currentUser?.admin || false;
  
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
  
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
  
    return (
      <div style={{ padding: "2rem", background: "white", minHeight: "100vh" }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "1.5rem" }}>User Management</h1>
        
        {loading && <p>Searching database...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
  
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #dee2e6" }}>
          <thead style={{ backgroundColor: "#f8f9fa" }}>
            <tr style={{ textAlign: "left" }}>
              <th style={cellStyle}>id</th>
              <th style={cellStyle}>First Name</th>
              <th style={cellStyle}>Last Name</th>
              <th style={cellStyle}>Email</th>
              <th style={cellStyle}>Admin</th>
              <th style={cellStyle}>Instructor</th>
            </tr>
          </thead>
          <tbody>
            {users.length > 0 ? users.map((u, i) => (
              <tr key={u.user_id || i}>
                <td style={cellStyle}>{i + 1}</td>
                <td style={cellStyle}>{u.first_name || "—"}</td>
                <td style={cellStyle}>{u.last_name || "—"}</td>
                <td style={cellStyle}>{u.email}</td>
                <td style={cellStyle}>{String(u.admin)}</td>
                <td style={cellStyle}>{String(u.teacher)}</td>
              </tr>
            )) : (
              <tr><td colSpan="6" style={{padding: "20px"}}>No users found. Check Supabase connection.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }